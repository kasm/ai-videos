// The guide to writing a script (guide.ts): the tool's part teaches what a script has, with examples
// the tool takes and compiles to what the text around them says; a plugin's part and its actions come
// with it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, type CompiledLine } from "./compile.ts";
import { SCRIPT, guideOf } from "./guide.ts";
import { isBlock, readScript } from "./read.ts";
import type { Schema } from "./plugin.ts";
import { checkScenario, linesIn, type ScriptItem, type ScriptPlugin, type WrittenScript } from "./scenario.ts";
import { writtenScript } from "./video-file.ts";

/** The examples of the tool's part, each as it is written. */
const EXAMPLES = [...SCRIPT.matchAll(/```script\n([\s\S]*?)```/g)].map((m) => m[1]!);

/** The files in the tool's part, each as it is written. */
const FILES = [...SCRIPT.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]!);

/** `go` takes `to`, a name, and 2 seconds at its own speed, and is fitted to words; `nod` takes its 2 seconds; `watch` is open. */
const to: Schema = { "~standard": { version: 1, vendor: "test", validate: (values) => ({ value: values }), jsonSchema: { input: () => ({ properties: { to: {} } }), output: () => ({}) } } };
/** A plugin that draws nothing. */
const bare: ScriptPlugin = {
  actions: {
    go: { description: "One goes somewhere.", example: "ann go to=pond", values: to, channels: ["place"], fits: true },
    nod: { description: "One nods.", example: "ann nod", values: to, channels: ["head"] },
    watch: { description: "One watches another.", example: "ben watch at=cat", values: to, channels: ["head"], open: true },
  },
  guide: "Nothing is drawn.",
  check: (scenes) => ({ scenes: scenes.map(({ actions }) => ({ setting: {}, actions: actions.map(({ action }) => ({ values: {}, ...(action === "watch" ? {} : { length: 2 }) })) })) }),
  draw: () => () => "<svg/>",
};

/** The library's sounds, of which the bell lasts half a second. */
const SOUNDS = { bell: "bell.wav", rain: "rain.wav", tune: "tune.wav" };
const TIMING = { lead: 0.6, gap: 0.4, tail: 1 };
const SETTINGS = { fps: 30, loudness: -14, moves: { slowest: 0.5, fastest: 2 } };

/** A script checked and compiled, each voice as many frames as its line has letters and at least 30: its scenes' lines, then the cartoon's own, and the frame each ends on. */
async function compiledScenes(script: WrittenScript): Promise<(CompiledLine & { end: number })[][]> {
  assert.deepEqual(script.issues, []);
  const checked = await checkScenario(bare, script, undefined, ["ann", "ben", "cat", "radio"], TIMING, {}, SOUNDS);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  const said = script.scenes.flatMap((scene) => linesIn(scene.items)).flatMap((line) => line.text ?? []);
  const voices = said.map((text, n) => ({ file: `${n}.wav`, duration: Math.max(30, text.length) / 30, mouth: [] }));
  const { lines, scenes } = compile(checked.scenes, voices, SETTINGS, "example.yaml", { "bell.wav": 0.5, "rain.wav": 3, "tune.wav": 8 }, checked.over);
  return [...scenes.map((scene) => scene.lines), ...(lines ? [lines] : [])].map((lines) => lines.map((line) => ({ ...line, end: line.from + line.frames })));
}
/** An example of one scene, by itself. */
async function compiled(example: string): Promise<(CompiledLine & { end: number })[]> {
  const { items, issues } = readScript(example);
  return (await compiledScenes({ scenes: [{ line: 1, setting: {}, items }], issues }))[0]!;
}

/** The example that has this in it. */
const example = (said: string) => EXAMPLES.find((text) => text.includes(said))!;

test("the tool's part shows scripts the tool takes, with no action but its own and three made up, and they compile", async () => {
  assert.equal(EXAMPLES.length, 13);
  for (const text of EXAMPLES) {
    assert.ok((await compiled(text)).length > 0);
    assert.deepEqual(new Set(linesIn(readScript(text).items).map(({ action }) => action)), new Set(["say", ...["go", "nod", "watch", "play", "loop"].filter((action) => text.includes(` ${action} `) || text.includes(` ${action}\n`))]));
  }
  assert.equal(FILES.length, 2);
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
  assert.deepEqual([...seen].sort(), ["&", "end", "ending together", "in order", "label", "start", "together", "under", "word"]);
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

test("ending together: the words end as somebody arrives, at their own pace, and what follows waits for both", async () => {
  const [cat, narrator, ann] = await compiled(example("ending together:"));
  assert.deepEqual([cat!.from, cat!.frames], [18, 60], "2 seconds, its own");
  assert.equal(narrator!.end, cat!.end);
  assert.ok(narrator!.from > cat!.from + 20, "the words wait");
  assert.equal(ann!.from, cat!.end + 12);
});

test("two who arrive together: each fitted to the words they go with, and both end with them", async () => {
  const [ann, ben, narrator, hello] = await compiled(example("from both ways"));
  assert.deepEqual([ann!.from, ben!.from, narrator!.from], [18, 18, 18]);
  assert.deepEqual([ann!.end, ben!.end], [narrator!.end, narrator!.end]);
  assert.notEqual(ann!.frames, 60, "not the 2 seconds of its own");
  assert.equal(hello!.from, narrator!.end + 12);
});

test("an open action: one watches for as long as another is on its way and the narrator talks, and the next line waits for those", async () => {
  const [go, narrator, watch, ben] = await compiled(example("ben watch"));
  assert.deepEqual([watch!.from, watch!.end], [narrator!.from, narrator!.end]);
  assert.deepEqual([go!.from, go!.end], [narrator!.from, narrator!.end]);
  assert.equal(ben!.from, narrator!.end + 12);
});

test("channels: one goes, nods and talks at once, and another nods a second later", async () => {
  const [go, nod, says, later, answer] = await compiled(example("ann nod"));
  assert.deepEqual([go!.from, nod!.from, says!.from, later!.from], [18, 18, 18, 48]);
  // The words are 39 letters, 39 frames: what is fitted ends with them, and what is not keeps its 2 seconds.
  assert.deepEqual([go!.frames, nod!.frames, says!.frames, later!.frames], [39, 60, 39, 60]);
  assert.equal(answer!.from, later!.end + 12, "the next line waits for all of it");
});

test("an anchor: one breaks in at a word, and one a little before the end", async () => {
  const [a, ben, cat, narrator] = await compiled(example("Last night I saw"));
  // "Last night I saw the ": 21 letters of the line's 57, its comma 4 of them.
  assert.equal(ben!.from, a!.from + Math.round((21 / 60) * a!.frames));
  assert.equal(cat!.from, a!.end - 12);
  assert.equal(narrator!.from, Math.max(ben!.end, cat!.end) + 12);
});

test("values: each level over the one around it, and a formula worked out where it is read", async () => {
  const script = writtenScript(FILES[0]!)!;
  assert.deepEqual(Object.keys(script.values!), ["beat", "pause"]);
  const [first, second] = await compiledScenes(script);
  // The pauses of the first scene are 0.8 s, in its block 0.2, and those of the second scene 0.4: in frames, 24, 6 and 12.
  assert.deepEqual(first!.slice(1).map((line, k) => line.from - first![k]!.end), [24, 6, 24]);
  assert.deepEqual(second!.slice(1).map((line, k) => line.from - second![k]!.end), [12]);
});

test("how long an action lasts: from a line's length, at a speed, and to arrive at a word", async () => {
  const [a, ann, ben, c, cat, narrator] = await compiled(example("It is a long way"));
  assert.deepEqual([ann!.from, ann!.frames], [a!.from, a!.frames * 2]);
  assert.deepEqual([ben!.from, ben!.frames], [ann!.end + 12, 120], "2 seconds, half as fast");
  // "Wait for me, all of you, I am " is 36 of the 46 its letters and marks weigh.
  assert.equal(cat!.from, c!.from);
  assert.equal(cat!.end, c!.from + Math.round((36 / 46) * c!.frames));
  assert.equal(narrator!.from, cat!.end + 30);
});

test("how loud: a murmur under a talk, and one who talks low", async () => {
  const lines = await compiled(example("One leaf"));
  assert.deepEqual(lines.map((line) => [line.who, "volume" in line && line.volume]), [["ben", -12], ["ben", -12], ["ann", 0], ["cat", -6], ["ann", 0]]);
  assert.equal(lines[1]!.end, lines[3]!.end, "it is cut where the talk ends");
});

test("sounds: one that is waited for, one at a word, and one under a talk to the end of its block", async () => {
  const [bell, rain, ann, again, ben, last] = await compiled(example("bell play"));
  assert.deepEqual([bell!.from, bell!.frames], [18, 15], "half a second, and nothing has begun before it");
  assert.deepEqual([rain!.from, rain!.end], [bell!.end + 12, ben!.end], "as long as its block");
  assert.equal("volume" in rain! && rain.volume, -20);
  assert.equal(ann!.from, rain!.from);
  // "Somebody rings the " is 19 of the 46 its letters and marks weigh, the last one none.
  assert.equal(again!.from, ann!.from + Math.round((19 / 45) * ann!.frames));
  assert.equal(ben!.from, Math.max(ann!.end, again!.end) + 12);
  assert.equal(last!.from, ben!.end + 12);
});

test("sounds: music that goes on from one scene into the next, and rain under the whole of one", async () => {
  const script = writtenScript(FILES[1]!)!;
  const [first, second, own] = await compiledScenes(script);
  assert.deepEqual(own!.map(({ who, action, from, end }) => [who, action, from, end]), [["tune", "loop", 0, second!.at(-1)!.end + 30]]);
  const [rain, ann, ben] = first!;
  assert.deepEqual([rain!.from, rain!.end], [ann!.from, ben!.end + 30], "to the scene's end, its tail too");
  assert.equal("volume" in rain! && rain.volume, -24);
  assert.equal("volume" in own![0]! && own![0].volume, -20);
});

test("what the tool's part says is refused, is refused", async () => {
  const refused = async (...rows: string[]) => {
    const { items, issues } = readScript(rows.join("\n"));
    const checked = await checkScenario(bare, { scenes: [{ line: 1, setting: {}, items }], issues }, undefined, ["ann", "ben", "radio"], TIMING, {}, SOUNDS);
    return "issues" in checked ? checked.issues.length : 0;
  };
  // Of sounds: one it does not have, twice at once, a loop alone, or under the rest, and what a sound does not take.
  assert.equal(await refused("drum play"), 1);
  assert.equal(await refused("bell play", "& bell play"), 1);
  assert.equal(await refused("bell play", "bell play"), 0);
  assert.equal(await refused("rain loop", "ann say: One.", "rain play"), 1);
  assert.equal(await refused("ann say: One.", "rain loop"), 1);
  assert.equal(await refused("in order:", "  under:", "    rain loop", "  ann say: One."), 1);
  assert.equal(await refused("in order:", "  under:", "    bell play", "  ann say: One."), 0);
  for (const given of ["takes=2s", "speed=2", "arrive=prev.end"]) assert.equal(await refused("ann say: One.", `bell play ${given}`), 1);
  assert.equal(await refused("bell play: Ding."), 1);
  assert.equal(await refused("[b] bell play", "ann go to=pond takes=b.length"), 0);
  assert.equal(await refused("[r] rain loop", "ann go to=pond takes=r.length"), 1);
  assert.equal(await refused("in order bell.volume=-6dB play.volume=-5dB loop.volume=-4dB volume=-5dB:", "  bell play", "  ann say: One."), 0);
  const over = async (own: string, ...rows: string[]) => {
    const script = writtenScript(["script: |", ...own.split("\n").map((row) => `  ${row}`), "scenes:", "  - script: |", ...rows.map((row) => `      ${row}`), ""].join("\n"))!;
    const checked = await checkScenario(bare, script, undefined, ["ann", "ben"], TIMING, {}, SOUNDS);
    return "issues" in checked ? checked.issues.length : 0;
  };
  assert.equal(await over("tune loop", "ann say: One."), 0);
  assert.equal(await over("ann say: One.", "ben say: Two."), 1);
  assert.equal(await over("ann go to=pond", "ben say: Two."), 1);
  assert.equal(await over("tune loop", "tune loop", "ann say: One."), 1);
  assert.equal(await over("bell play\ntune loop @ prev.end\nrain play @ block.end - 10s", "ann say: One."), 0);
  assert.equal(await over("in order:\n  bell play\n  rain play", "ann say: One."), 0);
  assert.equal(await refused("ann say @ b.end: One.", "[b] ben say: Two."), 1);
  assert.equal(await refused("ann say: One.", "ben say @ block.end: Two."), 1);
  assert.equal(await refused("in order:", "  under:", "    [a] ann say: One.", "  ben say @ a.end: Two."), 1);
  assert.equal(await refused("in order:", "  under:", "    ann say: One.", "  ben say: Two.", "  ann say: Three."), 1);
  assert.equal(await refused("ann say: One.", "under:", "  ben say: Two."), 1);
  assert.equal(await refused("[a] ben say: One.", "ending together:", "  ann say @ a.50%: One."), 1);
  assert.equal(await refused("[a] ben say: One.", "ending together:", "  ann go to=pond arrive=a.end"), 1);
  assert.equal(await refused("ending together:", "  ann say: One.", "  in order:", "    ben say: Two."), 1);
  assert.equal(await refused("ending together:", "  ann say: One.", "  & ben say: Two."), 1);
  assert.equal(await refused("ending together:", "  ann say: One.", "  ann say: Two."), 1);
  assert.equal(await refused("ending together:", "  ann go to=pond", "  ann go to=hill"), 1);
  assert.equal(await refused("[a] ben say: One.", "ending together @ a.50%:", "  ann go to=pond", "  ann say: Two."), 0);
  assert.equal(await refused("in order beat=2s:", "  ann say: One."), 1, "a value that nothing reads");
  for (const volume of ["2", "50%", "-61dB", "12.1dB"]) assert.equal(await refused(`ann say volume=${volume}: One.`), 1);
  for (const volume of ["-60dB", "0dB", "12dB"]) assert.equal(await refused(`ann say volume=${volume}: One.`), 0);
  assert.equal(await refused("ann go to=pond volume=-6dB"), 1);
  assert.equal(await refused("in order go.volume=-6dB:", "  ann say: One."), 1);
  assert.equal(await refused("in order ann.volume=-6dB say.volume=-5dB volume=-5dB:", "  ann say: One."), 0);
  assert.equal(await refused("in order one=two two=one:", "  ann go to=pond takes=one"), 1);
  assert.equal(await refused("ann go to=pond takes=2s speed=2"), 1);
  assert.equal(await refused("[a] ann go to=pond", "ben go to=pond takes=a.length"), 1);
  assert.equal(await refused("[a] ann nod", "ben go to=pond takes=a.length"), 0);
  assert.equal(await refused("together:", "  ann say: One.", "  ann say: Two."), 1);
  assert.equal(await refused("ann go to=pond", "& ann go to=hill"), 1);
  assert.equal(await refused("ann go to=pond", "& ann nod"), 0);
  assert.equal(await refused("together:", "  ann say: One.", "  ann say @ prev.end: Two.", "  in order:", "    ben say: Three.", "    ann say: Four."), 0);
  assert.equal(await refused("[a] in order:", "  ann say: One.", "ben go to=pond takes=a.length"), 1);
  assert.equal(await refused("ann say: One.", "ben watch at=ann"), 1, "nothing comes after it");
  assert.equal(await refused("ben watch at=ann", "ann watch at=ben"), 1, "nothing else is in its block");
  assert.equal(await refused("ben watch at=ann", "ann say: One.", "ben nod"), 1);
  assert.equal(await refused("ann say: One.", "& ben watch at=ann", "ben nod"), 0);
  assert.equal(await refused("in order:", "  under:", "    radio say: One.", "    ben watch at=ann", "    radio say: Two.", "  ann say: Three."), 1);
  for (const given of ["takes=2s", "speed=2", "arrive=prev.end"]) assert.equal(await refused("ann say: One.", `& ben watch at=ann ${given}`), 1);
  assert.equal(await refused("ann say: One.", "& [w] ben watch at=ann", "ann go to=pond takes=w.length"), 1);
  // The forms its text names are read.
  assert.equal(await refused("[a] ann say: A mole by a mole.", "under @ a.50%:", "  radio say: One.", "ann say: Two.", "together @ prev.end - 1s:", "  ann say @ block.start + 0.5s: Three.", "  ben say @ a.word(mole by): Four."), 0);
  assert.equal(await refused("[a] ann say: One.", "in order pause=5s - a.length:", "  ben say: Two.", "  ann say: Three."), 0);
});

test("the tool's part says what a script has: a line's form, say, blocks, joining, labels and anchors", () => {
  for (const said of ["`script: |`", "`narrator`", "for an action below that nobody does, the name its example has", "`say`", "`name=value`", "a colon and the words", "in order", "on its channel `voice`", "One channel does one thing at a time", "`#`", "`together:`", "`ending together:`", "`in order:`", "`under:`", "`&`", "`@`", "`prev`", "`block`", "`a.word(mole)`", "`- 0.5s`", "`values:`", "`50%`", "`pause`", "`lead`", "`tail`", "`takes=2s`", "`speed=0.5`", "`arrive=a.end - 0.5s`", "`volume`", "`-12dB`", "`radio.volume`", "`a.length`", "`ann.speed`", "`go.speed`", "### Sounds", "`bell play`", "`rain loop`", "nothing waits for it", "a `script` on top of the file", "`@ block.end - 10s`", "`tune.volume`", "`say.volume`", "An action that is open", "goes on to the end of the block it is in, and nothing waits for it", "An open action keeps its channel busy to the end of its block"]) {
    assert.ok(SCRIPT.includes(said), said);
  }
});

test("a plugin's guide: the tool's part, the plugin's, each action and construction described once with its example, and its names for numbers", () => {
  const slide = { description: "The square slides to a side.", example: "sq slide to=right", channels: ["place"], fits: true };
  const square = { guide: "\nA square slides to a side.\n", actions: { slide }, constructions: {} };
  const guide = guideOf({ ...square, names: {} });
  const names = { slow: 0.6, fast: 1.6 };
  assert.match(guideOf({ ...square, names }), /sq slide to=right`\n\nThese names stand for numbers in any value: `slow` is 0\.6 and `fast` is 1\.6\.\n$/);
  // A plugin with constructions has how they are written too.
  assert.ok(!guide.includes("construction"));
  const constructed = guideOf({ ...square, names, constructions: { beside: { description: "Beside a place.", example: "beside(mo, 2)" } } });
  assert.match(constructed, /sq slide to=right`\n\n## The constructions\n\nA value may be worked out from others by a construction: its name, and in parentheses .*\n\n- \*\*beside\*\*: Beside a place\. For example: `beside\(mo, 2\)`\n\nThese names stand/);
  assert.match(guide, /^## A script\n\nA scene's `script` says what happens in it/);
  assert.match(guide, /\n## The format\n\nA square slides to a side\.\n\n## The actions\n\n/);
  assert.match(guide, /\n- \*\*say\*\*: The character says the words after the colon.* Channel: `voice`\. For example: `narrator say: Once upon a time\.`\n/);
  assert.match(guide, /\n- \*\*play\*\*: The sound is played once.* Channel: `sound`\. For example: `bell play`\n- \*\*loop\*\*: The sound is played again and again\. Channel: `sound`; it is open\. For example: `tune loop volume=-20dB`\n/);
  assert.match(guide, /\n- \*\*slide\*\*: The square slides to a side\. Channel: `place`; it is fitted\. For example: `sq slide to=right`\n$/);
  const watch = { description: "It watches.", example: "sq watch", channels: ["facing"], open: true };
  assert.match(guideOf({ ...square, actions: { watch }, names: {} }), /\n- \*\*watch\*\*: It watches\. Channel: `facing`; it is open\. For example: `sq watch`\n$/);
  const spin = { description: "It spins.", example: "sq spin", channels: ["place", "facing"] };
  assert.match(guideOf({ ...square, actions: { spin }, names: {} }), /\n- \*\*spin\*\*: It spins\. Channels: `place` and `facing`\. For example: `sq spin`\n$/);
});
