// A scenario written as a script (scenario.ts): its lines read from the text, each with its line in
// the file, and the check, which gives the scenario worked out or every mistake with its line and a
// hint. The plugin's part here is a small one written for the test, its schema by hand.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Schema, SchemaIssue } from "./plugin.ts";
import { checkScenario, issuesText, nearest, readScript, type Issue, type SceneActions, type ScriptPlugin, type WrittenScript } from "./scenario.ts";

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
const written = (script: string, colour = "red"): WrittenScript => ({ scenes: [{ line: 3, setting: { colour }, ...{ lines: readScript(script, 5).lines } }], issues: readScript(script, 5).issues });
const check = (script: string, plugin = scripted(), colour?: string) => checkScenario(plugin, written(script, colour), LIBRARY, ["sq"]);
const issuesOf = async (script: string, plugin?: ScriptPlugin, colour?: string) => {
  const checked = await check(script, plugin, colour);
  assert.ok("issues" in checked, "it is refused");
  return checked.issues;
};

test("a line is who, the action, its values, and after the first colon its words, as written", () => {
  const read = readScript("sq slide to=right times=2\n\n# a note for the reader\nsq say: Here I go: a=b, @ 50%!\nnarrator say:   Done.  \n", 7);
  assert.deepEqual(read.issues, []);
  assert.deepEqual(read.lines, [
    { line: 7, who: "sq", action: "slide", values: { to: "right", times: 2 } },
    { line: 10, who: "sq", action: "say", values: {}, text: "Here I go: a=b, @ 50%!" },
    { line: 11, who: "narrator", action: "say", values: {}, text: "Done." },
  ]);
  // A file's line endings are not the script's.
  assert.deepEqual(readScript("sq say: One.\r\nsq say: Two.\r\n").lines.map((l) => [l.line, l.text]), [[1, "One."], [2, "Two."]]);
});

test("what is not a line is refused, with its line and a hint, and the lines around it are read", () => {
  const read = readScript(["sq", "Sq slide", "sq slide right", "sq slide to=right to=left", "sq slide to=2s", "  sq slide to=right", "sq say: Hello!", "sq Slide: x"].join("\n"), 20);
  assert.deepEqual(read.lines.map((l) => l.line), [26]);
  assert.deepEqual(read.issues.map((i) => [i.line, i.message]), [
    [20, "sq does nothing: the action comes after the name"],
    [21, '"Sq" is not a name: a line begins with who does it'],
    [22, '"right" is not a value'],
    [23, "to is given twice"],
    [24, 'to=2s: "2s" is neither a number nor a name'],
    [25, "the line is indented"],
    [27, '"Slide" is not an action\'s name'],
  ]);
  for (const issue of read.issues) assert.ok(issue.hint.length > 20, issue.message);
  assert.match(read.issues[2]!.hint, /write a value as name=value, before the colon, and what is said after it: sq say: Hello!/);
});

test("the check gives the scenario worked out: what is said, and the plugin's actions in plain numbers", async () => {
  const seen: SceneActions[][] = [];
  const checked = await check("sq say: Here I go!\nsq slide to=right\nnarrator say: It went.", scripted(seen));
  assert.deepEqual(checked, {
    scenes: [
      {
        line: 3,
        setting: { colour: "#d04040", x: 20 },
        lines: [
          { line: 5, who: "sq", action: "say", text: "Here I go!" },
          { line: 6, who: "sq", action: "slide", values: { x: 120 }, length: 1.5 },
          { line: 7, who: "narrator", action: "say", text: "It went." },
        ],
      },
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
  const nobody = await checkScenario(scripted(), written("mo say: Hi."), LIBRARY, []);
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

test("mistakes are shown in the file's order, each with the file, its line as written, and the hint", () => {
  const text = "use: square\nscenes:\n  - colour: red\n    script: |\n      sq slid to=right\n";
  const issues = [
    { line: 5, message: 'no action is named "slid"', hint: "the actions are say and slide: did you mean slide?" },
    { line: 3, message: 'no colour is named "red"', hint: "the library has none" },
  ];
  assert.equal(
    issuesText("videos/sq.yaml", text, issues),
    '2 mistakes in videos/sq.yaml:\n\nvideos/sq.yaml:3: - colour: red\n  no colour is named "red"\n  Hint: the library has none\n\n' +
      'videos/sq.yaml:5: sq slid to=right\n  no action is named "slid"\n  Hint: the actions are say and slide: did you mean slide?',
  );
  assert.equal(issuesText("sq", undefined, issues.slice(0, 1)), '1 mistake in sq:\n\nsq:5:\n  no action is named "slid"\n  Hint: the actions are say and slide: did you mean slide?');
});

test("the nearest name is a slip of a letter or two, and none when none is near", () => {
  assert.equal(nearest("wlak", ["say", "walk"]), "walk");
  assert.equal(nearest("medow", ["meadow", "morning"]), "meadow");
  assert.equal(nearest("dance", ["say", "walk"]), undefined);
  assert.equal(nearest("mo", ["pip"]), undefined);
});
