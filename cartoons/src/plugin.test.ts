// The plugin as the video tool uses it: a scenario checked and planned, each command's description,
// and the picture of each frame of a request. Turning the pictures into a clip is the tool's, and
// its tests'.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { moments, type Request } from "ai-videos/frames";
import { parse } from "yaml";
import plugin from "./plugin.ts";

const videos = path.join(import.meta.dirname, "../videos");
/** A cartoon's scenario, read and checked as the tool has the plugin do it: its file, without the tool's `use:`. */
const scenarioOf = (name: string) => {
  const file = path.join(videos, `${name}.yaml`);
  const { use: _use, ...scenario } = parse(readFileSync(file, "utf8"));
  return plugin.check(scenario, file);
};

test("hello's plan: its beats as events, its lines as texts", () => {
  assert.deepEqual(plugin.plan(scenarioOf("hello")), {
    duration: 7,
    events: [
      { name: "walks-in", at: 0, span: "move" },
      { name: "stops", at: 4, span: "hold" },
    ],
    texts: [
      { text: "This is Pip. Pip walks into the meadow.", from: 0, to: 4 },
      { text: "And here, Pip stops.", from: 4, to: 7 },
    ],
  });
});

test("each character's text names it as the speaker, and the narrator's names nobody", () => {
  assert.deepEqual(plugin.plan(scenarioOf("meet")).texts, [
    { text: "Pip is waiting in the meadow.", from: 0, to: 3 },
    { text: "Oh, someone is coming! Hello! Who are you?", speaker: "pip", from: 3, to: 6 },
    { text: "I am Mo. I live behind the hill.", speaker: "mo", from: 6, to: 8 },
    { text: "I am Pip. Shall we play?", speaker: "pip", from: 8, to: 10 },
    { text: "Yes, let's play!", speaker: "mo", from: 10, to: 12 },
  ]);
});

test("each command is described, and its example passes its schema", async () => {
  assert.deepEqual(Object.keys(plugin.commands), ["walk", "turn", "jump", "pose", "background"]);
  for (const [name, { description, example, schema }] of Object.entries(plugin.commands)) {
    assert.ok(description.length > 20, `${name} says what it does`);
    const checked = await schema["~standard"].validate(example);
    assert.equal(checked.issues, undefined, `${name}'s example`);
    assert.ok(schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }), `${name}'s JSON Schema`);
  }
});

// hello's walk in 8 frames with its motion in 6, then 4 frames of the stop.
const SMALL: Request = {
  fps: 30,
  frames: 12,
  spans: [
    { event: "walks-in", span: "move", at: 0, duration: 0.267, move: 0.2 },
    { event: "stops", span: "hold", at: 0.267, duration: 0.133 },
  ],
};
const size = { width: 320, height: 180 };
const pictures = (request: Request) => moments(request).map((moment) => plugin.frame(scenarioOf("hello"), moment, size));

test("each frame of the walk is its own picture; from its end on, through the stop, the picture stays", () => {
  const frames = pictures(SMALL);
  assert.equal(frames.length, 12);
  assert.equal(new Set(frames.slice(0, 7)).size, 7);
  assert.equal(new Set(frames.slice(6)).size, 1);
  assert.match(frames[0]!, /^<svg [^>]*viewBox="0 0 1920 1080" width="320" height="180">/);
  assert.deepEqual(pictures(SMALL), frames, "the same request, the same pictures");
});

test("Pip's line opens Pip's mouth in its track's frames, and nowhere else; the narrator's opens none", () => {
  // A line spoken through the stop: open, closed for a pause, open as wide again.
  const line = { mouth: { frame: 8, open: [0.7, 0, 0.7] } };
  const silent = pictures(SMALL);
  assert.deepEqual(pictures({ ...SMALL, lines: [line] }), silent, "with no speaker the line is the narrator's: nobody's mouth moves");
  const frames = pictures({ ...SMALL, lines: [{ ...line, speaker: "pip" }] });
  assert.deepEqual(frames.slice(0, 8), silent.slice(0, 8), "the walk, before the line: as with no line");
  assert.notEqual(frames[8], silent[8], "the mouth is open");
  assert.equal(frames[9], silent[9], "closed in the pause");
  assert.equal(frames[10], frames[8], "open as wide again: the same picture");
  assert.equal(frames[11], silent[11], "closed after the line");
});
