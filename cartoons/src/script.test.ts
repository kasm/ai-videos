// A cartoon written as a script (script.ts), read, checked, compiled and drawn as the video tool does
// it: hello-script on its frames, in plain numbers, and each frame's picture from those and the
// library alone; what the check refuses, each with its line and a hint; and the guide's example. The
// voices are given here as lengths: speaking is the tool's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NARRATOR, SAY, checkScenario, compile, isBlock, linesIn, pictureOf, plainValues, readScript, shownAt, type Compiled, type Issue, type ScriptItem, type Voiced, type WrittenScript, type WrittenValue } from "ai-videos/plugin";
import { parse } from "yaml";
import { scriptStaging } from "./picture.ts";
import plugin from "./plugin.ts";
import { MARKS, PACE, readLibrary } from "./scenario.ts";
import type { Did, Setting, Walk } from "./script.ts";

const root = path.join(import.meta.dirname, "..");
/** The project's library as the tool gives it to the plugin, without each character's voice and its sounds; who has a voice; each sound's file, and how loud it is, dB. */
const { library, speakers, sounds, volumes } = (() => {
  const file = path.join(root, "library.yaml");
  const { sounds, ...raw } = parse(readFileSync(file, "utf8")) as { sounds: Record<string, { file: string; volume?: string }>; [key: string]: any };
  for (const character of Object.values(raw.characters)) delete (character as { voice?: string }).voice;
  const files = Object.fromEntries(Object.entries(sounds).map(([name, sound]) => [name, sound.file]));
  const volumes = Object.fromEntries(Object.entries(sounds).flatMap(([name, { volume }]) => (volume === undefined ? [] : [[name, Number.parseFloat(volume)]])));
  return { library: { file, raw }, speakers: Object.keys(raw.characters), sounds: files, volumes };
})();
/** How long each of its sounds lasts, seconds, by its file: measuring is the tool's. */
const LENGTHS: Record<string, number> = { "sounds/tune.flac": 8, "sounds/jingle.flac": 1.4, "sounds/rustle.flac": 1 };

/**
 * A cartoon's file as the tool reads a script: its values, each scene's own keys and values, and its
 * script's lines and blocks, each with its line in the file.
 */
function written(text: string): WrittenScript {
  const rows = text.split(/\r?\n/);
  let next = 0;
  const issues: Issue[] = [];
  const valuesOf = (values: unknown, from: number): Record<string, WrittenValue> => {
    const line = rows.findIndex((row, i) => i >= from && /^\s*(- )?values: \{/.test(row)) + 1;
    return Object.fromEntries(Object.entries(values ?? {}).map(([name, value]) => [name, { line, text: String(value) }]));
  };
  const file = parse(text) as { values?: unknown; script?: string; scenes: Record<string, unknown>[] };
  /** The cartoon's own script, whose lines begin on the row after its `|`. */
  const overOf = () => {
    if (file.script === undefined) return {};
    const line = rows.findIndex((row) => /^script: \|/.test(row)) + 1;
    const read = readScript(file.script, line + 1);
    issues.push(...read.issues);
    return { over: { line, items: read.items } };
  };
  const over = overOf();
  const scenes = file.scenes.map(({ script, values, ...setting }) => {
    // The scene's `- ` row, then its script's `|` row: the lines begin on the row after it.
    const begins = rows.findIndex((row, i) => i >= next && /^\s*- /.test(row));
    const header = rows.findIndex((row, i) => i >= begins && /^\s+(- )?script: \|/.test(row));
    next = header + 1;
    const read = readScript(String(script), header + 2);
    issues.push(...read.issues);
    return { line: begins + 1, setting, values: valuesOf(values, begins), items: read.items };
  });
  return { values: valuesOf(file.values, 0), ...over, scenes, issues };
}
/** Checked as the tool does it: who speaks has a voice in the library, or in the file's cast. */
const check = (text: string) => checkScenario(plugin.script, written(text), library, [...speakers, ...Object.keys(parse(text).cast ?? {})], TIMING, volumes, sounds);
/** The mistakes the check finds in a scene of the meadow with Pip and Mo, and these lines. */
const SCENE = ["scenes:", "  - background: meadow", "    places: { pip: off-left, mo: right }", "    faces: { mo: left }", "    script: |"];
const issuesOf = async (lines: string[], scene = SCENE) => {
  const checked = await check([...scene, ...lines.map((line) => `      ${line}`), ""].join("\n"));
  assert.ok("issues" in checked, "it is refused");
  return checked.issues;
};

/** The tool's timing and loudness, and cartoons' 30 frames a second. */
const TIMING = { lead: 0.6, gap: 0.4, tail: 1 };
const SETTINGS = { fps: 30, loudness: -14, moves: { slowest: 0.5, fastest: 2 } };
const HELLO = readFileSync(path.join(root, "videos", "hello-script.yaml"), "utf8");
const AT_ONCE = readFileSync(path.join(root, "videos", "all-at-once.yaml"), "utf8");

/** A voice `duration` seconds long: its mouth opens wide, half and not at all, over and over. */
const voiced = (file: string, duration: number): Voiced => ({ file, duration, mouth: Array.from({ length: Math.ceil(duration * 30 - 1e-6) }, (_, k) => [1, 0.5, 0][k % 3]!) });
/** hello-script's two lines, spoken. */
const VOICES = [voiced("1f0e3dad99908345f743.wav", 2.2), voiced("b7a56873cd771f2c446d.wav", 1.22)];

test("hello-script compiles: the walk and the words joined to it, on hello's frames, and the next line after both", async () => {
  const checked = await check(HELLO);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  assert.deepEqual(compile(checked.scenes, VOICES, SETTINGS, "../../videos/hello-script.yaml"), {
    format: "ai-videos-compiled",
    version: 1,
    made: { by: "ai-videos compile", from: "../../videos/hello-script.yaml" },
    fps: 30,
    frames: 163,
    loudness: -14,
    scenes: [
      {
        from: 0,
        frames: 163,
        // Pip begins off the stage, on the ground, facing right as drawn.
        setting: { background: "meadow", characters: { pip: { at: [-250, 880], facing: 1 } } },
        lines: [
          // After the lead, 18 frames, both: 1210 px at 320 px a second are 113 frames, hurried to the words' 66.
          { line: 11, who: "pip", action: "walk", from: 18, frames: 66, values: { from: [-250, 880], to: [960, 880] } },
          // The next line a gap, 12 frames, after them. A caption is up until the next one, or the scene's end.
          {
            line: 12,
            who: "narrator",
            action: "say",
            from: 18,
            frames: 66,
            text: "This is Pip. Pip walks into the meadow.",
            volume: 0,
            file: "1f0e3dad99908345f743.wav",
            mouth: VOICES[0]!.mouth,
            captions: [{ text: "This is Pip. Pip walks into the meadow.", from: 18, frames: 78 }],
          },
          {
            line: 13,
            who: "narrator",
            action: "say",
            from: 96,
            frames: 37,
            text: "And here, Pip stops.",
            volume: 0,
            file: "b7a56873cd771f2c446d.wav",
            mouth: VOICES[1]!.mouth,
            captions: [{ text: "And here, Pip stops.", from: 96, frames: 67 }],
          },
        ],
      },
    ],
  });
});

/** Every value of a compiled scenario, with the keys that lead to it. */
function leaves(value: unknown, at: string[] = []): [string[], unknown][] {
  if (typeof value !== "object" || value === null) return [[at, value]];
  return Object.entries(value).flatMap(([key, inner]) => leaves(inner, [...at, key]));
}

test("a compiled scenario holds nothing but numbers, texts and file names, and the library's and the actions' names", async () => {
  const example = plugin.script.guide.match(/```yaml\n([\s\S]*?)```/)![1]!;
  for (const text of [HELLO, AT_ONCE, example]) {
    const script = written(text);
    const checked = await check(text);
    assert.ok("scenes" in checked);
    const rows = script.scenes.map((scene) => linesIn(scene.items));
    const said = rows.flat().filter((line) => line.action === SAY);
    const voices = said.map((_, n) => voiced(`${String(n).padStart(20, "0")}.wav`, 1 + n / 7));
    const compiled = compile(checked.scenes, voices, SETTINGS, "../../videos/a-cartoon.yaml", LENGTHS, checked.over);
    const cast = Object.keys(parse(text).cast ?? {});
    const names = new Set([NARRATOR, "scene", SAY, "play", "loop", ...Object.keys(sounds), ...cast, ...Object.keys(plugin.script.actions), ...Object.keys(library.raw.characters), ...Object.keys(library.raw.backgrounds)]);
    const texts = new Set(said.map((line) => line.text));
    const files = new Set(["../../videos/a-cartoon.yaml", ...voices.map((voice) => voice.file)]);
    for (const [at, value] of leaves(compiled)) {
      const where = at.join(".");
      if (typeof value === "number") assert.ok(Number.isFinite(value), where);
      else if (typeof value !== "string") assert.fail(`${where} is ${value}`);
      else if (where === "format" || where === "made.by") assert.match(value, /^ai-videos[ -]compiled?$/);
      // A caption's is a line's, or a piece of one.
      else if (at.at(-1) === "text") assert.ok([...texts].some((text) => text?.includes(value)), `${where}: ${value}`);
      else if (at.at(-1) === "file" || where === "made.from") assert.ok(files.has(value), `${where}: ${value}`);
      else if (at.at(-1) === "sound") assert.ok(Object.values(sounds).includes(value), `${where}: ${value}`);
      else assert.ok(names.has(value), `${where} is a name: ${value}`);
      // A mark is written in a script, and compiled to its point.
      assert.ok(!(String(value) in MARKS), `${where} is the mark ${value}`);
    }
    // So is any place: each character begins at a point, and each walk goes from one to one, in whole px.
    const point = ([x, y, ...more]: number[]) => Number.isInteger(x) && y === 880 && more.length === 0;
    for (const { setting, lines } of compiled.scenes) {
      for (const { at } of Object.values((setting as unknown as Setting).characters)) assert.ok(point(at), JSON.stringify(setting));
      for (const line of lines) if (line.action === "walk") assert.deepEqual(Object.entries((line as unknown as { values: Walk }).values).map(([key, at]) => [key, point(at)]), [["from", true], ["to", true]]);
    }
    // Every line of the script is there, in the order written, on frames of its scene.
    assert.deepEqual(
      compiled.scenes.map((scene) => scene.lines.map((line) => [line.line, line.who, line.action])),
      rows.map((lines) => lines.map((line) => [line.line, line.who, line.action])),
    );
    for (const scene of compiled.scenes) {
      for (const line of scene.lines) {
        assert.ok(Number.isInteger(line.from) && Number.isInteger(line.frames) && line.frames > 0, `line ${line.line}`);
        assert.ok(line.from >= scene.from && line.from + line.frames <= scene.from + scene.frames, `line ${line.line} is in its scene`);
      }
    }
  }
});

/** A script compiled, as the tool keeps it: read back from its JSON. */
async function compiledOf(text: string, voices: Voiced[]): Promise<Compiled> {
  const checked = await check(text);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  return JSON.parse(JSON.stringify(compile(checked.scenes, voices, SETTINGS, "x.yaml", LENGTHS, checked.over)));
}
const size = { width: 1920, height: 1080 };
/** Every frame's SVG, drawn as the tool does it: from the compiled scenario and the library, and nothing else. */
function pictures(compiled: Compiled): string[] {
  const picture = pictureOf(compiled);
  const draw = plugin.script.draw(library);
  return Array.from({ length: picture.frames }, (_, frame) => draw(shownAt(picture, frame), size));
}
/** Who stands where, and how, in a frame of a compiled scenario. */
const stagingOf = (compiled: Compiled, frame: number) => scriptStaging(readLibrary(library), shownAt(pictureOf(compiled), frame));

test("hello-script's frames: Pip off the stage, walking in from frame 18 to 84, and there to the end", async () => {
  const compiled = await compiledOf(HELLO, VOICES);
  const x = (frame: number) => stagingOf(compiled, frame).characters.map(({ name, at, facing, arm }) => [name, Math.round(at[0]), facing, arm]);
  assert.deepEqual(x(0), [["pip", -250, 1, 0]]);
  assert.deepEqual(x(18), [["pip", -250, 1, 0]]);
  // Slow at both ends: halfway there in the middle of its 66 frames, and nearly there in the last.
  assert.deepEqual(x(50)[0]![1], Math.round(-250 + 1210 * (0.5 - 0.5 * Math.cos((Math.PI * 32) / 66))));
  assert.ok((x(83)[0]![1] as number) > 955);
  for (const frame of [84, 96, 162]) assert.deepEqual(x(frame), [["pip", 960, 1, 0]]);
  // A walk rises between its steps and ends on the ground.
  const heights = Array.from({ length: compiled.frames }, (_, frame) => stagingOf(compiled, frame).characters[0]!.at[1]);
  assert.equal(Math.max(...heights), 880);
  assert.ok(Math.min(...heights) < 866 && Math.min(...heights) >= 864);
  assert.equal(heights[84], 880);

  const frames = pictures(compiled);
  assert.equal(frames.length, 163);
  assert.deepEqual(pictures(compiled), frames, "the same every time");
  assert.equal(new Set(frames.slice(0, 19)).size, 1, "off the stage, before the walk");
  assert.equal(new Set(frames.slice(19, 84)).size, 65, "each frame of the walk is its own");
  // The narrator's lines move nobody's mouth: after the walk, but for a blink, the picture is one.
  assert.match(frames[90]!, /^<svg [^>]*viewBox="0 0 1920 1080" width="1920" height="1080">/);
  assert.equal(frames[90], frames[91]);
  assert.equal(frames[90], frames[96]);
});

test("a walk is drawn in a script as it is in a beat: the same way, as far through, at the same time", async () => {
  const compiled = await compiledOf(HELLO, VOICES);
  const { use: _use, ...beats } = parse(readFileSync(path.join(root, "videos", "hello.yaml"), "utf8"));
  const scenario = plugin.check(beats, "hello.yaml", library);
  const frames = pictures(compiled);
  for (let frame = 18; frame < 140; frame++) {
    const moment = { span: 0, progress: Math.min(1, (frame - 18) / 66), time: frame / 30, into: (frame - 18) / 30, mouths: {} };
    assert.equal(frames[frame], plugin.frame(scenario, moment, size), `frame ${frame}`);
  }
});

test("a turn, a wave, a hop, a point, an arm that hangs again and another background are drawn in a script as they are in beats", async () => {
  const beats = { scenes: [{ background: "meadow", places: { pip: "left", mo: "right" }, faces: { mo: "left" }, beats: [
    { name: "turns", turn: { who: "pip" } },
    { name: "waves", takes: 1, pose: { pip: "wave" } },
    { name: "hops", jump: { who: "pip", times: 2 } },
    { name: "points", takes: 1, pose: { pip: "point", mo: "wave" }, background: "night" },
    { name: "stands", takes: 1, pose: { pip: "stand" } },
  ] }] };
  const scenario = plugin.check(beats, "beats", library);
  // The same in a script with no pauses: the beats' moves, each at its own pace, and their poses, after what is left of each second.
  const script = [
    "values: { lead: 0s, pause: 0s, tail: 1s }",
    "scenes:",
    "  - background: meadow",
    "    places: { pip: left, mo: right }",
    "    faces: { mo: left }",
    "    script: |",
    "      pip turn",
    "      [w] pip wave",
    "      pip jump times=2 @ w.start + 1s",
    "      [p] pip point",
    "      & mo wave",
    "      & scene background to=night",
    "      pip stand @ p.start + 1s",
    "",
  ].join("\n");
  const compiled = await compiledOf(script, []);
  const frames = pictures(compiled);
  const spans = [["turns", 0, 15], ["waves", 15, 30], ["hops", 45, 36], ["points", 81, 30], ["stands", 111, 30]] as const;
  assert.deepEqual(compiled.scenes[0]!.lines.map((line) => [line.action, line.from, line.frames]), [["turn", 0, 15], ["wave", 15, 9], ["jump", 45, 36], ["point", 81, 9], ["wave", 81, 9], ["background", 81, 1], ["stand", 111, 9]]);
  for (const [span, [, from, length]] of spans.entries()) {
    for (let frame = from; frame < from + length; frame++) {
      const moves = span === 0 || span === 2;
      const moment = { span, progress: moves ? (frame - from) / length : 0, time: frame / 30, into: (frame - from) / 30, mouths: {} };
      assert.equal(frames[frame], plugin.frame(scenario, moment, size), `frame ${frame}`);
    }
  }
});

/** all-at-once's lines, spoken: each as long as it is in its own voice, in hundredths of a second. */
const AT_ONCE_VOICES = [210, 98, 124, 200, 86, 204, 197, 237, 167, 118, 108, 116, 196, 252, 294, 115, 236, 82, 148, 189, 235, 157, 235].map((hundredths, n) => voiced(`${n}.wav`, hundredths / 100));

test("all-at-once: a walk under words, a chorus, an interruption at a word, a radio that is waited for, words that end with a walk, and a murmur cut where the talk over it ends", async () => {
  const compiled = await compiledOf(AT_ONCE, AT_ONCE_VOICES);
  const lines = compiled.scenes.flatMap((scene) => scene.lines);
  const said = lines.filter((line) => "text" in line);
  /** The line that says this: the frame it begins on, and the one it has stopped by. */
  const of = (words: string) => {
    const line = said.find((one) => one.text.startsWith(words))!;
    return { from: line.from, end: line.from + line.frames, line };
  };
  const walk = lines.find((line) => line.action === "walk")!;
  const told = of("Every morning");
  assert.deepEqual([walk.from, walk.from + walk.frames], [told.from, told.end], "Tuk walks as long as it is told");
  const chorus = said.filter((line) => line.text === "Good morning, Tuk!");
  assert.deepEqual(chorus.map((line) => line.from), [chorus[0]!.from, chorus[0]!.from]);
  const badger = of("Last night");
  assert.ok(of("A badger?").from > badger.from + 20 && of("A badger?").from < badger.end - 20, "Mo begins within Pip's line");
  assert.equal(of("A badger?").from, badger.from + Math.round((19 / 37) * badger.line.frames), "where Pip says badger");
  const [news, seen, alone] = [of("Good morning, and"), of("A badger was"), of("It has asked")];
  assert.ok(seen.from > news.end && alone.from > seen.end, "the radio's lines are in order");
  assert.ok(of("That was me").from > seen.from && of("That was me").end > seen.end && of("They know").from > of("That was me").end, "the talk has an order of its own");
  assert.equal(of("Poor badger").from, Math.max(alone.end, of("They know").end) + 12, "what comes after waits for both");
  // Tuk walks in at its own pace, 1260 px at 320 a second, and the words begin late enough to end as it arrives.
  const [, arrives, nearer] = lines.filter((line) => line.action === "walk");
  const evening = of("In the evening");
  assert.deepEqual([arrives!.from, arrives!.frames], [compiled.scenes[1]!.from + 18, 118]);
  assert.equal(evening.end, arrives!.from + arrives!.frames);
  assert.ok(evening.from > arrives!.from + 30);
  // Mo is beside the reeds, at 1500: half of its 200 px and 0.3 of them to their left. Tuk stops between Pip, at 480, and
  // Mo, then 0.3 of its own 178 px from Pip, whose half is 116.
  const { characters } = compiled.scenes[1]!.setting as unknown as Setting;
  assert.deepEqual([characters.pip!.at, characters.mo!.at, characters.tuk!.at], [[480, 880], [1340, 880], [2170, 880]]);
  assert.deepEqual([arrives, nearer].map((line) => (line as unknown as { values: Walk }).values), [{ from: [2170, 880], to: [910, 880] }, { from: [910, 880], to: [738, 880] }]);
  assert.equal(nearer!.from, of("That, only").from, "Tuk comes up to Pip as the last words begin");
  assert.equal(evening.line.frames, Math.ceil(AT_ONCE_VOICES[12]!.duration * 30));
  const [one, five, why, which] = [of("One reed"), of("Five reeds"), of("Why is"), of("And which")];
  assert.equal(one.from, evening.end + 12);
  assert.equal(one.from, why.from, "Mo murmurs as Pip begins");
  assert.equal(five.end, which.end, "and is cut where the third of them ends");
  assert.ok(five.line.frames < AT_ONCE_VOICES[14]!.mouth.length);
  assert.equal(five.line.mouth.length, five.line.frames);
  assert.equal(of("That, only").from, which.end + 12);

  // The radio and the murmur are lower than the talk over them, and Tuk hushes the others low.
  const lower = said.flatMap((line) => (line.volume === 0 ? [] : [[line.who, line.volume, line.text.slice(0, 10)]]));
  assert.deepEqual(lower, [["tuk", -6, "Hush, it i"], ["radio", -8, "Good morni"], ["radio", -8, "A badger w"], ["radio", -8, "It has ask"], ["mo", -12, "One reed, "], ["mo", -12, "Five reeds"]]);

  // Two who speak at once both move their mouths, and the cut one's is shut after the cut.
  const open = (frame: number) => Object.keys(shownAt(pictureOf(compiled), frame).mouths).sort();
  assert.deepEqual(open(chorus[0]!.from), ["mo", "pip"]);
  assert.ok(open(of("A badger?").from).includes("mo"));
  assert.deepEqual(open(seen.from), ["radio"]);
  const speaks = (who: string, from: number, to: number) => Array.from({ length: to - from }, (_, k) => open(from + k)).some((names) => names.includes(who));
  assert.ok(speaks("mo", five.from, five.end) && !speaks("mo", five.end, of("That, only").from));
  assert.equal(pictures(compiled).length, compiled.frames);
});

test("all-at-once's third scene: one walks in while another hops and a third turns a second later, one walks up waving and talking, two looking at it all the way past them, and the day breaks at a word as one walks off", async () => {
  const compiled = await compiledOf(AT_ONCE, AT_ONCE_VOICES);
  const scene = compiled.scenes[2]!;
  const told = scene.lines.map((line) => [line.who, line.action, line.from - scene.from, line.frames]);
  // In the first block the walk is fitted to the words, the hops and the turn keep their own pace, and Mo turns a second later, then points.
  assert.deepEqual(told.slice(0, 5), [["badger", "walk", 18, 57], ["tuk", "jump", 18, 36], ["mo", "turn", 48, 15], ["mo", "point", 63, 9], ["narrator", "say", 18, 57]]);
  // At "badger", which is 13 of the 41 the words weigh, somebody rustles in the reeds, for a second of them.
  assert.deepEqual(told[5], ["rustle", "play", 18 + Math.round((13 / 41) * 57), 30]);
  // In the second Pip's walk is as long as its words, and its arm is up 0.3 s after they begin.
  // So are the looks of Tuk and Mo, at Pip.
  assert.deepEqual(told.slice(6, 12), [["pip", "walk", 87, 71], ["pip", "wave", 87, 9], ["pip", "say", 87, 71], ["mo", "stand", 87, 9], ["tuk", "look-at", 87, 71], ["mo", "look-at", 87, 71]]);
  const at = (frame: number) => Object.fromEntries(stagingOf(compiled, scene.from + frame).characters.map((one) => [one.name, one]));
  assert.deepEqual([at(18).mo!.facing, at(48).mo!.facing, at(63).mo!.facing], [-1, -1, 1], "Mo turns to look");
  assert.deepEqual([at(63).mo!.arm, at(72).mo!.arm, at(96).mo!.arm], [0, -90, 0], "points, and stands as Pip comes by");
  assert.ok(at(27).tuk!.at[1] < 800 && at(27).badger!.at[0] < 2170, "Tuk is up while the badger comes");
  const midway = at(87 + 35);
  assert.ok(midway.pip!.at[0] > 500 && midway.pip!.at[0] < 900 && midway.pip!.arm < -130, "Pip is on its way, its arm raised");
  assert.ok(shownAt(pictureOf(compiled), scene.from + 87 + 1).mouths.pip! > 0, "and it talks");
  // Tuk, at 520, and Mo, at 800, turn to Pip in half a second, and face it all the way past them: to the left, edge-on, to the right.
  for (let frame = 87 + 15; frame <= 87 + 71; frame++) {
    const { pip, ...others } = at(frame);
    for (const who of ["tuk", "mo"]) {
      const { at: [x], facing } = others[who]!;
      const past = pip!.at[0] - x;
      assert.ok(past === 0 || Math.sign(facing) === Math.sign(past), `${who} faces ${facing} in frame ${frame}, and Pip is ${past} px past`);
      if (Math.abs(past) >= 120) assert.equal(Math.abs(facing), 1, `${who} in frame ${frame}`);
    }
  }
  assert.deepEqual([87, 102, 158, 250].map((frame) => [at(frame).tuk!.facing, at(frame).mo!.facing]), [[1, 1], [-1, -1], [1, 1], [1, 1]]);
  // Pip stops beside the badger, whose half and Pip's, and 0.3 of Pip's 232, are 312.
  assert.deepEqual([at(87 + 71).pip!.at, at(87 + 71).badger!.at], [[1440 - 312, 880], [1440, 880]]);
  const end = at(scene.frames - 1);
  assert.deepEqual([end.badger!.at, end.badger!.facing, end.mo!.arm, end.pip!.at], [[2170, 880], 1, 0, [1128, 880]]);
  // "And as the day " is 15 of the 46 the last line weighs: there the night is over, to the end, and the badger is on its way.
  const [last, change] = [scene.lines.find((line) => "text" in line && line.text.startsWith("And as the day"))!, scene.lines.at(-1)!];
  assert.deepEqual([change.who, change.action, change.from, change.frames], ["scene", "background", last.from + Math.round((15 / 46) * last.frames), 1]);
  const fills = Array.from({ length: compiled.frames }, (_, frame) => stagingOf(compiled, frame).background.fill);
  const { morning, sundown, night } = library.raw.backgrounds;
  assert.deepEqual(fills.flatMap((fill, frame) => (fill === fills[frame - 1] ? [] : [[frame, fill]])), [[0, morning.fill], [compiled.scenes[1]!.from, sundown.fill], [scene.from, night.fill], [change.from, morning.fill]]);
  const [before, then] = [at(change.from - scene.from - 1), at(change.from - scene.from)];
  assert.ok(before.badger!.at[0] > 1500 && then.badger!.at[0] > before.badger!.at[0] && then.badger!.at[0] < 1800, "it walks on, on the stage");
  for (const who of ["pip", "mo", "tuk"]) assert.deepEqual(then[who]!.at, before[who]!.at);
});

test("all-at-once's sounds: a tune under all three scenes, a jingle that the news waits for, and a rustle at a word, each at its volume", async () => {
  const compiled = await compiledOf(AT_ONCE, AT_ONCE_VOICES);
  const { lines, scenes, frames } = compiled;
  assert.equal(scenes.length, 3);
  assert.deepEqual(lines!.map(({ line: _, ...rest }) => rest), [{ who: "tune", action: "loop", from: 0, frames, sound: "sounds/tune.flac", volume: -20 }]);
  const of = (words: string) => scenes.flatMap((scene) => scene.lines).find((line) => "text" in line && line.text.startsWith(words))!;
  const played = (who: string) => scenes.flatMap((scene) => scene.lines).find((line) => line.who === who && line.action === "play")!;
  const [jingle, rustle] = [played("jingle"), played("rustle")];
  // The jingle begins a beat after the line before it, and the radio two beats after it, as that is the block's pause.
  assert.equal(jingle.from, of("Hush").from + of("Hush").frames + 12);
  assert.deepEqual([jingle.frames, "volume" in jingle && jingle.volume], [42, -8]);
  assert.equal(of("Good morning, and").from, jingle.from + 42 + 24);
  assert.equal(of("That was me").from > of("A badger was").from, true, "the talk over the radio waits with it");
  assert.equal(rustle.from, of("And then the badger").from + Math.round((13 / 41) * of("And then the badger").frames));
  assert.deepEqual([rustle.frames, "volume" in rustle && rustle.volume], [30, -6]);
  assert.ok(rustle.from + rustle.frames < of("And then the badger").from + of("And then the badger").frames, "it is over within the words");
  // Nothing of them is seen: the picture is the same without them.
  const quiet = AT_ONCE.replace(/script: \|\r?\n  tune loop\r?\n/, "").replace(/ *rustle play.*\r?\n/, "");
  const without = await compiledOf(quiet, AT_ONCE_VOICES);
  assert.ok(!("lines" in without));
  assert.deepEqual(pictureOf(without), pictureOf(compiled));
});

test("the library's sounds are files in the project, made from nothing by the script beside them", () => {
  const made = readFileSync(path.join(root, "sounds", "make.mjs"), "utf8");
  for (const file of Object.values(sounds)) {
    assert.equal(readFileSync(path.join(root, file)).subarray(0, 4).toString("latin1"), "fLaC", file);
    assert.ok(made.includes(`"${path.basename(file)}"`), file);
  }
  assert.deepEqual(Object.values(sounds).sort(), Object.keys(LENGTHS).sort());
});

test("all-at-once, with one value changed, has another timing and nothing else of it", async () => {
  assert.match(AT_ONCE, /\nvalues: \{ beat: 0\.4s, pause: beat, radio\.volume: -8dB, jingle\.volume: -8dB \}\r?\n/);
  const [before, after] = await Promise.all([AT_ONCE, AT_ONCE.replace("beat: 0.4s", "beat: 0.8s")].map((text) => compiledOf(text, AT_ONCE_VOICES)));
  assert.ok(after!.frames > before!.frames + 100, `${before!.frames} frames, and ${after!.frames}`);
  const lines = (compiled: Compiled) => compiled.scenes.flatMap((scene) => scene.lines);
  const moved = lines(after!).filter((line, k) => line.from - lines(before!)[k]!.from > 0);
  // All but the walk and the words joined to it, that the first scene begins with.
  assert.equal(moved.length, lines(before!).length - 2);
  const without = (compiled: Compiled) => lines(compiled).map(({ line, who, action, ...rest }) => [line, who, action, "text" in rest ? [rest.text, rest.file] : "sound" in rest ? rest.sound : rest.values]);
  assert.deepEqual(without(after!), without(before!));
  // The pause between lines is a beat, and the radio's two.
  for (const [compiled, beat] of [[before!, 12], [after!, 24]] as const) {
    const of = (words: string) => lines(compiled).find((line) => "text" in line && line.text.startsWith(words))!;
    assert.equal(of("Last night").from, of("Good morning, Tuk!").from + Math.max(...lines(compiled).filter((line) => "text" in line && line.text === "Good morning, Tuk!").map((line) => line.frames)) + beat);
    assert.equal(of("A badger was").from, of("Good morning, and").from + of("Good morning, and").frames + 2 * beat);
    assert.equal(of("They know").from, of("That was me").from + of("That was me").frames + beat);
  }
});

test("a walk at a speed of its own is as long as that says, whatever is said beside it: slow and fast are the cartoon's names", async () => {
  const walk = async (row: string, ...file: string[]) => {
    const compiled = await compiledOf([...file, ...SCENE, `      ${row}`, "      & narrator say: Pip walks.", ""].join("\n"), [voiced("a.wav", 2.5)]);
    return compiled.scenes[0]!.lines[0]!.frames;
  };
  // 1210 px at 320 px a second: 3.781 s. Beside 75 frames of words, it is fitted to them.
  assert.equal(await walk("pip walk to=middle"), 75);
  assert.equal(await walk("pip walk to=middle speed=1"), 113);
  assert.equal(await walk("pip walk to=middle speed=slow"), Math.round((3.781 / 0.6) * 30));
  assert.equal(await walk("pip walk to=middle speed=fast"), Math.round((3.781 / 1.6) * 30));
  assert.equal(await walk("pip walk to=middle", "values: { walk.speed: slow }"), Math.round((3.781 / 0.6) * 30));
  assert.equal(await walk("pip walk to=middle", "values: { mo.speed: slow }"), 75);
  assert.equal(await walk("pip walk to=middle takes=4s"), 120);
  // A mark may be set by a name, on any level.
  assert.equal(await walk("pip walk to=there", "values: { there: middle, walk.speed: 1 }"), 113);
  assert.equal(await walk("pip walk", "values: { pip.to: middle, walk.speed: 1 }"), 113);
  const wrong = await issuesOf(["pip walk to=there"], ["values: { there: centre }", ...SCENE]);
  assert.deepEqual(wrong.map((i) => [i.line, i.message]), [[7, '"pip" walks to centre: no place is called "centre"']]);
});

test("a character's line opens its mouth as the voice goes, and nobody else's; the next scene begins anew", async () => {
  const text = [
    ...SCENE,
    "      pip say: Hello!",
    "      mo say: Hello, Pip.",
    "  - background: night",
    "    places: { pip: middle }",
    "    script: |",
    "      tuk say: Who is there?",
    "      pip walk to=off-right",
    "",
  ].join("\n");
  // Pip's line is from frame 18 for 30; Mo's from 60 for 30; the second scene from frame 120, Tuk's line from 138 for 30.
  const compiled = await compiledOf(text, [voiced("a.wav", 1), voiced("b.wav", 1), voiced("c.wav", 1)]);
  assert.deepEqual(compiled.scenes.map((s) => [s.from, ...s.lines.map((l) => l.from)]), [[0, 18, 60], [120, 138, 180]]);
  const shut = structuredClone(compiled);
  for (const line of shut.scenes.flatMap((s) => s.lines)) if ("mouth" in line) line.mouth = [];
  const [spoken, silent] = [pictures(compiled), pictures(shut)];
  const mouthOf = (who: "pip" | "mo") => (frame: number) => {
    const parts = library.raw.characters[who].parts.mouth as { fill: string }[];
    return spoken[frame]!.split(/(?=<g )/).filter((part) => part.includes(parts[0]!.fill)).map((part) => part.match(new RegExp(`ry="([\\d.]+)" fill="${parts[0]!.fill}"`))?.[1]);
  };
  // Wide, half and closed, as Pip's voice goes; the mouth of Mo, who says nothing yet, stays shut.
  assert.deepEqual([18, 19, 20, 21].map((f) => mouthOf("pip")(f)[0]), ["31.5", "20.25", "9", "31.5"]);
  assert.deepEqual([18, 19, 20, 21].map((f) => mouthOf("mo")(f)[0]), ["8", "8", "8", "8"]);
  assert.deepEqual([60, 61, 62].map((f) => [mouthOf("pip")(f)[0], mouthOf("mo")(f)[0]]), [["9", "27"], ["9", "17.5"], ["9", "8"]]);
  for (const frame of [17, 48, 59, 90, 119]) assert.equal(spoken[frame], silent[frame], `nobody speaks in frame ${frame}`);
  // Tuk has no place in the second scene: a voice off stage moves no mouth.
  assert.deepEqual(spoken.slice(120), silent.slice(120));
  assert.deepEqual(stagingOf(compiled, 119).characters.map((c) => [c.name, c.at[0], c.facing]), [["pip", -250, 1], ["mo", 1440, -1]]);
  assert.deepEqual(stagingOf(compiled, 120).characters.map((c) => [c.name, c.at[0], c.facing]), [["pip", 960, 1]]);
  assert.deepEqual([119, 120, 200].map((frame) => stagingOf(compiled, frame).background.fill), ["#bfe3ff", "#1b2a4a", "#1b2a4a"]);
});

test("the check refuses an unknown action, a wrong value and an unknown name, each with its line and a hint", async () => {
  assert.deepEqual(await issuesOf(["pip wlak to=middle"]), [{ line: 6, message: 'no action is named "wlak"', hint: "the actions are say, walk, jump, turn, look-at, wave, point, stand, background, play and loop: did you mean walk?" }]);
  assert.deepEqual(await issuesOf(["narrator say: Here is Pip.", "pip walk to=centre"]), [
    { line: 7, message: '"pip" walks to centre: no place is called "centre"', hint: "a place is a mark (off-left, left, middle, right and off-right), a character of the scene (pip and mo), or a point that values set (values: { centre: 300 })" },
  ]);
  assert.match((await issuesOf(["pip walk to=midle"]))[0]!.hint, /: did you mean middle\?$/);
  assert.deepEqual(await issuesOf(["pip walk"]), [
    { line: 6, message: "walk, to: a place is a mark (off-left, left, middle, right, off-right), a point (its x, 0 to 1920), or one worked out: left-of(pip, near)", hint: "as in: pip walk to=middle" },
  ]);
  assert.match((await issuesOf(["pip walk to=middle steps=3"]))[0]!.message, /^walk: Unrecognized key: "steps"$/);
  const pop = await issuesOf(["pop walk to=middle"]);
  assert.deepEqual(pop.map((i) => [i.line, i.message]), [[6, 'no character is named "pop"']]);
  assert.match(pop[0]!.hint, /^the library has the characters pip, mo, tuk, .* and badger: did you mean pip\?$/);
  assert.deepEqual(await issuesOf(["pop say: Hello."]), [
    { line: 6, message: '"pop" is neither the narrator nor a character with a voice', hint: `the characters with a voice are ${speakers.slice(0, -1).join(", ")} and ${speakers.at(-1)}: did you mean pip?` },
  ]);
});

/** Each line's action as the check works it out, with its own length, of a scene of the meadow with Pip and Mo, who faces left. */
async function acted(lines: string[], scene = SCENE): Promise<(Did["values"] | number | string)[][]> {
  const checked = await check([...scene, ...lines.map((line) => `      ${line}`), ""].join("\n"));
  assert.ok("scenes" in checked, JSON.stringify(checked));
  return linesIn(checked.scenes[0]!.items).flatMap((line) => ("values" in line ? [[line.action, line.values as Did["values"], line.length]] : []));
}

test("an action is worked out from how the lines above on its channel left the character, in plain numbers, with its own length", async () => {
  assert.deepEqual(await acted(["pip turn", "pip turn", "mo turn", "pip wave", "pip jump", "pip point", "mo point", "pip jump times=3", "pip stand", "pip wave", "pip turn"]), [
    ["turn", {}, 0.5],
    ["turn", {}, 0.5],
    ["turn", {}, 0.5],
    ["wave", { from: "stand", to: "wave" }, 0.3],
    ["jump", { times: 1 }, 0.6],
    ["point", { from: "wave", to: "point" }, 0.3],
    ["point", { from: "stand", to: "point" }, 0.3],
    ["jump", { times: 3 }, 1.8],
    ["stand", { from: "point", to: "stand" }, 0.3],
    ["wave", { from: "stand", to: "wave" }, 0.3],
    ["turn", {}, 0.5],
  ]);
  // Each is on a channel of its own; only a walk is fitted to words, and only a look is open.
  assert.deepEqual(Object.entries(plugin.script.actions).map(([name, { channels, ...more }]) => [name, ...channels, ...["fits", "open"].filter((how) => how in more)]), [
    ["walk", "place", "fits"],
    ["jump", "hop"],
    ["turn", "facing"],
    ["look-at", "facing", "open"],
    ["wave", "arm"],
    ["point", "arm"],
    ["stand", "arm"],
    ["background", "background"],
  ]);
  // In two blocks at once, one character's are still one after another, as they are written.
  assert.deepEqual((await acted(["together:", "  in order:", "    pip wave", "    mo say: One.", "    pip stand", "  in order:", "    mo turn", "    pip point"])).map(([, values]) => values), [
    { from: "stand", to: "wave" },
    { from: "wave", to: "stand" },
    {},
    { from: "stand", to: "point" },
  ]);
  // A new scene begins anew: facing as it says, its arms hanging.
  const scene = ["scenes:", ...[1, 2].flatMap(() => [...SCENE.slice(1), "      pip wave", "      & pip turn"])];
  const two = await check([...scene, ""].join("\n"));
  assert.ok("scenes" in two);
  assert.deepEqual(two.scenes.map((one) => linesIn(one.items).map((line) => "values" in line && line.values)), Array(2).fill([{ from: "stand", to: "wave" }, {}]));
});

test("a look is worked out as whom it is at and how near the two may stand, and has no length: it goes on to the end of its block", async () => {
  // Pip is 232 wide and Mo 200, the tail and the arm too: 216 from middle to middle, less 0.3 of Mo's.
  assert.deepEqual(await acted(["pip walk to=middle", "& mo look-at target=pip", "& pip look-at target=mo", "mo turn"]), [
    ["walk", { from: [-250, 880], to: [960, 880] }, 3.781],
    ["look-at", { target: "pip", apart: 156 }, "open"],
    ["look-at", { target: "mo", apart: 156 }, "open"],
    ["turn", {}, 0.5],
  ]);
  // Whom it is at may be set on a level, as any action's value.
  assert.deepEqual((await acted(["mo look-at", "pip look-at target=mo", "narrator say: They look."], ["values: { look-at.target: pip }", ...SCENE])).map(([, values]) => (values as { target: string }).target), ["pip", "mo"]);
  const compiled = await compiledOf([...SCENE, "      pip walk to=middle", "      & mo look-at target=pip", "      & narrator say: Here is Pip.", "      mo turn", ""].join("\n"), [voiced("a.wav", 3)]);
  assert.deepEqual(compiled.scenes[0]!.lines.map((line) => [line.action, line.from, line.frames]), [["walk", 18, 90], ["look-at", 18, 90], ["say", 18, 90], ["turn", 120, 15]]);
  assert.deepEqual(compiled.scenes[0]!.lines[1], { line: 7, who: "mo", action: "look-at", from: 18, frames: 90, values: { target: "pip", apart: 156 } });
});

test("the check refuses a look at itself, at nobody, at whom the scene does not place and at a place, each with its line and a hint", async () => {
  const look = async (...rows: string[]) => (await issuesOf(["narrator say: Look.", ...rows])).map(({ line, message, hint }) => [line, message, hint]);
  const another = "name another character the scene places: pip";
  assert.deepEqual(await look("& mo look-at target=mo"), [[7, '"mo" looks at itself', another]]);
  assert.deepEqual(await look("& mo look-at target=narrator"), [[7, "the narrator is nobody on the stage to look at", another]]);
  assert.deepEqual(await look("& mo look-at target=scene"), [[7, "the scene is nobody on the stage to look at", another]]);
  assert.deepEqual(await look("& mo look-at target=tuk"), [[7, '"tuk" has no place in this scene', "give it one, in the scene's places: places: { tuk: off-left }"]]);
  const [unknown] = await look("& mo look-at target=pipp");
  assert.deepEqual(unknown!.slice(0, 2), [7, 'no character is named "pipp"']);
  assert.match(String(unknown![2]), /^the library has the characters pip, mo, .*: did you mean pip\?$/);
  assert.deepEqual((await look("& mo look-at target=middle")).map(([line, message]) => [line, message]), [[7, 'no character is named "middle"']]);
  for (const [value, shown] of [["300", "300"], ["left-of(pip, near)", "left-of(pip, 0.3)"]]) assert.deepEqual(await look(`& mo look-at target=${value}`), [[7, `look-at, target=${shown}: it is the name of a character of the scene`, "as in: mo look-at target=pip"]]);
  assert.deepEqual(await look("& mo look-at"), [[7, "look-at, target: it is the name of a character of the scene", "as in: mo look-at target=pip"]]);
  assert.match(String((await look("& mo look-at target=pip with=joy"))[0]![1]), /^look-at: Unrecognized key: "with"$/);
  assert.deepEqual(await look("& narrator look-at target=pip"), [[7, "the narrator is nobody on the stage: only a character looks at another", "name a character the scene places: pip and mo"]]);
  assert.deepEqual((await look("& scene look-at target=pip")).map(([line, message]) => [line, message]), [[7, "the scene is nobody on the stage: only a character looks at another"]]);
  assert.deepEqual((await look("& tuk look-at target=pip")).map(([line, message]) => [line, message]), [[7, '"tuk" has no place in this scene']]);
  const alone = ["scenes:", "  - background: meadow", "    places: { pip: left }", "    script: |"];
  assert.deepEqual((await issuesOf(["narrator say: Look.", "& pip look-at target=pip"], alone)).map(({ hint }) => hint), ["there is nobody else in the scene to look at"]);
  // An action's name is near, so a slip in it is told.
  assert.match((await issuesOf(["narrator say: Look.", "& mo lookat target=pip"]))[0]!.hint, /did you mean look-at\?$/);
});

test("the check refuses a second look or a turn in a look's block, a look that has a time of its own or is never seen, as the tool does", async () => {
  const told = async (...rows: string[]) => (await issuesOf(rows)).map(({ line, also, message }) => [line, also, message]);
  const busy = "mo's facing is busy with line 6, which goes on to the end of the scene";
  assert.deepEqual(await told("mo look-at target=pip", "pip walk to=middle", "mo turn"), [[8, [6], busy]]);
  assert.deepEqual(await told("mo look-at target=pip", "pip walk to=middle", "& mo look-at target=pip"), [[8, [6], busy]]);
  assert.deepEqual((await issuesOf(["mo look-at target=pip", "pip walk to=middle", "mo turn"]))[0]!.hint, "have line 6 end sooner, in a block of its own: join it to what it goes with (&)");
  assert.deepEqual(await told("together:", "  mo turn", "  mo look-at target=pip", "  pip walk to=middle"), [[8, [6, 7], "mo's facing is busy with line 7, and the two would begin at once"]]);
  assert.deepEqual(await told("pip walk to=middle", "& mo look-at target=pip takes=2s"), [[7, undefined, "look-at takes no takes: it lasts to the end of its block"]]);
  assert.deepEqual(await told("narrator say: Look.", "mo look-at target=pip"), [[7, undefined, "nothing comes after this in the scene, so there is nothing for it to go with"]]);
  assert.deepEqual(await told("mo look-at target=pip", "& pip look-at target=mo"), [[6, undefined, "everything in the lines joined at line 6 goes on to its end, and nothing in it says where that is"]]);
  assert.deepEqual(await told("in order:", "  under:", "    mo look-at target=pip", "    pip say: One.", "  narrator say: Two."), [[8, [7], "an action is never under the rest: cut, it would leave mo where only the voices know"]]);
  // Joined to what it goes with, it is over when that is; on other channels its character goes on meanwhile.
  assert.equal((await acted(["pip walk to=middle", "& mo look-at target=pip", "& mo wave", "& mo jump", "mo turn", "pip turn", "& mo look-at target=pip"])).length, 7);
  // However slow somebody is all through a scene, a look is not.
  assert.equal((await acted(["pip walk to=middle", "& pip look-at target=mo"], ["values: { pip.speed: slow }", ...SCENE])).length, 2);
});

test("two actions on one channel that would begin at once are refused, and on two channels they are not", async () => {
  const hint = "write the two one after the other, in an in order: there, or begin this one by the end of the other (@ prev.end, or its label)";
  for (const [one, other, channel] of [["walk to=middle", "walk to=left", "place"], ["jump", "jump times=2", "hop"], ["turn", "turn", "facing"], ["wave", "point", "arm"], ["point", "stand", "arm"], ["say: One.", "say: Two.", "voice"]]) {
    assert.deepEqual(await issuesOf(["together:", `  pip ${one}`, `  pip ${other}`]), [{ line: 8, also: [6, 7], message: `pip's ${channel} is busy with line 7, and the two would begin at once`, hint }]);
    assert.deepEqual((await issuesOf([`pip ${one}`, `& pip ${other}`])).map((i) => [i.line, i.also]), [[7, [6]]]);
  }
  assert.equal((await acted(["together:", "  pip walk to=middle", "  pip jump", "  pip turn", "  pip wave", "  pip say: All at once.", "  mo wave", "  mo turn"])).length, 6);
});

test("the check refuses an action by nobody on the stage, hops that are none, and a wave or a point by one drawn with no arm", async () => {
  for (const action of ["walk to=left", "jump", "turn", "wave", "point", "stand"]) {
    const verb = `${action.split(" ")[0]}s`;
    assert.deepEqual(await issuesOf([`narrator ${action}`]), [{ line: 6, message: `the narrator is nobody on the stage: only a character ${verb}`, hint: "name a character the scene places: pip and mo" }]);
    assert.deepEqual((await issuesOf([`tuk ${action}`])).map((i) => i.message), ['"tuk" has no place in this scene']);
    assert.deepEqual((await issuesOf([`pop ${action}`])).map((i) => i.message), ['no character is named "pop"']);
  }
  const times = async (times: string) => (await issuesOf([`pip jump times=${times}`])).map((i) => [i.message, i.hint]);
  assert.deepEqual(await times("0"), [["jump, times=0: it is 1 hop or more", "as in: pip jump times=2"]]);
  assert.deepEqual(await times("1.5"), [["jump, times=1.5: it is a whole number of hops", "as in: pip jump times=2"]]);
  assert.deepEqual(await times("twice"), [["jump, times=twice: it is how many hops, 1 or more", "as in: pip jump times=2"]]);
  assert.match((await issuesOf(["pip wave hand=left"]))[0]!.message, /^wave: Unrecognized key: "hand"$/);
  // Set on a level, as any action's value.
  assert.deepEqual((await acted(["pip jump", "mo jump", "mo jump times=1"], ["values: { mo.times: 3 }", ...SCENE])).map(([, values]) => values), [{ times: 1 }, { times: 3 }, { times: 1 }]);

  const body = [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#808080" }];
  const armless = { file: "library.yaml", raw: { characters: { fish: { parts: { body } }, crab: { shoulder: [0, -100], parts: { body, arm: body } } }, backgrounds: { sea: { fill: "#0000ff" } } } };
  const waving = (who: string, action: string, of: typeof armless = armless) => plugin.script.check([{ line: 1, setting: { background: "sea", places: { [who]: "left" } }, actions: [{ line: 2, who, action, values: {}, begun: [] }] }], of);
  assert.deepEqual(waving("fish", "wave"), { issues: [{ line: 2, message: '"fish" has no part named "arm" to wave with', hint: "those drawn with one are crab" }] });
  assert.deepEqual(waving("fish", "point"), { issues: [{ line: 2, message: '"fish" has no part named "arm" to point with', hint: "those drawn with one are crab" }] });
  for (const [who, action] of [["fish", "stand"], ["crab", "wave"], ["crab", "point"]] as const) assert.ok("scenes" in waving(who, action), `${who} ${action}`);
  const { crab: _crab, ...fish } = armless.raw.characters;
  const none = waving("fish", "wave", { ...armless, raw: { ...armless.raw, characters: fish as typeof armless.raw.characters } });
  assert.deepEqual("issues" in none && none.issues[0]!.hint, "the library draws nobody with an arm");
});

test("a change of background is the scene's line, worked out as the background's name, at once; a scene begins with its own again", async () => {
  assert.deepEqual(await acted(["scene background to=night", "pip wave", "scene background to=meadow", "scene background to=sundown takes=2s"]), [
    ["background", { to: "night" }, 0.001],
    ["wave", { from: "stand", to: "wave" }, 0.3],
    ["background", { to: "meadow" }, 0.001],
    ["background", { to: "sundown" }, 0.001],
  ]);
  // A name of the writer's, and a value set on a level, as any action's.
  assert.deepEqual((await acted(["scene background to=late"], ["values: { late: night }", ...SCENE])).map(([, values]) => values), [{ to: "night" }]);
  assert.deepEqual((await acted(["in order scene.to=night:", "  scene background", "  pip walk to=middle"])).map(([, values]) => values), [{ to: "night" }, { from: [-250, 880], to: [960, 880] }]);
  const two = await check([...SCENE, "      scene background to=night", ...SCENE.slice(1), "      scene background to=night", ""].join("\n"));
  assert.ok("scenes" in two, JSON.stringify(two));
  assert.deepEqual(two.scenes.map((one) => [(one.setting as unknown as Setting).background, linesIn(one.items).map((line) => "values" in line && line.values)]), Array(2).fill(["meadow", [{ to: "night" }]]));
  // On a channel of its own: it goes on beside all a character does, and beside what is said.
  assert.equal((await acted(["together:", "  pip walk to=middle", "  pip wave", "  pip turn", "  mo jump", "  scene background to=night", "  narrator say: All at once."])).length, 5);
});

test("the check refuses two changes of background at once, a name the library lacks, and the background that is there already", async () => {
  const hint = "write the two one after the other, in an in order: there, or begin this one by the end of the other (@ prev.end, or its label)";
  const message = "scene's background is busy with line 7, and the two would begin at once";
  assert.deepEqual(await issuesOf(["together:", "  scene background to=night", "  narrator say: Night falls.", "  scene background to=sundown"]), [{ line: 9, also: [6, 7], message, hint }]);
  assert.deepEqual(await issuesOf(["narrator say: It is late.", "scene background to=night", "& scene background to=sundown"]), [{ line: 8, also: [7], message, hint }]);
  assert.deepEqual((await issuesOf(["ending together:", "  scene background to=night", "  pip walk to=middle", "  scene background to=sundown"])).map((i) => [i.line, i.also, i.message]), [
    [9, [6, 7], "scene's background is busy with line 7, which ends when this does: the block of line 6 ends its lines together"],
  ]);
  // One after the other, by order or by a moment of its own, they are two.
  for (const second of ["scene background to=sundown", "& scene background to=sundown @ prev.end + 1s", "scene background to=sundown @ w.word(falls)"]) {
    assert.equal((await acted(["[w] narrator say: The night falls.", "scene background to=night @ w.word(night)", second])).length, 2, second);
  }

  assert.deepEqual(await issuesOf(["scene background to=nigth"]), [
    { line: 6, message: 'no background is named "nigth"', hint: `the library has the backgrounds ${Object.keys(library.raw.backgrounds).slice(0, -1).join(", ")} and ${Object.keys(library.raw.backgrounds).at(-1)}: did you mean night?` },
  ]);
  // What every table has is none of the library's, and a mistake is said once of each line.
  assert.deepEqual((await issuesOf(["scene background to=constructor", "scene background to=constructor", "scene background to=meadow"])).map((i) => [i.line, i.message]), [
    [6, 'no background is named "constructor"'],
    [7, 'no background is named "constructor"'],
  ]);

  const already = "change it to another, or leave the line out";
  assert.deepEqual(await issuesOf(["scene background to=meadow"]), [{ line: 6, also: [2], message: "the background is meadow already", hint: already }]);
  assert.deepEqual(await issuesOf(["scene background to=night", "pip wave", "scene background to=night", "scene background to=night"]), [
    { line: 8, also: [6], message: "the background is night already", hint: already },
    { line: 9, also: [6], message: "the background is night already", hint: already },
  ]);
  // In two blocks at once they are one after another, as they are written: the second finds what the first left.
  const blocks = (to: string) => ["together:", "  in order:", "    pip wave", "    scene background to=night", "  in order:", `    scene background to=${to}`];
  assert.deepEqual((await issuesOf(blocks("night"))).map((i) => [i.line, i.also, i.message]), [[11, [9], "the background is night already"]]);
  assert.equal((await acted(blocks("meadow"))).length, 3);
});

test("the check refuses a change of background by anybody else, one with no name, and whatever else the scene would do", async () => {
  for (const who of ["pip", "tuk", "pop", NARRATOR, "stage"]) {
    assert.deepEqual(await issuesOf([`${who} background to=night`]), [{ line: 6, message: `the background is the scene's to change, and not ${who}'s`, hint: "as in: scene background to=night" }]);
  }
  for (const action of ["walk to=left", "jump", "turn", "wave", "point", "stand"]) {
    assert.deepEqual(await issuesOf([`scene ${action}`]), [{ line: 6, message: `the scene is nobody on the stage: only a character ${action.split(" ")[0]}s`, hint: "name a character the scene places: pip and mo" }]);
  }
  assert.deepEqual((await issuesOf(["scene say: Hello."])).map((i) => i.message), ['"scene" is neither the narrator nor a character with a voice']);
  const what = "it is the name of one of the library's backgrounds";
  for (const [given, shown] of [["", ""], [" to=300", "=300"], [" to=left-of(pip, near)", "=left-of(pip, 0.3)"]]) {
    assert.deepEqual(await issuesOf([`scene background${given}`]), [{ line: 6, message: `background, to${shown}: ${what}`, hint: "as in: scene background to=night" }]);
  }
  assert.match((await issuesOf(["scene background to=night from=meadow"]))[0]!.message, /^background: Unrecognized key: "from"$/);
  assert.deepEqual((await issuesOf(["scene background to=night: Night falls."])).map((i) => i.message), ["background takes no words after a colon: only say does"]);
  assert.deepEqual((await issuesOf(["in order:", "  under:", "    scene background to=night", "  narrator say: It is late."])).map((i) => [i.line, i.also]), [[8, [7]]]);
});

test("the check follows who stands where: a walk by someone the scene does not place, to its own mark, or to another's", async () => {
  assert.deepEqual(await issuesOf(["tuk walk to=middle"]), [
    { line: 6, message: '"tuk" has no place in this scene', hint: "give it one, in the scene's places: places: { tuk: off-left }" },
  ]);
  assert.deepEqual((await issuesOf(["narrator walk to=middle"])).map((i) => i.message), ["the narrator is nobody on the stage: only a character walks"]);
  assert.deepEqual((await issuesOf(["pip walk to=off-left"])).map((i) => i.message), ['"pip" stands at off-left already']);
  assert.deepEqual((await issuesOf(["pip walk to=right"])).map((i) => i.message), ['"pip" walks to right, where "mo" stands']);
  // Where the lines above left it: Pip is at the middle by line 7, and Mo has left the right by line 9.
  assert.deepEqual((await issuesOf(["pip walk to=middle", "pip walk to=middle"])).map((i) => [i.line, i.message]), [[7, '"pip" stands at middle already']]);
  const moved = await check([...SCENE, "      pip walk to=middle", "      mo walk to=off-right", "      mo say: Goodbye!", "      pip walk to=right", ""].join("\n"));
  assert.ok("scenes" in moved);
  assert.deepEqual(linesIn(moved.scenes[0]!.items).map((line) => ("length" in line ? [line.values, line.length] : "text" in line && line.text)), [
    [{ from: [-250, 880], to: [960, 880] }, 3.781],
    [{ from: [1440, 880], to: [2170, 880] }, 2.281],
    "Goodbye!",
    [{ from: [960, 880], to: [1440, 880] }, 1.5],
  ]);
  assert.equal(PACE.walk, 320);
});

test("the check refuses a scene's setting at the scene's line: a name the library lacks, two on one mark, a key it has not", async () => {
  const scene = (...rows: string[]) => ["scenes:", ...rows, "    script: |"];
  const medow = await issuesOf(["narrator say: Hello."], scene("  - background: medow"));
  assert.deepEqual(medow.map((i) => [i.line, i.message]), [[2, 'no background is named "medow"']]);
  assert.match(medow[0]!.hint, /^the library has the backgrounds meadow, morning, .*: did you mean meadow\?$/);
  const messages = async (...rows: string[]) => (await issuesOf(["narrator say: Hello."], scene(...rows))).map((i) => i.message);
  assert.deepEqual(await messages("  - background: meadow", "    places: { pop: left }"), ['no character is named "pop"']);
  assert.deepEqual(await messages("  - background: meadow", "    places: { pip: left, mo: left, tuk: off-left, mole: off-left }"), ['"pip" and "mo" begin on one spot']);
  assert.deepEqual(await messages("  - background: meadow", "    places: { pip: centre }"), ['"pip" begins at centre: no place is called "centre"']);
  assert.deepEqual(await messages("  - background: meadow", "    places: { pip: [300, 880] }"), ["places.pip: a place is a mark (off-left, left, middle, right, off-right), a point (its x, 0 to 1920), or one worked out: left-of(pip, near)"]);
  assert.deepEqual(await messages("  - background: meadow", "    faces: { mo: left }"), ['"mo" faces left, and has no place in this scene']);
  assert.deepEqual(await messages("  - background: meadow", "    faces: { pip: back }", "    places: { pip: left }"), ["faces.pip: it is left or right"]);
  const beats = await issuesOf(["narrator say: Hello."], scene("  - background: meadow", "    beats: []"));
  assert.deepEqual(beats, [
    { line: 2, message: 'Unrecognized key: "beats"', hint: "a scene has background (one of the library's), places (where each of its characters begins), faces (who begins facing left) and script" },
  ]);
});

test("a scene begins with each character at its mark's point, facing 1 as drawn or -1", async () => {
  const checked = await check([...SCENE, "      mo say: Hello, Pip.", ""].join("\n"));
  assert.ok("scenes" in checked);
  assert.deepEqual(checked.scenes[0]!.setting, { background: "meadow", characters: { pip: { at: [-250, 880], facing: 1 }, mo: { at: [1440, 880], facing: -1 } } });
});

/** A file of one scene, its values, its places a row each, and its lines after the narrator's. */
const placing = (places: string[], lines: string[] = [], values?: string) =>
  ["scenes:", "  - background: meadow", "    places:", ...places.map((row) => `      ${row}`), ...(values === undefined ? [] : [`    values: { ${values} }`]), "    script: |", "      narrator say: Here they are.", ...lines.map((row) => `      ${row}`), ""].join("\n");
/** Where everyone begins in such a scene, and where each of its walks goes, from and to: their xs. */
async function xs(places: string[], lines?: string[], values?: string) {
  const checked = await check(placing(places, lines, values));
  assert.ok("scenes" in checked, JSON.stringify(checked));
  const [scene] = checked.scenes;
  const begins = Object.fromEntries(Object.entries((scene!.setting as unknown as Setting).characters).map(([who, { at }]) => [who, at[0]]));
  return { begins, walks: linesIn(scene!.items).flatMap((line) => ("values" in line ? [(line.values as unknown as Walk)] : [])).map(({ from, to }) => [from[0], to[0]]) };
}
/** Why such a scene is refused. */
async function refusedPlaces(places: string[], lines?: string[]): Promise<Issue[]> {
  const checked = await check(placing(places, lines));
  assert.ok("issues" in checked, "it is refused");
  return checked.issues;
}

test("a place is a mark, a point by its x, or half-way between two places", async () => {
  assert.deepEqual((await xs(["pip: left", "mo: 1200", "tuk: off-right"])).begins, { pip: 480, mo: 1200, tuk: 2170 });
  // A point has a name by a value, on any level, and a formula is worked out: the tool's "Values".
  assert.deepEqual((await xs(["pip: door", "mo: door + 600.4"], ["pip walk to=(door + 500) / 2", "pip walk to=door"], "door: 100")).walks, [[100, 300], [300, 100]]);
  assert.deepEqual((await xs(["pip: door", "mo: door + 600.4"], [], "door: 100")).begins, { pip: 100, mo: 700 });
  assert.deepEqual((await xs(["pip: here", "mo: here"], [], "pip.here: 300, here: 900")).begins, { pip: 300, mo: 900 }, "a value is for whose place it is");
  assert.deepEqual((await xs(["pip: left", "mo: right", "tuk: midpoint(pip, mo)", "mole: midpoint(left, 100)"])).begins, { pip: 480, mo: 1440, tuk: 960, mole: 290 });
  assert.deepEqual((await xs(["pip: left", "mo: 900", "tuk: midpoint(midpoint(pip, 1500), 1801)"])).begins.tuk, Math.round((990 + 1801) / 2));
});

test("beside somebody: the gap from body to body, in widths of the smaller of the two, the near one 0.3", async () => {
  // As drawn, with the arms and the tail: Pip is 232 px wide, Mo 200, Tuk 178, the badger 252 and the squirrel 224.
  const beside = async (one: string, other: string) => (await xs([`${one}: middle`, `${other}: right-of(${one}, near)`])).begins[other]! - 960;
  assert.deepEqual([await beside("tuk", "pip"), await beside("pip", "mo"), await beside("badger", "squirrel"), await beside("mo", "tuk")], [258, 276, 305, 242]);
  assert.equal(await beside("pip", "tuk"), 258, "whoever of the two it is");
  const tuk = async (place: string, values?: string) => (await xs(["pip: middle", `tuk: ${place}`], [], values)).begins.tuk! - 960;
  // Half of Pip, half of Tuk, and the gap: so many times Tuk's 178.
  assert.equal(await tuk("left-of(pip, near)"), -258);
  assert.equal(await tuk("left-of(pip, 0)"), -205);
  assert.equal(await tuk("right-of(pip, 1)"), 383);
  assert.equal(await tuk("right-of(pip, near * 2)"), Math.round(205 + 0.6 * 178));
  assert.equal(await tuk("right-of(pip, 50%)"), 294);
  assert.equal(await tuk("right-of(pip, near)", "near: 1"), 383, "near is a name that the scene may set");
  assert.equal(await tuk("right-of(pip, near)", "tuk.near: 1"), 383);
  // Beside a mark or a point, the gap is from that: half of Tuk, and so many times Tuk.
  assert.equal(await tuk("left-of(right, near)"), 480 - 89 - 53);
  assert.equal(await tuk("left-of(1700, 1)"), 740 - 89 - 178);
  assert.equal(await tuk("right-of(left-of(pip, 1), 0)"), -205 - 178 + 89, "or from a place worked out, which is a point");
  assert.equal(await tuk("left-of(midpoint(pip, 500), near)"), -230 - 89 - 53);
  // Whichever way they face: a character is as wide on both sides.
  const facing = await check(placing(["pip: middle", "tuk: left-of(pip, near)"]).replace("    script:", "    faces: { pip: left, tuk: left }\n    script:"));
  assert.ok("scenes" in facing);
  assert.deepEqual((facing.scenes[0]!.setting as unknown as Setting).characters.tuk, { at: [702, 880], facing: -1 });
});

test("a character's place is where the lines above leave it, in the order written", async () => {
  const places = ["pip: left", "mo: off-right", "tuk: 1700"];
  const rows = ["pip walk to=right", "& mo walk to=left-of(pip, near)"];
  assert.deepEqual((await xs(places, rows)).walks, [[480, 1440], [2170, 1440 - 276]], "beside where Pip's walk ends, though both walk at once");
  assert.deepEqual((await xs(places, ["mo walk to=left-of(pip, near)", "& pip walk to=right"])).walks, [[2170, 480 - 276], [480, 1440]], "or beside where Pip stands, when it walks below");
  // Whichever blocks they are in, and after several.
  assert.deepEqual((await xs(places, ["together:", "  in order:", "    pip walk to=700", "    pip walk to=100", "  mo walk to=midpoint(pip, tuk)"])).walks, [[480, 700], [700, 100], [2170, 900]]);
  // Its own name is where it stands: a step to the side.
  assert.deepEqual((await xs(places, ["tuk walk to=left-of(tuk, 0)", "tuk walk to=left-of(tuk, 0)"])).walks, [[1700, 1522], [1522, 1344]]);
  // As a scene begins, the places wait for each other, whichever is written first.
  assert.deepEqual((await xs(["tuk: midpoint(pip, mo)", "mo: right-of(pip, 2)", "pip: 300"])).begins, { tuk: 608, mo: 916, pip: 300 });
  // A new scene begins anew.
  const scene = (pip: string) => ["  - background: meadow", `    places: { pip: ${pip}, mo: right }`, "    script: |", "      pip walk to=left-of(mo, near)"];
  const two = await check(["scenes:", ...scene("left"), ...scene("300"), ""].join("\n"));
  assert.ok("scenes" in two);
  assert.deepEqual(two.scenes.map((scene) => linesIn(scene.items).map((line) => "values" in line && (line.values as unknown as Walk).from[0])), [[480], [300]]);
});

test("the check refuses two on one spot: nearer than one covering 0.3 of the smaller, as a scene begins and after a walk", async () => {
  // Pip is 232 px wide and Mo 200: they keep 216 - 60 px apart.
  assert.deepEqual(await refusedPlaces(["pip: 900", "mo: 1055"]), [
    { line: 2, message: '"pip" and "mo" begin on one spot', hint: "pip is at 900 and mo at 1055: they keep 156 px apart or more, middle to middle, so that neither covers much of the other; left-of(pip, near) is beside pip" },
  ]);
  assert.deepEqual((await xs(["pip: 900", "mo: 1056"])).begins, { pip: 900, mo: 1056 });
  // That is what a gap of less than -0.3 is, whatever is rounded.
  for (const one of ["pip", "badger", "tuk"]) for (const other of ["mo", "squirrel", "rabbit"]) for (const side of ["left-of", "right-of"]) assert.ok(await xs([`${one}: 961`, `${other}: ${side}(${one}, - 0.3)`]));
  assert.equal((await refusedPlaces(["pip: 900", "mo: right-of(pip, - 0.31)"])).length, 1);
  const places = ["pip: left", "mo: right", "tuk: off-left"];
  assert.deepEqual((await refusedPlaces(places, ["pip walk to=mo"])).map((i) => [i.line, i.message, i.hint]), [
    [9, '"pip" walks to mo, where "mo" stands', "mo is at 1440 and pip at 1440: they keep 156 px apart or more, middle to middle, so that neither covers much of the other; left-of(mo, near) is beside mo"],
  ]);
  assert.deepEqual((await refusedPlaces(places, ["tuk walk to=left", "pip walk to=left-of(mo, near)", "tuk walk to=midpoint(pip, 1000)"])).map((i) => [i.line, i.message]), [
    [9, '"tuk" walks to left, where "pip" stands'],
    [11, '"tuk" walks to midpoint(pip, 1000), where "pip" stands'],
  ]);
  // Who has left the spot is no longer on it, the walker itself too, and off the stage any number wait on one.
  assert.deepEqual((await xs(places, ["pip walk to=off-left", "tuk walk to=left", "mo walk to=off-left"])).walks, [[480, -250], [-250, 480], [1440, -250]]);
  assert.deepEqual((await xs(places, ["pip walk to=481"])).walks, [[480, 481]]);
  // One who waits off the stage is on no spot of it, however wide.
  const body = (width: number) => ({ parts: { body: [{ shape: "rect", at: [0, -100], size: [width, 200], fill: "#808080" }] } });
  const wide = { file: "library.yaml", raw: { characters: { whale: body(900), fish: body(100) }, backgrounds: { sea: { fill: "#0000ff" } } } };
  const sea = (whale: string, fish: string | number, who = "fish", to: string | number = 20) => plugin.script.check([{ line: 1, setting: { background: "sea", places: { whale, fish } }, actions: [{ line: 2, who, action: "walk", values: { to }, begun: [] }] }], wide);
  assert.ok("scenes" in sea("off-left", "left"));
  assert.ok("scenes" in sea("right", 20, "whale", "off-left"), "or who goes off it");
  assert.ok("issues" in sea("left", "right"), "it is when it stands on the stage");
});

test("two may be on one spot one after the other: when the first has surely left by the time the second comes", async () => {
  const places = ["pip: left", "mo: right", "tuk: off-left"];
  const spots = async (...rows: string[]) => (await refusedPlaces(places, rows)).map((i) => [i.line, ...(i.also ?? []), i.message]);
  const taken = (...rows: string[]) => xs(places, rows);
  // At once, whichever is written first, joined or in a block; a swap, too.
  await taken("mo walk to=off-right", "& pip walk to=right");
  await taken("pip walk to=right", "& mo walk to=off-right");
  await taken("together:", "  pip walk to=right", "  mo walk to=left");
  await taken("ending together:", "  pip walk to=right", "  narrator say: They swap.", "  mo walk to=left");
  await taken("together:", "  in order:", "    mo walk to=off-right", "    mo say: Goodbye!", "  in order:", "    narrator say: Pip comes later.", "    pip walk to=right");
  // In order, and by a moment of the one that leaves: a walk begins no earlier than what it names.
  await taken("[m] mo walk to=off-right", "pip walk to=right @ m.50%");
  await taken("mo walk to=off-right", "& narrator say: Mo goes.", "pip walk to=right @ prev.start + 0.2s");
  await taken("pip walk to=midpoint(pip, mo)", "pip walk to=left", "mo walk to=midpoint(pip, 1440)");

  // Two who come to one spot at once, or one after the other, and stay.
  const middle = '"mo" walks to middle, where "pip" stands';
  assert.deepEqual(await spots("together:", "  pip walk to=middle", "  mo walk to=middle"), [[11, middle]]);
  assert.deepEqual(await spots("pip walk to=middle", "mo walk to=middle"), [[10, middle]]);
  assert.deepEqual(await spots("together:", "  in order:", "    narrator say: Later.", "    mo walk to=middle", "  pip walk to=middle"), [[13, '"pip" walks to middle, where "mo" stands']]);
  // Or who arrive at one moment, though one of them goes on at once, whichever is written first.
  for (const [one, other] of [["pip", "mo"], ["mo", "pip"]]) {
    for (const on of ["pip walk to=left", "mo walk to=right"]) {
      assert.deepEqual((await spots("ending together:", `  ${one} walk to=middle`, `  ${other} walk to=middle`, `& ${on}`)).map(([line]) => line), [11]);
    }
  }
  // One who leaves too late, or who leaves later than the voices may let the other come.
  assert.deepEqual(await refusedPlaces(places, ["pip walk to=right", "mo walk to=off-right"]), [
    { line: 9, also: [10], message: '"pip" walks to right, where "mo" stands', hint: "mo leaves it at line 10: write that line above this one, or the two at once, joined by & and with no anchor; or walk beside mo" },
  ]);
  assert.deepEqual(await refusedPlaces(places, ["together:", "  in order:", "    narrator say: A long line.", "    mo walk to=off-right", "  pip walk to=right"]), [
    { line: 13, also: [12], message: '"pip" walks to right, where "mo" may still stand', hint: "mo leaves it at line 12, and only the voices say whether that begins before pip is there: write this line below that one, in order, or the two at once, joined by & and with no anchor" },
  ]);
  assert.deepEqual(await spots("pip walk to=right", "& mo walk to=off-right @ prev.start + 1s"), [[9, 10, '"pip" walks to right, where "mo" stands']]);
  // One who comes and goes again, while another comes when a voice says.
  const visit = ["together:", "  in order:", "    pip walk to=middle", "    pip say: Nobody here.", "    pip walk to=left", "  in order:", "    narrator say: Meanwhile.", "    mo walk to=middle"];
  assert.deepEqual(await spots(...visit), [[16, 13, '"mo" walks to middle, where "pip" may still stand']]);
  assert.deepEqual(await spots(...visit.slice(0, 1), ...visit.slice(5), ...visit.slice(1, 5)), [[14, '"pip" walks to middle, where "mo" stands']]);
  await taken("pip walk to=middle", "pip say: Nobody here.", "pip walk to=left", "& mo walk to=middle");
  // The spot is what counts, and not its name; a little beside is no spot of another's.
  assert.deepEqual(await spots("pip walk to=1300"), [[9, '"pip" walks to 1300, where "mo" stands']]);
  await taken("pip walk to=right", "& mo walk to=right-of(pip, near)");
  // Off the stage any number come and go.
  await taken("together:", "  pip walk to=off-left", "  mo walk to=off-left");
  // A walk with a mistake leaves its spot all the same, and is nowhere then: what follows is no second mistake.
  assert.deepEqual(await spots("mo walk to=tree", "pip walk to=right", "tuk walk to=left"), [[9, '"mo" walks to tree: no place is called "tree"']]);
  assert.deepEqual(await spots("mo walk to=tree", "pip walk to=right", "mo walk to=middle"), [[9, '"mo" walks to tree: no place is called "tree"']]);
  // A walk is told once, with the first it meets.
  assert.deepEqual((await spots("pip walk to=middle", "tuk walk to=950", "mo walk to=970")).map(([line]) => line), [10, 11]);
});

/** What happens at once, in every shape of three rows: a walk by one, a walk by another, and a line said. */
const SHAPES = (() => {
  const walks = ["pip walk to=middle", "pip walk to=off-left", "mo walk to=left", "mo walk to=middle", "mo walk to=off-right", "tuk walk to=left", "tuk walk to=middle"];
  const rows = (one: string, two: string, three: string) => [
    ["together:", `  ${one}`, `  ${two}`, three],
    [one, `& ${two}`, "narrator say: One.", three],
    [one, "narrator say: One.", `${two} @ prev.start`, three],
    ["together:", "  in order:", `    ${one}`, "    pip say: One.", `    ${two}`, `  ${three}`],
    ["together:", `  ${one}`, "  in order:", "    narrator say: One.", `    ${two}`, `    ${three}`],
    ["together:", "  in order:", "    mo say: One.", `    ${one}`, "  in order:", "    narrator say: Two.", `    ${two}`, three],
    ["ending together:", `  ${one}`, "  narrator say: One.", `  ${two}`, `${three}`],
    [`[a] ${one}`, `& ${two} @ a.start + 0.4s`, `${three} @ a.50%`],
    ["together:", `  [a] ${one}`, `  narrator say: One.`, `  ${two} @ a.end`, three],
  ];
  return walks.flatMap((one) => walks.flatMap((two) => walks.flatMap((three) => rows(one, two, three))));
})();

test("in what the check takes, two never stand on one spot, whatever the voices' lengths", async (t) => {
  const places = ["pip: left", "mo: right", "tuk: off-left"];
  const LENGTHS = [[0.1, 0.1], [6, 0.1], [0.1, 6], [1.5, 2.5], [4, 4]];
  const apart = (one: string, other: string) => ({ "mo pip": 156, "pip tuk": 152, "mo tuk": 136 })[[one, other].sort().join(" ")]!;
  let [tried, refused, met] = [0, 0, 0];
  for (const shape of SHAPES) {
    const checked = await check(placing(places, shape));
    if ("issues" in checked) {
      if (checked.issues.some((i) => /where ".*" (may still )?stand/.test(i.message))) refused++;
      continue;
    }
    tried++;
    const lines = checked.scenes.flatMap((scene) => linesIn(scene.items));
    for (const lengths of LENGTHS) {
      const said = lines.filter((line) => "text" in line).map((_, n) => voiced(`${n}.wav`, n === 0 ? 1 : lengths[n - 1]!));
      const [scene] = compile(checked.scenes, said, SETTINGS, "x.yaml").scenes;
      // Where each stands, and from which frame to which it does nothing but stand there.
      const stays = ["pip", "mo", "tuk"].flatMap((who) => {
        const walks = scene!.lines.filter((line) => line.who === who && line.action === "walk").map((line) => ({ from: line.from, end: line.from + line.frames, to: (line as unknown as { values: Walk }).values.to[0] }));
        const begins = (scene!.setting as unknown as Setting).characters[who]!.at[0];
        return [{ who, x: begins, from: scene!.from, until: walks[0]?.from }, ...walks.map(({ end, to }, k) => ({ who, x: to, from: end, until: walks[k + 1]?.from }))].map(({ until = scene!.frames, ...stay }) => ({ ...stay, until }));
      });
      for (const [k, one] of stays.entries()) {
        for (const other of stays.slice(k + 1)) {
          if (one.who === other.who || ![one, other].every(({ x }) => x >= 0 && x <= 1920) || Math.abs(one.x - other.x) >= apart(one.who, other.who)) continue;
          assert.ok(one.until <= other.from || other.until <= one.from, `${one.who} and ${other.who} stand at ${one.x} and ${other.x}, voices ${lengths}:\n${shape.join("\n")}`);
          met++;
        }
      }
    }
  }
  t.diagnostic(`${tried} scripts taken, ${refused} refused for a spot, and ${met} times two were on one spot, one after the other`);
  assert.ok(tried > 300 && refused > 300 && met > 300, `${tried}, ${refused}, ${met}`);
});

test("the check refuses a place that cannot be worked out, each with its line and a hint", async () => {
  const places = ["pip: left", "mo: right"];
  /** The message and the hint of a walk of Pip's to a place, or of that and how Mo begins. */
  const walking = async (to: string, ...more: string[]) => {
    const issues = await refusedPlaces([...places, ...more], [`pip walk to=${to}`]);
    assert.equal(issues.length, 1, JSON.stringify(issues));
    assert.equal(issues[0]!.line, 8 + more.length);
    return [issues[0]!.message, issues[0]!.hint];
  };
  // A name that is nothing's, a character that the scene does not place, and one that is out of sight.
  assert.deepEqual(await walking("left-of(reeds, near)"), [
    '"pip" walks to left-of(reeds, 0.3): no place is called "reeds"',
    "a place is a mark (off-left, left, middle, right and off-right), a character of the scene (pip and mo), or a point that values set (values: { reeds: 300 })",
  ]);
  assert.match((await walking("midpoint(pop, right)"))[1]!, /: did you mean pip\?$/);
  assert.deepEqual(await walking("midpoint(tuk, mo)"), ['"pip" walks to midpoint(tuk, mo): "tuk" has no place in this scene', "give it one, in the scene's places: places: { tuk: off-left }"]);
  assert.match((await walking("narrator"))[0]!, /no place is called "narrator"/);
  const off = "out of sight is off-left or off-right; how far beside is in widths of the smaller of the two, as near (0.3), and not in pixels";
  assert.deepEqual(await walking("tuk", "tuk: off-left"), ['"pip" walks to tuk: it is -250, off the stage, which is 0 to 1920', off]);
  // Off the stage: a point, and a gap that is taken for pixels.
  assert.deepEqual(await walking("right-of(mo, 150)"), ['"pip" walks to right-of(mo, 150): it is 31656, off the stage, which is 0 to 1920', off]);
  assert.match((await walking("1921"))[0]!, /it is 1921, off the stage/);
  assert.match((await walking("- 1"))[0]!, /it is -1, off the stage/);
  assert.deepEqual((await xs(places, ["pip walk to=1920", "pip walk to=0"])).walks, [[480, 1920], [1920, 0]]);
  // What a construction takes.
  assert.deepEqual(await walking("left-of(mo)"), ['"pip" walks to left-of(mo): left-of(mo) is not a place and how far from it', "write both: left-of(pip, near)"]);
  assert.equal((await walking("left-of(mo, near, 2)"))[0], '"pip" walks to left-of(mo, 0.3, 2): left-of(mo, 0.3, 2) is not a place and how far from it');
  assert.deepEqual(await walking("midpoint(mo)"), ['"pip" walks to midpoint(mo): midpoint(mo) is not between two places', "write both: midpoint(pip, mo)"]);
  assert.deepEqual(await walking("midpoint(mo, pip, 300)"), ['"pip" walks to midpoint(mo, pip, 300): midpoint(mo, pip, 300) is not between two places', "write both: midpoint(pip, mo)"]);
  assert.deepEqual(await walking("right-of(mo, naer)"), ['"pip" walks to right-of(mo, naer): how far is a number, and naer is none', "it is in widths of the smaller of the two: near (0.3), or 1 for a body between them: did you mean near?"]);
  assert.match((await walking("right-of(0.3, mo)"))[0]!, /how far is a number, and mo is none/);
  // What the tool refuses: a construction nobody has, a time, a line's length, and one taken for a number.
  assert.deepEqual(await walking("next-to(mo, near)"), ['to=next-to(mo, near): no construction is named "next-to"', "the constructions are left-of, right-of and midpoint"]);
  assert.match((await walking("lef-of(mo, near)"))[1]!, /: did you mean left-of\?$/);
  assert.deepEqual(await walking("right-of(mo, 2s)"), ["to=right-of(mo, 2s): what right-of takes is no time, and has no unit", "write it without the s"]);
  assert.match((await walking("right-of(mo, prev.length)"))[0]!, /^to=right-of\(mo, prev\.length\): what right-of takes is known before anything is spoken/);
  assert.match((await walking("right-of(mo, near) + 100"))[0]!, /^to=right-of\(mo, near\) \+ 100: right-of\(mo, 0\.3\) is no number$/);
  assert.deepEqual(await walking("pip + 100"), ["to=pip + 100: pip is a character, and no number", "a character's name stands by itself, or in a construction, as in left-of(pip, near), right-of(pip, 0.5) and midpoint(pip, mo)"]);
  // To where it stands already.
  assert.match((await walking("left"))[0]!, /^"pip" stands at left already$/);
  assert.match((await walking("480"))[0]!, /^"pip" stands at 480 already$/);
  assert.match((await walking("midpoint(pip, 480)"))[0]!, /^"pip" stands at midpoint\(pip, 480\) already$/);
});

test("the check refuses where characters begin, at the scene's line: places that go round, and one mistake is said once", async () => {
  const beginning = async (...places: string[]) => (await refusedPlaces(places)).map((i) => [i.line, i.message]);
  assert.deepEqual(await refusedPlaces(["pip: left-of(mo, near)", "mo: midpoint(tuk, 900)", "tuk: right-of(pip, 1)"]), [
    { line: 2, message: '"tuk" begins at right-of(pip, 1): the places go round: pip is at left-of(mo, 0.3), mo is at midpoint(tuk, 900) and tuk is at right-of(pip, 1)', hint: "give one of them a mark or a point" },
  ]);
  assert.deepEqual(await beginning("pip: right-of(pip, 1)"), [[2, '"pip" begins at right-of(pip, 1): the places go round: pip is at right-of(pip, 1)']]);
  // Tuk's place rests on two that go round, and is not one of them.
  assert.deepEqual(await beginning("tuk: right-of(pip, 1)", "pip: left-of(mo, 1)", "mo: right-of(pip, 1)"), [[2, '"mo" begins at right-of(pip, 1): the places go round: pip is at left-of(mo, 1) and mo is at right-of(pip, 1)']]);
  // Mo's place and the walks rest on Pip's, which is the mistake.
  assert.deepEqual((await refusedPlaces(["pip: reeds", "mo: right-of(pip, 1)", "tuk: right"], ["tuk walk to=left-of(pip, 1)", "pip walk to=left", "mo walk to=left", "tuk walk to=tree"])).map((i) => [i.line, i.message]), [
    [2, '"pip" begins at reeds: no place is called "reeds"'],
    [12, '"tuk" walks to tree: no place is called "tree"'],
  ]);
  assert.deepEqual(await beginning("pip: 2s"), [[2, "places.pip=2s: places.pip is no time, and has no unit"]]);
  assert.deepEqual(await beginning("pip: prev.length"), [[2, "places.pip=prev.length: no line is above the scene's own values"]]);
  assert.deepEqual(await beginning("pip: prev.end"), [[2, "places.pip=prev.end: only arrive takes a moment of a line"]]);
  assert.deepEqual(await beginning("pip: left-of(mo"), [[2, 'places.pip=left-of(mo: left-of( has no ")" after it']]);
  assert.deepEqual(await beginning("pip: 300 px"), [[2, 'places.pip=300 px: "px" comes after what is a value already']]);
});

test("where a character begins, written among the values, is refused with a hint of places", async () => {
  for (const value of ["pip: 300", "pip.pos: 300", "pip.pos.x: 300"]) {
    const checked = await check(placing(["pip: left"], [], value));
    assert.ok("issues" in checked && checked.issues.length === 1, value);
    assert.match(checked.issues[0]!.hint, / \(what a scene begins with is not among its values: places: \{ pip: 300 \}\)$/, value);
  }
});

test("each construction is described, and its example is one of it", async () => {
  assert.deepEqual(Object.keys(plugin.script.constructions), ["left-of", "right-of", "midpoint"]);
  for (const [name, { description, example }] of Object.entries(plugin.script.constructions)) {
    assert.ok(description.length > 20, `${name} says what it is`);
    // Tuk may go where the example says, with Pip and Mo on the stage.
    const { walks } = await xs(["pip: left", "mo: right", "tuk: off-right"], [`tuk walk to=${example}`]);
    assert.ok(example.startsWith(`${name}(`) && walks.length === 1, example);
  }
});

test("each action is described, and its example is a line of a script that passes its schema", async () => {
  assert.deepEqual(Object.keys(plugin.script.actions), ["walk", "jump", "turn", "look-at", "wave", "point", "stand", "background"]);
  for (const [name, { description, example, values }] of Object.entries(plugin.script.actions)) {
    assert.ok(description.length > 20, `${name} says what it does`);
    const read = readScript(example);
    assert.deepEqual(read.issues, []);
    const [line] = linesIn(read.items);
    assert.equal(line!.action, name);
    assert.equal((await values["~standard"].validate(plainValues(line!.values))).issues, undefined, `${name}'s example`);
    assert.ok(values["~standard"].jsonSchema.input({ target: "draft-2020-12" }), `${name}'s JSON Schema`);
  }
  const { walk } = plugin.script.actions;
  for (const to of ["midpoint(pip, 300)", "left-of(midpoint(pip, mo), near)", "left", "900"]) assert.equal((await walk.values["~standard"].validate(plainValues({ to }, plugin.script.names))).issues, undefined, to);
});

test("the check refuses a time that has none, as the tool does, with the lines it is between", async () => {
  assert.deepEqual((await issuesOf(["[w] pip walk to=middle", "& narrator say: Pip walks.", "& pip say @ w.end: Here."])).map((i) => [i.line, i.also, i.message]), [
    [8, [6], "it goes round: line 6 waits for line 8 and line 8 waits for line 6"],
  ]);
  assert.deepEqual((await issuesOf(["in order:", "  under:", "    pip walk to=middle", "  narrator say: Pip walks."])).map((i) => [i.line, i.also, i.message]), [
    [8, [7], "an action is never under the rest: cut, it would leave pip where only the voices know"],
  ]);
  // Where each stands is followed in the order written, whichever blocks the walks are in.
  assert.deepEqual((await issuesOf(["together:", "  mo walk to=middle", "  in order:", "    pip walk to=right", "    pip walk to=middle"])).map((i) => [i.line, i.message]), [
    [10, '"pip" walks to middle, where "mo" stands'],
  ]);
});

test("the guide's example is a cartoon the plugin takes as a script, against the library, and compiles", async () => {
  const examples = [...plugin.script.guide.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]!);
  assert.equal(examples.length, 1);
  assert.equal(parse(examples[0]!).use, plugin.scene);
  const script = written(examples[0]!);
  assert.deepEqual(script.issues, []);
  const checked = await check(examples[0]!);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  // It shows what a script has so far: two scenes, every action, lines by the narrator, by characters and
  // by a voice of the file's cast, every kind of block, and a value set on every level.
  assert.equal(checked.scenes.length, 2);
  const lines = checked.scenes.flatMap((scene) => linesIn(scene.items));
  assert.deepEqual(new Set(lines.map((line) => line.action)), new Set(["say", ...Object.keys(plugin.script.actions)]));
  assert.deepEqual(new Set(lines.filter((line) => "text" in line).map((line) => line.who)), new Set(["narrator", "pip", "mo", "radio"]));
  const kinds = new Set<string>();
  const look = (item: ScriptItem) => {
    if (item.anchor) kinds.add("@");
    if (!isBlock(item)) return;
    kinds.add(item.joined ? "&" : item.under ? "under" : item.order);
    item.items.forEach(look);
  };
  script.scenes.flatMap((scene) => scene.items).forEach(look);
  assert.deepEqual([...kinds].sort(), ["&", "@", "ending together", "in order", "together", "under"]);
  const blocks: Record<string, string>[] = [];
  const values = (item: ScriptItem) => {
    if (!isBlock(item)) return;
    if (item.values) blocks.push(item.values);
    item.items.forEach(values);
  };
  script.scenes.flatMap((scene) => scene.items).forEach(values);
  assert.deepEqual([Object.keys(script.values!), script.scenes.map((scene) => Object.keys(scene.values!)), blocks], [["beat", "pause"], [[], ["beat", "pond"]], [{ pause: "beat / 2" }]]);
  assert.deepEqual(script.scenes.flatMap((scene) => linesIn(scene.items)).filter((line) => line.action === "walk").map((line) => line.values), [{ to: "middle" }, { to: "left-of(mo, near)" }, { to: "off-right", speed: "slow" }]);
  // In the second scene Mo is beside a point of the scene's own, and Pip comes beside Mo.
  assert.deepEqual(checked.scenes.map((scene) => Object.values((scene.setting as unknown as Setting).characters).map(({ at }) => at[0])), [[-250, 1440], [-250, 1340]]);
  assert.deepEqual(lines.flatMap((line) => (line.action === "walk" && "values" in line ? [(line.values as unknown as Walk).to[0]] : [])), [960, 1340 - 276, 2170]);
  assert.deepEqual(checked.scenes.map((scene) => scene.pause), [0.4, 0.6]);
  const said = lines.filter((line) => "text" in line).length;
  const compiled = compile(checked.scenes, Array.from({ length: said }, (_, n) => voiced(`${n}.wav`, 2)), SETTINGS, "example.yaml");
  // It changes to the night at the word, as Pip walks up to Mo.
  const [walk, told, change] = compiled.scenes[1]!.lines;
  assert.deepEqual([change!.who, change!.action, "values" in change! && change.values], ["scene", "background", { to: "night" }]);
  assert.ok("text" in told! && told.text.includes("the night falls") && change!.from > told.from && change!.from < walk!.from + walk!.frames);
  assert.equal(pictures(compiled).length, compiled.frames);
  // The second scene begins on the frame the first ends on.
  assert.equal(compiled.scenes[1]!.from, compiled.scenes[0]!.frames);
  assert.equal(compiled.frames, compiled.scenes[0]!.frames + compiled.scenes[1]!.frames);
});
