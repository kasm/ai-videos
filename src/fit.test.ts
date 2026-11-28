// Fitting a clip to the voice: what the request asks of holds and moves, and that it adds up.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClipEvent } from "./clip.ts";
import { drawnTo, fitClip, type Fit, type FitLine, type FitTiming } from "./fit.ts";
import type { VideoScript } from "./script.ts";
import { buildTimeline, type SpokenLine } from "./timeline.ts";

const TIMING: FitTiming = { fps: 30, lead: 0.6, gap: 0.4, tail: 1.0, slowest: 0.5, fastest: 2 };
const F = TIMING.fps;

const hold = (name: string, at: number): ClipEvent => ({ name, at, span: "hold" });
const move = (name: string, at: number): ClipEvent => ({ name, at, span: "move" });
const line = (duration: number, cue?: string): FitLine => ({ text: `${duration} s`, cue, duration });
const span = (fit: Fit, event: string) => fit.spans.find((s) => s.event === event)!;
const frames = (seconds: number) => Math.round(seconds * F);

/** The spans tile the scene: each starts where the one before ends, and they add up to its length. */
function assertAddsUp(fit: Fit) {
  let at = 0;
  for (const s of fit.spans) {
    assert.equal(frames(s.at), at, `"${s.event}" starts where the span before it ends`);
    at += frames(s.duration);
  }
  assert.equal(at, fit.frames, "the spans add up to the scene");
  assert.equal(fit.duration, fit.frames / F);
}

test("a hold stretches to the voice", () => {
  // The square holds for 2 s, but the first line takes 5 s: the next line's event waits for it.
  const fit = fitClip([hold("start", 0), move("slide", 2), hold("there", 3)], 5, [line(5, "start"), line(1, "slide")], TIMING);
  assert.deepEqual(span(fit, "start"), { event: "start", span: "hold", natural: 2, at: 0, duration: 6 });
  assert.deepEqual(span(fit, "slide"), { event: "slide", span: "move", natural: 1, at: 6, duration: 1, move: 1 });
  assert.equal(fit.lines[1]!.at, 6);
  assert.equal(fit.lines[1]!.waits, 0);
  assertAddsUp(fit);
});

test("a move plays at most `fastest` times its speed, and then the voice waits", () => {
  // The slide takes 2 s at its own pace; the next line comes 0.9 s after it starts.
  const fit = fitClip([hold("start", 0), move("slide", 1), hold("there", 3)], 4, [line(0.5, "slide"), line(1, "there")], TIMING);
  const slide = span(fit, "slide");
  assert.equal(slide.move, slide.natural / TIMING.fastest, "the move at its fastest");
  assert.equal(slide.duration, slide.move, "and nothing after it");
  assert.equal(fit.lines[1]!.waits, 0.1, "the voice waits for the rest");
  assert.equal(fit.lines[1]!.at, 1.6);
  assertAddsUp(fit);
});

test("one move's own `fastest` holds it alone; the others keep the clip's", () => {
  // The fly takes 4 s and the slide 2 s; the voice gets to the end 0.9 s after the fly starts.
  const events = [hold("start", 0), move("fly", 1), move("slide", 5), hold("end", 7)];
  const fit = fitClip(events, 8, [line(0.5, "fly"), line(0.5, "end")], TIMING, { fly: { fastest: 4 } });
  assert.equal(span(fit, "fly").move, 1, "the fly at its own fastest, 4 times its speed");
  assert.equal(span(fit, "slide").move, 2 / TIMING.fastest, "the slide at the clip's");
  assert.equal(fit.lines[1]!.waits, 1.1, "the voice waits for the rest");
  assertAddsUp(fit);
});

test("a hold shrinks no further than its own `least`: the moves speed up first, then the voice waits", () => {
  // "there" holds 2 s and must show 1.5 s of it; the voice gets to "rise" 0.9 s after the slide starts.
  const events = [hold("start", 0), move("slide", 1), hold("there", 2), move("rise", 4), hold("up", 5)];
  const lines = [line(0.5, "slide"), line(0.5, "rise")];
  assert.equal(frames(span(fitClip(events, 6, lines, TIMING), "there").duration), 1, "with no limit, a frame");
  const fit = fitClip(events, 6, lines, TIMING, { there: { least: 1.5 } });
  assert.equal(span(fit, "there").duration, 1.5);
  assert.equal(span(fit, "slide").move, 0.5, "the slide at its fastest");
  assert.equal(fit.lines[1]!.waits, 1.1);
  assertAddsUp(fit);
});

test("a move with no hold after it slows down, within `slowest`", () => {
  // The slide's 1 s has to fill 1.4 s, and no hold is there to take the extra.
  const fit = fitClip([hold("start", 0), move("slide", 1), move("rise", 2), hold("up", 3)], 4, [line(1, "slide"), line(1, "rise")], TIMING);
  const slide = span(fit, "slide");
  assert.equal(slide.duration, 1.4);
  assert.equal(slide.move, 1.4, "all of it moving, at 0.71 times its speed");
  assertAddsUp(fit);
});

test("past `slowest`, a hold follows the move", () => {
  // The slide's 1 s has to fill 4.4 s: it moves at half its speed, then holds.
  const fit = fitClip([hold("start", 0), move("slide", 1), move("rise", 2), hold("up", 3)], 4, [line(4, "slide"), line(1, "rise")], TIMING);
  const slide = span(fit, "slide");
  assert.equal(slide.duration, 4.4);
  assert.equal(slide.move, slide.natural / TIMING.slowest, "the move at its slowest");
  assert.equal(fit.lines[1]!.at, 5);
  assertAddsUp(fit);
});

test("holds shrink before moves speed up", () => {
  // 1.5 s from "slide" to "rise", where the clip's own pace takes 1 + 2 = 3 s.
  const fit = fitClip([hold("start", 0), move("slide", 1), hold("across", 2), move("rise", 4), hold("up", 5)], 6, [line(1.1, "slide"), line(1, "rise")], TIMING);
  assert.equal(span(fit, "slide").move, 1, "the move keeps its own speed");
  assert.equal(span(fit, "across").duration, 0.5, "the hold gives up 1.5 s");
  assert.equal(fit.lines[1]!.waits, 0);
  assertAddsUp(fit);
});

test("after the voice, the clip ends with the tail, its moves at their own speed", () => {
  // One short line, and a 6 s clip: its holds shrink to end 1 s after the voice; the move does not.
  const fit = fitClip([hold("start", 0), move("slide", 1), hold("end", 3)], 6, [line(1, "start")], TIMING);
  assert.equal(fit.frames, frames(0.6 + 1 + TIMING.tail));
  assert.equal(span(fit, "slide").move, 2);
  assertAddsUp(fit);
});

/** A square's clip that waits, slides, waits, rises and waits: its events, and lines as long as their voice. */
const SQUARE_EVENTS = [hold("start", 0), move("slide", 5), hold("across", 6.5), move("rise", 10), hold("up", 11)];
const SQUARE_LINES = [line(4.003, "start"), line(4.787, "slide"), line(1.544, "rise"), line(3.498)];

test("a request adds up to the video's length, and a clip drawn to it puts every line on its event", () => {
  const fit = fitClip(SQUARE_EVENTS, 13, SQUARE_LINES, TIMING);
  assertAddsUp(fit);
  assert.ok(!drawnTo(fit, SQUARE_EVENTS, 13, F), "the clip at its own pace is not drawn to the voice");

  // The clip drawn to the request: each event at its span's `at`, its own pace kept as `natural`.
  const drawn: ClipEvent[] = SQUARE_EVENTS.map((e, i) => ({ ...e, at: fit.spans[i]!.at, natural: fit.spans[i]!.natural }));
  assert.ok(drawnTo(fit, drawn, fit.duration, F));
  assert.deepEqual(fitClip(drawn, fit.duration, SQUARE_LINES, TIMING), fit, "fitting it again asks for the same");

  // Built as one scene, the video lasts what the request does, and each line starts where the fit put it.
  const script = { fps: F, timing: { lead: 0.6, gap: 0.4, tail: 1 }, scenes: [{ id: "square", narration: [] }] } as unknown as VideoScript;
  const spoken: SpokenLine[] = SQUARE_LINES.map((l, i) => ({ ...l, n: i + 1, audioFile: "", unsure: [] }));
  const notes: string[] = [];
  const timeline = buildTimeline(script, new Map([["square", { byFormat: {}, duration: fit.duration, events: drawn }]]), [spoken], (m) => notes.push(m));
  assert.equal(timeline.duration, Math.round(fit.duration * 1000) / 1000, "the video's length is the request's");
  assert.deepEqual(timeline.scenes[0]!.lines.map((l) => l.localStart), fit.lines.map((l) => l.at));
  assert.deepEqual(notes, [], "no line waits for the clip, or starts late");
});
