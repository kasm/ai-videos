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
  assert.deepEqual(frames[0], { beat: 0, progress: 0, mouth: 0 });
  assert.deepEqual(frames[30], { beat: 0, progress: 0.5, mouth: 0 });
  assert.deepEqual(frames[60], { beat: 0, progress: 1, mouth: 0 });
  assert.deepEqual(frames[89], { beat: 0, progress: 1, mouth: 0 });
  assert.deepEqual(frames[90], { beat: 1, progress: 0, mouth: 0 });
  assert.deepEqual(frames[134], { beat: 1, progress: 0, mouth: 0 });
});

test("the mouth follows each line's track in the frames it names, and is closed in every other", () => {
  // Two lines: one from frame 18 with a pause in it, across the walk; one from frame 88, into the stop.
  const lines = [
    { text: "One. Two.", at: 0.6, duration: 0.2, mouth: { frame: 18, open: [0.5, 1, 0, 0, 0.8, 0.3] } },
    { text: "Three.", at: 2.95, duration: 0.1, mouth: { frame: 88, open: [0.2, 0.9, 1, 0.4] } },
    { text: "A line with no track." },
  ];
  const spoken = checkRequest({ ...request(), lines }, "test");
  const mouth = moments(spoken).map((m) => m.mouth);
  assert.deepEqual(mouth.slice(16, 26), [0, 0, 0.5, 1, 0, 0, 0.8, 0.3, 0, 0], "closed before the line, in its pause and after it");
  assert.deepEqual(mouth.slice(87, 93), [0, 0.2, 0.9, 1, 0.4, 0], "a line goes on from one beat into the next");
  assert.equal(mouth.filter((open) => open > 0).length, 8, "no other frame has the mouth open");
  // The beats are as without the lines: the mouth changes nothing else.
  assert.deepEqual(moments(spoken).map(({ beat, progress }) => [beat, progress]), moments(request()).map(({ beat, progress }) => [beat, progress]));
});

test("two lines in one frame show the wider mouth, and a track past the clip's end is cut there", () => {
  const lines = [{ mouth: { frame: 10, open: [0.6, 0.2] } }, { mouth: { frame: 11, open: [0.5, 0.7] } }, { mouth: { frame: 133, open: [0.1, 0.2, 0.3] } }];
  const mouth = moments(checkRequest({ ...request(), lines }, "test")).map((m) => m.mouth);
  assert.deepEqual(mouth.slice(10, 13), [0.6, 0.5, 0.7]);
  assert.equal(mouth.length, 135);
  assert.deepEqual(mouth.slice(133), [0.1, 0.2]);
});

test("a request with no lines is read, and a mouth track that is not one is refused", () => {
  const { lines: _, ...bare } = request();
  assert.deepEqual(checkRequest(bare, "test").lines, []);
  assert.throws(() => checkRequest({ ...request(), lines: [{ mouth: { frame: 3, open: [0.2, 1.5] } }] }, "old.json"), /old\.json is not a request/);
  assert.throws(() => checkRequest({ ...request(), lines: [{ mouth: { frame: 0.5, open: [] } }] }, "old.json"), /old\.json is not a request/);
});

test("a request whose beats do not follow each other from frame 0 is refused", () => {
  const late = request([
    { event: "walks-in", span: "move", natural: 4, at: 0.5, duration: 2.5 },
    { event: "stops", span: "hold", natural: 3, at: 3, duration: 1.5 },
  ]);
  assert.throws(() => moments(late), /"walks-in" does not follow/);
});
