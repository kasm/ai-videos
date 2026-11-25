// What a script's values come to (values.ts), read, checked and compiled as the tool does it: which
// level and which of a level's a line takes, formulas worked out where they are read, how long an
// action lasts, lines' lengths, the defaults; and every mistake, with its line and a hint. The plugin
// here is a small one written for the test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "./compile.ts";
import { secondsOf, type Span } from "./formula.ts";
import type { Schema } from "./plugin.ts";
import { readScript } from "./read.ts";
import { checkScenario, linesIn, type Anchor, type CheckedLine, type Issue, type ScriptPlugin, type WrittenScript, type WrittenValue } from "./scenario.ts";
import { plainValues, valuesTaken } from "./values.ts";

/** A schema that passes any values of these names, each with its default when it has one. */
const taking = (properties: Record<string, { default?: unknown }>): Schema => ({
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (values) => ({ value: { ...Object.fromEntries(Object.entries(properties).flatMap(([name, { default: own }]) => (own === undefined ? [] : [[name, own]]))), ...(values as object) } }),
    jsonSchema: { input: () => ({ type: "object", properties }), output: () => ({}) },
  },
});

/** `slide` goes \`far\`, a number, \`to\` a side, in 2 seconds; \`hop\` hops so many \`times\`, a second each. */
const PLUGIN: ScriptPlugin = {
  actions: {
    slide: { description: "It slides.", example: "sq slide to=right", values: taking({ far: {}, to: {} }) },
    hop: { description: "It hops.", example: "sq hop", values: taking({ times: { default: 1 } }) },
  },
  names: { slow: 0.5, fast: 2 },
  guide: "It slides.",
  check: (scenes) => ({
    scenes: scenes.map(({ actions }) => ({ setting: {}, actions: actions.map(({ action, values }) => ({ values: values as Record<string, number | string>, length: action === "hop" ? (values as { times: number }).times : 2 })) })),
  }),
  draw: () => () => "<svg/>",
};
const TIMING = { lead: 0.5, gap: 0.3, tail: 1 };
const SPEAKERS = ["sq", "mo"];

/** Values set on the cartoon or a scene, the first on this line of the file. */
const set = (values: Record<string, string>, line: number): Record<string, WrittenValue> => Object.fromEntries(Object.entries(values).map(([name, text], k) => [name, { line: line + k, text }]));

/**
 * A scenario: the cartoon's values from line 100 on, and one scene, on line 200, its values from line
 * 201 on, and its rows from line 1 on.
 */
const scenario = (rows: string[], { cartoon = {}, scene = {} }: { cartoon?: Record<string, string>; scene?: Record<string, string> } = {}): WrittenScript => {
  const { items, issues } = readScript(rows.join("\n"));
  assert.deepEqual(issues, []);
  return { values: set(cartoon, 100), scenes: [{ line: 200, setting: {}, values: set(scene, 201), items }], issues };
};
type Levels = Parameters<typeof scenario>[1];
const check = (rows: string[], levels?: Levels) => checkScenario(PLUGIN, scenario(rows, levels), undefined, SPEAKERS, TIMING);
async function checked(rows: string[], levels?: Levels) {
  const result = await check(rows, levels);
  assert.ok("scenes" in result, JSON.stringify(result));
  const [scene] = result.scenes;
  return { scene: scene!, lines: linesIn(scene!.items), defaults: result.defaults };
}
async function issues(rows: string[], levels?: Levels): Promise<Issue[]> {
  const result = await check(rows, levels);
  assert.ok("issues" in result, "it is refused");
  return result.issues;
}
/** What is refused: the line, the others, and why. */
const why = async (rows: string[], levels?: Levels) => (await issues(rows, levels)).map(({ line, also = [], message }) => [line, also, message]);
const hint = async (rows: string[], levels?: Levels) => (await issues(rows, levels))[0]!.hint;

/** The value \`far\` each slide is given. */
const far = async (rows: string[], levels?: Levels) => (await checked(rows, levels)).lines.flatMap((line) => ("values" in line && line.action === "slide" ? [(line.values as { far: number }).far] : []));
/** How long each action takes, in the order written; "own" when it is given none. */
const takes = async (rows: string[], levels?: Levels) => (await checked(rows, levels)).lines.flatMap((line) => ("values" in line ? [line.takes ?? (line.arrive ? "arrives" : "own")] : []));
/** The frame each line begins on and how many it lasts, at ten frames a second, a voice a frame a letter. */
async function frames(rows: string[], levels?: Levels, voice: (line: CheckedLine, n: number) => number = (line) => ("text" in line ? line.text.length : 0)) {
  const result = await check(rows, levels);
  assert.ok("scenes" in result, JSON.stringify(result));
  const said = result.scenes.flatMap((scene) => linesIn(scene.items)).filter((line) => "text" in line);
  const voices = said.map((line, n) => ({ file: `${n}.wav`, duration: voice(line, n) / 10, mouth: [] }));
  const { scenes } = compile(result.scenes, voices, { fps: 10, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "x.yaml");
  return Object.fromEntries(scenes.flatMap((scene) => scene.lines).map((line) => [line.line, [line.from, line.frames]]));
}

const TEN = "0123456789";

test("each level goes over the one above it: the plugin's names, the cartoon, the scene, a block, a block in it, and the line", async () => {
  const rows = [
    "sq slide far=slow", // the plugin's own name
    "sq slide", // 2: the scene's, or the cartoon's
    "in order far=3:",
    "  sq slide", // 4: the block's
    "  together far=4:",
    "    sq slide", // 6: the inner block's
    "    mo slide far=5", // 7: its own
    "  sq slide", // 8: the block's again
    "sq slide", // 9: after the block
  ];
  assert.deepEqual(await far(rows, { cartoon: { far: "1" } }), [0.5, 1, 3, 4, 5, 3, 1]);
  assert.deepEqual(await far(rows, { cartoon: { far: "1" }, scene: { far: "2" } }), [0.5, 2, 3, 4, 5, 3, 2]);
  // A name of the plugin's is under what the file sets.
  assert.deepEqual(await far(["sq slide far=slow"], { cartoon: { slow: "0.4" } }), [0.4]);
  // The video's pauses are under the cartoon's, the scene's and a block's.
  const pauses = async (levels?: Levels) => {
    const { scene } = await checked(["in order:", "  sq say: One.", "  sq say: Two.", "in order pause=0.1s:", "  sq say: One.", "  under:", "    mo say: Two.", "  sq say: Three."], levels);
    const [one, two] = scene.items as { pause: Span; items: { pause?: Span }[] }[];
    return [scene.lead, scene.pause, scene.tail, one!.pause, two!.pause, two!.items[1]!.pause];
  };
  assert.deepEqual(await pauses(), [0.5, 0.3, 1, 0.3, 0.1, 0.1]);
  assert.deepEqual(await pauses({ cartoon: { pause: "0.6s", lead: "0s" } }), [0, 0.6, 1, 0.6, 0.1, 0.1]);
  assert.deepEqual(await pauses({ cartoon: { pause: "0.6s", lead: "0s" }, scene: { pause: "0.2s", tail: "2s" } }), [0, 0.2, 2, 0.2, 0.1, 0.1]);
});

test("a block's setting reaches its lines, and those of the blocks in it and joined in it, and no others", async () => {
  const rows = ["sq slide", "together far=7:", "  sq slide", "  in order:", "    mo slide", "    & mo say: Hi.", "    mo slide", "mo slide", "& sq slide"];
  assert.deepEqual(await far(rows, { cartoon: { far: "1" } }), [1, 7, 7, 7, 1, 1]);
  assert.deepEqual(await frames([`sq say: ${TEN}`, "in order pause=0.1s:", `  sq say: ${TEN}`, `  mo say: ${TEN}`, `sq say: ${TEN}`]), { 1: [5, 10], 3: [18, 10], 4: [29, 10], 5: [42, 10] });
});

test("one character's setting reaches only its own, one action's only its own, and a level is nearer than whose it is", async () => {
  const rows = ["sq slide", "mo slide", "sq hop", "mo hop"];
  const speeds = (levels: Levels) => takes(rows, levels);
  // Own length: a slide 2 seconds, a hop 1.
  assert.deepEqual(await speeds({ cartoon: { "sq.speed": "slow" } }), [4, "own", 2, "own"]);
  assert.deepEqual(await speeds({ cartoon: { "hop.speed": "slow" } }), ["own", "own", 2, 2]);
  assert.deepEqual(await speeds({ cartoon: { speed: "slow" } }), [4, 4, 2, 2]);
  // Of one level: the character's over the action's, and both over everything's.
  assert.deepEqual(await speeds({ cartoon: { speed: "slow", "hop.speed": "fast", "sq.speed": "1" } }), [2, 4, 1, 0.5]);
  // A nearer level is over whosever it is.
  assert.deepEqual(await speeds({ cartoon: { "sq.speed": "slow", "hop.speed": "slow" }, scene: { speed: "fast" } }), [1, 1, 0.5, 0.5]);
  assert.deepEqual(await takes(["together mo.speed=fast:", "  sq slide", "  mo slide", "mo slide"]), ["own", 1, "own"]);
  assert.deepEqual(await takes(["sq slide speed=1", "sq slide"], { scene: { "sq.speed": "slow" } }), [2, 4]);
  // So it is for a value that is no length.
  assert.deepEqual(await far(["sq slide", "mo slide"], { cartoon: { far: "1", "slide.far": "2", "sq.far": "3" } }), [3, 2]);
  // A name of the writer's may be one character's too: what reads it is worked out for its own.
  assert.deepEqual(await far(["sq slide far=near * 2", "mo slide far=near * 2"], { cartoon: { near: "10", "mo.near": "20" } }), [20, 40]);
});

test("a formula is inherited as it is written, and worked out where it is read", async () => {
  const rows = ["sq slide far=gap", "in order near=100:", "  sq slide far=gap", "  sq slide far=near"];
  assert.deepEqual(await far(rows, { cartoon: { near: "10", gap: "near * 2 + 1" } }), [21, 201, 100]);
  assert.deepEqual(await far(rows, { cartoon: { near: "10", gap: "near * 2 + 1" }, scene: { near: "20" } }), [41, 201, 100]);
  const { scene } = await checked(["sq say: Hi.", "sq say: Ho."], { cartoon: { beat: "0.4s", pause: "beat", tail: "beat * 2" }, scene: { beat: "1s" } });
  assert.deepEqual([scene.lead, scene.pause, scene.tail], [0.5, 1, 2]);
  // What the tool sets may be read as any: a pause in a time.
  assert.deepEqual(await takes(["sq slide takes=pause * 2", "in order pause=1s:", "  sq slide takes=pause * 2"]), [0.6, 2]);
  // A name that no level sets is itself: a mark. One that a level sets stands for it.
  const marks = async (levels?: Levels) => (await checked(["sq slide to=home"], levels)).lines.map((line) => "values" in line && line.values);
  assert.deepEqual(await marks(), [{ to: "home" }]);
  assert.deepEqual(await marks({ cartoon: { home: "left" } }), [{ to: "left" }]);
  assert.deepEqual(await marks({ cartoon: { home: "house", house: "left" } }), [{ to: "left" }]);
  // What an action takes may be set on any level.
  assert.deepEqual(await marks({ scene: { "sq.far": "3" } }), [{ far: 3, to: "home" }]);
});

test("how long an action lasts is given in seconds, as times its own speed, or by the moment it arrives at: the nearest of them", async () => {
  assert.deepEqual(await takes(["sq slide takes=3s", "sq slide speed=4", "sq slide speed=50%", "sq slide"]), [3, 0.5, 4, "own"]);
  // The nearest of the three, whichever it is.
  assert.deepEqual(await takes(["sq slide", "in order takes=3s:", "  sq slide", "  sq slide speed=fast", "  sq slide arrive=prev.end + 1s"], { cartoon: { speed: "slow" } }), [4, 3, 1, "arrives"]);
  assert.deepEqual(await takes(["sq slide", "mo slide"], { cartoon: { takes: "3s", "sq.speed": "slow" } }), [4, 3]);
  // Given its length, it is fitted to no words, wherever that is set: the next waits for it.
  assert.deepEqual(await frames(["sq slide", `& mo say: ${TEN}`, `sq say: ${TEN}`]), { 1: [5, 10], 2: [5, 10], 3: [18, 10] });
  assert.deepEqual(await frames(["sq slide", `& mo say: ${TEN}`, `sq say: ${TEN}`], { cartoon: { "slide.speed": "slow" } }), { 1: [5, 40], 2: [5, 10], 3: [48, 10] });
  assert.deepEqual(await frames(["sq slide takes=0.01s"]), { 1: [5, 1] }, "a frame at least");
});

test("an action arrives at a moment of something above, no faster and no slower than the video's limits", async () => {
  // Its own length is 20 frames, from 10 to 40.
  const arriving = async (arrive: string, letters = 30) => (await frames([`[a] sq say: ${"x".repeat(letters - 5)} mole`, `& mo slide arrive=${arrive}`]))[2];
  assert.deepEqual(await arriving("a.end"), [5, 30]);
  assert.deepEqual(await arriving("a.end - 0.5s"), [5, 25]);
  assert.deepEqual(await arriving("a.word(mole)"), [5, 26]);
  assert.deepEqual(await arriving("a.10%"), [5, 10]);
  assert.deepEqual(await arriving("a.end", 60), [5, 40]);
  // A moment may be set on a level, and is the line's own there: prev is the line above it.
  assert.deepEqual(await frames([`sq say: ${TEN}${TEN}`, "& mo slide", `sq say: ${TEN}`, "& mo slide"], { scene: { beat: "0.2s", "slide.arrive": "prev.end - beat" } }), { 1: [5, 20], 2: [5, 18], 3: [28, 10], 4: [28, 10] });
  const { lines } = await checked(["[a] sq say: Hi.", "& mo slide arrive=there"], { cartoon: { there: "a.50% + 1s" } });
  assert.deepEqual((lines[1] as { arrive: Anchor }).arrive, { of: "a", at: { share: 0.5 }, plus: 1 });
  // One after another, two who arrive together.
  assert.deepEqual(await frames([`[a] sq say: ${TEN}${TEN}${TEN}`, "& sq slide takes=3s", "& mo slide arrive=prev.end"]), { 1: [5, 30], 2: [5, 30], 3: [5, 30] });
  // What has no such moment is refused, with its line.
  assert.deepEqual(await why(["sq slide arrive=b.end", "[b] mo say: Hi."]), [[1, [2], '"b" is below, at line 2: a move arrives by what is above it']]);
  assert.deepEqual(await why(["[a] sq say: Hi.", "mo slide arrive=a.word(ho)"]), [[2, [1], 'line 1 does not say "ho"']]);
  assert.deepEqual(await why(["sq slide"], { scene: { "slide.arrive": "prev.end" } }), [[201, [1], "there is no prev: it is the first of its block"]]);
  assert.deepEqual(await why(["sq slide arrive=2s"]), [[1, [], "arrive=2s: it is no moment of something above"]]);
  // By the end of what waits for it, it has no time: the line that arrives is the one to mend.
  assert.deepEqual(await why(["sq say: Hi.", "together:", "  mo say: Ho.", "  mo slide arrive=block.end"]), [[4, [2], "it goes round: the block of line 2 waits for line 4 and line 4 waits for the block of line 2"]]);
});

test("a move given both a speed and a length is refused, where they are set on one level for one line", async () => {
  assert.deepEqual(await issues(["sq slide speed=2 takes=1s"]), [
    { line: 1, message: "sq slide is given both takes and speed, and each says how long it lasts", hint: "keep one of them on this level: the others are worked out from it" },
  ]);
  assert.deepEqual(await why(["sq slide", "mo hop"], { cartoon: { speed: "slow", pause: "1s", takes: "1s" } }), [
    [102, [1, 100], "sq slide is given both takes and speed, and each says how long it lasts"],
    [102, [2, 100], "mo hop is given both takes and speed, and each says how long it lasts"],
  ]);
  assert.deepEqual(await why(["in order sq.speed=2 sq.arrive=prev.end sq.takes=1s:", "  sq slide", "  mo slide"]), [[1, [2], "sq slide is given sq.takes, sq.speed and sq.arrive, and each says how long it lasts"]]);
  // For another character, or on another level, they are not for one line.
  assert.deepEqual(await takes(["sq slide", "mo slide"], { cartoon: { "sq.speed": "slow", "mo.takes": "1s" } }), [4, 1]);
  assert.deepEqual(await takes(["sq slide takes=1s"], { cartoon: { speed: "slow" } }), [1]);
});

test("a wrong takes, speed or arrive counts as given: it is the one mistake, and nothing is refused for want of it", async () => {
  // Fitted to the words, the slide would wait for the line that waits for it.
  const rows = (given = "") => ["together:", `  [w] sq slide${given}`, "  narrator say: It goes.", "  mo say @ w.end: Here."];
  assert.deepEqual(await why(rows()), [[4, [2], "it goes round: line 2 waits for line 4 and line 4 waits for line 2"]]);
  assert.deepEqual(await why(rows(" takes=2")), [[2, [], "takes=2: it is a number, and not a time"]]);
  assert.deepEqual(await why(rows(" speed=0")), [[2, [], "speed=0: a speed is more than 0"]]);
  assert.deepEqual(await why(rows(" arrive=2s")), [[2, [], "arrive=2s: it is no moment of something above"]]);
  assert.deepEqual(await why(rows(" speed=1 takes=1s")), [[2, [], "sq slide is given both takes and speed, and each says how long it lasts"]]);
});

test("values that go round are refused with their chain, whether or not a line reads them", async () => {
  assert.deepEqual(await issues(["sq slide far=near"], { cartoon: { near: "far-off / 2", "far-off": "gap * 2", gap: "near + 1" } }), [
    { line: 102, also: [1, 100, 101], message: "the values go round: near is far-off / 2, far-off is gap * 2 and gap is near + 1", hint: "give one of them a value that reads none of the others" },
  ]);
  assert.deepEqual(await why(["sq say: Hi."], { cartoon: { one: "two" }, scene: { two: "one" } }), [[201, [100], "the values go round: one is two and two is one"]]);
  assert.deepEqual(await issues(["in order near=near * 2:", "  sq slide far=near"], { cartoon: { near: "1" } }), [
    { line: 1, also: [2], message: "the values go round: near is near * 2", hint: "a value does not read itself: give one of the two another name" },
  ]);
  assert.deepEqual(await why(["sq slide takes=pause"], { scene: { pause: "pause * 2" } }), [[201, [1, 200], "the values go round: pause is pause * 2"]]);
  // For one character alone.
  assert.deepEqual(await why(["sq slide far=near", "mo slide far=near"], { cartoon: { near: "1", "sq.near": "gap", gap: "near" } }), [[102, [1, 101], "the values go round: sq.near is gap and gap is near"]]);
  // Through a moment.
  assert.deepEqual(await why(["[a] sq say: Hi.", "mo slide arrive=there"], { cartoon: { there: "a.end - beat", beat: "lag", lag: "beat" } }).then((all) => all.map(([line, , message]) => [line, message])), [[102, "the values go round: beat is lag and lag is beat"]]);
});

test("a default taken is said: what it is, and the lines that take it", async () => {
  const rows = ["sq slide", "sq hop", "mo hop times=2", "in order:", "  sq say: One.", "  sq say: Two.", "in order:", "  sq say: Alone."];
  assert.deepEqual((await checked(rows)).defaults, [
    { name: "lead", value: "0.5s", lines: [200] },
    { name: "pause", value: "0.3s", lines: [200, 4] },
    { name: "tail", value: "1s", lines: [200] },
    { name: "speed", value: "1, or what the words beside it take", lines: [1, 2, 3] },
    { name: "hop times", value: "1", lines: [2] },
  ]);
  assert.deepEqual((await checked(rows, { cartoon: { pause: "1s", lead: "1s", tail: "1s", speed: "1", "hop.times": "3" } })).defaults, []);
});

test("a.length is how long a line above lasts: one that is said, or an action given its length", async () => {
  // In frames: the voice's 25, half of it and a second.
  assert.deepEqual(await frames(["[a] sq say: 0123456789012345678901234", "mo slide takes=a.length / 2 + 1s", "mo slide takes=prev.length * 2"]), { 1: [5, 25], 2: [33, 23], 3: [59, 46] });
  assert.deepEqual(await frames(["[a] sq slide speed=slow", "mo slide takes=a.length"]), { 1: [5, 40], 2: [48, 40] });
  // Two lengths, and a share of a ratio.
  assert.deepEqual(await frames([`[a] sq say: ${TEN}`, `[b] sq say: ${TEN}${TEN}`, "mo slide takes=(a.length + b.length) / 2", "mo slide takes=a.length / 2s * 3s"]), { 1: [5, 10], 2: [18, 20], 3: [41, 15], 4: [59, 15] });
  // A line that is cut has its whole length.
  assert.deepEqual((await frames(["in order:", "  under:", `    [a] mo say: ${TEN}${TEN}${TEN}`, `  sq say: ${TEN}`, "sq slide takes=a.length"]))[5], [18, 30]);
  // Every walk as long as the line above it, set once.
  assert.deepEqual(await frames([`sq say: ${TEN}`, "& mo slide", `sq say: ${TEN}${TEN}`, "& mo slide"], { cartoon: { "slide.takes": "prev.length" } }), { 1: [5, 10], 2: [5, 10], 3: [18, 20], 4: [18, 20] });
  // A pause, and what comes after a moment.
  assert.deepEqual(await frames([`[a] sq say: ${TEN}`, "in order pause=a.length / 2:", `  sq say: ${TEN}`, `  mo say: ${TEN}`, `mo say @ a.start + a.length / 5: ${TEN}`]), { 1: [5, 10], 3: [18, 10], 4: [33, 10], 5: [43, 10] });
  assert.deepEqual((await frames([`[a] sq say: ${TEN}`, `mo say @ a.start + a.length / 5: ${TEN}`]))[2], [7, 10]);
  // What is left of a time: an action's is a frame at least, and a pause none.
  assert.deepEqual(await frames([`[a] sq say: ${TEN}`, "mo slide takes=3s - a.length", "mo slide takes=0.5s - a.length"]), { 1: [5, 10], 2: [18, 20], 3: [41, 1] });
  const paused = async (time: string) => (await frames([`[a] sq say: ${TEN}`, `in order pause=${time} - a.length:`, `  sq say: ${TEN}`, `  mo say: ${TEN}`]))[4];
  assert.deepEqual([await paused("3s"), await paused("0.5s")], [[48, 10], [28, 10]]);
  assert.deepEqual((await frames([`[a] sq say: ${TEN}`, `mo say @ a.end - a.length / 2: ${TEN}`]))[2], [10, 10]);
});

test("a length that is known only once everything has its place is not read, and a number reads none", async () => {
  const known = "known only once they have their place";
  assert.deepEqual(await why(["[a] sq slide", "mo slide takes=a.length"]), [[2, [1], `takes=a.length: how long line 1 lasts is its own, or what the words beside it take, ${known}`]]);
  assert.deepEqual(await why([`[b] sq say: ${TEN}`, "[a] sq slide arrive=b.end + 1s", "mo slide takes=a.length"]), [[3, [2], `takes=a.length: how long line 2 lasts is what it needs to arrive, ${known}`]]);
  assert.deepEqual(await why(["[a] in order:", "  sq say: Hi.", "mo slide takes=a.length"]), [[3, [1], "takes=a.length: how long the block of line 1 lasts is known only once all in it has its place"]]);
  assert.deepEqual(await why(["sq say: Hi.", "mo slide takes=block.length"]), [[2, [], "takes=block.length: how long the scene lasts is known only once all in it has its place"]]);
  assert.match(await hint(["[a] sq slide", "mo slide takes=a.length"]), /^a line that is said, or an action given its length/);
  // Nothing from below, from another scene, or of nobody.
  assert.deepEqual(await why(["mo slide takes=a.length", "[a] sq say: Hi."]), [[1, [2], '"a" is below, at line 2: a length is read of a line above']]);
  assert.deepEqual(await why(["[a] sq say: Hi.", "mo slide takes=aa.length"]), [[2, [], 'nothing above is called "aa"']]);
  assert.deepEqual(await why(["sq slide", "mo slide"], { cartoon: { "mo.takes": "prev.length", "sq.takes": "prev.length" } }), [[101, [1], "sq.takes=prev.length: for line 1, there is no prev: it is the first of its block"]]);
  assert.deepEqual(await why(["sq say: Hi.", "sq say: Ho."], { scene: { pause: "a.length" } }), [[201, [200], "pause=a.length: no line is above the scene's own values"]]);
  assert.deepEqual(await why(["[a] sq say: Hi.", "mo slide takes=1s * (2s / a.length)"]), [[2, [], "takes=1s * (2s / a.length): nothing is divided by a line's length"]]);
  assert.deepEqual(await takes(["[a] sq say: Hi.", "mo slide takes=1s + a.length - a.length"]), [1]);
  // A number is known before anything is spoken.
  assert.deepEqual(await why(["[a] sq say: Hi.", "mo slide speed=a.length / 2s"]), [[2, [], "speed=a.length / 2s: a speed is known before anything is spoken, and a line's length is not"]]);
  assert.deepEqual(await why(["[a] sq say: Hi.", "mo slide far=a.length / 2s"]), [[2, [], "far=a.length / 2s: far is known before anything is spoken, and a line's length is not"]]);
});

test("a value of the wrong kind is refused: a time without seconds, a number in seconds, a moment, a name that is none", async () => {
  const one = async (row: string, levels?: Levels) => (await why([row], levels))[0]!.at(-1);
  assert.equal(await one("sq slide takes=2"), "takes=2: it is a number, and not a time");
  assert.equal(await hint(["sq slide takes=2"]), "write it in seconds: 0.5s");
  assert.equal(await one("sq slide takes=0s"), "takes=0s: an action takes more than 0");
  assert.equal(await one("sq slide takes=1s - 2s"), "takes=1s - 2s: an action takes more than 0");
  assert.equal(await one("sq slide speed=2s"), "speed=2s: it is a time, and a speed is so many times its own");
  assert.equal(await one("sq slide speed=0"), "speed=0: a speed is more than 0");
  assert.equal(await one("sq slide far=2s"), "far=2s: far is no time, and has no unit");
  assert.equal(await one("sq slide far=2 + 1s"), "far=2 + 1s: a time and a number without a unit do not add up");
  assert.equal(await one("sq slide speed=1 / 0"), "speed=1 / 0: nothing is divided by 0");
  // What comes to 0 is 0, though a computer's sums are a hair off.
  assert.equal(await one("sq slide speed=0.1 + 0.2 - 0.3"), "speed=0.1 + 0.2 - 0.3: a speed is more than 0");
  assert.equal(await one("sq slide takes=1s / (0.1 + 0.2 - 0.3)"), "takes=1s / (0.1 + 0.2 - 0.3): nothing is divided by 0");
  assert.deepEqual(await far(["sq slide far=0.1 + 0.2"]), [0.3]);
  assert.equal(await one("in order pause=2:\n  sq say: Hi.\n  sq say: Ho."), "pause=2: it is a number, and not a time");
  assert.equal(await one("in order pause=1s - 2s:\n  sq say: Hi.\n  sq say: Ho."), "pause=1s - 2s: it is less than 0");
  const moments = ["[a] sq say: Hi."];
  assert.deepEqual(await why([...moments, "mo slide far=a.end"]), [[2, [], "far=a.end: only arrive takes a moment of a line"]]);
  assert.deepEqual(await why([...moments, "mo slide takes=a.end"]), [[2, [], "takes=a.end: a moment of a line is no number"]]);
  assert.deepEqual(await why([...moments, "mo slide far=there * 2"], { cartoon: { there: "a.end" } }), [[2, [], "far=there * 2: a moment of a line is no number"]]);
  assert.deepEqual(await issues([...moments, "mo say @ a.end - 0.5: Ho."]), [{ line: 2, message: '"- 0.5" is not a time', hint: "write it in seconds: - 0.5s" }]);
  assert.deepEqual(await issues([...moments, "mo say @ a.end + two: Ho."], { cartoon: { two: "2" } }), [{ line: 2, message: '"+ two" is not a time', hint: "write it in seconds: - 0.5s" }]);
  // A name that nothing sets: where it is written, with the line that needs a number of it.
  assert.deepEqual(await issues(["sq slide speed=slo"]), [{ line: 1, message: 'speed=slo: no value is called "slo"', hint: "did you mean slow?" }]);
  assert.deepEqual(await issues(["sq slide far=gap * 2"], { cartoon: { gap: "nearr", near: "2", unread: "near" } }).then((all) => all[0]), { line: 100, also: [1], message: 'gap=nearr: no value is called "nearr"', hint: "did you mean near?" });
  assert.equal(await hint(["sq slide far=width * 2"]), "set it on the cartoon, a scene or a block (width: 2), or write a number");
  assert.equal(await hint(["sq slide far=near-20 + 1"], { cartoon: { near: "2", gap: "near" } }), "a minus has a space on each side; set it on the cartoon, a scene or a block (near-20: 2), or write a number");
  // The same mistake of one line is said once, though it makes it twice.
  assert.deepEqual(await why(["sq slide arrive=a.end @ a.start"]), [[1, [], 'nothing above is called "a"']]);
  // The same mistake of one value is said once, with the lines that read it.
  assert.deepEqual(await why(["sq slide", "mo slide"], { cartoon: { "slide.takes": "2" } }), [[100, [1, 2], "slide.takes=2: it is a number, and not a time"]]);
  // A schema's own reason comes with the level that sets the value.
  const strict: Schema = { "~standard": { ...taking({ far: {} })["~standard"], validate: () => ({ issues: [{ message: "it is at most 3", path: ["far"] }] }) } };
  const picky = { ...PLUGIN, actions: { slide: { ...PLUGIN.actions.slide!, values: strict } } };
  const result = await checkScenario(picky, scenario(["sq slide"], { cartoon: { far: "2 * 2" } }), undefined, SPEAKERS, TIMING);
  assert.deepEqual(result, { issues: [{ line: 1, also: [100], message: "slide, far=4: it is at most 3", hint: "as in: sq slide to=right" }] });
});

test("a value nothing reads is refused, and whose nobody is, and one set where it means nothing", async () => {
  const say = ["sq say: Hi."];
  assert.deepEqual(await issues(say, { cartoon: { puase: "1s" } }), [
    { line: 100, message: 'nothing reads "puase"', hint: "a value is one of the tool's (pause, lead, tail, takes, speed, arrive), one an action takes (far, to, times), or one that a formula reads: did you mean pause?" },
  ]);
  // What a formula reads is read, and what an action takes is taken, whether or not a line has it.
  assert.equal((await checked(say, { scene: { near: "1", "sq.far": "near", speed: "slow" } })).lines.length, 1);
  assert.deepEqual(await why(["sq say: Hi.", "mo say @ prev.end + lag: Ho."], { cartoon: { lag: "1s", lagg: "1s" } }), [[101, [], 'nothing reads "lagg"']]);
  assert.deepEqual(await issues(say, { cartoon: { "sk.speed": "1" } }), [
    { line: 100, message: '"sk" is neither a character nor an action', hint: "a value is for everything (speed), for a character (pip.speed) or an action (hop.speed): did you mean sq?" },
  ]);
  assert.deepEqual(await why(say, { cartoon: { "slid.speed": "1" } }), [[100, [], '"slid" is neither a character nor an action']]);
  assert.deepEqual(await why(say, { cartoon: { "sq.pause": "1s" } }), [[100, [], "pause is nobody's own: it is the same for everyone"]]);
  assert.deepEqual(await why(say, { cartoon: { "say.speed": "2" } }), [[100, [], "say takes no speed: a voice lasts as long as its words"]]);
  assert.deepEqual(await why(["in order lead=1s:", "  sq say: Hi."]), [[1, [], "lead is a scene's, and not a block's"]]);
  assert.deepEqual(await why(say, { cartoon: { Near: "1" } }), [[100, [], '"Near" is not a value\'s name']]);
  assert.deepEqual(await why(say, { cartoon: { "sq.slide.far": "1" } }), [[100, [], '"sq.slide.far" is not a value\'s name']]);
  assert.deepEqual(await issues(["sq slide pause=1s", "sq slide tail=1s"]), [
    { line: 1, message: "slide takes no pause", hint: "a pause is a block's: set it on its header, or begin the next row later (@ prev.end + 1s)" },
    { line: 2, message: "slide takes no tail", hint: "tail is a scene's: set it on the scene or the cartoon" },
  ]);
  assert.deepEqual(await why(["sq say speed=2: Hi."]), [[1, [], "say takes no speed"]]);
});

test("an anchor's seconds are a formula of the line's own, or of the first of those joined to it", async () => {
  const begins = async (rows: string[], levels?: Levels) => (await frames(rows, levels))[2]![0];
  assert.equal(await begins([`[a] sq say: ${TEN}`, "mo say @ a.start + beat * 2: Ho."], { cartoon: { beat: "0.2s" } }), 9);
  assert.equal(await begins([`[a] sq say: ${TEN}`, "mo say @ a.end - (beat + 0.1s): Ho."], { cartoon: { beat: "0.2s" } }), 12);
  assert.equal(await begins([`[a] sq say: ${TEN}`, "mo say @ a.start + beat: Ho.", "& sq slide"], { cartoon: { beat: "0.2s", "mo.beat": "0.4s" } }), 9);
  const block = await frames([`[a] sq say: ${TEN}`, "in order beat=0.3s @ a.start + beat:", "  mo say: Ho."]);
  assert.equal(block[3]![0], 8);
});

test("a compiled scenario holds numbers only: no name and no formula is in it", async () => {
  const rows = ["[a] sq say: Hello there.", "& mo slide far=near * 2 takes=a.length / 2", "in order pause=beat near=near-by:", "  sq hop times=two speed=slow", "  mo slide far=near arrive=prev.end + beat"];
  const result = await check(rows, { cartoon: { beat: "0.4s", near: "10", "near-by": "3 * 5", two: "2" } });
  assert.ok("scenes" in result, JSON.stringify(result));
  const compiled = compile(result.scenes, [{ file: "a.wav", duration: 1.4, mouth: [] }], { fps: 10, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "x.yaml");
  assert.deepEqual(
    compiled.scenes[0]!.lines.map((line) => ("values" in line ? [line.from, line.frames, line.values] : [line.from, line.frames])),
    [[5, 14], [5, 7, { far: 20 }], [22, 40, { times: 2 }], [66, 10, { far: 15 }]],
  );
  for (const name of ["beat", "near", "slow", "length", "takes", "speed", "arrive"]) assert.ok(!JSON.stringify(compiled).includes(name), name);
});

test("the values an action takes are those its JSON Schema names, and an example's are plain", () => {
  assert.deepEqual(valuesTaken(PLUGIN.actions), { slide: { far: {}, to: {} }, hop: { times: { default: 1 } } });
  const bare = { description: "It goes.", example: "sq go", values: { "~standard": { ...taking({})["~standard"], jsonSchema: { input: () => ({}), output: () => ({}) } } } };
  assert.deepEqual(valuesTaken({ go: bare }), { go: {} });
  assert.deepEqual(plainValues({ to: "left", far: "2 * 3" }), { to: "left", far: 6 });
  assert.throws(() => plainValues({ far: "2s" }), /far=2s: far is no time, and has no unit/);
});

test("seconds with lengths in them are worked out by the lines' frames", () => {
  assert.equal(secondsOf({ seconds: -0.4, lengths: [{ line: 3, times: 0.5 }] }, () => 2), 0.6);
});
