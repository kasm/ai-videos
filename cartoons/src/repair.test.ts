// Each thing the plugin mends before the check, what it says it did, and what it leaves alone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { repairScenario } from "./repair.ts";
import { checkScenario } from "./scenario.ts";

/** Pip and Mo, with arms, and a meadow. */
const library = {
  file: "library.yaml",
  raw: {
    characters: Object.fromEntries(
      ["pip", "mo"].map((who) => [
        who,
        {
          shoulder: [50, -150],
          parts: {
            body: [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#f2a33a" }],
            arm: [{ shape: "rect", at: [50, -110], size: [20, 100], fill: "#d9861f" }],
          },
        },
      ]),
    ),
    backgrounds: { meadow: { fill: "#bfe3ff" } },
  },
};
/** A scenario of one scene, Pip on the left facing right, with these beats. */
const scene = (beats: object[], more: object = {}) => ({ scenes: [{ background: "meadow", places: { pip: "left" }, beats, ...more }] });
const repair = (raw: unknown) => repairScenario(raw, library);
const beatsOf = (source: unknown) => (source as { scenes: { beats: { name: string }[] }[] }).scenes[0]!.beats;

test("a beat with two moves becomes two beats, in the order written, its lines and the rest with the first", () => {
  const line = { who: "pip", text: "Here I go." };
  const raw = scene([{ name: "goes", takes: 2, turn: { who: "pip" }, walk: { who: "pip", to: "off-left" }, pose: { pip: "wave" }, says: [line] }]);
  const { source, did } = repair(raw);
  assert.deepEqual(beatsOf(source), [
    { name: "goes", takes: 2, turn: { who: "pip" }, pose: { pip: "wave" }, says: [line] },
    { name: "goes-walk", walk: { who: "pip", to: "off-left" } },
  ]);
  assert.deepEqual(did, ['beat "goes" had a turn and a walk, and a beat has one move: beat "goes-walk" follows it with the rest']);
  checkScenario(source, "s", library);

  // Three moves are three beats.
  const three = repair(scene([{ name: "all", jump: { who: "pip" }, turn: { who: "pip" }, walk: { who: "pip", to: "off-left" } }]));
  assert.deepEqual(beatsOf(three.source).map((b) => b.name), ["all", "all-turn", "all-walk"]);
  assert.deepEqual(three.did, ['beat "all" had a jump, a turn and a walk, and a beat has one move: beats "all-turn" and "all-walk" follow it with the rest']);
});

test("a walk away from where the walker faces gets a beat before it that turns the walker round", () => {
  // Pip faces right, as written, and walks left; Mo, off the stage on the right, walks in facing right.
  const raw = scene(
    [
      { name: "pip-leaves", walk: { who: "pip", to: "off-left" } },
      { name: "mo-comes", walk: { who: "mo", to: "middle" }, says: [{ who: "mo", text: "Hello?" }] },
    ],
    { places: { pip: "left", mo: "off-right" } },
  );
  const { source, did } = repair(raw);
  assert.deepEqual(beatsOf(source), [
    { name: "pip-leaves-turn", turn: { who: "pip" } },
    { name: "pip-leaves", walk: { who: "pip", to: "off-left" } },
    { name: "mo-comes-turn", turn: { who: "mo" } },
    { name: "mo-comes", walk: { who: "mo", to: "middle" }, says: [{ who: "mo", text: "Hello?" }] },
  ]);
  assert.deepEqual(did, [
    '"pip" faced away from off-left, where it walks in beat "pip-leaves": beat "pip-leaves-turn" turns it round first',
    '"mo" faced away from middle, where it walks in beat "mo-comes": beat "mo-comes-turn" turns it round first',
  ]);
  checkScenario(source, "s", library);
});

test("who faces the way it walks is left alone: as the scene's faces say, or as a turn left it", () => {
  const faces = scene([{ name: "leaves", walk: { who: "pip", to: "off-left" } }], { faces: { pip: "left" } });
  assert.deepEqual(repair(faces), { source: faces, did: [] });
  const turned = scene([
    { name: "turns", turn: { who: "pip" } },
    { name: "leaves", walk: { who: "pip", to: "off-left" } },
    { name: "comes-back", walk: { who: "pip", to: "right" } }, // facing left still: this one is turned
  ]);
  const { source, did } = repair(turned);
  assert.deepEqual(beatsOf(source).map((b) => b.name), ["turns", "leaves", "comes-back-turn", "comes-back"]);
  assert.equal(did.length, 1);
});

test("both at once: the moves split first, then the walk that would go backwards is turned", () => {
  // The walk is written first and goes left: the beat's own turn follows it as "back-turn", so the
  // turn put in before the walk is named next, "back-turn-2".
  const { source, did } = repair(scene([{ name: "back", walk: { who: "pip", to: "off-left" }, turn: { who: "pip" } }]));
  assert.deepEqual(beatsOf(source).map((b) => b.name), ["back-turn-2", "back", "back-turn"]);
  assert.equal(did.length, 2);
  checkScenario(source, "s", library);
});

test("the mended scenario is a copy, in names, and what it can't make sense of is left for the check", () => {
  const raw = scene([{ name: "goes", turn: { who: "pip" }, jump: { who: "pip" } }]);
  const copy = structuredClone(raw);
  repair(raw);
  assert.deepEqual(raw, copy, "the source as given is unchanged");

  for (const odd of [undefined, "scenes", { scenes: "none" }, scene([{ name: "far", walk: { who: "pip", to: "far" } }]), scene([{ name: "bob", walk: { who: "bob", to: "middle" } }])]) {
    assert.deepEqual(repair(odd), { source: odd, did: [] });
  }
});
