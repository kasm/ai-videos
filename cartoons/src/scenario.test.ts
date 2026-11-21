import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { checkScenario, GROUND, MARKS, moveOf, PACE } from "./scenario.ts";

const root = path.join(import.meta.dirname, "..");
/** The project's library, as the tool gives it to the plugin: without each character's voice. */
const libraryOf =(file = path.join(root, "library.yaml")) => {
  const raw = parse(readFileSync(file, "utf8"));
  for (const character of Object.values(raw.characters ?? {})) delete (character as { voice?: string }).voice;
  return { file, raw };
};
/** A cartoon's file, read as the tool reads it for the plugin: without the tool's `use:`. */
const readScenario = (file: string) => {
  const { use: _use, ...scenario } = parse(readFileSync(file, "utf8"));
  return checkScenario(scenario, file, libraryOf());
};

/** The smallest library: one character and one background, as parsed YAML. */
const library = () => ({
  characters: { pip: { parts: { body: [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#f2a33a" }] } } as Record<string, object> },
  backgrounds: { meadow: { fill: "#bfe3ff" } } as Record<string, object>,
});
/** `library` with an arm on Pip, and a second background: what poses, turns and changes of background need. */
const withArm = () => {
  const l = library();
  Object.assign(l.characters.pip!, { shoulder: [50, -150] });
  Object.assign((l.characters.pip as { parts: object }).parts, { arm: [{ shape: "rect", at: [50, -110], size: [20, 100], fill: "#d9861f" }] });
  Object.assign(l.backgrounds, { night: { fill: "#101030" } });
  return l;
};
/** A beat as parsed YAML: its name and its lines, and whatever else a test gives it. */
type RawBeat = { name: string; says?: { who: string; text: string }[] } & Record<string, unknown>;
/** The smallest scenario, as parsed YAML; each test breaks one thing in a copy of it. */
const small = () => ({
  scenes: [
    {
      background: "meadow",
      places: { pip: "off-left" } as Record<string, unknown>,
      beats: [
        { name: "walks-in", takes: 4, walk: { who: "pip", to: "middle" }, says: [{ who: "narrator", text: "This is Pip." }] },
        { name: "stops", takes: 3 },
      ] as RawBeat[],
    },
  ],
});
/** Checks a scenario against a library, `withArm`'s unless it says. */
const check = (s: unknown, l: unknown = withArm()) => checkScenario(s, "small.yaml", { file: "library.yaml", raw: l });
/** `small`, its second beat given `more`. */
const withBeat = (more: object) => {
  const s = small();
  Object.assign(s.scenes[0]!.beats[1]!, more);
  return s;
};

test("the-shy-visitor reads with the library: every name found, each mark a point on the ground", () => {
  const s = readScenario(path.join(root, "videos/the-shy-visitor.yaml"));
  assert.deepEqual(Object.keys(s.characters), ["pip", "mo", "tuk"]);
  assert.deepEqual(s.scenes[0]!.places, { pip: [960, 880], mo: [1440, 880], tuk: [-250, 880] });
  const beats = s.scenes.flatMap((scene) => scene.beats);
  assert.deepEqual(beats.find((beat) => beat.walk)!.walk, { who: "tuk", to: [480, 880] });
  // It uses each move, each pose and backgrounds changed by a beat.
  assert.deepEqual(new Set(beats.map((beat) => moveOf(beat)?.kind)), new Set(["walk", "turn", "jump", undefined]));
  assert.deepEqual(new Set(beats.flatMap((beat) => Object.values(beat.pose))), new Set(["stand", "wave", "point"]));
  assert.deepEqual([s.scenes[0]!.background, ...beats.flatMap((beat) => beat.background ?? [])], ["morning", "sundown", "night"]);
});

test("the smallest scenario passes, and what it leaves out is empty", () => {
  const s = check(small(), library());
  assert.deepEqual(s.backgrounds.meadow!.shapes, []);
  assert.deepEqual(s.scenes[0]!.faces, {});
  assert.deepEqual(s.scenes[0]!.beats[1]!.says, []);
});

test("a key the format does not have is refused, with the file's name", () => {
  assert.throws(() => check(withBeat({ dance: true })), /small\.yaml is not a scenario[\s\S]*dance/);
});

test("a place is a mark on the ground, and a walk goes to one", () => {
  const s = small();
  s.scenes[0]!.places = { pip: "right" };
  Object.assign(s.scenes[0]!.beats[1]!, { walk: { who: "pip", to: "off-right" } });
  assert.deepEqual(GROUND, 880);
  const read = check(s);
  assert.deepEqual(read.scenes[0]!.places, { pip: [MARKS.right, GROUND] });
  assert.deepEqual(read.scenes[0]!.beats[0]!.walk, { who: "pip", to: [MARKS.middle, GROUND] });
  assert.deepEqual(read.scenes[0]!.beats[1]!.walk, { who: "pip", to: [MARKS["off-right"], GROUND] });

  const point = small();
  point.scenes[0]!.places = { pip: [960, 880] };
  assert.throws(() => check(point), /small\.yaml is not a scenario[\s\S]*off-left[\s\S]*places\.pip/);
  assert.throws(() => check(withBeat({ walk: { who: "pip", to: "far" } })), /small\.yaml is not a scenario[\s\S]*walk\.to/);
  // A walk to where the walker stands would go nowhere.
  assert.throws(() => check(withBeat({ walk: { who: "pip", to: "middle" } })), /"pip" stands at middle already: walk to another mark/);
});

test("two characters never stand on one mark of the stage; off it, any number wait", () => {
  const l = withArm();
  Object.assign(l.characters, { mo: library().characters.pip, bo: library().characters.pip });
  const two = small();
  two.scenes[0]!.places = { pip: "middle", mo: "middle" };
  two.scenes[0]!.beats[0] = { name: "waits" };
  assert.throws(() => check(two, l), /"pip" and "mo" both stand at middle: give each a mark of its own/);

  const onto = small();
  onto.scenes[0]!.places = { pip: "off-left", mo: "middle", bo: "off-left" };
  assert.throws(() => check(onto, l), /"pip" walks to middle, where "mo" stands: walk to another mark/);
  // Bo and Pip wait off the stage together; Pip goes where Mo stood, once Mo has gone.
  onto.scenes[0]!.beats.splice(0, 0, { name: "mo-goes", walk: { who: "mo", to: "off-right" } });
  check(onto, l);
});

test("a beat's length, left out, is its own: a walk's way, a turn, a jump's hops, a hold's words", () => {
  const s = small();
  s.scenes[0]!.beats = [
    { name: "walks-in", walk: { who: "pip", to: "middle" }, says: [{ who: "narrator", text: "A walk takes its own time, whatever is said." }] },
    { name: "turns", turn: { who: "pip" } },
    { name: "jumps", jump: { who: "pip", times: 3 } },
    { name: "waits" },
    { name: "talks", says: [{ who: "narrator", text: "Five words take their time." }, { who: "pip", text: "And four more here." }] },
    { name: "walks-on", takes: 2, walk: { who: "pip", to: "left" } },
    { name: "walks-off", walk: { who: "pip", to: "off-right" } },
  ];
  const takes = check(s).scenes[0]!.beats.map((beat) => beat.takes);
  assert.deepEqual(takes, [
    (960 + 250) / PACE.walk, // from off-left to the middle: 1210 px at 320 px a second
    PACE.turn,
    3 * PACE.hop,
    PACE.hold, // a hold with nothing said takes the least
    Math.round(9 * PACE.word * 1000) / 1000, // nine words, said one after another
    2, // as written
    (2170 - 480) / PACE.walk, // from where the walk before left it
  ].map((t) => Math.round(t * 1000) / 1000));
});

test("a video names the library's characters and backgrounds, and draws none of its own", () => {
  const drawn = { ...small(), characters: library().characters };
  assert.throws(() => check(drawn), /small\.yaml is not a scenario[\s\S]*characters are drawn in library\.yaml/);
  const backdrop = { ...small(), backgrounds: library().backgrounds };
  assert.throws(() => check(backdrop), /backgrounds are drawn in library\.yaml/);
});

test("a name the library lacks is refused, saying what the library has", () => {
  const noBackground = small();
  noBackground.scenes[0]!.background = "forest";
  assert.throws(() => check(noBackground), /no background is named "forest": the library has backgrounds: meadow, night/);
  assert.throws(() => check(withBeat({ background: "forest" })), /no background is named "forest"/);

  const noCharacter = small();
  Object.assign(noCharacter.scenes[0]!.places, { bob: "right" });
  assert.throws(() => check(noCharacter), /no character is named "bob": the library has characters: pip/);

  // A project with no library has nothing to name.
  assert.throws(() => checkScenario(small(), "small.yaml", undefined), /no background is named "meadow": the library has no backgrounds[\s\S]*no character is named "pip": the library has no characters/);
});

test("a mistake in the library is reported against the library", () => {
  const noShoulder = withArm();
  delete (noShoulder.characters.pip as { shoulder?: unknown }).shoulder;
  assert.throws(() => check(small(), noShoulder), /^Error: library\.yaml is not a library[\s\S]*"pip" has an arm and no shoulder/);

  const named = library();
  Object.assign(named.characters, { narrator: named.characters.pip });
  assert.throws(() => check(small(), named), /library\.yaml is not a library[\s\S]*"narrator" is the speaker nobody draws/);

  assert.throws(() => check(small(), { characters: {}, backgrounds: {}, props: {} }), /library\.yaml is not a library[\s\S]*props/);
});

test("a beat may turn or jump, change poses and the background; a scene says who faces left", () => {
  const s = small();
  Object.assign(s.scenes[0]!, { faces: { pip: "left" } });
  s.scenes[0]!.beats.push(
    { name: "turns", takes: 0.5, turn: { who: "pip" } },
    { name: "jumps", takes: 1.2, jump: { who: "pip", times: 2 }, pose: { pip: "wave" }, background: "night" },
    { name: "hops", takes: 0.6, jump: { who: "pip" }, pose: { pip: "point" } },
  );
  const read = check(s);
  const [walk, stop, turn, jump, hop] = read.scenes[0]!.beats;
  assert.deepEqual(read.scenes[0]!.faces, { pip: "left" });
  assert.deepEqual([walk, stop, turn, jump, hop].map((beat) => moveOf(beat!)?.kind), ["walk", undefined, "turn", "jump", "jump"]);
  assert.deepEqual(jump!.pose, { pip: "wave" });
  assert.equal(jump!.background, "night");
  assert.equal(hop!.jump!.times, 1, "a jump is one hop when it does not say");
  assert.deepEqual(stop!.pose, {}, "a beat that names no pose changes none");
});

test("a beat has one move, and who moves has a place in the scene", () => {
  const two = small();
  Object.assign(two.scenes[0]!.beats[0]!, { jump: { who: "pip" } });
  assert.throws(() => check(two), /a beat has one move, not walk and jump/);

  assert.throws(() => check(withBeat({ turn: { who: "bob" } })), /"bob" has no place in this scene/);
  assert.throws(() => check(withBeat({ jump: { who: "bob" } })), /"bob" has no place in this scene/);
  assert.throws(() => check(withBeat({ walk: { who: "bob", to: "left" } })), /"bob" has no place in this scene/);
  assert.throws(() => check(withBeat({ jump: { who: "pip", times: 0 } })), /times/);
  assert.throws(() => check(withBeat({ jump: { who: "pip", times: 1.5 } })), /times/);
});

test("a pose is one of the three, of a character the scene places, and a wave or a point needs an arm", () => {
  for (const pose of ["stand", "wave", "point"]) check(withBeat({ pose: { pip: pose } }));
  assert.throws(() => check(withBeat({ pose: { pip: "dance" } })), /pose/);
  assert.throws(() => check(withBeat({ pose: { bob: "wave" } })), /"bob" has no place in this scene/);

  // `library` has no arm: Pip may stand, not wave.
  check(withBeat({ pose: { pip: "stand" } }), library());
  assert.throws(() => check(withBeat({ pose: { pip: "wave" } }), library()), /"pip" has no part named "arm" to wave with/);
  assert.throws(() => check(withBeat({ pose: { pip: "point" } }), library()), /"pip" has no part named "arm" to point with/);
});

test("who faces left has a place, and faces left or right", () => {
  const faces = small();
  Object.assign(faces.scenes[0]!, { faces: { bob: "left" } });
  assert.throws(() => check(faces), /"bob" has no place in this scene/);
  Object.assign(faces.scenes[0]!, { faces: { pip: "up" } });
  assert.throws(() => check(faces), /faces/);
});

test("a line is said by the narrator or a character of the library, placed or not", () => {
  const s = small();
  s.scenes[0]!.beats[0]!.says![0]!.who = "bob";
  assert.throws(() => check(s), /"bob" is neither the narrator nor a character: the library has characters: pip/);

  // A character the scene does not place is a voice off stage.
  const off = withArm();
  Object.assign(off.characters, { mo: library().characters.pip });
  const said = small();
  said.scenes[0]!.beats[0]!.says![0]!.who = "mo";
  check(said, off);
});

test("a beat's name is unique, and a beat takes some time", () => {
  const twice = small();
  twice.scenes[0]!.beats[1]!.name = "walks-in";
  assert.throws(() => check(twice), /beat "walks-in" is named twice/);
  assert.throws(() => check(withBeat({ takes: 0 })), /takes/);
});
