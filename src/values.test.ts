// What a script's values come to (values.ts), read, checked and compiled as the tool does it: which
// level and which of a level's a line takes, formulas worked out where they are read, how long an
// action lasts, lines' lengths, constructions, the defaults; and every mistake, with its line and a
// hint. The plugin here is a small one written for the test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "./compile.ts";
import { secondsOf, type Span } from "./formula.ts";
import type { Schema } from "./plugin.ts";
import { readScript } from "./read.ts";
import { checkScenario, linesIn, type Anchor, type CheckedLine, type Issue, type SceneActions, type ScriptPlugin, type WrittenScript, type WrittenValue } from "./scenario.ts";
import { plainValues, valuesTaken, workOut } from "./values.ts";

/** A schema that passes any values of these names, each with its default when it has one. */
const taking = (properties: Record<string, { default?: unknown }>): Schema => ({
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (values) => ({ value: { ...Object.fromEntries(Object.entries(properties).flatMap(([name, { default: own }]) => (own === undefined ? [] : [[name, own]]))), ...(values as object) } }),
    jsonSchema: { input: () => ({ type: "object", properties }), output: () => ({}) },
  },
});

/** `slide` goes \`far\`, a number, \`to\` a side, in 2 seconds, and is fitted; \`hop\` hops so many \`times\`, a second each, and is not; \`watch\` is open. */
const PLUGIN: ScriptPlugin = {
  actions: {
    slide: { description: "It slides.", example: "sq slide to=right", values: taking({ far: {}, to: {} }), channels: ["place"], fits: true },
    hop: { description: "It hops.", example: "sq hop", values: taking({ times: { default: 1 } }), channels: ["hop"] },
    watch: { description: "It watches.", example: "sq watch", values: taking({ far: {} }), channels: ["head"], open: true },
  },
  names: { slow: 0.5, fast: 2 },
  guide: "It slides.",
  check: (scenes) => ({
    scenes: scenes.map(({ actions }) => ({ setting: {}, actions: actions.map(({ action, values }) => ({ values: values as Record<string, number | string>, ...(action === "watch" ? {} : { length: action === "hop" ? (values as { times: number }).times : 2 }) })) })),
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
  // Own length: a slide 2 seconds, a hop 1, which is never fitted and so has its own without being given it.
  assert.deepEqual(await speeds({ cartoon: { "sq.speed": "slow" } }), [4, "own", 2, 1]);
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

/** How loud each line that is said is, dB; `library` is the library's volumes. */
const volumes = async (rows: string[], levels?: Levels, library: Record<string, number> = {}) => {
  const result = await checkScenario(PLUGIN, scenario(rows, levels), undefined, SPEAKERS, TIMING, library);
  assert.ok("scenes" in result, JSON.stringify(result));
  return result.scenes.flatMap((scene) => linesIn(scene.items)).flatMap((line) => ("text" in line ? [line.volume] : []));
};

test("how loud what is said is, is found on the nearest level: the line's, a block's, the scene's, the cartoon's, and the library's under them", async () => {
  const rows = [
    "sq say: One.",
    "mo say volume=-3dB: Two.",
    "in order volume=-10dB:",
    "  sq say: Three.",
    "  together mo.volume=-20dB:",
    "    sq say: Four.",
    "    mo say: Five.",
    "    narrator say volume=1.5dB: Six.",
    "narrator say: Seven.",
  ];
  assert.deepEqual(await volumes(rows), [0, -3, -10, -10, -20, 1.5, 0]);
  assert.deepEqual(await volumes(rows, { cartoon: { volume: "-1dB" } }), [-1, -3, -10, -10, -20, 1.5, -1]);
  assert.deepEqual(await volumes(rows, { cartoon: { volume: "-1dB" }, scene: { volume: "-2dB" } }), [-2, -3, -10, -10, -20, 1.5, -2]);
  // Of one level, the character's goes over what is said by all, and that over everything's.
  assert.deepEqual(await volumes(rows, { scene: { volume: "-2dB", "say.volume": "-4dB", "narrator.volume": "-6dB" } }), [-4, -3, -10, -10, -20, 1.5, -6]);
  // The library's is each character's own, under every level of the file; the narrator is not in it.
  assert.deepEqual(await volumes(rows, {}, { sq: -5, mo: 2.5 }), [-5, -3, -10, -10, -20, 1.5, 0]);
  assert.deepEqual(await volumes(["sq say: One.", "mo say: Two."], { cartoon: { "mo.volume": "0dB" } }, { sq: -5, mo: 2.5 }), [-5, 0]);
  assert.deepEqual(await volumes(["sq say: One.", "mo say: Two."], { scene: { volume: "-9dB" } }, { sq: -5, mo: 2.5 }), [-9, -9]);
  // A formula of the writer's own names, worked out where it is read.
  assert.deepEqual(await volumes(["sq say volume=hush: One.", "in order hush=-20dB:", "  mo say volume=hush * 2 + 4dB: Two.", "mo say volume=hush - 0.5dB: Three."], { cartoon: { hush: "-12dB" } }), [-12, -36, -12.5]);
  assert.deepEqual(await volumes(["sq say volume=0.1dB + 0.2dB: One."]), [0.3]);
  // It may be read, as any value of the tool's.
  assert.deepEqual(await volumes(["sq say volume=-6dB * (volume-of / 2): One."], { cartoon: { "volume-of": "3" } }), [-9]);
  // Joined rows are at the level of the row they are in.
  assert.deepEqual(await volumes(["sq say volume=-6dB: One.", "& mo say: Two."]), [-6, 0]);
  // What is given no volume has the default, and is said to; one that the library gives is not.
  const result = await checkScenario(PLUGIN, scenario(["sq say: One.", "mo say: Two.", "narrator say: Three."]), undefined, SPEAKERS, TIMING, { mo: -3 });
  assert.ok("scenes" in result);
  assert.deepEqual(result.defaults.filter(({ name }) => name === "volume"), [{ name: "volume", value: "0dB", lines: [1, 3] }]);
});

test("a volume that is none, or too much of one, is refused where it is set, and so is one for what is not said", async () => {
  const one = async (volume: string) => (await issues([`[a] sq say: Hi.`, `mo say volume=${volume}: Ho.`])).map(({ line, message, hint }) => [line, message, hint]);
  const decibels = "write it in decibels: -12dB is quieter, and 0dB as loud as any voice";
  assert.deepEqual(await one("0.5"), [[2, "volume=0.5: it is a number, and not a volume", decibels]]);
  assert.deepEqual(await one("50%"), [[2, "volume=50%: it is a number, and not a volume", decibels]]);
  assert.deepEqual(await one("2s"), [[2, "volume=2s: it is a time, and not a volume", decibels]]);
  assert.deepEqual(await one("-60.5dB"), [[2, "volume=-60.5dB: a volume is from -60dB to 12dB", decibels]]);
  assert.deepEqual(await one("6dB * 2 + 0.001dB"), [[2, "volume=6dB * 2 + 0.001dB: a volume is from -60dB to 12dB", decibels]]);
  assert.deepEqual(await volumes(["sq say volume=-60dB: Hi.", "sq say volume=12dB: Ho."]), [-60, 12]);
  assert.deepEqual(await one("a.length / 1s * 3dB"), [[2, "volume=a.length / 1s * 3dB: a volume is known before anything is spoken, and a line's length is not", decibels]]);
  assert.equal((await one("a.end"))[0]![1], "volume=a.end: a moment of a line is no number");
  assert.equal((await one("hush"))[0]![1], 'volume=hush: no value is called "hush"');
  assert.deepEqual(await one("volume - 3dB"), [[2, "the values go round: volume is volume - 3dB", "a value does not read itself: give one of the two another name"]]);
  // At the line that sets it, with those that read it.
  assert.deepEqual(await why(["sq say: Hi.", "mo say: Ho."], { scene: { volume: "-6" } }), [[201, [1, 2], "volume=-6: it is a number, and not a volume"]]);
  // What is not said has none, and a volume is no time and no number.
  assert.deepEqual(await issues(["sq slide volume=-6dB"]), [{ line: 1, message: "slide takes no volume: only what is said has one", hint: "leave volume out" }]);
  assert.deepEqual(await why(["sq watch volume=-6dB", "& mo say: Hi."]), [[1, [], "watch takes no volume: only what is said has one"]]);
  for (const action of ["slide", "watch"]) {
    assert.deepEqual(await issues(["sq say: Hi."], { cartoon: { [`${action}.volume`]: "-6dB" } }), [
      { line: 100, message: `${action} takes no volume: only what is said has one`, hint: "it is for everything that is said (volume, say.volume) or for a character (pip.volume)" },
    ]);
  }
  assert.deepEqual(await why(["sq slide takes=3dB"]), [[1, [], "takes=3dB: it is a volume, and not a time"]]);
  assert.deepEqual(await why(["sq slide speed=3dB"]), [[1, [], "speed=3dB: it is a volume, and a speed is so many times its own"]]);
  assert.deepEqual(await issues(["sq slide far=3dB"]), [{ line: 1, message: "far=3dB: far is no volume, and has no unit", hint: "write it without the dB" }]);
  assert.deepEqual(await why(["in order pause=volume:", "  sq say: Hi.", "  sq say: Ho."]), [[1, [], "pause=volume: it is a volume, and not a time"]]);
  // A wrong one counts as the tool's own: it is the one mistake.
  assert.deepEqual(await why(["sq say volume=2: Hi."]), [[1, [], "volume=2: it is a number, and not a volume"]]);
  // For a character or an action nobody is, as any value.
  assert.deepEqual(await why(["sq say: Hi."], { cartoon: { "sk.volume": "-6dB" } }), [[100, [], '"sk" is neither a character nor an action']]);
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

test("in a block that ends its lines together, an action goes at its own speed or takes what it is given, and arrives at no moment of its own", async () => {
  assert.deepEqual(await frames(["ending together:", "  sq slide", `  mo say: ${TEN}`]), { 2: [5, 20], 3: [15, 10] });
  assert.deepEqual(await frames(["ending together speed=2:", "  sq slide", "  mo slide takes=3s", `  mo say: ${TEN}`]), { 2: [25, 10], 3: [5, 30], 4: [25, 10] });
  assert.deepEqual(await frames([`[a] sq say: ${TEN}`, "ending together:", `  mo say: ${TEN}`, "  sq slide takes=a.length * 1.5"]), { 1: [5, 10], 3: [23, 10], 4: [18, 15] });
  // A line of it may have its length read below, in it too.
  assert.deepEqual(await frames(["ending together:", `  [a] mo say: ${TEN}`, "  sq slide takes=a.length / 2"]), { 2: [5, 10], 3: [10, 5] });
  assert.deepEqual((await checked(["sq slide", "ending together:", "  mo slide", "  sq say: Hi."])).defaults.filter(({ name }) => name === "speed"), [
    { name: "speed", value: "1, or what the words beside it take", lines: [1] },
    { name: "speed", value: "1", lines: [3] },
  ]);

  assert.deepEqual(await issues(["[a] sq say: Hi.", "ending together:", "  mo slide arrive=a.end", "  sq say: Ho."]), [
    { line: 3, also: [2], message: "arrive=a.end: the block of line 2 ends its lines together, so an action in it has no end of its own", hint: "leave it out, or give the action its speed there: speed=1" },
  ]);
  // Set on a level around it, it is said where it is set, with all it reaches there; a nearer speed goes over it.
  const around = ["sq say: Hi.", "ending together:", "  mo slide", "  sq slide", "  mo say: Ho."];
  const levels = { scene: { "slide.arrive": "prev.end" } };
  assert.deepEqual(await why(around, levels), [[201, [2, 3, 4], "slide.arrive=prev.end: the block of line 2 ends its lines together, so an action in it has no end of its own"]]);
  assert.deepEqual(await takes(around.toSpliced(1, 1, "ending together speed=1:"), levels), [2, 2]);
  // Beside the block, it arrives as ever.
  assert.deepEqual(await frames([`[a] sq say: ${TEN}${TEN}`, "& ending together:", `    mo say: ${TEN}`, "& sq slide arrive=a.end"]), { 1: [5, 20], 3: [5, 10], 4: [5, 20] });
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
    { name: "speed", value: "1, or what the words beside it take", lines: [1] },
    { name: "hop times", value: "1", lines: [2] },
    { name: "speed", value: "1", lines: [2, 3] },
    { name: "volume", value: "0dB", lines: [5, 6, 8] },
  ]);
  assert.deepEqual((await checked(rows, { cartoon: { pause: "1s", lead: "1s", tail: "1s", speed: "1", "hop.times": "3", volume: "-1dB" } })).defaults, []);
});

test("an action that is not fitted takes its own length, whatever is said beside it, and the length it is given", async () => {
  const beside = async (row: string, levels?: Levels) => (await frames([row, `& mo say: ${TEN}${TEN}${TEN}`], levels))[1];
  assert.deepEqual([await beside("sq slide"), await beside("sq hop"), await beside("sq hop times=2")], [[5, 30], [5, 10], [5, 20]]);
  assert.deepEqual([await beside("sq hop takes=0.5s"), await beside("sq hop speed=slow"), await beside("sq hop", { scene: { "hop.speed": "fast" } })], [[5, 5], [5, 20], [5, 5]]);
  // Told when to arrive, it is hurried or slowed to that, as any.
  assert.deepEqual(await frames([`[a] mo say: ${TEN}5678`, "& sq hop arrive=a.end"]), { 1: [5, 14], 2: [5, 14] });
  // In an `ending together:` it ends with the rest, as any.
  assert.deepEqual(await frames(["ending together:", "  sq hop", `  mo say: ${TEN}${TEN}`]), { 2: [15, 10], 3: [5, 20] });
  // So it waits for no words, and they may wait for its end; and how long it lasts is read.
  assert.deepEqual(await frames(["together:", "  [h] sq hop", `  narrator say: ${TEN}${TEN}`, `  mo say @ h.end: ${TEN}`]), { 2: [5, 10], 3: [5, 20], 4: [15, 10] });
  assert.deepEqual(await frames(["[h] sq hop times=3", "mo slide takes=h.length / 2"]), { 1: [5, 30], 2: [38, 15] });
  assert.deepEqual(await takes(["sq hop times=3", "sq slide"]), [3, "own"]);
  // Its speed is a default too.
  assert.deepEqual((await checked(["sq hop times=1"])).defaults.filter(({ name }) => name === "speed"), [{ name: "speed", value: "1", lines: [1] }]);
});

test("an action that is open lasts to the end of its block, whatever is set for the rest, and takes no length of its own", async () => {
  // Nothing waits for it, and no level's length is its own: not the cartoon's, its character's, or two of them on one level.
  const rows = ["sq slide", "& mo watch", `& mo say: ${TEN}${TEN}${TEN}`, `sq say: ${TEN}`];
  const open = { 1: [5, 30], 2: [5, 30], 3: [5, 30], 4: [38, 10] };
  assert.deepEqual(await frames(rows), open);
  for (const set of [{ "mo.takes": "1s" }, { "mo.speed": "slow" }, { "mo.arrive": "prev.end" }, { "mo.takes": "1s", "mo.speed": "2" }] as Record<string, string>[]) {
    assert.deepEqual(await frames(rows, { cartoon: set }), open);
    assert.deepEqual(await frames(rows, { scene: set }), open);
  }
  assert.deepEqual(await frames(rows, { cartoon: { takes: "1s" } }), { ...open, 1: [5, 10] });
  // What it takes is found on any level, as any action's, and it has no speed to take by default.
  const { lines, defaults } = await checked(rows, { scene: { "watch.far": "7" } });
  assert.deepEqual(lines[1], { line: 2, who: "mo", action: "watch", values: { far: 7 }, channels: ["head"], length: "open" });
  assert.deepEqual(defaults.filter(({ name }) => name === "speed"), [{ name: "speed", value: "1, or what the words beside it take", lines: [1] }]);

  const beside = (row: string) => [`[a] sq say: ${TEN}`, `& ${row}`];
  assert.deepEqual(await issues(beside("mo watch takes=2s")), [{ line: 2, message: "watch takes no takes: it lasts to the end of its block", hint: "leave takes out, and have its block end where it does: join it to what it goes with (&)" }]);
  assert.deepEqual(await why(beside("mo watch speed=2 arrive=a.end")), [[2, [], "watch takes no speed: it lasts to the end of its block"], [2, [], "watch takes no arrive: it lasts to the end of its block"]]);
  assert.deepEqual(await issues(beside("mo watch"), { cartoon: { "watch.takes": "2s" } }), [{ line: 100, message: "watch takes no takes: it lasts to the end of its block", hint: "takes is another action's: leave it out" }]);
  for (const name of ["speed", "arrive"]) assert.deepEqual(await why(beside("mo watch"), { scene: { [`watch.${name}`]: name === "speed" ? "2" : "prev.end" } }), [[201, [], `watch takes no ${name}: it lasts to the end of its block`]]);
  assert.deepEqual(await why(beside("mo watch pause=1s")), [[2, [], "watch takes no pause"]]);
  // Where it is not said which are open, none is.
  const { scenes } = workOut(scenario(["mo watch takes=1s"]), { actions: { watch: {} }, names: {}, speakers: SPEAKERS, timing: TIMING });
  assert.deepEqual(linesIn(scenes[0]!.items).map(({ lasts }) => lasts), [{ takes: 1 }]);
  // How long it lasts is read by nothing.
  assert.deepEqual(await why([`sq say: ${TEN}`, "& [w] mo watch", "sq slide takes=w.length"]), [[3, [2], "takes=w.length: line 2 lasts to the end of its block, and where that is, is known only once all in it has its place"]]);
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
  assert.match(await hint(["[a] sq slide", "mo slide takes=a.length"]), /^a line that is said, or an action given its length \(takes, speed\) or never fitted, /);
  assert.deepEqual(await why([`[b] sq say: ${TEN}`, "[a] sq hop arrive=b.end + 1s", "mo slide takes=a.length"]), [[3, [2], `takes=a.length: how long line 2 lasts is what it needs to arrive, ${known}`]]);
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
    { line: 100, message: 'nothing reads "puase"', hint: "a value is one of the tool's (pause, lead, tail, takes, speed, arrive, volume), one an action takes (far, to, times), or one that a formula reads: did you mean pause?" },
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
  for (const name of ["beat", "near", "slow", "length", "takes", "speed", "arrive", "dB"]) assert.ok(!JSON.stringify(compiled).includes(name), name);
});

test("the values an action takes are those its JSON Schema names, and an example's are plain", () => {
  assert.deepEqual(valuesTaken(PLUGIN.actions), { slide: { far: {}, to: {} }, hop: { times: { default: 1 } }, watch: { far: {} } });
  const bare = { description: "It goes.", example: "sq go", channels: ["place"], values: { "~standard": { ...taking({})["~standard"], jsonSchema: { input: () => ({}), output: () => ({}) } } } };
  assert.deepEqual(valuesTaken({ go: bare }), { go: {} });
  assert.deepEqual(plainValues({ to: "left", far: "2 * 3" }), { to: "left", far: 6 });
  assert.deepEqual(plainValues({ to: "beside(mo, near * 2)" }, { near: 3 }), { to: { construction: "beside", of: ["mo", 6] } });
  assert.throws(() => plainValues({ far: "2s" }), /far=2s: far is no time, and has no unit/);
});

/** The plugin with constructions and a table of formulas (\`spots\`), and what its check is given: the scene's own keys and each action's values. */
async function given(rows: string[], { spots, names = PLUGIN.names!, ...levels }: { spots?: unknown; names?: Record<string, number> } & Levels = {}) {
  let seen: SceneActions[] = [];
  const plugin: ScriptPlugin = {
    ...PLUGIN,
    names,
    constructions: { beside: { description: "Beside a place.", example: "beside(mo, 2)" }, between: { description: "Between two.", example: "between(sq, mo)" } },
    tables: ["spots"],
    check: (scenes) => ((seen = scenes), { scenes: scenes.map(({ actions }) => ({ setting: {}, actions: actions.map(() => ({ values: {}, length: 1 })) })) }),
  };
  const script = scenario(rows, levels);
  if (spots !== undefined) script.scenes[0]!.setting = { colour: "red", spots };
  const result = await checkScenario(plugin, script, undefined, SPEAKERS, TIMING);
  if ("issues" in result) return { issues: result.issues, why: result.issues.map(({ line, also = [], message }) => [line, also, message]) };
  return { setting: seen[0]!.setting, to: seen[0]!.actions.map(({ values }) => (values as { to?: unknown }).to) };
}

test("a construction is the plugin's to work out: it gets its name, the numbers worked out, and the names that nothing sets", async () => {
  const made = (construction: string, ...of: unknown[]) => ({ construction, of });
  assert.deepEqual((await given(["sq slide to=beside(mo, 2 * 3)"])).to, [made("beside", "mo", 6)]);
  assert.deepEqual((await given(["sq slide to=beside(between(mo, home), slow)"])).to, [made("beside", made("between", "mo", "home"), 0.5)]);
  // A name in it stands for what the nearest level sets: a number, another name, or a construction.
  assert.deepEqual((await given(["sq slide to=beside(home, near)", "in order near=5:", "  sq slide to=beside(home, near)", "mo slide to=beside(home, near)"], { cartoon: { near: "1", "mo.near": "2", home: "house" } })).to, [
    made("beside", "house", 1),
    made("beside", "house", 5),
    made("beside", "house", 2),
  ]);
  // It may be set on a level itself, and by a name: worked out where it is read.
  assert.deepEqual((await given(["sq slide", "mo slide", "in order near=5:", "  sq slide"], { cartoon: { to: "there", there: "beside(home, near)", near: "1", "mo.near": "2" } })).to, [made("beside", "home", 1), made("beside", "home", 2), made("beside", "home", 5)]);
  assert.deepEqual((await given(["sq slide to=beside(+there, 1)"], { cartoon: { there: "between(a-hill, 100%)" } })).to, [made("beside", made("between", "a-hill", 1), 1)]);
  // What is only in a construction is read.
  assert.equal("issues" in (await given(["sq slide to=beside(home, near)"], { cartoon: { near: "1" } })), false);
});

test("a construction the plugin has not, or of what it does not take, is refused, with the line that sets it", async () => {
  const refusal = async (to: string, levels?: Levels) => {
    const { issues: [issue], issues } = await given([`sq slide to=${to}`, "sq say: Hi."], levels) as { issues: Issue[] };
    assert.equal(issues.length, 1, JSON.stringify(issues));
    return [issue!.message, issue!.hint];
  };
  assert.deepEqual(await refusal("near-to(mo, 2)"), ['to=near-to(mo, 2): no construction is named "near-to"', "the constructions are beside and between"]);
  assert.deepEqual(await refusal("beside(besid(mo, 2), 2)"), ['to=beside(besid(mo, 2), 2): no construction is named "besid"', "the constructions are beside and between: did you mean beside?"]);
  assert.deepEqual(await why(["sq slide to=beside(mo, 2)"]), [[1, [], 'to=beside(mo, 2): no construction is named "beside"']]);
  assert.equal(await hint(["sq slide to=beside(mo, 2)"]), "a value is a number, a name, or a formula of these");
  assert.deepEqual(await refusal("beside(mo, 2s)"), ["to=beside(mo, 2s): what beside takes is no time, and has no unit", "write it without the s"]);
  assert.equal((await refusal("beside(mo, pause)"))[0], "to=beside(mo, pause): what beside takes is no time, and has no unit");
  // It is a value by itself, and no number.
  const stands = "a construction stands by itself, or in another's parentheses: what is worked out goes in its own, as in left-of(pip, near * 2)";
  assert.deepEqual(await refusal("beside(mo, 2) + 1"), ["to=beside(mo, 2) + 1: beside(mo, 2) is no number", stands]);
  assert.deepEqual(await refusal("beside(mo, there * 2)", { cartoon: { there: "between(sq, 1)" } }), ["to=beside(mo, there * 2): between(sq, 1) is no number", stands]);
  assert.equal((await refusal("- beside(mo, 2)"))[0], "to=- beside(mo, 2): beside(mo, 2) is no number");
  for (const time of ["takes", "speed"]) assert.equal((await refusal(`home ${time}=beside(mo, 2)`))[0], `${time}=beside(mo, 2): beside(mo, 2) is no number`);
  assert.equal((await refusal("home arrive=beside(mo, 2)"))[0], "arrive=beside(mo, 2): it is no moment of something above");
  assert.equal((await refusal("home", { cartoon: { pause: "beside(mo, 2)" } }))[0], "pause=beside(mo, 2): beside(mo, 2) is no number");
  // A name in arithmetic is a number's, in a construction as anywhere: a character is none.
  assert.deepEqual(await refusal("beside(tower + 1, 2)"), ['to=beside(tower + 1, 2): no value is called "tower"', "set it on the cartoon, a scene or a block (tower: 2), or write a number"]);
  assert.deepEqual(await refusal("beside(mo + 1, 2)"), ["to=beside(mo + 1, 2): mo is a character, and no number", "a character's name stands by itself, or in a construction, as in beside(mo, 2) and between(sq, mo)"]);
  assert.deepEqual(await refusal("home takes=there", { cartoon: { there: "mo * 2" } }), ["there=mo * 2: mo is a character, and no number", "a character's name stands by itself, or in a construction, as in beside(mo, 2) and between(sq, mo)"]);
  assert.equal(await hint(["sq slide far=mo + 1"]), "a character's name stands by itself");
  // At the line that sets it, with the one that reads it; a moment or a length is known only with the voices.
  assert.deepEqual((await given(["[a] sq say: Hi.", "sq slide to=there"], { cartoon: { there: "beside(mo, a.length)" } })).why, [[100, [2], "there=beside(mo, a.length): what beside takes is known before anything is spoken, and a line's length is not"]]);
  assert.deepEqual((await given(["[a] sq say: Hi.", "sq slide to=beside(when, 1)"], { cartoon: { when: "a.end" } })).why, [[2, [], "to=beside(when, 1): only arrive takes a moment of a line"]]);
  // Values that go round, through constructions.
  assert.deepEqual((await given(["sq slide to=here"], { cartoon: { here: "beside(there, 1)", there: "between(here, mo)" } })).why, [[101, [1, 100], "the values go round: here is beside(there, 1) and there is between(here, mo)"]]);
});

test("a scene's table of formulas is worked out at the scene's level, each for whose it is, for the plugin's check", async () => {
  const levels = { cartoon: { near: "1", home: "house" }, scene: { near: "2", "mo.near": "3" } };
  assert.deepEqual((await given(["sq say: Hi."], { ...levels, spots: { sq: "beside(mo, near)", mo: "near * 10", tri: "home", sun: 300, moon: "left" } })).setting, {
    colour: "red",
    spots: { sq: { construction: "beside", of: ["mo", 2] }, mo: 30, tri: "house", sun: 300, moon: "left" },
  });
  // What is no formula, and what is no table, the plugin's check gets as it is written; a block's values are not the scene's.
  assert.deepEqual((await given(["in order near=5:", "  sq slide far=near"], { ...levels, spots: { sq: [1, 2], mo: null, tri: "near", far: "home", on: true } })).setting!.spots, { sq: [1, 2], mo: null, tri: 2, far: "house", on: true });
  for (const spots of ["near", 3, ["near"], null]) assert.deepEqual((await given(["sq slide to=beside(home, near)"], { ...levels, spots })).setting!.spots, spots);
  assert.deepEqual((await given(["sq say: Hi."])).setting, {});
  // What a table reads is read, and what is wrong in one is said at the scene's line.
  assert.equal("issues" in (await given(["sq say: Hi."], { cartoon: { near: "1" }, spots: { sq: "near" } })), false);
  assert.deepEqual((await given(["sq say: Hi."], { cartoon: { near: "1" }, spots: { sq: 1 } })).why, [[100, [], 'nothing reads "near"']]);
  const wrong = async (text: string, cartoon: Record<string, string> = {}) => (await given(["[a] sq say: Hi."], { cartoon, spots: { sq: text } })).why;
  assert.deepEqual(await wrong("beside(mo"), [[200, [], 'spots.sq=beside(mo: beside( has no ")" after it']]);
  assert.deepEqual(await wrong("2 *"), [[200, [], 'spots.sq=2 *: something is missing after "*"']]);
  assert.deepEqual(await wrong("2s"), [[200, [], "spots.sq=2s: spots.sq is no time, and has no unit"]]);
  assert.deepEqual(await wrong("a.length"), [[200, [], "spots.sq=a.length: no line is above the scene's own values"]]);
  assert.deepEqual(await wrong("a.end"), [[200, [], "spots.sq=a.end: only arrive takes a moment of a line"]]);
  assert.deepEqual(await wrong("nob + 1"), [[200, [], 'spots.sq=nob + 1: no value is called "nob"']]);
  assert.deepEqual(await wrong("far-off(mo)"), [[200, [], 'spots.sq=far-off(mo): no construction is named "far-off"']]);
  assert.deepEqual(await wrong("here", { here: "there", there: "here" }), [[101, [100, 200], "the values go round: here is there and there is here"]]);
});

test("a value has no character's name: in a formula, that is the character", async () => {
  assert.deepEqual(await issues(["sq slide to=mo"], { cartoon: { mo: "3" } }), [{ line: 100, message: "mo is a character's name, and no value's", hint: "call it something else: in a formula, mo is the character" }]);
  assert.deepEqual(await why(["sq slide to=tri", "tri slide to=left"], { scene: { "sq.tri": "3" } }), [[201, [], "tri is a character's name, and no value's"]]);
  assert.deepEqual(await why(["in order narrator=3:", "  sq slide far=narrator"]), [[1, [], "narrator is a character's name, and no value's"]]);
});

test("what is written as a character's value, and no value is, has a hint of the tables that say how a scene begins", async () => {
  const hintOf = async (key: string, text = "300") => {
    const { issues: [issue] } = (await given(["sq slide to=home"], { scene: { [key]: text } })) as { issues: Issue[] };
    return [issue!.message, issue!.hint.match(/( \(what a scene begins with.*)?$/)![0]];
  };
  const begins = " (what a scene begins with is not among its values: spots: { mo: 300 })";
  assert.deepEqual(await hintOf("mo"), ["mo is a character's name, and no value's", begins]);
  assert.deepEqual(await hintOf("mo.pos"), ['nothing reads "pos"', begins]);
  assert.deepEqual(await hintOf("mo.pos.x"), ['"mo.pos.x" is not a value\'s name', begins]);
  assert.deepEqual(await hintOf("mo.pos", "left"), ['nothing reads "pos"', begins.replace("300", "left")]);
  // Not for what is no character's, and not when the plugin has no tables.
  assert.deepEqual(await hintOf("pos"), ['nothing reads "pos"', ""]);
  assert.deepEqual(await hintOf("slide.pos"), ['nothing reads "pos"', ""]);
  assert.deepEqual(await hintOf("narrator"), ["narrator is a character's name, and no value's", ""]);
  assert.doesNotMatch(await hint(["sq slide"], { scene: { "mo.pos": "300" } }), /begins with/);
});

test("seconds with lengths in them are worked out by the lines' frames", () => {
  assert.equal(secondsOf({ seconds: -0.4, lengths: [{ line: 3, times: 0.5 }] }, () => 2), 0.6);
});
