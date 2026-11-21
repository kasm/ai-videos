import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { checkScenario, moveOf } from "./scenario.ts";

const hello = path.join(import.meta.dirname, "../videos/hello.yaml");
/** A cartoon's file, read as the tool reads it for the plugin: without the tool's `use:`. */
const readScenario = (file: string) => {
  const { use: _use, ...scenario } = parse(readFileSync(file, "utf8"));
  return checkScenario(scenario, file);
};

/** The smallest scenario, as parsed YAML; each test breaks one thing in a copy of it. */
const small = () => ({
  characters: { pip: { parts: { body: [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#f2a33a" }] } } },
  backgrounds: { meadow: { fill: "#bfe3ff" } },
  scenes: [
    {
      background: "meadow",
      places: { pip: [-200, 900] },
      beats: [
        { name: "walks-in", takes: 4, walk: { who: "pip", to: [960, 900] }, says: [{ who: "narrator", text: "This is Pip." }] },
        { name: "stops", takes: 3 },
      ],
    },
  ],
});

test("hello's scenario reads: a character of parts, a background, one scene", () => {
  const s = readScenario(hello);
  assert.deepEqual(Object.keys(s.characters.pip!.parts), ["body", "eyes", "mouth"]);
  assert.deepEqual(Object.keys(s.backgrounds), ["meadow"]);
  assert.equal(s.scenes.length, 1);
  assert.deepEqual(s.scenes[0]!.beats.map((b) => b.name), ["walks-in", "stops"]);
});

test("sundown's scenario reads, and uses each pose, each move and a background changed by a beat", () => {
  const s = readScenario(path.join(import.meta.dirname, "../videos/sundown.yaml"));
  const beats = s.scenes.flatMap((scene) => scene.beats);
  assert.deepEqual(new Set(beats.map((beat) => moveOf(beat)?.kind)), new Set(["walk", "turn", "jump", undefined]));
  assert.deepEqual(new Set(beats.flatMap((beat) => Object.values(beat.pose))), new Set(["stand", "wave", "point"]));
  assert.deepEqual(new Set([s.scenes[0]!.background, ...beats.flatMap((beat) => beat.background ?? [])]), new Set(Object.keys(s.backgrounds)));
  assert.deepEqual(s.scenes[0]!.faces, { mo: "left" });
});

test("the smallest scenario passes, and what it leaves out is empty", () => {
  const s = checkScenario(small(), "small.yaml");
  assert.deepEqual(s.backgrounds.meadow!.shapes, []);
  assert.deepEqual(s.scenes[0]!.beats[1]!.says, []);
});

test("a key the format does not have is refused, with the file's name", () => {
  const s = small();
  Object.assign(s.scenes[0]!.beats[1]!, { dance: true });
  assert.throws(() => checkScenario(s, "small.yaml"), /small\.yaml is not a scenario[\s\S]*dance/);
});

/** `small` with an arm on Pip, and a second background: what poses, turns and changes of background need. */
const withArm = () => {
  const s = small();
  Object.assign(s.characters.pip, { shoulder: [50, -150] });
  Object.assign(s.characters.pip.parts, { arm: [{ shape: "rect", at: [50, -110], size: [20, 100], fill: "#d9861f" }] });
  Object.assign(s.backgrounds, { night: { fill: "#101030" } });
  return s;
};
/** `withArm`, its second beat given `more`. */
const withBeat = (more: object) => {
  const s = withArm();
  Object.assign(s.scenes[0]!.beats[1]!, more);
  return s;
};

test("a beat may turn or jump, change poses and the background; a scene says who faces left", () => {
  const s = withArm();
  Object.assign(s.scenes[0]!, { faces: { pip: "left" } });
  s.scenes[0]!.beats.push(
    { name: "turns", takes: 0.5, turn: { who: "pip" } } as never,
    { name: "jumps", takes: 1.2, jump: { who: "pip", times: 2 }, pose: { pip: "wave" }, background: "night" } as never,
    { name: "hops", takes: 0.6, jump: { who: "pip" }, pose: { pip: "point" } } as never,
  );
  const read = checkScenario(s, "s");
  const [walk, stop, turn, jump, hop] = read.scenes[0]!.beats;
  assert.deepEqual(read.scenes[0]!.faces, { pip: "left" });
  assert.deepEqual([walk, stop, turn, jump, hop].map((beat) => moveOf(beat!)?.kind), ["walk", undefined, "turn", "jump", "jump"]);
  assert.deepEqual(jump!.pose, { pip: "wave" });
  assert.equal(jump!.background, "night");
  assert.equal(hop!.jump!.times, 1, "a jump is one hop when it does not say");
  assert.deepEqual(stop!.pose, {}, "a beat that names no pose changes none");
});

test("a beat has one move, and who moves has a place in the scene", () => {
  const two = withArm();
  Object.assign(two.scenes[0]!.beats[0]!, { jump: { who: "pip" } });
  assert.throws(() => checkScenario(two, "s"), /a beat has one move, not walk and jump/);

  assert.throws(() => checkScenario(withBeat({ turn: { who: "bob" } }), "s"), /"bob" has no place in this scene/);
  assert.throws(() => checkScenario(withBeat({ jump: { who: "bob" } }), "s"), /"bob" has no place in this scene/);
  assert.throws(() => checkScenario(withBeat({ jump: { who: "pip", times: 0 } }), "s"), /times/);
  assert.throws(() => checkScenario(withBeat({ jump: { who: "pip", times: 1.5 } }), "s"), /times/);
});

test("a pose is one of the three, of a character the scene places, and a wave or a point needs an arm", () => {
  for (const pose of ["stand", "wave", "point"]) checkScenario(withBeat({ pose: { pip: pose } }), "s");
  assert.throws(() => checkScenario(withBeat({ pose: { pip: "dance" } }), "s"), /pose/);
  assert.throws(() => checkScenario(withBeat({ pose: { bob: "wave" } }), "s"), /"bob" has no place in this scene/);

  // `small` has no arm: Pip may stand, not wave.
  const armless = (pose: string) => {
    const s = small();
    Object.assign(s.scenes[0]!.beats[1]!, { pose: { pip: pose } });
    return s;
  };
  checkScenario(armless("stand"), "s");
  assert.throws(() => checkScenario(armless("wave"), "s"), /"pip" has no part named "arm" to wave with/);
  assert.throws(() => checkScenario(armless("point"), "s"), /"pip" has no part named "arm" to point with/);
});

test("an arm needs a shoulder, a beat's background exists, and who faces left has a place", () => {
  const noShoulder = withArm();
  delete (noShoulder.characters.pip as { shoulder?: unknown }).shoulder;
  assert.throws(() => checkScenario(noShoulder, "s"), /"pip" has an arm and no shoulder/);

  assert.throws(() => checkScenario(withBeat({ background: "forest" }), "s"), /no background is named "forest"/);

  const faces = withArm();
  Object.assign(faces.scenes[0]!, { faces: { bob: "left" } });
  assert.throws(() => checkScenario(faces, "s"), /"bob" has no place in this scene/);
  Object.assign(faces.scenes[0]!, { faces: { pip: "up" } });
  assert.throws(() => checkScenario(faces, "s"), /faces/);
});

test("a scene's background, the characters it places and the one who walks must exist", () => {
  const noBackground = small();
  noBackground.scenes[0]!.background = "forest";
  assert.throws(() => checkScenario(noBackground, "s"), /no background is named "forest"/);

  const noCharacter = small();
  Object.assign(noCharacter.scenes[0]!.places, { bob: [0, 0] });
  assert.throws(() => checkScenario(noCharacter, "s"), /no character is named "bob"/);

  const noPlace = small();
  noPlace.scenes[0]!.places = {} as never;
  assert.throws(() => checkScenario(noPlace, "s"), /"pip" has no place in this scene/);
});

test("a line is said by the narrator or a character", () => {
  const s = small();
  s.scenes[0]!.beats[0]!.says![0]!.who = "bob";
  assert.throws(() => checkScenario(s, "s"), /"bob" is neither the narrator nor a character/);

  const named = small();
  Object.assign(named.characters, { narrator: named.characters.pip });
  assert.throws(() => checkScenario(named, "s"), /"narrator" is the speaker nobody draws/);
});

test("a beat's name is unique, and a beat takes some time", () => {
  const twice = small();
  twice.scenes[0]!.beats[1]!.name = "walks-in";
  assert.throws(() => checkScenario(twice, "s"), /beat "walks-in" is named twice/);

  const still = small();
  still.scenes[0]!.beats[1]!.takes = 0;
  assert.throws(() => checkScenario(still, "s"), /takes/);
});
