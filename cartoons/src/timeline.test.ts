import assert from "node:assert/strict";
import { test } from "node:test";
import { checkScenario } from "./scenario.ts";
import { timeline } from "./timeline.ts";

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
