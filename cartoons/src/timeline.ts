// A scenario's beats as the clip's timeline: the events and texts the video tool fits the voice to
// (the tool's AGENTS.md, "Clips"), at the scenario's own pace. The tool times them to the voice.
import { moveOf, type Beat, type Scenario } from "./scenario.ts";

export interface Timeline {
  /** The clip's length, seconds: every beat's time, added up. */
  duration: number;
  /** One event per beat, in order, the first at 0. */
  events: { name: string; at: number; span: "hold" | "move" }[];
  /** One text per line, with its speaker and the time it has. */
  lines: { who: string; text: string; from: number; to: number }[];
}

/**
 * Where the picture is in the scenario: in which beat, counted through every scene, how far through
 * its move (0 to 1), and whose mouth is open, how wide (above 0, to 1). A character it does not
 * name has its mouth closed. `time` is the seconds since the clip began (a wave's swing and the
 * blinks go by it) and `into` the seconds since the beat did (an arm reaching its new pose). It is
 * the tool's moment (its AGENTS.md, "Moments"), whose span is a beat here.
 */
export interface Moment {
  beat: number;
  progress: number;
  time: number;
  into: number;
  mouths: Record<string, number>;
}

/** Whole milliseconds, so times added up from fractions stay equal where they should. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** What a beat is to the tool: a move when someone walks, turns or jumps in it, a hold otherwise, however its poses change. */
const spanOf = (beat: Beat) => (moveOf(beat) ? "move" : "hold");

/**
 * Lays the scenes' beats end to end, each taking its own `takes`. A beat's lines share its time in
 * equal parts, in the order written, so the first begins with the beat: the tool cues a line to
 * the event it begins at.
 */
export function timeline(scenario: Scenario): Timeline {
  const beats = scenario.scenes.flatMap((scene) => scene.beats);
  const duration = ms(beats.reduce((sum, beat) => sum + beat.takes, 0));
  const events: Timeline["events"] = [];
  const lines: Timeline["lines"] = [];
  let at = 0;
  for (const beat of beats) {
    events.push({ name: beat.name, at: ms(at), span: spanOf(beat) });
    const share = beat.takes / Math.max(beat.says.length, 1);
    beat.says.forEach((line, k) => {
      lines.push({ who: line.who, text: line.text, from: ms(at + k * share), to: Math.min(ms(at + (k + 1) * share), duration) });
    });
    at += beat.takes;
  }
  return { duration, events, lines };
}
