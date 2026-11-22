// The plugin as the video tool uses it: a scenario checked and planned, each command's description,
// and the picture of each frame of a request. Turning the pictures into a clip is the tool's, and
// its tests'.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { moments, type Request } from "ai-videos/plugin";
import { parse } from "yaml";
import plugin from "./plugin.ts";

const root = path.join(import.meta.dirname, "..");
/** The project's library, as the tool gives it to the plugin: without each character's voice. */
const library = (() => {
  const file = path.join(root, "library.yaml");
  const raw = parse(readFileSync(file, "utf8"));
  for (const character of Object.values(raw.characters)) delete (character as { voice?: string }).voice;
  return { file, raw };
})();
/** A cartoon's scenario, read and checked as the tool has the plugin do it: its file, without the tool's `use:`, and the library. */
const scenarioOf = (name: string) => {
  const file = path.join(root, "videos", `${name}.yaml`);
  const { use: _use, ...scenario } = parse(readFileSync(file, "utf8"));
  return plugin.check(scenario, file, library);
};
/** Pip walks in from off the stage and stops, the narrator telling it. */
const walk = plugin.check(
  {
    scenes: [
      {
        background: "morning",
        places: { pip: "off-left" },
        beats: [
          { name: "walks-in", takes: 4, walk: { who: "pip", to: "middle" }, says: [{ who: "narrator", text: "This is Pip. Pip walks into the meadow." }] },
          { name: "stops", takes: 3, says: [{ who: "narrator", text: "And here, Pip stops." }] },
        ],
      },
    ],
  },
  "walk.yaml",
  library,
);

test("the plan: its beats as events, its lines as texts", () => {
  assert.deepEqual(plugin.plan(walk), {
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
  // the-shy-visitor writes no beat's length: a hold takes its words' time, 0.3 s each.
  assert.deepEqual(plugin.plan(scenarioOf("the-shy-visitor")).texts.slice(0, 2), [
    { text: "It is a sunny morning in the meadow.", from: 0, to: 2.4 },
    { text: "Oh, nothing ever happens here.", speaker: "mo", from: 2.4, to: 3.9 },
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

test("the guide's example is a cartoon the plugin takes, against the library, with nothing to mend", () => {
  const examples = [...plugin.guide.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]!);
  assert.equal(examples.length, 1);
  const { use, ...source } = parse(examples[0]!);
  assert.equal(use, plugin.scene);
  assert.deepEqual(plugin.repair!(source, library).did, []);
  const scenario = plugin.check(source, "the guide", library);
  // It shows each move and each pose, and a background that changes.
  const beats = scenario.scenes.flatMap((s) => s.beats);
  for (const key of ["walk", "turn", "jump", "background"] as const) assert.ok(beats.some((b) => key in b && b[key] !== undefined), key);
  assert.deepEqual(new Set(beats.flatMap((b) => Object.values(b.pose))), new Set(["wave", "stand", "point"]));
});

// The walk in 8 frames with its motion in 6, then 4 frames of the stop.
const SMALL: Request = {
  fps: 30,
  frames: 12,
  spans: [
    { event: "walks-in", span: "move", at: 0, duration: 0.267, move: 0.2 },
    { event: "stops", span: "hold", at: 0.267, duration: 0.133 },
  ],
};
const size = { width: 320, height: 180 };
const pictures = (request: Request) => moments(request).map((moment) => plugin.frame(walk, moment, size));

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
