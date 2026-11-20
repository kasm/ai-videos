// A scenario's beats as the clip's timeline at its own pace: the events and texts the video tool
// fits the voice to (the tool's AGENTS.md, "Clips").
import type { Scenario } from "./scenario.ts";

export interface Timeline {
  /** The clip's length, seconds: every beat's `takes`, added up. */
  duration: number;
  /** One event per beat, in order, the first at 0. */
  events: { name: string; at: number; span: "hold" | "move" }[];
  /** One text per line, with its speaker and the time it has. */
  lines: { who: string; text: string; from: number; to: number }[];
}

/** Whole milliseconds, so times added up from fractions stay equal where they should. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * Lays the scenes' beats end to end. A beat's lines share its time in equal parts, in the order
 * written, so the first begins with the beat: the tool cues a line to the event it begins at.
 */
export function timeline(scenario: Scenario): Timeline {
  const events: Timeline["events"] = [];
  const lines: Timeline["lines"] = [];
  let at = 0;
  for (const scene of scenario.scenes) {
    for (const beat of scene.beats) {
      events.push({ name: beat.name, at: ms(at), span: beat.walk ? "move" : "hold" });
      const share = beat.takes / Math.max(beat.says.length, 1);
      beat.says.forEach((line, i) => {
        lines.push({ who: line.who, text: line.text, from: ms(at + i * share), to: ms(at + (i + 1) * share) });
      });
      at += beat.takes;
    }
  }
  return { duration: ms(at), events, lines };
}
