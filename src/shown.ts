// What each frame of a compiled scenario shows (AGENTS.md, "A script"): its scene's setting, the
// actions that have begun and how far through each is, and whose mouth is open. The plugin draws
// that and counts no frames of its own. It is pure and imports nothing that runs: the host draws a
// script's clip with it, the web page its frames (page.ts), and plugin.ts gives it to the plugins'
// tests.
import type { Compiled } from "./compile.ts";
import type { Plain } from "./scenario.ts";

/** What the picture is drawn from: the compiled scenario without its words, files, captions and loudness. */
export interface CompiledPicture {
  fps: number;
  frames: number;
  scenes: {
    from: number;
    frames: number;
    setting: Plain;
    /** The plugin's actions, in the order written. */
    actions: { who: string; action: string; from: number; frames: number; values: Plain }[];
    /** Each said line's mouth: `open[k]` is for frame `from + k`. */
    mouths: { who: string; from: number; open: number[] }[];
  }[];
}

/** One of a scene's actions that has begun. */
export interface ShownAction {
  who: string;
  action: string;
  /** Its values in plain numbers, as the plugin's check gave them. */
  values: Plain;
  /** How far through it is: evenly from 0 on the frame it begins to 1 on the frame after its last, and it stays at 1. */
  progress: number;
  /** Seconds since it began. */
  into: number;
  /** Seconds it lasts: with `into`, how far through it was at any moment before. */
  length: number;
}

/** What one frame shows. */
export interface Shown {
  /** Seconds since the video began. */
  time: number;
  /** How the frame's scene began, in plain numbers, as the plugin's check gave it. */
  setting: Plain;
  /** The scene's actions that have begun by the frame, in the order written. */
  actions: ShownAction[];
  /** How open each speaker's mouth is, above 0 to 1. A speaker it does not name has it closed. */
  mouths: Record<string, number>;
}

/** The picture's part of a compiled scenario: a change to the rest of it draws nothing again. */
export function pictureOf({ fps, frames, scenes }: Compiled): CompiledPicture {
  return {
    fps,
    frames,
    scenes: scenes.map((scene) => ({
      from: scene.from,
      frames: scene.frames,
      setting: scene.setting,
      actions: scene.lines.flatMap((line) => ("values" in line ? [{ who: line.who, action: line.action, from: line.from, frames: line.frames, values: line.values }] : [])),
      mouths: scene.lines.flatMap((line) => ("mouth" in line ? [{ who: line.who, from: line.from, open: line.mouth }] : [])),
    })),
  };
}

/** What `frame` shows, counted from 0. */
export function shownAt({ fps, scenes }: CompiledPicture, frame: number): Shown {
  const scene = scenes.findLast(({ from }) => from <= frame);
  if (!scene || frame >= scene.from + scene.frames) throw new Error(`the compiled scenario has no frame ${frame}`);
  const mouths: Record<string, number> = {};
  for (const { who, from, open } of scene.mouths) {
    const value = open[frame - from] ?? 0;
    if (value > 0) mouths[who] = Math.max(mouths[who] ?? 0, value);
  }
  return {
    time: frame / fps,
    setting: scene.setting,
    actions: scene.actions
      .filter(({ from }) => from <= frame)
      .map(({ who, action, values, from, frames }) => ({ who, action, values, progress: Math.min(1, (frame - from) / frames), into: (frame - from) / fps, length: frames / fps })),
    mouths,
  };
}
