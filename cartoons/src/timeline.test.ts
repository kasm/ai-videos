import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRequest } from "./request.ts";
import { checkScenario } from "./scenario.ts";
import { moments, timeline } from "./timeline.ts";

const scene = (beats: unknown[]) => ({ background: "meadow", places: { pip: [0, 900] }, beats });
const scenario = (...scenes: unknown[]) =>
  checkScenario(
    {
      characters: { pip: { parts: { body: [{ shape: "ellipse", at: [0, -100], size: [100, 200], fill: "#f2a33a" }] } } },
      backgrounds: { meadow: { fill: "#bfe3ff" } },
      scenes,
    },
    "test",
  );
const says = (...texts: string[]) => texts.map((text) => ({ who: "narrator", text }));

test("each beat is an event: a move with a walk, a hold without, one after another from 0", () => {
  const t = timeline(
    scenario(
      scene([
        { name: "walks-in", takes: 4, walk: { who: "pip", to: [960, 900] } },
        { name: "stops", takes: 2.5 },
        { name: "walks-on", takes: 1.5, walk: { who: "pip", to: [1500, 900] } },
      ]),
    ),
  );
  assert.deepEqual(t.events, [
    { name: "walks-in", at: 0, span: "move" },
    { name: "stops", at: 4, span: "hold" },
    { name: "walks-on", at: 6.5, span: "move" },
  ]);
  assert.equal(t.duration, 8);
});

test("a beat's line has the beat's whole time, and keeps its speaker", () => {
  const t = timeline(scenario(scene([{ name: "waits", takes: 1 }, { name: "talks", takes: 3, says: [{ who: "pip", text: "Hello!" }] }])));
  assert.deepEqual(t.lines, [{ who: "pip", text: "Hello!", from: 1, to: 4 }]);
});

test("a beat's lines share its time in equal parts, the first from the beat's start", () => {
  const t = timeline(scenario(scene([{ name: "talks", takes: 1, says: says("One.", "Two.", "Three.") }])));
  assert.deepEqual(
    t.lines.map((l) => [l.from, l.to]),
    [[0, 0.333], [0.333, 0.667], [0.667, 1]],
  );
});

test("scenes follow each other on one timeline", () => {
  const t = timeline(scenario(scene([{ name: "first", takes: 2 }]), scene([{ name: "second", takes: 3, says: says("Later.") }])));
  assert.deepEqual(t.events.map((e) => e.at), [0, 2]);
  assert.deepEqual(t.lines, [{ who: "narrator", text: "Later.", from: 2, to: 5 }]);
  assert.equal(t.duration, 5);
});

// A walk of 4 s and a hold of 3 s, fitted to a voice: the walk in 3 s with its motion in 2, the hold in 1.5.
const walkAndStop = () =>
  scenario(
    scene([
      { name: "walks-in", takes: 4, walk: { who: "pip", to: [960, 900] }, says: says("One.", "Two.") },
      { name: "stops", takes: 3, says: says("Three.") },
    ]),
  );
const request = (spans: unknown[] = [
  { event: "walks-in", span: "move", natural: 4, at: 0, duration: 3, move: 2 },
  { event: "stops", span: "hold", natural: 3, at: 3, duration: 1.5 },
]) => checkRequest({ format: "ai-videos-request", version: 1, fps: 30, duration: 4.5, frames: 135, spans, lines: [] }, "test");

test("drawn to a request, beats begin and last as it says, and keep their own length as natural", () => {
  const t = timeline(walkAndStop(), request());
  assert.deepEqual(t.events, [
    { name: "walks-in", at: 0, span: "move", natural: 4 },
    { name: "stops", at: 3, span: "hold", natural: 3 },
  ]);
  assert.deepEqual(t.lines.map((l) => [l.from, l.to]), [[0, 1.5], [1.5, 3], [3, 4.5]]);
  assert.equal(t.duration, 4.5);
});

test("a request for other beats is refused", () => {
  const other = request([{ event: "walks-in", span: "move", natural: 4, at: 0, duration: 4.5 }]);
  assert.throws(() => timeline(walkAndStop(), other), /are not the scenario's beats.*make the video again/);
  const otherKind = request([
    { event: "walks-in", span: "hold", natural: 4, at: 0, duration: 3 },
    { event: "stops", span: "hold", natural: 3, at: 3, duration: 1.5 },
  ]);
  assert.throws(() => timeline(walkAndStop(), otherKind), /are not the scenario's beats/);
});

test("every frame of the request has its moment: a move's motion, then its end until the next beat", () => {
  const frames = moments(request());
  assert.equal(frames.length, 135);
  assert.deepEqual(frames[0], { beat: 0, progress: 0 });
  assert.deepEqual(frames[30], { beat: 0, progress: 0.5 });
  assert.deepEqual(frames[60], { beat: 0, progress: 1 });
  assert.deepEqual(frames[89], { beat: 0, progress: 1 });
  assert.deepEqual(frames[90], { beat: 1, progress: 0 });
  assert.deepEqual(frames[134], { beat: 1, progress: 0 });
});

test("a request whose beats do not follow each other from frame 0 is refused", () => {
  const late = request([
    { event: "walks-in", span: "move", natural: 4, at: 0.5, duration: 2.5 },
    { event: "stops", span: "hold", natural: 3, at: 3, duration: 1.5 },
  ]);
  assert.throws(() => moments(late), /"walks-in" does not follow/);
});
