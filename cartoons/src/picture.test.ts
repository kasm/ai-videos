import assert from "node:assert/strict";
import { test } from "node:test";
import { frameSvg, stagingAt } from "./picture.ts";
import { checkScenario } from "./scenario.ts";

const scenario = checkScenario(
  {
    characters: {
      pip: {
        parts: {
          body: [{ shape: "rect", at: [0, -100], size: [100, 200], round: 50, fill: "#f2a33a" }],
          mouth: [{ shape: "ellipse", at: [0, -90], size: [40, 10], fill: "#5b2333" }],
        },
      },
    },
    backgrounds: {
      meadow: { fill: "#bfe3ff", shapes: [{ shape: "rect", at: [960, 950], size: [1920, 260], fill: "#7cc36a" }] },
      night: { fill: "#101030" },
    },
    scenes: [
      {
        background: "meadow",
        places: { pip: [-200, 900] },
        beats: [
          { name: "walks-in", takes: 4, walk: { who: "pip", to: [960, 900] } },
          { name: "stops", takes: 3 },
        ],
      },
      { background: "night", places: { pip: [300, 800] }, beats: [{ name: "later", takes: 2 }] },
    ],
  },
  "test",
);
const pipAt = (beat: number, progress: number) => stagingAt(scenario, { beat, progress }).characters[0]!.at;

test("a walk goes from the character's place to its end, and the beats after find it there", () => {
  assert.deepEqual(pipAt(0, 0), [-200, 900]);
  assert.deepEqual(pipAt(0, 1), [960, 900]);
  assert.deepEqual(pipAt(1, 0), [960, 900]);
});

test("halfway through, the walker is halfway, and never below the ground", () => {
  const [x, y] = pipAt(0, 0.5);
  assert.ok(Math.abs(x - 380) < 1e-6, `x is ${x}`);
  assert.ok(y <= 900 && y >= 900 - 16, `y is ${y}`);
  // Between two steps the character is up: 1160 px is 8 steps, so 1/16 of the way is a step's middle.
  const p = Math.acos(1 - 2 / 16) / Math.PI; // where the eased way is 1/16
  assert.ok(Math.abs(pipAt(0, p)[1] - (900 - 16)) < 1e-6);
});

test("a later scene has its own background and places", () => {
  const staging = stagingAt(scenario, { beat: 2, progress: 0 });
  assert.equal(staging.background.fill, "#101030");
  assert.deepEqual(staging.characters, [{ name: "pip", at: [300, 800] }]);
  assert.throws(() => stagingAt(scenario, { beat: 3, progress: 0 }), /no beat 3/);
});

test("the picture is the stage as SVG: the background, its shapes, then each character's parts in order", () => {
  assert.equal(
    frameSvg(scenario, { beat: 1, progress: 0, mouth: 0 }, { width: 960, height: 540 }),
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="960" height="540">',
      '<rect width="1920" height="1080" fill="#bfe3ff"/>',
      '<rect x="0" y="820" width="1920" height="260" fill="#7cc36a"/>',
      '<g transform="translate(960 900)"><rect x="-50" y="-200" width="100" height="200" rx="50" fill="#f2a33a"/><ellipse cx="0" cy="-90" rx="20" ry="5" fill="#5b2333"/></g>',
      "</svg>",
    ].join("\n"),
  );
});

test("the same moment is the same text", () => {
  const at = { beat: 0, progress: 0.37, mouth: 0.4 };
  const size = { width: 1920, height: 1080 };
  assert.equal(frameSvg(scenario, at, size), frameSvg(scenario, { ...at }, size));
  assert.notEqual(frameSvg(scenario, at, size), frameSvg(scenario, { ...at, progress: 0.38 }, size));
  assert.notEqual(frameSvg(scenario, at, size), frameSvg(scenario, { ...at, mouth: 0.41 }, size));
});

test("the mouth opens downwards: its top edge stays, and wide open it is nearly as tall as wide", () => {
  // Pip's mouth is 40 wide and 10 tall, its top edge 95 above the ground.
  const mouth = (open: number) => /<ellipse cx="0" cy="([-\d.]+)" rx="20" ry="([-\d.]+)" fill="#5b2333"\/>/.exec(frameSvg(scenario, { beat: 1, progress: 0, mouth: open }, { width: 960, height: 540 }))!.slice(1).map(Number);
  assert.deepEqual(mouth(0), [-90, 5], "closed: as the scenario writes it");
  assert.deepEqual(mouth(1), [-77, 18], "wide open: 36 tall, 0.9 of its width");
  assert.deepEqual(mouth(0.5), [-83.5, 11.5], "half open: halfway");
  for (const open of [0, 0.5, 1]) {
    const [cy, ry] = mouth(open);
    assert.equal(cy! - ry!, -95, "the top edge stays");
  }
  // Only the mouth moves: the rest of the picture is the closed one's.
  const rest = (open: number) => frameSvg(scenario, { beat: 1, progress: 0, mouth: open }, { width: 960, height: 540 }).replace(/<ellipse[^>]*fill="#5b2333"\/>/, "");
  assert.equal(rest(1), rest(0));
});
