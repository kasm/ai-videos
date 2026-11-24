// The compiled scenario (AGENTS.md, "A script"): a checked scenario with its voices measured, every
// line on its frames, in plain numbers. For now the lines of a scene follow each other in the order
// written, and the scenes too; what happens at once comes with the plan's later steps.
//
// It imports nothing that runs: plugin.ts gives it to the plugins' tests.
import type { CheckedScene, Plain } from "./scenario.ts";

/** A line's voice, spoken and measured: its file's name in the tool's voice cache, and its length, seconds. */
export interface Voiced {
  file: string;
  duration: number;
}

/** What the lines are laid out by: the video's frame rate, and its pauses, seconds (script.ts, timing). */
export interface CompileTiming {
  fps: number;
  /** Before a scene's first line. */
  lead: number;
  /** Between a line's end and the next line. */
  gap: number;
  /** After a scene's last line. */
  tail: number;
}

/** A line on its frames: what is said, with its voice's file, or one of the plugin's actions in plain numbers. */
export type CompiledLine = {
  /** Its line in the video file. */
  line: number;
  who: string;
  action: string;
  /** The frame of the video it begins on, from 0, and how many frames it lasts. */
  from: number;
  frames: number;
} & ({ text: string; file: string } | { values: Plain });

export interface CompiledScene {
  /** The frame of the video it begins on, and how many frames it lasts. */
  from: number;
  frames: number;
  /** How it begins, in plain numbers: the plugin's. */
  setting: Plain;
  lines: CompiledLine[];
}

/** The compiled scenario (`ai-videos-compiled`): what the picture, the sound and the captions are made from. */
export interface Compiled {
  format: "ai-videos-compiled";
  version: 1;
  made: { by: string; from: string };
  fps: number;
  /** The video's length in whole frames: its scenes', added up. */
  frames: number;
  scenes: CompiledScene[];
}

const EPS = 1e-6;

/**
 * Lays a checked scenario on the video's frames. `voices` are its said lines' voices, in the order
 * written. In a scene each line follows the one before: the first begins `lead` after the scene
 * does, each next one `gap` after the one before has ended, and the scene ends `tail` after its
 * last. A voice lasts the frames it sounds in, an action its own length to the nearest frame, each
 * at least one. `from` names the video file, for the compiled scenario to say what it is made from.
 */
export function compile(scenes: CheckedScene[], voices: Voiced[], timing: CompileTiming, from: string): Compiled {
  const { fps } = timing;
  const frames = (seconds: number) => Math.round(seconds * fps);
  const said = scenes.reduce((n, scene) => n + scene.lines.filter((line) => "text" in line).length, 0);
  if (said !== voices.length) throw new Error(`the scenario says ${said} lines, and ${voices.length} voices were measured`);
  let voice = 0;
  let at = 0;
  const compiled = scenes.map((scene): CompiledScene => {
    const begins = at;
    at += frames(timing.lead);
    const lines = scene.lines.map((line, i): CompiledLine => {
      if (i > 0) at += frames(timing.gap);
      const { line: n, who, action } = line;
      if ("text" in line) {
        const { file, duration } = voices[voice++]!;
        const placed = { line: n, who, action, from: at, frames: Math.max(1, Math.ceil(duration * fps - EPS)), text: line.text, file };
        at += placed.frames;
        return placed;
      }
      const placed = { line: n, who, action, from: at, frames: Math.max(1, frames(line.length)), values: line.values };
      at += placed.frames;
      return placed;
    });
    at += frames(timing.tail);
    return { from: begins, frames: at - begins, setting: scene.setting, lines };
  });
  return { format: "ai-videos-compiled", version: 1, made: { by: "ai-videos compile", from }, fps, frames: at, scenes: compiled };
}

/** The compiled scenario's text: JSON a person can read too, a list of numbers (a point) on one line. */
export function compiledText(compiled: Compiled): string {
  // In JSON a line break is never inside a string, so a list found this way is a real one.
  const lists = /\[\n\s*(-?[\d.e+-]+(?:,\n\s*-?[\d.e+-]+)*)\n\s*\]/g;
  return `${JSON.stringify(compiled, null, 2).replace(lists, (_, list: string) => `[${list.split(/,\s*/).join(", ")}]`)}\n`;
}
