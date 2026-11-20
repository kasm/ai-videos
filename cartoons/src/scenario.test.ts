import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { checkScenario, readScenario } from "./scenario.ts";

const hello = path.join(import.meta.dirname, "../videos/hello/scenario.yaml");

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

test("the smallest scenario passes, and what it leaves out is empty", () => {
  const s = checkScenario(small(), "small.yaml");
  assert.deepEqual(s.backgrounds.meadow!.shapes, []);
  assert.deepEqual(s.scenes[0]!.beats[1]!.says, []);
});

test("a missing file is named", () => {
  assert.throws(() => readScenario(path.join(import.meta.dirname, "nothing/scenario.yaml")), /no scenario at .*nothing/);
});

test("a key the format does not have is refused, with the file's name", () => {
  const s = small();
  Object.assign(s.scenes[0]!.beats[1]!, { jump: true });
  assert.throws(() => checkScenario(s, "small.yaml"), /small\.yaml is not a scenario[\s\S]*jump/);
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
