import assert from "node:assert/strict";
import { test } from "node:test";
import { checkScenario as checkScript, compile, pictureOf, readScript, shownAt, type CompiledPicture, type Shown } from "ai-videos/plugin";
import { drawScript, frameSvg, scriptStaging, stagingAt, type Actor, type Staging } from "./picture.ts";
import plugin from "./plugin.ts";
import { checkScenario, readLibrary } from "./scenario.ts";

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
  assert.deepEqual([0.49, 0.51].map((progress) => bo(TURNS, { progress }).facing), [0.04, -0.04], "before it one way, after it the other");
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
  near(bo(WAVES, { time: 0.5, into: 0.075 }).arm, -155 * (0.5 - 0.5 * Math.cos(Math.PI / 4)), "a quarter of the time: slow at both ends");
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

// A script's pictures: what its actions show at once, each on its own channel. Three of one drawing, with an arm.
const puppet = { shoulder: [40, -150], parts: { body: [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#f2a33a" }], arm: [{ shape: "rect", at: [40, -110], size: [20, 100], fill: "#d9861f" }] } };
const puppets = { file: "library", raw: { characters: { bo: puppet, pip: puppet, mo: puppet }, backgrounds: { day: { fill: "#bfe3ff" }, dusk: { fill: "#f7a072" }, night: { fill: "#101030" } } } };

/**
 * What a video's pictures are drawn from, at 30 a second, its scenes' rows laid as the tool lays them. Each
 * scene begins by day, Bo at the left, Pip at 700 and Mo at 900; its lines last these seconds.
 */
async function pictureIn(scenes: string[][], ...voices: number[]): Promise<CompiledPicture> {
  const read = scenes.map((rows, n) => readScript(rows.join("\n"), 100 * n + 1));
  const script = { scenes: read.map(({ items }, n) => ({ line: 100 * n + 99, setting: { background: "day", places: { bo: "left", pip: 700, mo: 900 } }, items })), issues: read.flatMap(({ issues }) => issues) };
  const checked = await checkScript(plugin.script, script, puppets, ["bo", "pip", "mo"], { lead: 0.6, gap: 0.4, tail: 1 });
  assert.ok("scenes" in checked, JSON.stringify(checked));
  const voiced = voices.map((duration, n) => ({ file: `${n}.wav`, duration, mouth: [] }));
  return pictureOf(compile(checked.scenes, voiced, { fps: 30, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "x.yaml"));
}
/** What each frame of it shows. */
const framesOf = (picture: CompiledPicture): Shown[] => Array.from({ length: picture.frames }, (_, frame) => shownAt(picture, frame));
const shownIn = async (scenes: string[][], ...voices: number[]): Promise<Shown[]> => framesOf(await pictureIn(scenes, ...voices));
/** Such scenes' frames as they are staged. */
const stagings = async (scenes: string[][], ...voices: number[]): Promise<Staging[]> => (await shownIn(scenes, ...voices)).map((shown) => scriptStaging(readLibrary(puppets), shown));
/** Everyone of one such scene in each of its frames, by name. */
const staged = async (rows: string[], ...voices: number[]): Promise<Record<string, Actor>[]> => (await stagings([rows], ...voices)).map(({ characters }) => Object.fromEntries(characters.map((one) => [one.name, one])));
/** The frames in which something of somebody moves: the first from which it is another in the next, and the one it is there in. */
const moves = (frames: Record<string, Actor>[], who: string, of: (actor: Actor) => number): [number, number] => {
  const values = frames.map((one) => of(one[who]!));
  return [values.findIndex((value, k) => k + 1 < values.length && values[k + 1] !== value), values.findLastIndex((value, k) => k > 0 && values[k - 1] !== value)];
};
const X = ({ at }: Actor) => at[0];
const HIGH = ({ at }: Actor) => 880 - at[1];
const FACING = ({ facing }: Actor) => facing;

const AT_ONCE = ["together:", "  bo walk to=right", "  pip jump times=2", "  mo turn @ block.start + 1s", "  narrator say: Bo walks, and Pip hops."];

test("in a script, one walks from a block's start while another hops and a third turns a second later", async () => {
  const frames = await staged(AT_ONCE, 3);
  // The block begins after the lead, 18 frames. 960 px at 320 a second are 90 frames, as the words are.
  assert.deepEqual(moves(frames, "bo", X), [18, 108]);
  assert.deepEqual(moves(frames, "pip", HIGH), [18, 54], "two hops of 0.6 s");
  assert.deepEqual(moves(frames, "mo", FACING), [48, 63], "half a second, a second later");
  near(X(frames[63]!.bo!), 960, "half-way, Bo");
  near(HIGH(frames[18 + 9]!.pip!), 120, "the top of the first hop");
  near(HIGH(frames[18 + 27]!.pip!), 120, "the top of the second");
  assert.equal(HIGH(frames[54]!.pip!), 0);
  assert.deepEqual([47, 48, 63, 100].map((frame) => frames[frame]!.mo!.facing), [1, 1, -1, -1]);
  near(frames[53]!.mo!.facing, 0.5, "a third through, Mo");
  // Nobody does what another does, and nobody does anything else.
  for (const one of frames) {
    assert.deepEqual([X(one.pip!), X(one.mo!), HIGH(one.mo!), one.bo!.facing, one.pip!.facing], [700, 900, 0, 1, 1]);
    assert.deepEqual([one.bo!.arm, one.pip!.arm, one.mo!.arm], [0, 0, 0]);
  }
});

test("in a script, one walks while it waves, each action with its own start and length, and the wave goes on", async () => {
  const frames = await staged(["together:", "  bo walk to=right", "  bo wave @ block.start + 0.5s", "  narrator say: Bo has seen somebody.", "bo stand"], 3);
  assert.deepEqual(moves(frames, "bo", X), [18, 108]);
  const arm = (frame: number) => frames[frame]!.bo!.arm;
  for (let frame = 0; frame <= 33; frame++) assert.equal(arm(frame), 0, `it hangs in frame ${frame}`);
  assert.ok(arm(36) < 0 && arm(36) > -60, "on its way up");
  // Up 0.3 s after it began, and swinging 20 degrees each way around 155, twice a second by the video's time, on the way and after it.
  const swung = (frame: number) => -155 + 20 * Math.sin(2 * Math.PI * 2 * (frame / 30));
  for (let frame = 42; frame <= 120; frame++) near(arm(frame), swung(frame), `the arm in frame ${frame}`);
  // The next line is after both: 12 frames after the walk, in 9 the arm hangs again.
  for (let frame = 129; frame < frames.length; frame++) near(arm(frame), 0, `the arm in frame ${frame}`);
  assert.equal(frames.length, 129 + 30);

  // A hop and a turn on the way: the walk goes on as it does without them, and the hop's height is over the steps'.
  const rows = (...more: string[]) => ["together:", "  bo walk to=right", ...more, "  narrator say: Bo is glad."];
  const [walking, acting] = [await staged(rows(), 3), await staged(rows("  bo jump", "  bo turn @ block.start + 1s"), 3)];
  assert.deepEqual(acting.map((one) => X(one.bo!)), walking.map((one) => X(one.bo!)));
  for (let frame = 0; frame < acting.length; frame++) {
    const through = Math.min(1, Math.max(0, frame - 18) / 18);
    near(HIGH(acting[frame]!.bo!) - HIGH(walking[frame]!.bo!), 120 * 4 * through * (1 - through), `the hop in frame ${frame}`);
  }
  assert.deepEqual(moves(acting, "bo", FACING), [48, 63]);
});

test("in a block stretched by its lines, the actions keep their order: who begins, and who is done, before whom", async () => {
  const rows = ["together:", "  bo walk to=right", "  bo wave", "  pip jump times=2", "  mo turn @ block.start + 1s", "  in order:", "    narrator say: Bo walks and waves.", "    narrator say: And Pip hops.", "bo stand"];
  const timed = async (...voices: number[]) => {
    const frames = await staged(rows, ...voices);
    const arm = frames.map((one) => one.bo!.arm);
    const up = arm.findIndex((angle) => angle !== 0) - 1;
    return { walk: moves(frames, "bo", X), jump: moves(frames, "pip", HIGH), turn: moves(frames, "mo", FACING), up };
  };
  // The lines take 2.4 s, 3.4 s, and 6.4 s with the pause between: the walk, 3 s of its own, is hurried to them, or slowed, and no more than to twice its time.
  assert.deepEqual(await timed(1, 1), { walk: [18, 90], jump: [18, 54], turn: [48, 63], up: 18 });
  assert.deepEqual(await timed(2, 1), { walk: [18, 120], jump: [18, 54], turn: [48, 63], up: 18 });
  assert.deepEqual(await timed(4, 2), { walk: [18, 198], jump: [18, 54], turn: [48, 63], up: 18 });
  // Beside no words at all, each at its own pace.
  const alone = await staged(rows.filter((row) => !row.includes("narrator") && !row.includes("in order")));
  assert.deepEqual([moves(alone, "bo", X), moves(alone, "pip", HIGH), moves(alone, "mo", FACING)], [[18, 108], [18, 54], [48, 63]]);
});

/** The backgrounds of frames, each from the frame it is there in first, by its fill. */
const backdrops = (frames: Staging[]) => frames.flatMap(({ background: { fill } }, frame) => (fill === frames[frame - 1]?.background.fill ? [] : [[frame, fill]]));
const [DAY, DUSK, NIGHT] = Object.values(puppets.raw.backgrounds).map(({ fill }) => fill);

test("in a script, the background changes as its row begins, and stays so until a row changes it again: everyone stays where they are", async () => {
  const rows = ["bo walk to=right", "pip turn", "mo wave", "scene background to=night", "narrator say: Now it is night.", "narrator say: And it stays so.", "scene background to=dusk", "narrator say: Then it is dusk."];
  const frames = await stagings([rows, ["narrator say: The next day."]], 2, 4, 1, 1);
  // After the lead, 18 frames, the walk's 90, the turn's 15 and the wave's 9, each with the pause of 12 after it: 168. The change
  // is there from its first frame on, and is a frame long: the words begin a pause after it, in 181, and are over in 241 and 373.
  assert.deepEqual(backdrops(frames), [[0, DAY], [168, NIGHT], [385, DUSK], [458, DAY]]);
  assert.deepEqual([167, 168, 384].map((frame) => frames[frame]!.background.fill), [DAY, NIGHT, NIGHT], "the frame before it, its first, and one long after");
  // Everyone is where the rows above left them, before it, in it and long after, and the wave goes on.
  const where = (frame: number) => frames[frame]!.characters.map(({ name, at, facing }) => [name, ...at, facing]);
  for (const frame of [167, 168, 384, 385]) assert.deepEqual(where(frame), [["bo", 1440, 880, 1], ["pip", 700, 880, -1], ["mo", 900, 880, 1]], `frame ${frame}`);
  for (let frame = 156; frame < 458; frame++) near(frames[frame]!.characters[2]!.arm, -155 + 20 * Math.sin(2 * Math.PI * 2 * (frame / 30)), `Mo's arm in frame ${frame}`);
  // The next scene begins with its own, and everyone placed anew.
  assert.deepEqual(where(458), [["bo", 480, 880, 1], ["pip", 700, 880, 1], ["mo", 900, 880, 1]]);
});

test("in a script, a walk goes on through a change of background, as it does without one", async () => {
  const rows = ["together:", "  bo walk to=right", "  bo wave", "  narrator say: Bo walks on, and the night falls."];
  const changed = [...rows, "  scene background to=night @ block.start + 1s"];
  const [without, frames] = [await stagings([rows], 3), await stagings([changed], 3)];
  // The block begins in frame 18, the walk lasts to 108, and the change is a second in.
  assert.deepEqual(backdrops(frames), [[0, DAY], [48, NIGHT]]);
  assert.deepEqual(frames.map(({ characters }) => characters), without.map(({ characters }) => characters));
  const bo = (frame: number) => frames[frame]!.characters[0]!.at[0];
  assert.ok(bo(47) < bo(48) && bo(48) < bo(49) && bo(107) < 1440 && bo(108) === 1440, "it is under way, and arrives");
  // Drawn, the stage is filled with the other background from that frame on, and the rest of each frame is as it is without it.
  const pictures = async (of: string[]) => (await shownIn([of], 3)).map((shown) => drawScript(puppets)(shown, { width: 960, height: 540 }));
  const fill = (colour: string) => `<rect width="1920" height="1080" fill="${colour}"/>`;
  const day = await pictures(rows);
  assert.ok(day.every((svg) => svg.includes(fill(DAY!))));
  assert.deepEqual(await pictures(changed), day.map((svg, frame) => (frame < 48 ? svg : svg.replace(fill(DAY!), fill(NIGHT!)))));
  // With the words alone beside it, the walk is fitted to them as it was: a change is no voice, and no longer than a frame.
  const joined = await stagings([["scene background to=night", "& bo walk to=right", "& narrator say: Bo walks by night."]], 2);
  assert.deepEqual(backdrops(joined), [[0, DAY], [18, NIGHT]]);
  assert.deepEqual([17, 18, 19, 77, 78].map((frame) => joined[frame]!.characters[0]!.at[0]).map((x) => x === 480 || x === 1440), [true, true, false, false, true], "60 frames of words, from 18");
});

test("in a script, a change of background is anchored to a word, and given its time it is a look before the next row", async () => {
  const rows = ["[d] narrator say: They play all day, until the sun goes down.", "scene background to=dusk @ d.word(sun)", "scene background to=night @ d.word(down)", "narrator say: Good night."];
  // "They play all day, until the " is 32 of the 45 its letters and marks weigh, and "sun goes " 9 more: of the line's 90 frames, from 18.
  assert.deepEqual(backdrops(await stagings([rows], 3, 1)), [[0, DAY], [18 + Math.round((32 / 45) * 90), DUSK], [18 + Math.round((41 / 45) * 90), NIGHT]]);
  // Another voice, another frame: the words set it.
  assert.deepEqual(backdrops(await stagings([rows], 1.5, 1)), [[0, DAY], [18 + Math.round((32 / 45) * 45), DUSK], [18 + Math.round((41 / 45) * 45), NIGHT]]);
  // At once, the next row comes a frame and a pause later; given 2 seconds, after those, the change on the first frame of them.
  const next = async (row: string) => {
    const frames = await stagings([[row, "bo walk to=right"]]);
    return [backdrops(frames)[1]![0], frames.findIndex(({ characters }) => characters[0]!.at[0] > 480) - 1];
  };
  assert.deepEqual(await next("scene background to=night"), [18, 18 + 1 + 12]);
  assert.deepEqual(await next("scene background to=night takes=2s"), [18, 18 + 60 + 12]);
  assert.deepEqual(await next("scene background to=night speed=slow"), [18, 18 + 1 + 12], "at once has no speed");
  // In a block whose lines end together it ends with them: in the last frame of the walk.
  assert.deepEqual(backdrops(await stagings([["ending together:", "  bo walk to=right", "  scene background to=night"]])), [[0, DAY], [18 + 90 - 1, NIGHT]]);
});

/** How far round one faces who looks at one `dx` px to its right, as wide as it is seen: these two may stand 70 px apart, and pass within that. */
const towards = (dx: number) => Math.max(-1, Math.min(1, Math.sin((Math.PI / 2) * Math.max(-1, Math.min(1, dx / 70)))));
/** The facings of somebody in these frames. */
const facings = (frames: Record<string, Actor>[], who: string, from: number, to: number) => frames.slice(from, to).map((one) => one[who]!.facing);
/** An angle round, from a facing. */
const round = (facing: number) => Math.acos(Math.max(-1, Math.min(1, facing)));

test("in a script, one faces another all through its walk past it, and stays facing where it went: the same in the page's frames", async () => {
  // Bo walks from 480 to 1440, past Pip at 700 and Mo at 900, in 90 frames from 18; then it walks back.
  const rows = ["bo walk to=right", "& pip look-at target=bo", "& mo look-at target=bo", "& narrator say: Bo goes by.", "bo turn", "bo walk to=left"];
  const frames = await staged(rows, 3);
  assert.deepEqual(moves(frames, "bo", X)[0], 18);
  for (const who of ["pip", "mo"] as const) {
    const past = (frame: number) => X(frames[frame]!.bo!) - X(frames[frame]![who]!);
    // As drawn until the look; then it turns to Bo, who is on its left, as a turn goes.
    assert.deepEqual(new Set(facings(frames, who, 0, 19)), new Set([1]), who);
    for (let frame = 18; frame <= 33; frame++) near(frames[frame]![who]!.facing, Math.cos((Math.PI * (frame - 18)) / 15), `${who} in frame ${frame}`);
    // From there on it faces Bo in every frame: wholly, but while Bo passes it, edge-on as Bo is in front.
    const widths: number[] = [];
    for (let frame = 33; frame <= 108; frame++) {
      const { facing } = frames[frame]![who]!;
      assert.ok(past(frame) === 0 || Math.sign(facing) === Math.sign(past(frame)), `${who} faces ${facing} in frame ${frame}, and Bo is ${past(frame)} px past it`);
      const seen = towards(past(frame));
      near(facing, Math.abs(seen) < 0.04 ? Math.sign(seen) * 0.04 : seen, `${who} in frame ${frame}`);
      widths.push(facing);
    }
    assert.ok(widths.every((facing, k) => k === 0 || facing >= widths[k - 1]!), "it turns one way, and once");
    assert.ok(widths.filter((facing) => Math.abs(facing) < 1).length > 5, "and not at a stroke");
    // The look is over with the walk, and it stays so as Bo goes back past it.
    assert.ok(past(frames.length - 1) < 0);
    assert.deepEqual(new Set(facings(frames, who, 108, frames.length)), new Set([1]), who);
  }
  // Bo itself looks at nobody, and nobody else moves.
  assert.deepEqual(new Set(facings(frames, "bo", 0, 109)), new Set([1]));
  assert.ok(frames.every(({ pip, mo }) => X(pip!) === 700 && X(mo!) === 900 && pip!.arm === 0 && HIGH(mo!) === 0));

  // The page has the picture as text, and draws a frame by itself, any of them first.
  const picture = await pictureIn([rows], 3);
  const page = JSON.parse(JSON.stringify(picture)) as CompiledPicture;
  const size = { width: 960, height: 540 };
  const video = framesOf(picture).map((shown) => drawScript(puppets)(shown, size));
  for (let frame = picture.frames - 1; frame >= 0; frame--) assert.equal(drawScript(puppets)(shownAt(page, frame), size), video[frame], `frame ${frame}`);
  assert.ok(new Set(video).size > 150);
});

test("in a script, a look that ends as another is still on its way leaves its character facing the side that one was on, and a turn goes the other way from there", async () => {
  // Mo, at 900, looks at Bo as long as it speaks; Bo is level with it in 41.4 frames of its 90, from 18.
  const rows = ["together:", "  bo walk to=right takes=3s", "  in order:", "    mo say: There goes Bo.", "    & mo look-at target=bo", "mo turn"];
  const ended = async (seconds: number) => {
    const frames = await staged(rows, seconds);
    const end = 18 + Math.ceil(seconds * 30 - 1e-6);
    const facing = facings(frames, "mo", 0, frames.length);
    // It never jumps: from frame to frame it goes no further round than as Bo passes it fastest.
    for (let frame = 1; frame < facing.length; frame++) assert.ok(Math.abs(round(facing[frame]!) - round(facing[frame - 1]!)) < 0.45, `frame ${frame}, of ${seconds} s: ${facing[frame - 1]} to ${facing[frame]}`);
    return { facing, end, past: X(frames[end]!.bo!) - 900, turned: frames.length - 30 - 15 };
  };
  // Over before Bo comes by, or after: it stays, and Bo goes by it.
  for (const [seconds, side] of [[1, -1], [2, 1]] as const) {
    const { facing, end, turned } = await ended(seconds);
    assert.deepEqual(new Set(facing.slice(end, turned + 1)), new Set([side]), `${seconds} s`);
    for (let frame = turned; frame <= turned + 15; frame++) near(facing[frame]!, side * Math.max(-1, Math.cos((Math.PI * (frame - turned)) / 15)), `the turn in frame ${frame}`);
    assert.deepEqual(facing.at(-1), -side);
  }
  // Over as Bo is in front of it: it turns on, to the side where Bo is, in a turn's time at most.
  for (const [seconds, side] of [[1.3, -1], [1.4, 1]] as const) {
    const { facing, end, past } = await ended(seconds);
    assert.equal(Math.sign(past), side);
    assert.ok(Math.abs(facing[end]!) < 0.95 && Math.abs(past) < 70, `${facing[end]}`);
    near(facing[end]!, towards(past), "as the look ends");
    for (let frame = end; frame <= end + 15; frame++) near(round(facing[frame]!), round(facing[end]!) + (round(side) - round(facing[end]!)) * ((frame - end) / 15), `frame ${frame}`);
    assert.equal(facing[end + 15], side);
  }
  // Shorter than a turn: it turns on to Bo all the same.
  const { facing, end } = await ended(0.2);
  assert.equal(end, 24);
  near(facing[end]!, Math.cos((Math.PI * 6) / 15), "six frames of the turn");
  for (let frame = end; frame <= end + 15; frame++) near(round(facing[frame]!), (Math.PI * 6) / 15 + (Math.PI * 9 * (frame - end)) / 15 / 15, `frame ${frame}`);
  assert.equal(facing[end + 15], -1);

  // What either of them does when it is over changes nothing: the one looked at walks past, long after, and so does the one that looked.
  const after = async (row: string) => {
    const frames = await staged(["narrator say: One.", "& mo look-at target=bo", "narrator say: Two.", row], 1, 3);
    assert.ok(X(frames.at(-1)!.bo!) > X(frames.at(-1)!.mo!), row);
    assert.deepEqual(new Set(facings(frames, "mo", 33, frames.length)), new Set([-1]), row);
  };
  await after("bo walk to=right");
  await after("mo walk to=200");
});

test("in a script, one who looks is never seen narrower than a turning one: edge-on as the other is in front of it, or a pixel to either side", async () => {
  // Bo is half-way in frame 63: 480 and as far again as Mo, at 900, is, or a pixel less or more.
  const front = async (to: number) => {
    const { bo, mo } = (await staged([`bo walk to=${to} takes=3s`, "& mo look-at target=bo"]))[63]!;
    return [Math.round(X(bo!) * 100) / 100, mo!.facing];
  };
  assert.deepEqual(await front(1318), [899, -0.04]);
  assert.deepEqual(await front(1322), [901, 0.04]);
  const [x, facing] = await front(1320);
  assert.deepEqual([x, Math.abs(facing!)], [900, 0.04]);
});

test("in a script, two look at each other, one who walks looks at one who stands, and a look is wherever the other has got to by then", async () => {
  // Each works out the other's place, and neither its facing: nothing goes round.
  const frames = await staged(["bo walk to=right", "& bo look-at target=mo", "& mo look-at target=bo", "& narrator say: They look."], 3);
  for (let frame = 33; frame < frames.length; frame++) {
    const { bo, mo } = frames[frame]!;
    const past = frame <= 108 ? X(bo!) - X(mo!) : 540;
    const seen = (facing: number) => (Math.abs(facing) < 0.04 ? Math.sign(facing) * 0.04 : facing);
    near(mo!.facing, seen(towards(past)), `Mo in frame ${frame}`);
    near(bo!.facing, seen(towards(-past)), `Bo in frame ${frame}`);
  }
  // A walk is as it is without them, and so is an arm, a hop and where everyone stands.
  const without = await staged(["bo walk to=right", "& narrator say: They look."], 3);
  assert.deepEqual(frames.map(({ bo, mo }) => [bo!.at, bo!.arm, mo!.at]), without.map(({ bo, mo }) => [bo!.at, bo!.arm, mo!.at]));
  // Two looks one after another: from the one's side to the other's. Bo is at 480 and Mo at 900, and Pip between them.
  const both = await staged(["narrator say: One.", "& pip look-at target=bo", "narrator say: Two.", "& pip look-at target=mo"], 1, 1);
  assert.deepEqual([18, 33, 48, 60, 75, both.length - 1].map((frame) => both[frame]!.pip!.facing), [1, -1, -1, -1, 1, 1]);
  near(both[65]!.pip!.facing, Math.cos(Math.PI - Math.PI / 3), "five frames of fifteen");
  // At the nearest that two may stand, 70 px from middle to middle, one faces the other wholly; a hop by either turns nobody.
  const close = await staged(["bo walk to=left-of(pip, -0.3)", "pip look-at target=bo", "bo jump", "pip jump", "narrator say: Near."], 1);
  const last = close.at(-1)!;
  assert.deepEqual([X(last.pip!) - X(last.bo!), last.pip!.facing], [70, -1]);
  // Until a look begins, its character faces as it did, and one set in its scene too; a new scene begins anew.
  const [one, two] = [["narrator say: One.", "& mo look-at target=bo"], ["narrator say: Two."]];
  const scenes = (await stagings([one, two], 1, 1)).map(({ characters }) => characters.find(({ name }) => name === "mo")!.facing);
  assert.deepEqual([scenes[18], scenes[33], scenes[77], scenes[78], scenes.at(-1)], [1, -1, -1, 1, 1]);
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
