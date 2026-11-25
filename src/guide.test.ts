// The guide to writing a script (guide.ts): the tool's part teaches what a script has, with examples
// the tool takes and compiles to what the text around them says; a plugin's part and its actions come
// with it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, type CompiledLine } from "./compile.ts";
import { SCRIPT, guideOf } from "./guide.ts";
import { isBlock, readScript } from "./read.ts";
import { checkScenario, linesIn, type ScriptItem, type ScriptPlugin } from "./scenario.ts";

/** The examples of the tool's part, each as it is written. */
const EXAMPLES = [...SCRIPT.matchAll(/```script\n([\s\S]*?)```/g)].map((m) => m[1]!);

/** A plugin that draws nothing. */
const bare: ScriptPlugin = { actions: {}, guide: "Nothing is drawn.", check: (scenes) => ({ scenes: scenes.map(() => ({ setting: {}, actions: [] })) }), draw: () => () => "<svg/>" };

/** An example checked and compiled, each voice as many frames as its line has letters and at least 30: its lines, and the frame each ends on. */
async function compiled(example: string): Promise<(CompiledLine & { end: number })[]> {
  const { items, issues } = readScript(example);
  assert.deepEqual(issues, []);
  const checked = await checkScenario(bare, { scenes: [{ line: 1, setting: {}, items }], issues: [] }, undefined, ["ann", "ben", "cat", "radio"]);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  const voices = linesIn(items).map(({ line, text }) => ({ file: `${line}.wav`, duration: Math.max(30, text!.length) / 30, mouth: [] }));
  const settings = { fps: 30, loudness: -14, lead: 0.6, gap: 0.4, tail: 1, moves: { slowest: 0.5, fastest: 2 } };
  const { scenes } = compile(checked.scenes, voices, settings, "example.yaml");
  return scenes[0]!.lines.map((line) => ({ ...line, end: line.from + line.frames }));
}

/** The example that has this in it. */
const example = (said: string) => EXAMPLES.find((text) => text.includes(said))!;

test("the tool's part shows scripts the tool takes, with no action but its own, and they compile", async () => {
  assert.equal(EXAMPLES.length, 6);
  for (const text of EXAMPLES) {
    assert.ok((await compiled(text)).length > 0);
    assert.deepEqual(new Set(linesIn(readScript(text).items).map(({ action }) => action)), new Set(["say"]));
  }
  // They show every kind of block, and what joins, labels and anchors.
  const seen = new Set<string>();
  const look = (item: ScriptItem) => {
    if (item.label) seen.add("label");
    if (item.anchor) seen.add(typeof item.anchor.at === "string" ? item.anchor.at : Object.keys(item.anchor.at)[0]!);
    if (!isBlock(item)) return;
    seen.add(item.joined ? "&" : item.under ? "under" : item.order);
    item.items.forEach(look);
  };
  for (const text of EXAMPLES) readScript(text).items.forEach(look);
  assert.deepEqual([...seen].sort(), ["&", "end", "in order", "label", "together", "under", "word"]);
});

test("in order: a line begins when the one above has ended, after the pause", async () => {
  const lines = await compiled(example("It is morning"));
  assert.deepEqual(lines.map((l) => [l.from, l.frames]), [[18, 33], [63, 44]]);
  // A colon in what is said is the line's own.
  assert.equal("text" in lines[1]! && lines[1].text, "Then somebody calls: hello, is anyone there?");
});

test("at once: voices together and joined, talk over a radio that is waited for, and one under a talk, cut", async () => {
  for (const said of ["Good morning!", "Who is there?"]) {
    const [one, two, next] = await compiled(example(said));
    assert.equal(one!.from, two!.from);
    assert.equal(next!.from, Math.max(one!.end, two!.end) + 12);
  }
  const [radio, ann, ben, last] = await compiled(example("And now the news"));
  assert.equal(ann!.from, radio!.from);
  assert.equal(ben!.from, ann!.end + 12);
  assert.ok(ben!.end < radio!.end);
  assert.equal(last!.from, radio!.end + 12, "after the radio, not the talk");

  const [first, second, ...talk] = await compiled(example("One flower"));
  assert.equal(talk.length, 3);
  assert.equal(talk[0]!.from, first!.from, "they begin when it does");
  assert.ok(second!.frames < 50, "its second line is cut");
  assert.equal(second!.end, talk[2]!.end, "where the talk ends");
});

test("an anchor: one breaks in at a word, and one a little before the end", async () => {
  const [a, ben, cat, narrator] = await compiled(example("Last night I saw"));
  // "Last night I saw the ": 21 letters of the line's 57, its comma 4 of them.
  assert.equal(ben!.from, a!.from + Math.round((21 / 60) * a!.frames));
  assert.equal(cat!.from, a!.end - 12);
  assert.equal(narrator!.from, Math.max(ben!.end, cat!.end) + 12);
});

test("what the tool's part says is refused, is refused", async () => {
  const refused = async (...rows: string[]) => {
    const { items, issues } = readScript(rows.join("\n"));
    const checked = await checkScenario(bare, { scenes: [{ line: 1, setting: {}, items }], issues }, undefined, ["ann", "ben", "radio"]);
    return "issues" in checked ? checked.issues.length : 0;
  };
  assert.equal(await refused("ann say @ b.end: One.", "[b] ben say: Two."), 1);
  assert.equal(await refused("ann say: One.", "ben say @ block.end: Two."), 1);
  assert.equal(await refused("in order:", "  under:", "    [a] ann say: One.", "  ben say @ a.end: Two."), 1);
  assert.equal(await refused("in order:", "  under:", "    ann say: One.", "  ben say: Two.", "  ann say: Three."), 1);
  assert.equal(await refused("ann say: One.", "under:", "  ben say: Two."), 1);
  // The forms its text names are read.
  assert.equal(await refused("[a] ann say: A mole by a mole.", "under @ a.50%:", "  radio say: One.", "ann say: Two.", "together @ prev.end - 1s:", "  ann say @ block.start + 0.5s: Three.", "  ben say @ a.word(mole by): Four."), 0);
});

test("the tool's part says what a script has: a line's form, say, blocks, joining, labels and anchors", () => {
  for (const said of ["`script: |`", "`narrator`", "`say`", "`name=value`", "a colon and the words", "in order", "`#`", "`together:`", "`in order:`", "`under:`", "`&`", "`@`", "`prev`", "`block`", "`a.word(mole)`", "`- 0.5s`"]) {
    assert.ok(SCRIPT.includes(said), said);
  }
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
