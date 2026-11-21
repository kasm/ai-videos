import assert from "node:assert/strict";
import { test } from "node:test";
import { frameSvg, stagingAt } from "./picture.ts";
import { checkScenario } from "./scenario.ts";

const scenario = checkScenario(
  {
    scenes: [
      {
        background: "meadow",
        places: { pip: "off-left" },
        beats: [
          { name: "walks-in", takes: 4, walk: { who: "pip", to: "middle" } },
          { name: "stops", takes: 3 },
        ],
      },
      { background: "night", places: { pip: "left", mo: "middle" }, beats: [{ name: "later", takes: 2 }] },
    ],
  },
  "test",
  {
    file: "library",
    raw: {
      characters: {
        pip: {
          parts: {
            body: [{ shape: "rect", at: [0, -100], size: [100, 200], round: 50, fill: "#f2a33a" }],
            mouth: [{ shape: "ellipse", at: [0, -90], size: [40, 10], fill: "#5b2333" }],
          },
        },
        mo: {
          parts: {
            body: [{ shape: "ellipse", at: [0, -120], size: [160, 240], fill: "#6aa9e9" }],
            mouth: [{ shape: "rect", at: [0, -100], size: [60, 12], fill: "#27324f" }],
          },
        },
      },
      backgrounds: {
        meadow: { fill: "#bfe3ff", shapes: [{ shape: "rect", at: [960, 950], size: [1920, 260], fill: "#7cc36a" }] },
        night: { fill: "#101030" },
      },
    },
  },
);
/** A moment with nothing going on: the clip's first instant, where nobody blinks yet. */
const still = { progress: 0, time: 0, into: 0, mouths: {} };
const pipAt = (beat: number, progress: number) => stagingAt(scenario, { ...still, beat, progress }).characters[0]!.at;

test("a walk goes from the character's place to its end, and the beats after find it there", () => {
  assert.deepEqual(pipAt(0, 0), [-250, 880]);
  assert.deepEqual(pipAt(0, 1), [960, 880]);
  assert.deepEqual(pipAt(1, 0), [960, 880]);
});

test("halfway through, the walker is halfway, and never below the ground", () => {
  const [x, y] = pipAt(0, 0.5);
  assert.ok(Math.abs(x - 355) < 1e-6, `x is ${x}`);
  assert.ok(y <= 880 && y >= 880 - 16, `y is ${y}`);
  // Between two steps the character is up: 1210 px is 8 steps, so 1/16 of the way is a step's middle.
  const p = Math.acos(1 - 2 / 16) / Math.PI; // where the eased way is 1/16
  assert.ok(Math.abs(pipAt(0, p)[1] - (880 - 16)) < 1e-6);
});

test("a later scene has its own background and places", () => {
  const staging = stagingAt(scenario, { ...still, beat: 2 });
  assert.equal(staging.background.fill, "#101030");
  // Each as written: facing right, the arm down, the eyes open.
  assert.deepEqual(staging.characters, [
    { name: "pip", at: [480, 880], facing: 1, arm: 0, eyes: 1 },
    { name: "mo", at: [960, 880], facing: 1, arm: 0, eyes: 1 },
  ]);
  assert.throws(() => stagingAt(scenario, { ...still, beat: 3 }), /no beat 3/);
});

test("the picture is the stage as SVG: the background, its shapes, then each character's parts in order", () => {
  assert.equal(
    frameSvg(scenario, { ...still, beat: 1 }, { width: 960, height: 540 }),
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="960" height="540">',
      '<rect width="1920" height="1080" fill="#bfe3ff"/>',
      '<rect x="0" y="820" width="1920" height="260" fill="#7cc36a"/>',
      '<g transform="translate(960 880)"><rect x="-50" y="-200" width="100" height="200" rx="50" fill="#f2a33a"/><ellipse cx="0" cy="-90" rx="20" ry="5" fill="#5b2333"/></g>',
      "</svg>",
    ].join("\n"),
  );
});

test("the same moment is the same text", () => {
  const at = { ...still, beat: 0, progress: 0.37, mouths: { pip: 0.4 } };
  const size = { width: 1920, height: 1080 };
  assert.equal(frameSvg(scenario, at, size), frameSvg(scenario, { ...at }, size));
  assert.notEqual(frameSvg(scenario, at, size), frameSvg(scenario, { ...at, progress: 0.38 }, size));
  assert.notEqual(frameSvg(scenario, at, size), frameSvg(scenario, { ...at, mouths: { pip: 0.41 } }, size));
});

test("the mouth opens downwards: its top edge stays, and wide open it is nearly as tall as wide", () => {
  // Pip's mouth is 40 wide and 10 tall, its top edge 95 above the ground.
  const mouth = (open: number) => /<ellipse cx="0" cy="([-\d.]+)" rx="20" ry="([-\d.]+)" fill="#5b2333"\/>/.exec(frameSvg(scenario, { ...still, beat: 1, mouths: { pip: open } }, { width: 960, height: 540 }))!.slice(1).map(Number);
  assert.deepEqual(mouth(0), [-90, 5], "closed: as the scenario writes it");
  assert.deepEqual(mouth(1), [-77, 18], "wide open: 36 tall, 0.9 of its width");
  assert.deepEqual(mouth(0.5), [-83.5, 11.5], "half open: halfway");
  for (const open of [0, 0.5, 1]) {
    const [cy, ry] = mouth(open);
    assert.equal(cy! - ry!, -95, "the top edge stays");
  }
  // Only the mouth moves: the rest of the picture is the closed one's.
  const rest = (open: number) => frameSvg(scenario, { ...still, beat: 1, mouths: { pip: open } }, { width: 960, height: 540 }).replace(/<ellipse[^>]*fill="#5b2333"\/>/, "");
  assert.equal(rest(1), rest(0));
});

test("only the mouth of a speaker the moment names opens: the other character's stays as written", () => {
  // The night scene has both: Pip's mouth is the ellipse above, Mo's a rect 60 wide and 12 tall.
  const svg = (mouths: Record<string, number>) => frameSvg(scenario, { ...still, beat: 2, mouths }, { width: 960, height: 540 });
  const pip = (text: string) => /<ellipse[^>]*fill="#5b2333"\/>/.exec(text)![0];
  const mo = (text: string) => /<rect[^>]*fill="#27324f"\/>/.exec(text)![0];
  const closed = svg({});
  assert.equal(mo(closed), '<rect x="-30" y="-106" width="60" height="12" fill="#27324f"/>');

  const pipSpeaks = svg({ pip: 1 });
  assert.notEqual(pip(pipSpeaks), pip(closed), "Pip's mouth is open");
  assert.equal(mo(pipSpeaks), mo(closed), "Mo's is closed");
  const moSpeaks = svg({ mo: 1 });
  assert.equal(pip(moSpeaks), pip(closed), "Pip's is closed");
  assert.equal(mo(moSpeaks), '<rect x="-30" y="-106" width="60" height="54" fill="#27324f"/>', "Mo's is open: 54 tall, its top edge where it was");
  // Both at once, each as wide as its own; and a speaker the scenario does not draw changes nothing.
  const both = svg({ pip: 1, mo: 1 });
  assert.deepEqual([pip(both), mo(both)], [pip(pipSpeaks), mo(moSpeaks)]);
  assert.equal(svg({ owl: 1 }), closed);
});

// Bo has an arm and eyes, and a scene with every move and pose but the walk, which Pip has above.
const acting = checkScenario(
  {
    scenes: [
      {
        background: "day",
        places: { bo: "left" },
        beats: [
          { name: "turns", takes: 0.5, turn: { who: "bo" } },
          { name: "waves", takes: 2, pose: { bo: "wave" } },
          { name: "waves-on", takes: 2 },
          { name: "points", takes: 2, pose: { bo: "point" }, background: "night" },
          { name: "jumps", takes: 1.2, jump: { who: "bo", times: 2 } },
          { name: "rests", takes: 1, pose: { bo: "stand" } },
        ],
      },
      { background: "day", places: { bo: "left" }, faces: { bo: "left" }, beats: [{ name: "again", takes: 1 }] },
    ],
  },
  "test",
  {
    file: "library",
    raw: {
      characters: {
        bo: {
          shoulder: [40, -150],
          parts: {
            body: [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#f2a33a" }],
            arm: [{ shape: "rect", at: [40, -110], size: [20, 100], fill: "#d9861f" }],
            eyes: [
              { shape: "ellipse", at: [0, -160], size: [40, 40], fill: "#ffffff" },
              { shape: "ellipse", at: [6, -156], size: [10, 20], fill: "#2b2d42" },
            ],
          },
        },
      },
      backgrounds: { day: { fill: "#bfe3ff" }, night: { fill: "#101030" } },
    },
  },
);
const [TURNS, WAVES, WAVES_ON, POINTS, JUMPS, RESTS, AGAIN] = [0, 1, 2, 3, 4, 5, 6];
const bo = (beat: number, at: Partial<typeof still> = {}) => stagingAt(acting, { ...still, beat, ...at }).characters[0]!;
const boSvg = (beat: number, at: Partial<typeof still> = {}) => frameSvg(acting, { ...still, beat, ...at }, { width: 960, height: 540 });
const near = (value: number, wanted: number, what = "the value") => assert.ok(Math.abs(value - wanted) < 1e-9, `${what} is ${value}, not ${wanted}`);

test("a turn mirrors the character: narrow halfway and never nothing, then facing the other way in the beats after", () => {
  assert.equal(bo(TURNS).facing, 1);
  near(bo(TURNS, { progress: 0.25 }).facing, Math.SQRT1_2);
  assert.equal(Math.abs(bo(TURNS, { progress: 0.5 }).facing), 0.04, "edge-on: thin, not gone");
  near(bo(TURNS, { progress: 0.75 }).facing, -Math.SQRT1_2);
  assert.equal(bo(TURNS, { progress: 1 }).facing, -1);
  assert.equal(bo(WAVES).facing, -1);
  assert.deepEqual(bo(TURNS, { progress: 0.5 }).at, [480, 880], "it turns where it stands");
  // As written it has no scale; mirrored, its parts are the same, flipped around the point between its feet.
  assert.match(boSvg(TURNS), /<g transform="translate\(480 880\)"><rect/);
  assert.match(boSvg(WAVES_ON), /<g transform="translate\(480 880\) scale\(-1 1\)"><rect/);
  assert.match(boSvg(TURNS, { progress: 0.25 }), /<g transform="translate\(480 880\) scale\(0\.7071 1\)">/);
});

test("a scene's faces begin it mirrored, and a character it does not name is as written", () => {
  assert.equal(bo(AGAIN).facing, -1);
  assert.equal(stagingAt(scenario, { ...still, beat: 2 }).characters[1]!.facing, 1);
});

test("a jump is whole hops in place: up in the middle of each, down between them and at the end", () => {
  const height = (progress: number) => 880 - bo(JUMPS, { progress }).at[1];
  near(height(0), 0);
  near(height(0.125), 90, "a quarter through the first hop");
  near(height(0.25), 120, "the top of the first hop");
  near(height(0.5), 0, "between the hops");
  near(height(0.75), 120, "the top of the second");
  near(height(1), 0);
  assert.equal(bo(JUMPS, { progress: 0.25 }).at[0], 480);
  assert.deepEqual(bo(RESTS).at, [480, 880]);
});

test("a pose turns the arm around the shoulder: down to stand, forward to point, up and swinging to wave", () => {
  assert.equal(bo(TURNS).arm, 0);
  // The wave swings 20 degrees each way around 155, twice a second: at 1/8 s one way, at 3/8 s the other.
  near(bo(WAVES_ON, { time: 0.5 }).arm, -155, "mid-swing");
  near(bo(WAVES_ON, { time: 0.125 }).arm, -135);
  near(bo(WAVES_ON, { time: 0.375 }).arm, -175);
  near(bo(POINTS, { time: 1, into: 1 }).arm, -90);
  near(bo(JUMPS, { time: 0.125, into: 1 }).arm, -90, "a pose stays through the beats after, and a point does not swing");
  near(bo(RESTS, { time: 1, into: 1 }).arm, 0);
  near(bo(AGAIN, { time: 0.125 }).arm, 0, "a new scene begins standing");

  const arm = '<rect x="30" y="-160" width="20" height="100" fill="#d9861f"/>';
  assert.ok(boSvg(TURNS).includes(`fill="#f2a33a"/>${arm}<ellipse`), "standing, the arm is as written");
  assert.ok(boSvg(POINTS, { time: 1, into: 1 }).includes(`<g transform="rotate(-90 40 -150)">${arm}</g>`));
  assert.ok(boSvg(WAVES_ON, { time: 0.125 }).includes(`<g transform="rotate(-135 40 -150)">${arm}</g>`));
  // Only the arm turns: without it, the picture is the standing one's (Bo mirrored, as the turn left it).
  const rest = (svg: string) => svg.replace(/(<g transform="rotate[^>]*>)?<rect[^>]*fill="#d9861f"\/>(<\/g>)?/, "");
  assert.equal(rest(boSvg(WAVES_ON, { time: 0.125 })), rest(boSvg(TURNS, { progress: 1 })));
});

test("in the beat that changes a pose the arm takes 0.3 s to get there, from where the pose before had it", () => {
  near(bo(WAVES, { time: 0.5, into: 0 }).arm, 0, "from standing");
  near(bo(WAVES, { time: 0.5, into: 0.15 }).arm, -77.5, "halfway up");
  near(bo(WAVES, { time: 0.5, into: 0.3 }).arm, -155);
  near(bo(WAVES, { time: 0.125, into: 2 }).arm, -135, "then it swings");
  // The swing comes in with the reach: halfway up, half of it.
  near(bo(WAVES, { time: 0.125, into: 0.15 }).arm, -67.5);
  // Leaving the wave, the arm starts where the swing has it.
  near(bo(POINTS, { time: 0.125, into: 0 }).arm, -135);
  near(bo(POINTS, { time: 0.125, into: 0.15 }).arm, -112.5);
  near(bo(POINTS, { time: 0.125, into: 0.3 }).arm, -90);
});

test("a beat's background shows from that beat on in its scene, and everyone stays where they are", () => {
  const fill = (beat: number) => stagingAt(acting, { ...still, beat }).background.fill;
  assert.deepEqual([TURNS, WAVES_ON, POINTS, JUMPS, RESTS, AGAIN].map(fill), ["#bfe3ff", "#bfe3ff", "#101030", "#101030", "#101030", "#bfe3ff"]);
  assert.deepEqual(bo(POINTS).at, bo(WAVES_ON).at);
  assert.ok(boSvg(POINTS).includes('<rect width="1920" height="1080" fill="#101030"/>'));
});

/** How open the eyes of character `who` are in each frame of `seconds`, at 30 frames a second. */
const eyes = (seconds: number, who = 0, of = acting, beat = WAVES_ON) =>
  Array.from({ length: seconds * 30 }, (_, frame) => stagingAt(of, { ...still, beat, time: frame / 30 }).characters[who]!.eyes);
/** The frames where a blink begins. */
const blinks = (open: number[]) => open.flatMap((value, frame) => (value < 1 && (open[frame - 1] ?? 1) === 1 ? [frame] : []));

test("eyes blink once in every 3.2 s, shut for a frame or two, the same in every run", () => {
  const open = eyes(32);
  const begins = blinks(open);
  assert.equal(begins.length, 10);
  begins.forEach((frame, k) => {
    const [from, to] = [k * 3.2 + 0.64, k * 3.2 + 2.56 + 1 / 30];
    assert.ok(frame / 30 >= from && frame / 30 <= to, `blink ${k} begins at ${frame / 30} s`);
    const blink = open.slice(frame, frame + 7).filter((value) => value < 1);
    assert.ok(blink.length >= 5 && blink.length <= 6, `blink ${k} takes ${blink.length} frames`);
    near(Math.min(...blink), 0.1, `blink ${k}, at its most shut`);
  });
  const gaps = begins.slice(1).map((frame, k) => frame - begins[k]!);
  assert.ok(new Set(gaps).size > 3, "not a metronome: the gaps differ");
  assert.deepEqual(eyes(32), open);
});

test("each character blinks at its own times", () => {
  // The first scenario's night scene has Pip and Mo. Neither has eyes drawn; the staging still says when.
  assert.notDeepEqual(blinks(eyes(32, 0, scenario, 2)), blinks(eyes(32, 1, scenario, 2)));
});

test("a blink closes the eyes towards the middle line of the whole part, and a character with no eyes part stays", () => {
  // Bo's eyes: a white 40 tall around -160, and a pupil 20 tall around -156; the part's middle is -160.
  const open = eyes(4);
  const shut = open.indexOf(Math.min(...open)) / 30;
  assert.ok(boSvg(WAVES_ON, { time: shut }).includes('<ellipse cx="0" cy="-160" rx="20" ry="2" fill="#ffffff"/><ellipse cx="6" cy="-159.6" rx="5" ry="1" fill="#2b2d42"/>'));
  assert.ok(boSvg(WAVES_ON).includes('<ellipse cx="0" cy="-160" rx="20" ry="20" fill="#ffffff"/><ellipse cx="6" cy="-156" rx="5" ry="10" fill="#2b2d42"/>'));
  // Pip and Mo have no eyes part: their picture in a blink is the one outside it.
  const blinking = (blinks(eyes(4, 0, scenario, 2))[0]! + 2) / 30;
  assert.ok(stagingAt(scenario, { ...still, beat: 2, time: blinking }).characters[0]!.eyes < 1);
  const size = { width: 960, height: 540 };
  assert.equal(frameSvg(scenario, { ...still, beat: 2, time: blinking }, size), frameSvg(scenario, { ...still, beat: 2 }, size));
});
