// A plugin's video as one file: its keys split between the tool and the plugin, its settings in
// layers (the server's, the project's package.json, the file's, a profile's), its lines from the
// plan, and its format from the plugin's stage.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { ClipJson } from "./clip.ts";
import { formatOf, linesOf, readVideoFile, scriptOf, writtenScript } from "./video-file.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-file-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A project `name` whose package.json says this of "ai-videos" (a plugin and settings), its video files, and its library.yaml if given. */
async function project(name: string, settings: Record<string, unknown>, files: Record<string, string>, library?: string) {
  const root = path.join(scratch, name);
  await mkdir(path.join(root, "videos"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "plugin.mjs", ...settings } }));
  await writeFile(path.join(root, "plugin.mjs"), "");
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(root, "videos", file), text);
  if (library !== undefined) await writeFile(path.join(root, "library.yaml"), library);
  return root;
}

/** A library of two characters, each with its voice and a drawing of the plugin's, and a background. */
const LIBRARY = `characters:
  pip: { voice: am_puck, parts: { body: [] } }
  mo: { voice: bf_emma, parts: { body: [] } }
backgrounds:
  meadow: { fill: "#bfe3ff" }
`;

const FILE = `use: cartoon
loudness: -16
cast: { mo: bm_fable, tuk: am_puck }
timing: { gap: 0.2 }
characters: { pip: {} }
scenes: []
`;

test("the file's own keys are the tool's settings and use:, the rest is the plugin's source", async () => {
  const root = await project("split", {}, { "meet.yaml": FILE });
  const video = await readVideoFile(path.join(root, "videos", "meet.yaml"));
  assert.equal(video.name, "meet");
  assert.equal(video.use, "cartoon");
  assert.deepEqual(video.source, { characters: { pip: {} }, scenes: [] });
  assert.equal(video.cache, path.join(root, ".cache", "meet"));
  assert.equal(video.out, path.join(root, "out", "meet"));
  assert.equal(video.profile, undefined);
  assert.equal(video.library, undefined, "a project with no library.yaml has none");
  assert.deepEqual(video.settings.cast, { mo: "bm_fable", tuk: "am_puck" });
});

test("the library: each character's voice is the project's cast, and the plugin gets the rest", async () => {
  const root = await project("library", {}, { "meet.yaml": "use: cartoon\nscenes: []\n" }, LIBRARY);
  const video = await readVideoFile(path.join(root, "videos", "meet.yaml"));
  assert.deepEqual(video.settings.cast, { pip: "am_puck", mo: "bf_emma" });
  assert.deepEqual(video.library, {
    file: path.join(root, "library.yaml"),
    raw: { characters: { pip: { parts: { body: [] } }, mo: { parts: { body: [] } } }, backgrounds: { meadow: { fill: "#bfe3ff" } } },
  });
});

test("settings in layers: the server's, the project's over them, the file's, then a profile's", async () => {
  const project_ = { voice: "am_michael", fps: 24, loudness: -22, timing: { lead: 1 }, outputs: { web: true } };
  const root = await project("layers", project_, { "meet.yaml": FILE }, LIBRARY);
  const file = path.join(root, "videos", "meet.yaml");
  const { settings } = await readVideoFile(file);
  assert.equal(settings.speed, 1); // the server's: set nowhere else
  assert.equal(settings.voice, "am_michael"); // the project's
  assert.equal(settings.fps, 24);
  assert.equal(settings.loudness, -16); // the file's, over the project's
  // Tables merge key by key: the file's speakers over the library's, the project's lead under the file's gap.
  assert.deepEqual(settings.cast, { pip: "am_puck", mo: "bm_fable", tuk: "am_puck" });
  assert.deepEqual(settings.timing, { lead: 1, gap: 0.2, tail: 1, moves: { slowest: 0.5, fastest: 2 } });
  assert.equal(settings.quality, "high");
  // What is made: the server's video, and the project's page over its default.
  assert.deepEqual(settings.outputs, { video: true, web: true });
  const { settings: own } = await readVideoFile(path.join(await project("outputs", {}, { "a.yaml": "use: cartoon\noutputs: { video: false, web: true }\n" }), "videos", "a.yaml"));
  assert.deepEqual(own.outputs, { video: false, web: true });
  const { settings: plain } = await readVideoFile(path.join(await project("plain", {}, { "a.yaml": "use: cartoon\n" }), "videos", "a.yaml"));
  assert.deepEqual(plain.outputs, { video: true, web: false }, "the server's: the video, and no page");

  // A profile goes over everything, and names the finished files.
  const quiet = await readVideoFile(file, "quiet");
  assert.equal(quiet.settings.loudness, -20);
  assert.equal(quiet.settings.voice, "am_michael");
  assert.equal(quiet.out, path.join(root, "out", "meet-quiet"));
  assert.equal((await readVideoFile(file, "youtube")).settings.loudness, -14);
  const draft = await readVideoFile(file, "draft");
  assert.equal(draft.settings.quality, "draft");
  assert.equal(draft.settings.loudness, -16);
  await assert.rejects(readVideoFile(file, "loud"), /No profile "loud": the profiles are youtube, quiet, draft/);
});

test("a mistake is reported against the file that holds it", async () => {
  const bad = await project("bad-project", { loudness: 3, formats: ["landscape"] }, { "a.yaml": "use: cartoon\n" });
  await assert.rejects(readVideoFile(path.join(bad, "videos", "a.yaml")), (e: Error) => {
    assert.match(e.message, /package\.json: "ai-videos" is not valid/);
    assert.match(e.message, /loudness/);
    assert.match(e.message, /formats/); // a video file's format is its plugin's stage
    return true;
  });
  const root = await project("bad-file", {}, {
    "loud.yaml": "use: cartoon\nloudness: 3\n",
    "nouse.yaml": "characters: {}\n",
    "list.yaml": "- use: cartoon\n",
    "Bad_Name.yaml": "use: cartoon\n",
  });
  const file = (name: string) => path.join(root, "videos", name);
  await assert.rejects(readVideoFile(file("loud.yaml")), /loud\.yaml: a setting is not valid:[\s\S]*loudness/);
  await assert.rejects(readVideoFile(file("nouse.yaml")), /nouse\.yaml: write use: <the scene its plugin draws> on top/);
  await assert.rejects(readVideoFile(file("list.yaml")), /list\.yaml: a video file is a mapping/);
  await assert.rejects(readVideoFile(file("Bad_Name.yaml")), /a video file is <name>\.yaml, its name in lowercase letters/);
  await assert.rejects(readVideoFile(file("none.yaml")), /No video file at .*none\.yaml/);

  // A voice has one home: the library's character.
  const cast = await project("cast-in-package", { cast: { pip: "am_puck" } }, { "a.yaml": "use: cartoon\n" });
  await assert.rejects(readVideoFile(path.join(cast, "videos", "a.yaml")), /package\.json: "ai-videos" is not valid:[\s\S]*a character's voice is in library\.yaml/);
  const library = async (name: string, text: string) => readVideoFile(path.join(await project(name, {}, { "a.yaml": "use: cartoon\n" }, text), "videos", "a.yaml"));
  await assert.rejects(library("library-yaml", "characters: [\n"), /library\.yaml is not YAML/);
  await assert.rejects(library("library-list", "- pip\n"), /library\.yaml: a library is a mapping/);
  await assert.rejects(library("library-voiceless", "characters:\n  pip: { parts: {} }\n"), /library\.yaml: its characters are not valid:[\s\S]*give each character its voice[\s\S]*characters\.pip\.voice/);
  await assert.rejects(library("library-name", "characters:\n  Pip: { voice: am_puck }\n"), /library\.yaml: its characters are not valid:[\s\S]*name is lowercase[\s\S]*characters\.Pip/);
});

test("a video file needs a plugin, named by the package.json above it", async () => {
  const root = path.join(scratch, "no-plugin");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "no-plugin" }));
  await writeFile(path.join(root, "a.yaml"), "use: cartoon\n");
  await assert.rejects(readVideoFile(path.join(root, "a.yaml")), /no package\.json above it names a plugin/);
});

/** A plan of three beats, its texts out of order. */
const PLAN: ClipJson = {
  format: "ai-videos-clip",
  version: 1,
  made: { by: "a test", from: "this table" },
  duration: 6,
  events: [
    { name: "start", at: 0, span: "hold" },
    { name: "turn", at: 2, span: "move" },
    { name: "rest", at: 4, span: "hold" },
  ],
  texts: [
    { text: "Rounded apart from its event.", speaker: "mo", from: 4.0004, to: 6 },
    { text: "First.", from: 0, to: 2 },
    { text: "Between two events: the last before it.", from: 3, to: 4 },
    { text: "A second on the same event.", from: 3.5, to: 4 },
  ],
};

test("each text becomes a line cued to the event it begins at, in time order", () => {
  assert.deepEqual(linesOf(PLAN), [
    { text: "First.", cue: "start" },
    { text: "Between two events: the last before it.", cue: "turn" },
    { text: "A second on the same event.", cue: "turn" },
    { speaker: "mo", text: "Rounded apart from its event.", cue: "rest" },
  ]);
});

test("the script: one scene by the file's name, its lines the plan's, every speaker with a voice", async () => {
  const root = await project("script", { voice: "af_heart" }, { "meet.yaml": FILE, "alone.yaml": "use: cartoon\n" });
  const script = scriptOf(await readVideoFile(path.join(root, "videos", "meet.yaml")), PLAN);
  assert.equal(script.title, "meet");
  assert.equal(script.loudness, -16);
  assert.deepEqual(script.scenes, [
    {
      id: "meet",
      limits: {},
      narration: linesOf(PLAN),
    },
  ]);
  // The plan's limits, when it gives some, are the scene's.
  const limited = scriptOf(await readVideoFile(path.join(root, "videos", "meet.yaml")), PLAN, { turn: { fastest: 3 } });
  assert.deepEqual(limited.scenes, [{ ...script.scenes[0]!, limits: { turn: { fastest: 3 } } }]);
  const alone = await readVideoFile(path.join(root, "videos", "alone.yaml"));
  assert.throws(
    () => scriptOf(alone, PLAN),
    /alone\.yaml: mo says "Rounded apart from its event\.", and the cast \(it is empty\) gives mo no voice: give mo a voice: under the character in .*library\.yaml, or under cast: in the file/,
  );
  assert.throws(() => scriptOf(alone, { ...PLAN, texts: [] }), /alone\.yaml has no line to say/);
});

test("a file written as a script: each scene's own keys, and its script's lines with their lines in the file", async () => {
  const text = [
    "use: cartoon", // line 1
    "",
    "scenes:",
    "  - background: meadow", // 4: the scene
    "    places: { pip: off-left }",
    "    script: |", // 6
    "      pip walk to=middle", // 7
    "",
    "      # a note",
    "      narrator say: This is Pip.", // 10
    "  - script: |",
    "      pip wave hello", // 12
    "    background: night", // a scene's keys in any order
    "",
  ].join("\r\n");
  const root = await project("as-script", {}, { "hello.yaml": text, "beats.yaml": "use: cartoon\nscenes:\n  - beats: []\n" });
  const video = await readVideoFile(path.join(root, "videos", "hello.yaml"));
  assert.equal(video.text, text);
  assert.deepEqual(video.script, {
    scenes: [
      {
        line: 4,
        setting: { background: "meadow", places: { pip: "off-left" } },
        items: [
          { line: 7, who: "pip", action: "walk", values: { to: "middle" } },
          { line: 10, who: "narrator", action: "say", values: {}, text: "This is Pip." },
        ],
      },
      { line: 11, setting: { background: "night" }, items: [] },
    ],
    issues: [{ line: 12, message: '"hello" is not a value', hint: "write a value as name=value, before the colon, and what is said after it: pip say: Hello!" }],
  });
  // The plugin's source is the file as before: the script path reads its own.
  assert.deepEqual(Object.keys(video.source), ["scenes"]);
  // A file with no script in its scenes is not one.
  assert.equal((await readVideoFile(path.join(root, "videos", "beats.yaml"))).script, undefined);
  assert.equal(writtenScript("use: cartoon\nscenes: 3\n"), undefined);
});

test("a script's blocks are in the file as they are indented, under its own margin", () => {
  const text = ["scenes:", "  - script: |", "", "      together:", "        pip say: Hi.", "        in order:", "            mo say: Hello.", "      & tuk say: Hm?", "    background: night", ""].join("\n");
  assert.deepEqual(writtenScript(text), {
    scenes: [
      {
        line: 2,
        setting: { background: "night" },
        items: [
          {
            line: 4,
            order: "together",
            joined: true,
            items: [
              {
                line: 4,
                order: "together",
                items: [
                  { line: 5, who: "pip", action: "say", values: {}, text: "Hi." },
                  { line: 6, order: "in order", items: [{ line: 7, who: "mo", action: "say", values: {}, text: "Hello." }] },
                ],
              },
              { line: 8, who: "tuk", action: "say", values: {}, text: "Hm?" },
            ],
          },
        ],
      },
    ],
    issues: [],
  });
});

test("the values of a file and of a scene are formulas, each with its line; they are no key of the plugin's", async () => {
  const text = [
    "use: cartoon", // line 1
    "timing: { gap: 0.2 }",
    "values: { pause: 0.8s, walk.speed: slow, near: 150 }", // 3
    "scenes:",
    "  - background: meadow", // 5
    "    values:",
    "      near: near-by * 2 + 20", // 7
    '      "pip.near": "1.50"',
    "      share: 50%",
    "    script: |",
    "      pip say: Hi.", // 11
    "  - script: |",
    "      pip say: Ho.",
    "",
  ].join("\n");
  const root = await project("with-values", {}, { "hello.yaml": text });
  const video = await readVideoFile(path.join(root, "videos", "hello.yaml"));
  const say = (line: number, words: string) => ({ line, who: "pip", action: "say", values: {}, text: words });
  assert.deepEqual(video.script, {
    values: { pause: { line: 3, text: "0.8s" }, "walk.speed": { line: 3, text: "slow" }, near: { line: 3, text: "150" } },
    scenes: [
      {
        line: 5,
        setting: { background: "meadow" },
        values: { near: { line: 7, text: "near-by * 2 + 20" }, "pip.near": { line: 8, text: "1.50" }, share: { line: 9, text: "50%" } },
        items: [say(11, "Hi.")],
      },
      { line: 12, setting: {}, items: [say(13, "Ho.")] },
    ],
    issues: [],
  });
  assert.equal(video.settings.timing.gap, 0.2, "a setting is the tool's still");
});

test("a number in values is taken as it is written, as a line's is, and not as YAML reads it", () => {
  const script = (row: string) => writtenScript(["values:", `  ${row}`, "scenes:", "  - script: |", "      pip say: Hi.", ""].join("\n"))!;
  for (const number of ["2.50", "010", "+2", "-3", "12345678901234567890"]) assert.deepEqual(script(`near: ${number}`).values, { near: { line: 2, text: number } });
  // What YAML has as a number and a formula does not is refused, as it is on a line.
  assert.deepEqual(script("near: 1e3").issues.map(({ line, message }) => [line, message]), [[2, 'near=1e3: "1e" has no unit that is known']]);
  assert.deepEqual(script("near: 0x10").issues.map(({ line, message }) => [line, message]), [[2, 'near=0x10: "0x" has no unit that is known']]);
});

test("values that do not read, and a key on top of a script that nothing reads, are refused with their lines", () => {
  const scene = ["scenes:", "  - script: |", "      pip say: Hi."];
  const refused = (...rows: string[]) => writtenScript([...rows, ...scene, ""].join("\n"))!.issues.map(({ line, message }) => [line, message]);
  assert.deepEqual(refused("values:", "  pause: 2 *", "  near: 150px", "  on: true", "  none:", "  list: [1, 2]", "  walk: { speed: slow, takes: 2s }"), [
    [2, 'pause=2 *: something is missing after "*"'],
    [3, 'near=150px: "150px" has no unit that is known'],
    [4, "on has no value"],
    [5, "none has no value"],
    [6, "list has no value"],
    [7, "walk has values of its own"],
  ]);
  assert.equal(writtenScript(["values:", "  walk: { speed: slow, takes: 2s }", ...scene, ""].join("\n"))!.issues[0]!.hint, "write each on a row: walk.speed: slow, walk.takes: 2s");
  // A comma ends a value in braces: what is left of it is none.
  assert.deepEqual(refused("values: { meet: midpoint(door, tree) }"), [
    [1, 'meet=midpoint(door: "(" comes after what is a value already'],
    [1, "tree) has no value"],
  ]);
  assert.deepEqual(refused("values: 0.5s"), [[1, "these values are not a mapping"]]);
  assert.deepEqual(writtenScript(["use: cartoon", "valuse: { pause: 1s }", "outputs: { web: true }", ...scene, ""].join("\n"))!.issues, [
    {
      line: 2,
      message: 'nothing reads "valuse"',
      hint: "on top of a script are use, voice, cast, speed, fps, loudness, timing, quality, outputs, values and scenes: did you mean values?",
    },
  ]);
  const [inScene] = writtenScript(["scenes:", "  - values: { pause: 1 s }", "    script: |", "      pip say: Hi.", ""].join("\n"))!.issues;
  assert.deepEqual([inScene!.line, inScene!.message], [2, 'pause=1 s: "s" comes after what is a value already']);
});

test("a script is a block of lines, one in every scene", () => {
  const block = "write its lines under script: |, one under another";
  const script = writtenScript('scenes:\n  - script: "pip say: Hi."\n  - background: night\n  - script: |\n      # nothing yet\n  - night\n  - script: >\n      pip say: Hi.\n');
  assert.deepEqual(script?.issues, [
    { line: 2, message: "this script is not a block of lines", hint: block },
    { line: 3, message: "this scene has no script", hint: block },
    { line: 4, message: "this script has no line", hint: block },
    { line: 6, message: "this scene is not a mapping", hint: `a scene has its own keys and its script: ${block}` },
    { line: 7, message: "this script is not a block of lines", hint: block },
  ]);
  assert.equal(script?.scenes.length, 4);
});

test("the format is the one of the stage's shape", () => {
  assert.equal(formatOf("cartoon", { width: 1920, height: 1080 }), "landscape");
  assert.equal(formatOf("square", { width: 160, height: 90 }), "landscape");
  assert.equal(formatOf("tall", { width: 540, height: 960 }), "portrait");
  assert.throws(() => formatOf("box", { width: 100, height: 100 }), /the box stage is 100 by 100: no format has its shape \(landscape 1920 by 1080, portrait 1080 by 1920\)/);
});
