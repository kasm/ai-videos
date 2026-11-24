// The compiled scenario (AGENTS.md, "A script"): a checked scenario with its voices measured, every
// line on its frames, in plain numbers. The sound, the picture, the captions and the web page are
// made from it alone. For now the lines of a scene follow each other in the order written, and the
// scenes too; what happens at once comes with the plan's later steps.
//
// It needs none of the tool's packages: plugin.ts gives it to the plugins' tests.
import { LINGER, captionsOf } from "./captions.ts";
import type { CheckedScene, Plain } from "./scenario.ts";

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
 * written. In a scene each line follows the one before: the first begins `lead` after the scene
 * does, each next one `gap` after the one before has ended, and the scene ends `tail` after its
 * last. A voice lasts the frames it sounds in, an action its own length to the nearest frame, each
 * at least one. `from` names the video file, for the compiled scenario to say what it is made from.
 */
export function compile(scenes: CheckedScene[], voices: Voiced[], settings: CompileSettings, from: string): Compiled {
  const { fps, loudness } = settings;
  const frames = (seconds: number) => Math.round(seconds * fps);
  const said = scenes.reduce((n, scene) => n + scene.lines.filter((line) => "text" in line).length, 0);
  if (said !== voices.length) throw new Error(`the scenario says ${said} lines, and ${voices.length} voices were measured`);
  let voice = 0;
  let at = 0;
  const compiled = scenes.map((scene): CompiledScene => {
    const begins = at;
    at += frames(settings.lead);
    const lines = scene.lines.map((line, i): CompiledLine => {
      if (i > 0) at += frames(settings.gap);
      const { line: n, who, action } = line;
      if ("text" in line) {
        const { file, duration, mouth } = voices[voice++]!;
        const placed = { line: n, who, action, from: at, frames: Math.max(1, Math.ceil(duration * fps - EPS)), text: line.text, file, mouth, captions: [] };
        at += placed.frames;
        return placed;
      }
      const placed = { line: n, who, action, from: at, frames: Math.max(1, frames(line.length)), values: line.values };
      at += placed.frames;
      return placed;
    });
    at += frames(settings.tail);
    caption(lines, at, frames(LINGER));
    return { from: begins, frames: at - begins, setting: scene.setting, lines };
  });
  return { format: "ai-videos-compiled", version: 1, made: { by: "ai-videos compile", from }, fps, frames: at, loudness, scenes: compiled };
}

/** The compiled scenario's text: JSON a person can read too, a list of numbers (a point, a mouth) on one line. */
export function compiledText(compiled: Compiled): string {
  // In JSON a line break is never inside a string, so a list found this way is a real one.
  const lists = /\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g;
  return `${JSON.stringify(compiled, null, 2).replace(lists, (_, list: string) => `[${list.split(/,\s*/).join(", ")}]`)}\n`;
}
