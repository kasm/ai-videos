// Fits a clip to the voice: from the measured narration and the clip's events, how long each span
// of the clip should last (the request), so that each line cued to an event starts as the clip
// reaches it. Whatever drew the clip draws it again to the request; the tool never retimes video.
//
// Each cued line fixes when its event happens: when the voice gets to the line. The spans between
// two fixed events share that time, in whole frames. Short of time, holds shrink first (to a frame),
// then moves play faster, up to `fastest`; when even that is too slow, the voice waits for the clip.
// With time to spare, holds take it and moves keep their own speed; with no hold to take it, moves
// play slower, down to `slowest`, and past that a hold follows them. After the last cue the clip
// ends with the scene: holds shrink to end it with the voice (and the tail), but moves keep their
// speed, as no voice is waiting for them.
//
// One event may have limits of its own, over those (`limits` in a clip scene): a move its own
// `slowest` and `fastest`, a hold the `least` it shrinks to instead of a frame. A hold's `least`
// longer than its own length makes it that long: it is what the hold must show.
import path from "node:path";
import type { ClipEvent } from "./clip.ts";
import type { EventLimitsScript } from "./script.ts";

/** A narration line as the fit needs it: measured, in seconds. */
export interface FitLine {
  text: string;
  cue?: string;
  pause: number;
  duration: number;
}

export interface FitTiming {
  fps: number;
  lead: number;
  gap: number;
  tail: number;
  /** The slowest and fastest a move may play, as multiples of its own speed. */
  slowest: number;
  fastest: number;
}

/** One span of the clip as the request asks for it, in seconds. */
export interface RequestSpan {
  /** The event it starts at. */
  event: string;
  span: "hold" | "move";
  /** Its length at the clip's own pace. */
  natural: number;
  /** When it starts, in the clip drawn to the request. */
  at: number;
  /** How long it lasts there. */
  duration: number;
  /** Moves only: how long the motion takes. Any rest of `duration` holds the move's last frame. */
  move?: number;
}

export interface Fit {
  /** The scene's length in whole frames; the spans add up to it. */
  frames: number;
  /** The same, in seconds. */
  duration: number;
  spans: RequestSpan[];
  /** When each line starts, from the scene's start, and how long the voice waits for the clip there. */
  lines: { text: string; cue?: string; at: number; waits: number }[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (t: number) => Math.round(t * 1000) / 1000;
const EPS = 1e-6;

/** Each span's length at the clip's own pace: its `natural`, else the time to the next event. */
export function naturalLengths(events: ClipEvent[], duration: number): number[] {
  return events.map((e, i) => e.natural ?? (events[i + 1]?.at ?? duration) - e.at);
}

/** A span in frames: what it would like (its own pace), the least it may take and, for a move, the most before a hold follows. */
interface Span {
  move: boolean;
  own: number;
  least: number;
  most: number;
}

/** What a span gets: frames in all, and for a move, how many of them the motion takes. */
interface Share {
  frames: number;
  motion: number;
}

/** `total` whole frames over items: each gets its `base`, and the rest goes by `weight` (largest remainder first). */
function spread(total: number, base: number[], weight: number[]): number[] {
  if (base.length === 0) return [];
  const w = sum(weight) > 0 ? weight : base.map(() => 1);
  const rest = total - sum(base);
  const exact = w.map((x) => (rest * x) / sum(w));
  const out = base.map((b, i) => b + Math.floor(exact[i]! + EPS));
  const order = exact.map((x, i) => [x - Math.floor(x + EPS), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0, left = total - sum(out); left > 0; k++, left--) out[order[k % order.length]![1]]!++;
  return out;
}

/** Shares `total` frames among consecutive spans, as the header says. `total` is at least their `least`. */
function share(spans: Span[], total: number): Share[] {
  const holds = spans.flatMap((s, i) => (s.move ? [] : [i]));
  const moves = spans.flatMap((s, i) => (s.move ? [i] : []));
  const out: Share[] = spans.map((s) => ({ frames: s.own, motion: s.move ? s.own : 0 }));
  const set = (idx: number[], frames: number[], motion = false) =>
    idx.forEach((i, k) => {
      out[i]!.frames = frames[k]!;
      if (motion) out[i]!.motion = frames[k]!;
    });
  const of = (idx: number[], key: keyof Span) => idx.map((i) => spans[i]![key] as number);
  const movesOwn = sum(of(moves, "own"));

  if (total <= sum(of(holds, "own")) + movesOwn) {
    // Short of time: holds shrink first, each to its least, then moves speed up.
    const holdsLeast = of(holds, "least");
    if (total - movesOwn >= sum(holdsLeast)) {
      set(holds, spread(total - movesOwn, holdsLeast, of(holds, "own").map((x, k) => x - holdsLeast[k]!)));
    } else {
      set(holds, holdsLeast);
      const least = of(moves, "least");
      set(moves, spread(total - sum(holdsLeast), least, of(moves, "own").map((x, k) => x - least[k]!)), true);
    }
  } else if (holds.length) {
    // Time to spare, and holds to take it, in proportion to their own length.
    const own = of(holds, "own");
    set(holds, spread(total - movesOwn, own, own));
  } else {
    // Time to spare and only moves: they slow down, then a hold follows the last of them.
    const own = of(moves, "own");
    const most = of(moves, "most");
    if (total <= sum(most)) {
      set(moves, spread(total, own, most.map((x, k) => x - own[k]!)), true);
    } else {
      set(moves, most, true);
      out[moves.at(-1)!]!.frames += total - sum(most);
    }
  }
  return out;
}

/**
 * The request for one clip scene: how long each span should last for the voice to land on its
 * events. `limits` are single events' own (loadClips has checked each names an event of its kind).
 */
export function fitClip(
  events: ClipEvent[],
  clipDuration: number,
  lines: FitLine[],
  timing: FitTiming,
  limits: Record<string, EventLimitsScript> = {},
): Fit {
  const F = timing.fps;
  const natural = naturalLengths(events, clipDuration);
  const spans: Span[] = events.map((e, i) => {
    const own = Math.max(1, Math.round(natural[i]! * F));
    const limit = limits[e.name] ?? {};
    if (e.span === "hold") {
      const least = Math.max(1, Math.round((limit.least ?? 0) * F));
      return { move: false, own: Math.max(own, least), least, most: Infinity };
    }
    const least = Math.min(own, Math.max(1, Math.ceil((natural[i]! * F) / (limit.fastest ?? timing.fastest) - EPS)));
    const most = Math.max(own, Math.floor((natural[i]! * F) / (limit.slowest ?? timing.slowest) + EPS));
    return { move: true, own, least, most };
  });
  const shares: Share[] = new Array(events.length);
  const place = (from: number, to: number, total: number) =>
    share(spans.slice(from, to), total).forEach((s, k) => (shares[from + k] = s));
  const index = new Map(events.map((e, i) => [e.name, i]));

  let fixed = 0; // the last event a line fixed (the first is at 0) ...
  let frame = 0; // ... and its frame
  let t = timing.lead; // the voice's clock, seconds from the scene's start
  const placed: Fit["lines"] = [];
  for (const line of lines) {
    t += line.pause;
    let waits = 0;
    const k = line.cue === undefined ? undefined : index.get(line.cue);
    if (k === undefined && line.cue !== undefined) throw new Error(`cue "${line.cue}" is not an event of the clip`);
    if (k !== undefined && k > fixed) {
      const wanted = Math.ceil(t * F - EPS);
      const earliest = frame + sum(spans.slice(fixed, k).map((s) => s.least));
      const at = Math.max(wanted, earliest);
      if (earliest > wanted) waits = at / F - t;
      place(fixed, k, at - frame);
      fixed = k;
      frame = at;
      t = at / F;
    }
    placed.push({ text: line.text, ...(line.cue ? { cue: line.cue } : {}), at: round(t), waits: round(waits) });
    t += line.duration + timing.gap;
  }

  // After the last cue: the clip ends with the voice and the tail, its moves at their own speed.
  const voiceEnd = lines.length ? t - timing.gap : t;
  const rest = spans.slice(fixed);
  const least = sum(rest.map((s) => (s.move ? s.own : s.least)));
  const frames = Math.max(Math.ceil((voiceEnd + timing.tail) * F - EPS), frame + least);
  place(fixed, events.length, frames - frame);

  let at = 0;
  const request = events.map((e, i): RequestSpan => {
    const s = shares[i]!;
    const span: RequestSpan = { event: e.name, span: e.span, natural: round(natural[i]!), at: round(at / F), duration: round(s.frames / F) };
    if (e.span === "move") span.move = round(s.motion / F);
    at += s.frames;
    return span;
  });
  return { frames, duration: frames / F, spans: request, lines: placed };
}

/** Where the request for a clip goes: beside it, `<clip>.request.json`. */
export function requestFileOf(clipFile: string): string {
  const ext = path.extname(clipFile);
  return `${clipFile.slice(0, clipFile.length - ext.length)}.request.json`;
}

/**
 * The request as a file, for whatever draws the clip. It draws each span from `at` for `duration`
 * seconds: a hold shows its picture that long; a move plays its motion over `move` seconds and holds
 * its last frame for the rest. The clip it draws lasts `duration`, and its JSON puts each event at
 * its span's `at` and keeps each span's `natural`, so a later fit starts from the clip's own pace.
 */
export function requestDocument(fit: Fit, meta: { from: string; clip: string; fps: number }) {
  return {
    format: "ai-videos-request",
    version: 1,
    made: { by: "ai-videos request", from: meta.from },
    clip: meta.clip,
    fps: meta.fps,
    duration: round(fit.duration),
    frames: fit.frames,
    spans: fit.spans,
    lines: fit.lines,
  };
}

/** Whether a clip is drawn to this fit already: each event where the fit puts it, and the same length, to half a frame. */
export function drawnTo(fit: Fit, events: ClipEvent[], clipDuration: number, fps: number): boolean {
  const slack = 0.5 / fps;
  return Math.abs(clipDuration - fit.duration) <= slack && events.every((e, i) => Math.abs(e.at - fit.spans[i]!.at) <= slack);
}
