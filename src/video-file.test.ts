// A plugin's video as one file: its keys split between the tool and the plugin, its settings in
// layers (the server's, the project's package.json, the file's, a profile's), its lines from the
// plan, and its format from the plugin's stage.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { ClipJson } from "./clip.ts";
import { formatOf, linesOf, readVideoFile, scriptOf } from "./video-file.ts";

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
  const project_ = { voice: "am_michael", fps: 24, loudness: -22, timing: { lead: 1 } };
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

test("the script: one made clip scene by the file's name, its lines the plan's, every speaker with a voice", async () => {
  const root = await project("script", { voice: "af_heart" }, { "meet.yaml": FILE, "alone.yaml": "use: cartoon\n" });
  const script = scriptOf(await readVideoFile(path.join(root, "videos", "meet.yaml")), "landscape", PLAN);
  assert.equal(script.title, "meet");
  assert.deepEqual(script.formats, ["landscape"]);
  assert.equal(script.loudness, -16);
  assert.deepEqual(script.scenes, [
    {
      id: "meet",
      scene: "clip",
      make: "meet",
      limits: {},
      narration: linesOf(PLAN).map((line) => ({ ...line, pause: 0 })),
    },
  ]);
  const alone = await readVideoFile(path.join(root, "videos", "alone.yaml"));
  assert.throws(
    () => scriptOf(alone, "landscape", PLAN),
    /alone\.yaml: mo says "Rounded apart from its event\.", and the cast \(it is empty\) gives mo no voice: give mo a voice: under the character in .*library\.yaml, or under cast: in the file/,
  );
  assert.throws(() => scriptOf(alone, "landscape", { ...PLAN, texts: [] }), /alone\.yaml has no line to say/);
});

test("the format is the one of the stage's shape", () => {
  assert.equal(formatOf("cartoon", { width: 1920, height: 1080 }), "landscape");
  assert.equal(formatOf("square", { width: 160, height: 90 }), "landscape");
  assert.equal(formatOf("tall", { width: 540, height: 960 }), "portrait");
  assert.throws(() => formatOf("box", { width: 100, height: 100 }), /the box stage is 100 by 100: no format has its shape \(landscape 1920 by 1080, portrait 1080 by 1920\)/);
});
