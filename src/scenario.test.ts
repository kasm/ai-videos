// A scenario written as a script (scenario.ts): the check, which gives the scenario worked out or
// every mistake with its line and a hint. The plugin's part here is a small one written for the
// test, its schema by hand. Reading a script's text is tried in read.test.ts, and what has no time in
// plan.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nearest } from "./names.ts";
import type { Schema, SchemaIssue } from "./plugin.ts";
import { readScript } from "./read.ts";
import { checkScenario, issuesText, type Issue, type SceneActions, type ScriptPlugin, type WrittenScript } from "./scenario.ts";

/** What `slide` takes: `to`, a side, and nothing else. */
const side: Schema<{ to: "left" | "right" }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(values) {
      const { to, ...rest } = values as Record<string, unknown>;
      const issues: SchemaIssue[] = Object.keys(rest).map((key) => ({ message: `slide takes no ${key}` }));
      if (to === "left" || to === "right") return issues.length > 0 ? { issues } : { value: { to } };
      return { issues: [...issues, { message: "it is left or right", path: ["to"] }] };
    },
    jsonSchema: { input: () => ({}), output: () => ({}) },
  },
};

/** A square that slides to a side: its scene names its colour, which the library has. */
const scripted = (seen: SceneActions[][] = []): ScriptPlugin => ({
  actions: { slide: { description: "The square slides to a side.", example: "sq slide to=right", values: side } },
  guide: "A square slides to a side, and speaks.",
  check(scenes, library) {
    seen.push(scenes);
    const colours = (library?.raw as { colours?: Record<string, string> } | undefined)?.colours ?? {};
    const issues: Issue[] = [];
    const worked = scenes.map((scene) => {
      const colour = colours[String(scene.setting.colour)];
      if (!colour) issues.push({ line: scene.line, message: `no colour is named "${scene.setting.colour}"`, hint: `the library has ${Object.keys(colours).join(", ")}` });
      return { setting: { colour: colour ?? "", x: 20 }, actions: scene.actions.map((a) => ({ values: { x: (a.values as { to: string }).to === "right" ? 120 : 20 }, length: 1.5 })) };
    });
    return issues.length > 0 ? { issues } : { scenes: worked };
  },
  draw: () => () => "<svg/>",
});

const LIBRARY = { file: "library.yaml", raw: { colours: { red: "#d04040" } } };

/** A scenario of one scene, its colour red, its script beginning on line 5 of the file. */
const written = (script: string, colour = "red"): WrittenScript => {
  const { items, issues } = readScript(script, 5);
  return { scenes: [{ line: 3, setting: { colour }, items }], issues };
};
/** The video's pauses. */
const TIMING = { lead: 0.6, gap: 0.4, tail: 1 };
const check = (script: string, plugin = scripted(), colour?: string) => checkScenario(plugin, written(script, colour), LIBRARY, ["sq"], TIMING);
const issuesOf = async (script: string, plugin?: ScriptPlugin, colour?: string) => {
  const checked = await check(script, plugin, colour);
  assert.ok("issues" in checked, "it is refused");
  return checked.issues;
};

test("the check gives the scenario worked out: what is said, and the plugin's actions in plain numbers", async () => {
  const seen: SceneActions[][] = [];
  const checked = await check("sq say: Here I go!\nsq slide to=right\nnarrator say: It went.", scripted(seen));
  assert.deepEqual(checked, {
    scenes: [
      {
        line: 3,
        setting: { colour: "#d04040", x: 20 },
        lead: 0.6,
        pause: 0.4,
        tail: 1,
        items: [
          { line: 5, who: "sq", action: "say", text: "Here I go!" },
          { line: 6, who: "sq", action: "slide", values: { x: 120 }, length: 1.5 },
          { line: 7, who: "narrator", action: "say", text: "It went." },
        ],
      },
    ],
    defaults: [
      { name: "lead", value: "0.6s", lines: [3] },
      { name: "pause", value: "0.4s", lines: [3] },
      { name: "tail", value: "1s", lines: [3] },
      { name: "speed", value: "1, or what the words beside it take", lines: [6] },
    ],
  });
  // The plugin gets each scene's own keys, and its own actions with what their schema gave.
  assert.deepEqual(seen, [[{ line: 3, setting: { colour: "red" }, actions: [{ line: 6, who: "sq", action: "slide", values: { to: "right" } }] }]]);
});

test("an unknown action is refused with its line, the actions there are, and the nearest", async () => {
  assert.deepEqual(await issuesOf("sq say: Hi.\nsq slid to=right"), [{ line: 6, message: 'no action is named "slid"', hint: "the actions are say and slide: did you mean slide?" }]);
  assert.deepEqual((await issuesOf("sq dance"))[0]!.hint, "the actions are say and slide");
});

test("a wrong value is refused with its line, the schema's reason, and the action's example", async () => {
  assert.deepEqual(await issuesOf("sq slide to=up"), [{ line: 5, message: "slide, to=up: it is left or right", hint: "as in: sq slide to=right" }]);
  assert.deepEqual(await issuesOf("sq slide"), [{ line: 5, message: "slide, to: it is left or right", hint: "as in: sq slide to=right" }]);
  assert.deepEqual(await issuesOf("sq slide to=left fast=1"), [{ line: 5, message: "slide: slide takes no fast", hint: "as in: sq slide to=right" }]);
  assert.deepEqual(await issuesOf("sq slide to=left: Whee!"), [{ line: 5, message: "slide takes no words after a colon: only say does", hint: "as in: sq slide to=right" }]);
});

test("say is the tool's: its speaker has a voice or is the narrator, it has words, and takes no values", async () => {
  assert.deepEqual(await issuesOf("sk say: Hi."), [
    { line: 5, message: '"sk" is neither the narrator nor a character with a voice', hint: "the characters with a voice are sq: did you mean sq?" },
  ]);
  assert.deepEqual((await issuesOf("sq say")).map((i) => i.message), ["sq says nothing"]);
  assert.deepEqual((await issuesOf("sq say loud=2: Hi.")).map((i) => i.message), ["say takes no loud"]);
  const nobody = await checkScenario(scripted(), written("mo say: Hi."), LIBRARY, [], TIMING);
  assert.ok("issues" in nobody);
  assert.equal(nobody.issues[0]!.hint, "no character has a voice");
});

test("every mistake is found in one pass, and the plugin's own check runs only on a script with none before it", async () => {
  const seen: SceneActions[][] = [];
  const issues = await issuesOf("sq\nsq slid to=right\nsq slide to=up\nmo say: Hi.", scripted(seen), "blue");
  assert.deepEqual(issues.map((i) => i.line), [5, 6, 7, 8]);
  assert.equal(seen.length, 0, "the plugin follows the lines in order: one missing would mislead it");
  // With the lines right, the plugin's mistakes come, each with its line and hint.
  assert.deepEqual(await issuesOf("sq slide to=right", scripted(seen), "blue"), [{ line: 3, message: 'no colour is named "blue"', hint: "the library has red" }]);
  assert.equal(seen.length, 1);
});

test("what the plugin's check gives is held to the contract: a scene and an action for each, in plain numbers", async () => {
  const giving = (scenes: unknown): ScriptPlugin => ({ ...scripted(), check: () => ({ scenes }) as never });
  const script = "sq slide to=right";
  const action = { values: { x: 120 }, length: 1.5 };
  await assert.rejects(check(script, giving([])), /the plugin's check of the script gave 0 scenes for 1/);
  await assert.rejects(check(script, giving([{ setting: {}, actions: [] }])), /scene 1 \(line 3\) 0 actions for 1/);
  await assert.rejects(check(script, giving([{ setting: { at: null }, actions: [action] }])), /a setting that is not numbers and names alone/);
  await assert.rejects(check(script, giving([{ setting: {}, actions: [{ ...action, values: { on: true } }] }])), /line 5 values that are not numbers and names alone/);
  await assert.rejects(check(script, giving([{ setting: {}, actions: [{ ...action, length: 0 }] }])), /line 5 the length 0: an action's own length is seconds, above 0/);
  await assert.rejects(check(script, { ...scripted(), check: () => ({ issues: [] }) }), /refused it with no mistake named/);
});

test("mistakes are shown in the file's order, each with the file, its line as written, the other lines it is between, and the hint", () => {
  const text = "use: square\nscenes:\n  - colour: red\n    script: |\n      sq slid to=right\n";
  const issues = [
    { line: 5, also: [1, 3], message: 'no action is named "slid"', hint: "the actions are say and slide: did you mean slide?" },
    { line: 3, message: 'no colour is named "red"', hint: "the library has none" },
  ];
  assert.equal(
    issuesText("videos/sq.yaml", text, issues),
    '2 mistakes in videos/sq.yaml:\n\nvideos/sq.yaml:3: - colour: red\n  no colour is named "red"\n  Hint: the library has none\n\n' +
      'videos/sq.yaml:5: sq slid to=right\n  no action is named "slid"\n  videos/sq.yaml:1: use: square\n  videos/sq.yaml:3: - colour: red\n  Hint: the actions are say and slide: did you mean slide?',
  );
  assert.equal(issuesText("sq", undefined, issues.slice(0, 1)), '1 mistake in sq:\n\nsq:5:\n  no action is named "slid"\n  sq:1:\n  sq:3:\n  Hint: the actions are say and slide: did you mean slide?');
});

test("the nearest name is a slip of a letter or two, and none when none is near", () => {
  assert.equal(nearest("wlak", ["say", "walk"]), "walk");
  assert.equal(nearest("medow", ["meadow", "morning"]), "meadow");
  assert.equal(nearest("dance", ["say", "walk"]), undefined);
  assert.equal(nearest("mo", ["pip"]), undefined);
});
