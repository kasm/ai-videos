// A scenario's beats as the clip's timeline: the events and texts the video tool fits the voice to
// (the tool's AGENTS.md, "Clips"), at the scenario's own pace or as the tool's request times them.
import { moments as frames } from "ai-videos/frames";
import type { Request } from "./request.ts";
import { moveOf, type Beat, type Scenario } from "./scenario.ts";

export interface Timeline {
  /** The clip's length, seconds: every beat's time, added up. */
  duration: number;
  /** One event per beat, in order, the first at 0. Drawn to a request, each keeps its `natural`. */
  events: { name: string; at: number; span: "hold" | "move"; natural?: number }[];
  /** One text per line, with its speaker and the time it has. */
  lines: { who: string; text: string; from: number; to: number }[];
}

/**
 * Where the picture is in the scenario: in which beat, counted through every scene, how far through
 * its move (0 to 1), and whose mouth is open, how wide (above 0, to 1). A character it does not
 * name has its mouth closed. `time` is the seconds since the clip began (a wave's swing and the
 * blinks go by it) and `into` the seconds since the beat did (an arm reaching its new pose).
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

const beatsOf = (scenario: Scenario) => scenario.scenes.flatMap((scene) => scene.beats);

/** What a beat is to the tool: a move when someone walks, turns or jumps in it, a hold otherwise, however its poses change. */
const spanOf = (beat: Beat) => (moveOf(beat) ? "move" : "hold");

/**
 * Lays the scenes' beats end to end: each takes its own `takes`, or begins and lasts as `request`
 * says. A beat's lines share its time in equal parts, in the order written, so the first begins
 * with the beat: the tool cues a line to the event it begins at.
 */
export function timeline(scenario: Scenario, request?: Request): Timeline {
  const beats = beatsOf(scenario);
  if (request) {
    // The tool writes the request from this maker's own data, so they differ only when the
    // scenario changed since: the tool's `make` writes it again.
    const kind = (name: string, span: string) => `${name} (${span})`;
    const asked = request.spans.map((s) => kind(s.event, s.span)).join(", ");
    const own = beats.map((b) => kind(b.name, spanOf(b))).join(", ");
    if (asked !== own) throw new Error(`the request's spans (${asked}) are not the scenario's beats (${own}): make the video again`);
  }
  const duration = request ? request.duration : ms(beats.reduce((sum, beat) => sum + beat.takes, 0));
  const events: Timeline["events"] = [];
  const lines: Timeline["lines"] = [];
  let at = 0;
  beats.forEach((beat, i) => {
    const span = request?.spans[i];
    const start = span ? span.at : at;
    const length = span ? span.duration : beat.takes;
    events.push({ name: beat.name, at: ms(start), span: spanOf(beat), ...(span ? { natural: span.natural } : {}) });
    const share = length / Math.max(beat.says.length, 1);
    beat.says.forEach((line, k) => {
      // The request's times are whole milliseconds each, so their sum may pass its duration by one.
      lines.push({ who: line.who, text: line.text, from: ms(start + k * share), to: Math.min(ms(start + (k + 1) * share), duration) });
    });
    at += beat.takes;
  });
  return { duration, events, lines };
}

/**
 * The moment each frame of the requested clip shows, as the tool's shared code finds it (its
 * AGENTS.md, "The maker's shared code"): a span is a beat here. The tool puts every beat on a whole
 * frame; a move's motion takes its `move` seconds from there and then stays at its end, and the
 * next beat begins where it ended. Each speaker's mouth follows their lines' voice, whatever the
 * beat: a line with no speaker is the narrator's, whom nobody draws, so it opens no mouth, and a
 * speaker the scenario does not draw (a voice off stage) opens none either, as the picture looks
 * up its own characters only.
 */
export function moments(request: Request): Moment[] {
  return frames(request).map(({ span, ...at }) => ({ beat: span, ...at }));
}
