// The guide to writing a script (guide.ts): the tool's part teaches what a script has, with an
// example the tool takes and compiles; a plugin's part and its actions come with it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "./compile.ts";
import { SCRIPT, guideOf } from "./guide.ts";
import { checkScenario, readScript, type ScriptPlugin } from "./scenario.ts";

test("the tool's part shows a script the tool takes, with no action but its own, and compiles", async () => {
  const examples = [...SCRIPT.matchAll(/```script\n([\s\S]*?)```/g)].map((m) => m[1]!);
  assert.equal(examples.length, 1);
  const read = readScript(examples[0]!);
  assert.deepEqual(read.issues, []);
  assert.deepEqual(read.lines.map((l) => [l.who, l.action]), [["narrator", "say"], ["narrator", "say"]]);
  // A colon in what is said is the line's own.
  assert.equal(read.lines[1]!.text, "Then somebody calls: hello, is anyone there?");
  const bare: ScriptPlugin = { actions: {}, guide: "Nothing is drawn.", check: (scenes) => ({ scenes: scenes.map(() => ({ setting: {}, actions: [] })) }) };
  const checked = await checkScenario(bare, { scenes: [{ line: 1, setting: {}, lines: read.lines }], issues: [] }, undefined, []);
  assert.ok("scenes" in checked);
  const voices = [{ file: "a.wav", duration: 2 }, { file: "b.wav", duration: 3 }];
  const { scenes } = compile(checked.scenes, voices, { fps: 30, lead: 0.6, gap: 0.4, tail: 1 }, "example.yaml");
  // The second line begins when the first has ended, after the pause.
  assert.deepEqual(scenes[0]!.lines.map((l) => [l.from, l.frames]), [[18, 60], [90, 90]]);
});

test("the tool's part says what step 1 gives a script: a line's form, say, and lines in order", () => {
  for (const said of ["`script: |`", "`narrator`", "`say`", "`name=value`", "a colon and the words", "in order", "`#`"]) assert.ok(SCRIPT.includes(said), said);
});

test("a plugin's guide: the tool's part, the plugin's, and each action described once with its example", () => {
  const guide = guideOf({
    guide: "\nA square slides to a side.\n",
    actions: { slide: { description: "The square slides to a side.", example: "sq slide to=right" } },
  });
  assert.match(guide, /^## A script\n\nA scene's `script` says what happens in it/);
  assert.match(guide, /\n## The format\n\nA square slides to a side\.\n\n## The actions\n\n/);
  assert.match(guide, /\n- \*\*say\*\*: The character says the words after the colon.* For example: `narrator say: Once upon a time\.`\n/);
  assert.match(guide, /\n- \*\*slide\*\*: The square slides to a side\. For example: `sq slide to=right`\n$/);
});
