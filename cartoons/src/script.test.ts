// A cartoon written as a script (script.ts), read, checked and compiled as the video tool does it:
// hello-script on its frames, in plain numbers; what the check refuses, each with its line and a
// hint; and the guide's example. The voices are given here as lengths: speaking is the tool's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NARRATOR, SAY, checkScenario, compile, readScript, type Issue, type Voiced, type WrittenScript } from "ai-videos/plugin";
import { parse } from "yaml";
import plugin from "./plugin.ts";
import { MARKS, PACE } from "./scenario.ts";

const root = path.join(import.meta.dirname, "..");
/** The project's library as the tool gives it to the plugin, without each character's voice; and who has one. */
const { library, speakers } = (() => {
  const file = path.join(root, "library.yaml");
  const raw = parse(readFileSync(file, "utf8"));
  for (const character of Object.values(raw.characters)) delete (character as { voice?: string }).voice;
  return { library: { file, raw }, speakers: Object.keys(raw.characters) };
})();

/**
 * A cartoon's file as the tool reads a script: each scene's own keys, and its script's lines, each
 * with its line in the file.
 */
function written(text: string): WrittenScript {
  const rows = text.split(/\r?\n/);
  let next = 0;
  const issues: Issue[] = [];
  const scenes = (parse(text).scenes as Record<string, unknown>[]).map(({ script, ...setting }) => {
    // The scene's `- ` row, then its script's `|` row: the lines begin on the row after it.
    const begins = rows.findIndex((row, i) => i >= next && /^\s*- /.test(row));
    const header = rows.findIndex((row, i) => i >= begins && /^\s*(- )?script: \|/.test(row));
    next = header + 1;
    const read = readScript(String(script), header + 2);
    issues.push(...read.issues);
    return { line: begins + 1, setting, lines: read.lines };
  });
  return { scenes, issues };
}
const check = (text: string) => checkScenario(plugin.script, written(text), library, speakers);
/** The mistakes the check finds in a scene of the meadow with Pip and Mo, and these lines. */
const SCENE = ["scenes:", "  - background: meadow", "    places: { pip: off-left, mo: right }", "    faces: { mo: left }", "    script: |"];
const issuesOf = async (lines: string[], scene = SCENE) => {
  const checked = await check([...scene, ...lines.map((line) => `      ${line}`), ""].join("\n"));
  assert.ok("issues" in checked, "it is refused");
  return checked.issues;
};

/** The tool's timing, and cartoons' 30 frames a second. */
const TIMING = { fps: 30, lead: 0.6, gap: 0.4, tail: 1 };
const HELLO = readFileSync(path.join(root, "videos", "hello-script.yaml"), "utf8");

test("hello-script compiles: each line and action on its frames, in the order written", async () => {
  const checked = await check(HELLO);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  const voices = [{ file: "1f0e3dad99908345f743.wav", duration: 2.2 }, { file: "b7a56873cd771f2c446d.wav", duration: 1.22 }];
  assert.deepEqual(compile(checked.scenes, voices, TIMING, "../../videos/hello-script.yaml"), {
    format: "ai-videos-compiled",
    version: 1,
    made: { by: "ai-videos compile", from: "../../videos/hello-script.yaml" },
    fps: 30,
    frames: 288,
    scenes: [
      {
        from: 0,
        frames: 288,
        // Pip begins off the stage, on the ground, facing right as drawn.
        setting: { background: "meadow", characters: { pip: { at: [-250, 880], facing: 1 } } },
        lines: [
          // After the lead, 18 frames: 1210 px at 320 px a second, 3.781 s.
          { line: 10, who: "pip", action: "walk", from: 18, frames: 113, values: { from: [-250, 880], to: [960, 880] } },
          // Each line a gap, 12 frames, after the one before it: the walk is over before the narrator begins.
          { line: 11, who: "narrator", action: "say", from: 143, frames: 66, text: "This is Pip. Pip walks into the meadow.", file: "1f0e3dad99908345f743.wav" },
          { line: 12, who: "narrator", action: "say", from: 221, frames: 37, text: "And here, Pip stops.", file: "b7a56873cd771f2c446d.wav" },
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
  for (const text of [HELLO, example]) {
    const script = written(text);
    const checked = await checkScenario(plugin.script, script, library, speakers);
    assert.ok("scenes" in checked);
    const said = script.scenes.flatMap((scene) => scene.lines).filter((line) => line.action === SAY);
    const voices = said.map((_, n): Voiced => ({ file: `${String(n).padStart(20, "0")}.wav`, duration: 1 + n / 7 }));
    const compiled = compile(checked.scenes, voices, TIMING, "../../videos/a-cartoon.yaml");
    const names = new Set([NARRATOR, SAY, ...Object.keys(plugin.script.actions), ...Object.keys(library.raw.characters), ...Object.keys(library.raw.backgrounds)]);
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
    // Every line of the script is there, on frames that follow each other.
    const lines = compiled.scenes.flatMap((scene) => scene.lines);
    assert.deepEqual(lines.map((line) => [line.line, line.who, line.action]), script.scenes.flatMap((scene) => scene.lines.map((line) => [line.line, line.who, line.action])));
    for (const line of lines) assert.ok(Number.isInteger(line.from) && Number.isInteger(line.frames) && line.frames > 0, `line ${line.line}`);
    for (const scene of compiled.scenes) {
      scene.lines.forEach((line, i) => assert.ok(line.from >= (i === 0 ? scene.from : scene.lines[i - 1]!.from + scene.lines[i - 1]!.frames), `line ${line.line} begins after the one before`));
    }
  }
});

test("the check refuses an unknown action, a wrong value and an unknown name, each with its line and a hint", async () => {
  assert.deepEqual(await issuesOf(["pip wlak to=middle"]), [{ line: 6, message: 'no action is named "wlak"', hint: "the actions are say and walk: did you mean walk?" }]);
  assert.deepEqual(await issuesOf(["narrator say: Here is Pip.", "pip walk to=centre"]), [
    { line: 7, message: "walk, to=centre: it is one of the marks: off-left, left, middle, right, off-right", hint: "as in: pip walk to=middle" },
  ]);
  assert.deepEqual((await issuesOf(["pip walk"])).map((i) => i.message), ["walk, to: it is one of the marks: off-left, left, middle, right, off-right"]);
  assert.match((await issuesOf(["pip walk to=middle speed=3"]))[0]!.message, /^walk: Unrecognized key: "speed"$/);
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
  assert.deepEqual(moved.scenes[0]!.lines.map((line) => ("length" in line ? [line.values, line.length] : line.text)), [
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
    assert.equal(read.lines[0]!.action, name);
    assert.equal((await values["~standard"].validate(read.lines[0]!.values)).issues, undefined, `${name}'s example`);
    assert.ok(values["~standard"].jsonSchema.input({ target: "draft-2020-12" }), `${name}'s JSON Schema`);
  }
});

test("the guide's example is a cartoon the plugin takes as a script, against the library, and compiles", async () => {
  const examples = [...plugin.script.guide.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]!);
  assert.equal(examples.length, 1);
  assert.equal(parse(examples[0]!).use, plugin.scene);
  const script = written(examples[0]!);
  assert.deepEqual(script.issues, []);
  const checked = await checkScenario(plugin.script, script, library, speakers);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  // It shows what a script has so far: two scenes, a walk, and lines by the narrator and by characters.
  assert.equal(checked.scenes.length, 2);
  const lines = checked.scenes.flatMap((scene) => scene.lines);
  assert.deepEqual(new Set(lines.map((line) => line.action)), new Set(["say", "walk"]));
  assert.deepEqual(new Set(lines.filter((line) => "text" in line).map((line) => line.who)), new Set(["narrator", "pip", "mo"]));
  const said = lines.filter((line) => "text" in line).length;
  const compiled = compile(checked.scenes, Array.from({ length: said }, (_, n) => ({ file: `${n}.wav`, duration: 2 })), TIMING, "example.yaml");
  // The second scene begins on the frame the first ends on.
  assert.equal(compiled.scenes[1]!.from, compiled.scenes[0]!.frames);
  assert.equal(compiled.frames, compiled.scenes[0]!.frames + compiled.scenes[1]!.frames);
});
