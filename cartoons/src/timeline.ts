// A scenario's beats as the clip's timeline: the events and texts the video tool fits the voice to
// (the tool's AGENTS.md, "Clips"), at the scenario's own pace or as the tool's request times them.
import type { Request } from "./request.ts";
import type { Scenario } from "./scenario.ts";

export interface Timeline {
  /** The clip's length, seconds: every beat's time, added up. */
  duration: number;
  /** One event per beat, in order, the first at 0. Drawn to a request, each keeps its `natural`. */
  events: { name: string; at: number; span: "hold" | "move"; natural?: number }[];
  /** One text per line, with its speaker and the time it has. */
  lines: { who: string; text: string; from: number; to: number }[];
}

/** Where the picture is in the scenario: in which beat, counted through every scene, and how far through its move (0 to 1). */
export interface Moment {
  beat: number;
  progress: number;
}

/** Whole milliseconds, so times added up from fractions stay equal where they should. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

const beatsOf = (scenario: Scenario) => scenario.scenes.flatMap((scene) => scene.beats);

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
    const own = beats.map((b) => kind(b.name, b.walk ? "move" : "hold")).join(", ");
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
    events.push({ name: beat.name, at: ms(start), span: beat.walk ? "move" : "hold", ...(span ? { natural: span.natural } : {}) });
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
 * The moment each frame of the requested clip shows. The tool puts every beat on a whole frame; a
 * move's motion takes its `move` seconds from there and then stays at its end, and the next beat
 * begins where it ended.
 */
export function moments(request: Request): Moment[] {
  const starts = request.spans.map((span) => Math.round(span.at * request.fps));
  const frames: Moment[] = [];
  request.spans.forEach((span, beat) => {
    const start = starts[beat]!;
    const end = starts[beat + 1] ?? request.frames;
    if (start !== frames.length || end <= start) throw new Error(`the request's span "${span.event}" does not follow the one before it on a whole frame`);
    for (let frame = start; frame < end; frame++) {
      const progress = span.span === "move" ? Math.min(1, (frame - start) / request.fps / (span.move ?? span.duration)) : 0;
      frames.push({ beat, progress });
    }
  });
  return frames;
}
