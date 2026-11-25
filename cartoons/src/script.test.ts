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

const root = path.join(import.meta.dirname, "..");
/** The project's library as the tool gives it to the plugin, without each character's voice; and who has one. */
const { library, speakers } = (() => {
  const file = path.join(root, "library.yaml");
  const raw = parse(readFileSync(file, "utf8"));
  for (const character of Object.values(raw.characters)) delete (character as { voice?: string }).voice;
  return { library: { file, raw }, speakers: Object.keys(raw.characters) };
})();

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
  const file = parse(text) as { values?: unknown; scenes: Record<string, unknown>[] };
  const scenes = file.scenes.map(({ script, values, ...setting }) => {
    // The scene's `- ` row, then its script's `|` row: the lines begin on the row after it.
    const begins = rows.findIndex((row, i) => i >= next && /^\s*- /.test(row));
    const header = rows.findIndex((row, i) => i >= begins && /^\s*(- )?script: \|/.test(row));
    next = header + 1;
    const read = readScript(String(script), header + 2);
    issues.push(...read.issues);
    return { line: begins + 1, setting, values: valuesOf(values, begins), items: read.items };
  });
  return { values: valuesOf(file.values, 0), scenes, issues };
}
/** Checked as the tool does it: who speaks has a voice in the library, or in the file's cast. */
const check = (text: string) => checkScenario(plugin.script, written(text), library, [...speakers, ...Object.keys(parse(text).cast ?? {})], TIMING);
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
    const compiled = compile(checked.scenes, voices, SETTINGS, "../../videos/a-cartoon.yaml");
    const cast = Object.keys(parse(text).cast ?? {});
    const names = new Set([NARRATOR, SAY, ...cast, ...Object.keys(plugin.script.actions), ...Object.keys(library.raw.characters), ...Object.keys(library.raw.backgrounds)]);
    const texts = new Set(said.map((line) => line.text));
    const files = new Set(["../../videos/a-cartoon.yaml", ...voices.map((voice) => voice.file)]);
    for (const [at, value] of leaves(compiled)) {
      const where = at.join(".");
      if (typeof value === "number") assert.ok(Number.isFinite(value), where);
      else if (typeof value !== "string") assert.fail(`${where} is ${value}`);
      else if (where === "format" || where === "made.by") assert.match(value, /^ai-videos[ -]compiled?$/);
      else if (at.at(-1) === "text") assert.ok(texts.has(value), `${where}: ${value}`);
      else if (at.at(-1) === "file" || where === "made.from") assert.ok(files.has(value), `${where}: ${value}`);
      else assert.ok(names.has(value), `${where} is a name: ${value}`);
      // A mark is written in a script, and compiled to its point.
      assert.ok(!(String(value) in MARKS), `${where} is the mark ${value}`);
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
  return JSON.parse(JSON.stringify(compile(checked.scenes, voices, SETTINGS, "x.yaml")));
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

/** all-at-once's lines, spoken: each as long as it is in its own voice, in hundredths of a second. */
const AT_ONCE_VOICES = [210, 98, 124, 200, 86, 204, 197, 237, 167, 118, 108, 116, 196, 252, 294, 115, 236, 82, 148].map((hundredths, n) => voiced(`${n}.wav`, hundredths / 100));

test("all-at-once: a walk under words, a chorus, an interruption at a word, a radio that is waited for, and a murmur cut where the talk over it ends", async () => {
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
  const [one, five, why, which] = [of("One reed"), of("Five reeds"), of("Why is"), of("And which")];
  assert.equal(one.from, why.from, "Mo murmurs as Pip begins");
  assert.equal(five.end, which.end, "and is cut where the third of them ends");
  assert.ok(five.line.frames < AT_ONCE_VOICES[14]!.mouth.length);
  assert.equal(five.line.mouth.length, five.line.frames);
  assert.equal(of("That, only").from, which.end + 12);

  // Two who speak at once both move their mouths, and the cut one's is shut after the cut.
  const open = (frame: number) => Object.keys(shownAt(pictureOf(compiled), frame).mouths).sort();
  assert.deepEqual(open(chorus[0]!.from), ["mo", "pip"]);
  assert.ok(open(of("A badger?").from).includes("mo"));
  assert.deepEqual(open(seen.from), ["radio"]);
  const speaks = (who: string, from: number, to: number) => Array.from({ length: to - from }, (_, k) => open(from + k)).some((names) => names.includes(who));
  assert.ok(speaks("mo", five.from, five.end) && !speaks("mo", five.end, of("That, only").from));
  assert.equal(pictures(compiled).length, compiled.frames);
});

test("all-at-once, with one value changed, has another timing and nothing else of it", async () => {
  assert.match(AT_ONCE, /\nvalues: \{ beat: 0\.4s, pause: beat \}\r?\n/);
  const [before, after] = await Promise.all([AT_ONCE, AT_ONCE.replace("beat: 0.4s", "beat: 0.8s")].map((text) => compiledOf(text, AT_ONCE_VOICES)));
  assert.ok(after!.frames > before!.frames + 100, `${before!.frames} frames, and ${after!.frames}`);
  const lines = (compiled: Compiled) => compiled.scenes.flatMap((scene) => scene.lines);
  const moved = lines(after!).filter((line, k) => line.from - lines(before!)[k]!.from > 0);
  // All but the walk and the words joined to it, which the first scene begins with.
  assert.equal(moved.length, lines(before!).length - 2);
  const without = (compiled: Compiled) => lines(compiled).map(({ line, who, action, ...rest }) => [line, who, action, "text" in rest ? [rest.text, rest.file] : rest.values]);
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
  assert.deepEqual(wrong.map((i) => [i.line, i.message]), [[7, "walk, to=centre: it is one of the marks: off-left, left, middle, right, off-right"]]);
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
  assert.deepEqual(await issuesOf(["pip wlak to=middle"]), [{ line: 6, message: 'no action is named "wlak"', hint: "the actions are say and walk: did you mean walk?" }]);
  assert.deepEqual(await issuesOf(["narrator say: Here is Pip.", "pip walk to=centre"]), [
    { line: 7, message: "walk, to=centre: it is one of the marks: off-left, left, middle, right, off-right", hint: "as in: pip walk to=middle" },
  ]);
  assert.deepEqual((await issuesOf(["pip walk"])).map((i) => i.message), ["walk, to: it is one of the marks: off-left, left, middle, right, off-right"]);
  assert.match((await issuesOf(["pip walk to=middle steps=3"]))[0]!.message, /^walk: Unrecognized key: "steps"$/);
  const pop = await issuesOf(["pop walk to=middle"]);
  assert.deepEqual(pop.map((i) => [i.line, i.message]), [[6, 'no character is named "pop"']]);
  assert.match(pop[0]!.hint, /^the library has the characters pip, mo, tuk, .* and badger: did you mean pip\?$/);
  assert.deepEqual(await issuesOf(["pop say: Hello."]), [
    { line: 6, message: '"pop" is neither the narrator nor a character with a voice', hint: `the characters with a voice are ${speakers.slice(0, -1).join(", ")} and ${speakers.at(-1)}: did you mean pip?` },
  ]);
});

test("the check follows who stands where: a walk by someone the scene does not place, to its own mark, or to another's", async () => {
  assert.deepEqual(await issuesOf(["tuk walk to=middle"]), [
    { line: 6, message: '"tuk" has no place in this scene', hint: "give it the mark it begins on, in the scene's places: places: { tuk: off-left }" },
  ]);
  assert.deepEqual((await issuesOf(["narrator walk to=middle"])).map((i) => i.message), ["the narrator is nobody on the stage: only a character walks"]);
  assert.deepEqual((await issuesOf(["pip walk to=off-left"])).map((i) => i.message), ['"pip" stands at off-left already']);
  assert.deepEqual((await issuesOf(["pip walk to=right"])).map((i) => i.message), ['"pip" walks to right, where "mo" stands']);
  // Where the lines above left it: Pip is at the middle by line 7, and Mo has left the right by line 9.
  assert.deepEqual((await issuesOf(["pip walk to=middle", "pip walk to=middle"])).map((i) => [i.line, i.message]), [[7, '"pip" stands at middle already']]);
  const moved = await check([...SCENE, "      pip walk to=middle", "      mo walk to=off-right", "      mo say: Goodbye!", "      pip walk to=right", ""].join("\n"));
  assert.ok("scenes" in moved);
  assert.deepEqual(linesIn(moved.scenes[0]!.items).map((line) => ("length" in line ? [line.values, line.length] : line.text)), [
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
  assert.deepEqual(await messages("  - background: meadow", "    places: { pip: left, mo: left, tuk: off-left, mole: off-left }"), ['"pip" and "mo" both begin at left']);
  assert.deepEqual(await messages("  - background: meadow", "    places: { pip: centre }"), ["places.pip: it is one of the marks: off-left, left, middle, right, off-right"]);
  assert.deepEqual(await messages("  - background: meadow", "    faces: { mo: left }"), ['"mo" faces left, and has no place in this scene']);
  assert.deepEqual(await messages("  - background: meadow", "    faces: { pip: back }", "    places: { pip: left }"), ["faces.pip: it is left or right"]);
  const beats = await issuesOf(["narrator say: Hello."], scene("  - background: meadow", "    beats: []"));
  assert.deepEqual(beats, [
    { line: 2, message: 'Unrecognized key: "beats"', hint: "a scene has background (one of the library's), places (the mark each of its characters begins on), faces (who begins facing left) and script" },
  ]);
});

test("a scene begins with each character at its mark's point, facing 1 as drawn or -1", async () => {
  const checked = await check([...SCENE, "      mo say: Hello, Pip.", ""].join("\n"));
  assert.ok("scenes" in checked);
  assert.deepEqual(checked.scenes[0]!.setting, { background: "meadow", characters: { pip: { at: [-250, 880], facing: 1 }, mo: { at: [1440, 880], facing: -1 } } });
});

test("each action is described, and its example is a line of a script that passes its schema", async () => {
  assert.deepEqual(Object.keys(plugin.script.actions), ["walk"]);
  for (const [name, { description, example, values }] of Object.entries(plugin.script.actions)) {
    assert.ok(description.length > 20, `${name} says what it does`);
    const read = readScript(example);
    assert.deepEqual(read.issues, []);
    const [line] = linesIn(read.items);
    assert.equal(line!.action, name);
    assert.equal((await values["~standard"].validate(plainValues(line!.values))).issues, undefined, `${name}'s example`);
    assert.ok(values["~standard"].jsonSchema.input({ target: "draft-2020-12" }), `${name}'s JSON Schema`);
  }
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
  // It shows what a script has so far: two scenes, a walk, lines by the narrator, by characters and
  // by a voice of the file's cast, every kind of block, and a value set on every level.
  assert.equal(checked.scenes.length, 2);
  const lines = checked.scenes.flatMap((scene) => linesIn(scene.items));
  assert.deepEqual(new Set(lines.map((line) => line.action)), new Set(["say", "walk"]));
  assert.deepEqual(new Set(lines.filter((line) => "text" in line).map((line) => line.who)), new Set(["narrator", "pip", "mo", "radio"]));
  const kinds = new Set<string>();
  const look = (item: ScriptItem) => {
    if (item.anchor) kinds.add("@");
    if (!isBlock(item)) return;
    kinds.add(item.joined ? "&" : item.under ? "under" : item.order);
    item.items.forEach(look);
  };
  script.scenes.flatMap((scene) => scene.items).forEach(look);
  assert.deepEqual([...kinds].sort(), ["&", "@", "in order", "together", "under"]);
  const blocks: Record<string, string>[] = [];
  const values = (item: ScriptItem) => {
    if (!isBlock(item)) return;
    if (item.values) blocks.push(item.values);
    item.items.forEach(values);
  };
  script.scenes.flatMap((scene) => scene.items).forEach(values);
  assert.deepEqual([Object.keys(script.values!), script.scenes.map((scene) => Object.keys(scene.values!)), blocks], [["beat", "pause"], [[], ["beat"]], [{ pause: "beat / 2" }]]);
  assert.deepEqual(script.scenes.flatMap((scene) => linesIn(scene.items)).filter((line) => line.action === "walk").map((line) => line.values), [{ to: "middle" }, { to: "off-right", speed: "slow" }]);
  assert.deepEqual(checked.scenes.map((scene) => scene.pause), [0.4, 0.6]);
  const said = lines.filter((line) => "text" in line).length;
  const compiled = compile(checked.scenes, Array.from({ length: said }, (_, n) => voiced(`${n}.wav`, 2)), SETTINGS, "example.yaml");
  assert.equal(pictures(compiled).length, compiled.frames);
  // The second scene begins on the frame the first ends on.
  assert.equal(compiled.scenes[1]!.from, compiled.scenes[0]!.frames);
  assert.equal(compiled.frames, compiled.scenes[0]!.frames + compiled.scenes[1]!.frames);
});
