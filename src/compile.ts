// The compiled scenario (AGENTS.md, "A script"): a checked scenario with its voices measured, every
// line on its frames, in plain numbers. The sound, the picture, the captions and the web page are
// made from it alone. When each line begins and ends is worked out by times.ts, from the plan of its
// lines and blocks (plan.ts).
//
// It needs none of the tool's packages: plugin.ts gives it to the plugins' tests.
import { LINGER, captionsOf, rowsOf } from "./captions.ts";
import { secondsOf, type Span } from "./formula.ts";
import { planOf, type Lasting } from "./plan.ts";
import { LOOP } from "./read.ts";
import { linesIn, type CheckedLine, type CheckedOver, type CheckedScene, type Plain } from "./scenario.ts";
import { times, type Item } from "./times.ts";

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

/** What a scenario is compiled by: the video's frame rate, its loudness, and its limits on a fitted action (script.ts, settings). */
export interface CompileSettings {
  fps: number;
  /** How loud the video's sound is, LUFS. */
  loudness: number;
  /** How slow and how fast a fitted action may be, as multiples of its own speed. */
  moves: { slowest: number; fastest: number };
}

/**
 * One caption: its words, the frame of the video it shows from, and for how many. One of a line that sounds
 * at once with another is in a small row, 1 over 2; any other is alone.
 */
export interface CompiledCaption {
  text: string;
  from: number;
  frames: number;
  row?: 1 | 2;
}

/** What is played: the sound's file, a path from the project's folder, and how loud, dB. One that is looped is played again and again in its frames. */
export interface Sounded {
  sound: string;
  volume: number;
}

/** What is said: its words, how loud, dB, its voice's file, how open its speaker's mouth is in each of its frames, and its captions. */
export interface Said {
  text: string;
  volume: number;
  file: string;
  mouth: number[];
  captions: CompiledCaption[];
}

/**
 * A line on its frames: what is said or played, or one of the plugin's actions in plain numbers. What is cut
 * stops with its frames, its voice and its mouth too; what is cut before it begins is no line.
 */
export type CompiledLine = {
  /** Its line in the video file. */
  line: number;
  who: string;
  action: string;
  /** The frame of the video it begins on, from 0, and how many frames it lasts. */
  from: number;
  frames: number;
} & (Said | Sounded | { values: Plain });

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
  /** What the cartoon's own script plays over its scenes; none when it has none. */
  lines?: CompiledLine[];
  scenes: CompiledScene[];
}

const EPS = 1e-6;

/** The lines of a compiled scenario that are said, in order. */
export const saidLines = (scenes: Pick<CompiledScene, "lines">[]) => scenes.flatMap((scene) => scene.lines).filter((line) => "text" in line);
/** Its lines that are played: the cartoon's own, then the scenes', in order. */
export const playedLines = ({ lines = [], scenes }: Pick<Compiled, "lines" | "scenes">) => [...lines, ...scenes.flatMap((scene) => scene.lines)].filter((line) => "sound" in line);

/**
 * The captions of a scene that ends on frame `end`: each said line's, split, each in its row (captions.ts),
 * given to it. One is up through its words, whatever else is said, and then until another begins, `linger`
 * frames, or the scene's end; a cut line's goes with its voice. `lasts` is how many frames a line's words
 * take, cut or not.
 */
function caption(lines: CompiledLine[], lasts: (line: CompiledLine) => number, end: number, linger: number): void {
  const said = saidLines([{ lines }]);
  const rows = rowsOf(said);
  const pieces = said
    .filter((line) => rows.has(line))
    .flatMap((line) => {
      const row = rows.get(line);
      const stop = line.from + line.frames;
      const cut = line.frames < lasts(line);
      return captionsOf(line.text, line.from, lasts(line), row !== undefined).map(({ text, start, end }) => {
        const words = Math.round(end);
        return { line, row, text, from: Math.round(start), words, until: cut ? stop : words + linger };
      });
    })
    .filter(({ from, until }) => from < until)
    .sort((a, b) => a.from - b.from);
  for (const [k, { line, row, text, from, words, until }] of pieces.entries()) {
    const next = pieces.slice(k + 1).find((one) => one.from >= words);
    const frames = Math.min(next?.from ?? end, until, end) - from;
    if (frames > 0) line.captions.push({ text, from, frames, ...(row === undefined ? {} : { row }) });
  }
}

/**
 * Lays a checked scenario on the video's frames, by the laws of what happens at once (times.ts).
 * `voices` are its said lines' voices, in the order written. A voice lasts the frames it sounds in. An
 * action given its length lasts that to the nearest frame, worked out from the lengths of lines above
 * where it reads them; any other its own, or what it is fitted to or arrives at takes, within the
 * video's `moves`. Each lasts at least one frame. An open one goes on to the end of its block, and what
 * is under the rest stops where its block does. A sound played once lasts the frames it sounds in, and a
 * looped one is open.
 * `from` names the video file, for the compiled scenario to say what it is made from. `sounds` says how long
 * each sound's file lasts, seconds, and `over` is the cartoon's own script, which goes on over the scenes.
 */
export function compile(scenes: CheckedScene[], voices: Voiced[], settings: CompileSettings, from: string, sounds: Record<string, number> = {}, over?: CheckedOver): Compiled {
  const { fps, loudness, moves } = settings;
  const said = scenes.flatMap((scene) => linesIn(scene.items)).filter((line) => "text" in line);
  if (said.length !== voices.length) throw new Error(`the scenario says ${said.length} lines, and ${voices.length} voices were measured`);
  const voiceOf = new Map<CheckedLine, Voiced>(said.map((line, i) => [line, voices[i]!]));
  /** The frames of each line that is said or played once, or is given its length, by its line in the file: those above it are there before it. */
  const given = new Map<number, number>();
  const frames = (seconds: Span) => Math.round(secondsOf(seconds, (line) => given.get(line)! / fps) * fps);
  /** The frames that what lasts so long sounds in. */
  const sounding = (seconds: number) => Math.max(1, Math.ceil(seconds * fps - EPS));
  for (const line of [...scenes, ...(over ? [over] : [])].flatMap(({ items }) => linesIn(items))) {
    if ("text" in line) given.set(line.line, sounding(voiceOf.get(line)!.duration));
    else if ("sound" in line) {
      const lasts = sounds[line.sound];
      if (lasts === undefined) throw new Error(`the scenario plays ${line.sound}, which was not measured`);
      if (line.action !== LOOP) given.set(line.line, sounding(lasts));
    } else if (line.takes !== undefined) given.set(line.line, Math.max(1, frames(line.takes)));
  }
  const lasting = (line: CheckedLine): Lasting => {
    const length = given.get(line.line);
    if ("text" in line) return { kind: "voice", length: length! };
    if ("sound" in line) return { kind: "sound", length: length ?? "open" };
    const { channels } = line;
    if (line.length === "open") return { kind: "move", channels, length: "open" };
    if (length !== undefined) return { kind: "move", channels, length };
    const own = Math.max(1, Math.round(line.length * fps));
    return { kind: "move", channels, length: { own, least: Math.ceil(own / moves.fastest - EPS), most: Math.floor(own / moves.slowest + EPS) }, arrive: line.arrive };
  };
  const { video, scenes: planned, items } = planOf(scenes, frames, lasting, over);
  const placed = times(video);
  const spanOf = (item: Item) => {
    const { start, end } = placed.get(item)!;
    return { from: start, frames: end - start };
  };
  /** How long each said line would last if nothing cut it. */
  const lasts = new Map<CompiledLine, number>();
  const linesOf = (script: { items: CheckedScene["items"] }) =>
    linesIn(script.items).flatMap((line): CompiledLine[] => {
      const { line: n, who, action } = line;
      const at = { line: n, who, action, ...spanOf(items.get(line)!) };
      // Its block ended before it began: it is not there.
      if (at.frames === 0) return [];
      if ("sound" in line) return [{ ...at, sound: line.sound, volume: line.volume }];
      if (!("text" in line)) return [{ ...at, values: line.values }];
      const { file, mouth } = voiceOf.get(line)!;
      const compiled = { ...at, text: line.text, volume: line.volume, file, mouth: mouth.slice(0, at.frames), captions: [] };
      lasts.set(compiled, lasting(line).length as number);
      return [compiled];
    });
  const compiled = scenes.map((scene, i): CompiledScene => {
    const span = spanOf(planned[i]!);
    const lines = linesOf(scene);
    caption(lines, (line) => lasts.get(line)!, span.from + span.frames, Math.round(LINGER * fps));
    return { ...span, setting: scene.setting, lines };
  });
  return { format: "ai-videos-compiled", version: 1, made: { by: "ai-videos compile", from }, fps, frames: spanOf(video).frames, loudness, ...(over ? { lines: linesOf(over) } : {}), scenes: compiled };
}

/** The compiled scenario's text: JSON a person can read too, a list of numbers (a point, a mouth) on one line. */
export function compiledText(compiled: Compiled): string {
  // In JSON a line break is never inside a string, so a list found this way is a real one.
  const lists = /\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g;
  return `${JSON.stringify(compiled, null, 2).replace(lists, (_, list: string) => `[${list.split(/,\s*/).join(", ")}]`)}\n`;
}
