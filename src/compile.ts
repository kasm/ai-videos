// The compiled scenario (AGENTS.md, "A script"): a checked scenario with its voices measured, every
// line on its frames, in plain numbers. The sound, the picture, the captions and the web page are
// made from it alone. When each line begins and ends is worked out by times.ts. For now a script has
// no words for what happens at once, so the lines of a scene follow each other in the order written,
// and the scenes too.
//
// It needs none of the tool's packages: plugin.ts gives it to the plugins' tests.
import { LINGER, captionsOf } from "./captions.ts";
import type { CheckedLine, CheckedScene, Plain } from "./scenario.ts";
import { times, type Block, type Line } from "./times.ts";

/**
 * A line's voice, spoken and measured: its file's name in the tool's voice cache, its length,
 * seconds, and how open a mouth is while it sounds (mouth.ts), a number for each frame from the
 * one it begins on.
 */
export interface Voiced {
  file: string;
  duration: number;
  mouth: number[];
}

/** What a scenario is compiled by: the video's frame rate, its loudness, and its pauses, seconds (script.ts, settings). */
export interface CompileSettings {
  fps: number;
  /** How loud the video's sound is, LUFS. */
  loudness: number;
  /** Before a scene's first line. */
  lead: number;
  /** Between a line's end and the next line. */
  gap: number;
  /** After a scene's last line. */
  tail: number;
}

/** One caption: its words, the frame of the video it shows from, and for how many. */
export interface CompiledCaption {
  text: string;
  from: number;
  frames: number;
}

/** What is said: its words, its voice's file, how open its speaker's mouth is in each of its frames, and its captions. */
export interface Said {
  text: string;
  file: string;
  mouth: number[];
  captions: CompiledCaption[];
}

/** A line on its frames: what is said, or one of the plugin's actions in plain numbers. */
export type CompiledLine = {
  /** Its line in the video file. */
  line: number;
  who: string;
  action: string;
  /** The frame of the video it begins on, from 0, and how many frames it lasts. */
  from: number;
  frames: number;
} & (Said | { values: Plain });

export interface CompiledScene {
  /** The frame of the video it begins on, and how many frames it lasts. */
  from: number;
  frames: number;
  /** How it begins, in plain numbers: the plugin's. */
  setting: Plain;
  lines: CompiledLine[];
}

/** The compiled scenario (`ai-videos-compiled`): what the sound, the picture, the captions and the page are made from. */
export interface Compiled {
  format: "ai-videos-compiled";
  version: 1;
  made: { by: string; from: string };
  fps: number;
  /** The video's length in whole frames: its scenes', added up. */
  frames: number;
  /** How loud its sound is, LUFS. */
  loudness: number;
  scenes: CompiledScene[];
}

const EPS = 1e-6;

/** The lines of a compiled scenario that are said, in order. */
export const saidLines = (scenes: Pick<CompiledScene, "lines">[]) => scenes.flatMap((scene) => scene.lines).filter((line) => "text" in line);

/**
 * The captions of a scene that ends on frame `end`: each said line's, split (captions.ts), given to
 * it. A caption stays through the pause after its words, until the next one, `linger` frames, or
 * the scene's end.
 */
function caption(lines: CompiledLine[], end: number, linger: number): void {
  const pieces = saidLines([{ lines }]).flatMap((line) => captionsOf(line.text, line.from, line.frames).map((piece) => ({ ...piece, line })));
  const from = pieces.map((piece) => Math.round(piece.start));
  pieces.forEach(({ text, end: words, line }, k) => {
    const until = Math.min(from[k + 1] ?? end, Math.round(words) + linger, end);
    line.captions.push({ text, from: from[k]!, frames: until - from[k]! });
  });
}

/**
 * Lays a checked scenario on the video's frames. `voices` are its said lines' voices, in the order
 * written. A scene is a block in order, and so are the scenes: each line follows the one before, the
 * first beginning `lead` after the scene does, each next one `gap` after the one before has ended,
 * and the scene ends `tail` after its last. A voice lasts the frames it sounds in, an action its own
 * length to the nearest frame, each at least one. `from` names the video file, for the compiled
 * scenario to say what it is made from.
 */
export function compile(scenes: CheckedScene[], voices: Voiced[], settings: CompileSettings, from: string): Compiled {
  const { fps, loudness } = settings;
  const frames = (seconds: number) => Math.round(seconds * fps);
  const said = scenes.flatMap((scene) => scene.lines).filter((line) => "text" in line);
  if (said.length !== voices.length) throw new Error(`the scenario says ${said.length} lines, and ${voices.length} voices were measured`);
  const voiceOf = new Map<CheckedLine, Voiced>(said.map((line, i) => [line, voices[i]!]));
  const planned = new Map<CheckedLine, Line>();
  const plan = scenes.map((scene): Block => {
    const items = scene.lines.map((line): Line => {
      const item: Line =
        "text" in line
          ? { kind: "voice", on: [`${line.who} voice`], length: Math.max(1, Math.ceil(voiceOf.get(line)!.duration * fps - EPS)) }
          : { kind: "move", on: [], length: Math.max(1, frames(line.length)) };
      planned.set(line, item);
      return item;
    });
    return { kind: "block", order: "in order", items, lead: frames(settings.lead), pause: frames(settings.gap), tail: frames(settings.tail) };
  });
  const video: Block = { kind: "block", order: "in order", items: plan };
  const placed = times(video);
  const spanOf = (item: Block | Line) => {
    const { start, end } = placed.get(item)!;
    return { from: start, frames: end - start };
  };
  const compiled = scenes.map((scene, i): CompiledScene => {
    const span = spanOf(plan[i]!);
    const lines = scene.lines.map((line): CompiledLine => {
      const { line: n, who, action } = line;
      const at = { line: n, who, action, ...spanOf(planned.get(line)!) };
      if (!("text" in line)) return { ...at, values: line.values };
      const { file, mouth } = voiceOf.get(line)!;
      return { ...at, text: line.text, file, mouth, captions: [] };
    });
    caption(lines, span.from + span.frames, frames(LINGER));
    return { ...span, setting: scene.setting, lines };
  });
  return { format: "ai-videos-compiled", version: 1, made: { by: "ai-videos compile", from }, fps, frames: spanOf(video).frames, loudness, scenes: compiled };
}

/** The compiled scenario's text: JSON a person can read too, a list of numbers (a point, a mouth) on one line. */
export function compiledText(compiled: Compiled): string {
  // In JSON a line break is never inside a string, so a list found this way is a real one.
  const lists = /\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g;
  return `${JSON.stringify(compiled, null, 2).replace(lists, (_, list: string) => `[${list.split(/,\s*/).join(", ")}]`)}\n`;
}
