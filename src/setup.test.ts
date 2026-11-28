// What the tool needs on the disk to run offline (setup.ts): a command with a piece missing names
// it and stops before it writes or fetches anything. `setup` itself uses the network, so its test
// is `npm run video -- setup`, then a make, on empty caches (AGENTS.md, "Offline").
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { run } from "./render.ts";
import { STRESS_FILES } from "./marks.ts";
import { cachePaths, marksReady, missing, ready } from "./setup.ts";
import { SUPERTONIC, SUPERTONIC_FILES } from "./supertonic.ts";
import { KokoroProvider, MODEL, MODEL_FILES } from "./tts.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-setup-"));
after(() => rm(scratch, { recursive: true, force: true }));

const modelDir = (cache: string, model = MODEL) => path.join(cachePaths(cache).models, ...model.split("/"));
const HYPERFRAMES = JSON.parse(await readFile(path.join(ROOT, "node_modules", "hyperframes", "package.json"), "utf8")).version;

/** The tool's CLI, its cache in `cache`. */
const cli = (cache: string, args: string[]) =>
  run(process.execPath, [path.join(ROOT, "src", "cli.ts"), ...args], { cwd: ROOT, env: { ...process.env, AI_VIDEOS_CACHE: cache } });

/** A project with a plugin and one video file, videos/sq.yaml: make would start the plugin. */
async function project(name: string) {
  const dir = path.join(scratch, name);
  await mkdir(path.join(dir, "videos"), { recursive: true });
  await mkdir(path.join(dir, "src"));
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ "ai-videos": { plugin: "./src/plugin.mjs" } }));
  await writeFile(path.join(dir, "src", "plugin.mjs"), "throw new Error('started');\n");
  await writeFile(path.join(dir, "videos", "sq.yaml"), "use: square\n");
  return dir;
}

test("make on empty caches names the voice models and Chrome, and starts nothing", async () => {
  const dir = await project("empty");
  const cache = path.join(scratch, "empty-cache");
  await mkdir(cache);
  const { code, stdout, stderr } = await cli(cache, ["make", path.join(dir, "videos", "sq.yaml")]);
  assert.equal(code, 1, stderr);
  assert.ok(stderr.includes("Missing, and not fetched:"), stderr);
  assert.ok(stderr.includes(`the voice model (${MODEL}): ${MODEL_FILES.join(", ")} not in ${modelDir(cache)}`), stderr);
  assert.ok(stderr.includes(`the voice model (${SUPERTONIC}): none of its 17 files in ${modelDir(cache, SUPERTONIC)}`), stderr);
  for (const pinned of STRESS_FILES) assert.ok(stderr.includes(`${pinned.what} (${pinned.name}): none of its ${Object.keys(pinned.files).length} files in ${modelDir(cache, pinned.name)}`), stderr);
  assert.ok(stderr.includes(`HyperFrames' Chrome: none found by setup (no ${cachePaths(cache).record})`), stderr);
  assert.ok(stderr.includes(`Run "npm run video -- setup" once, with the network on`), stderr);
  // Nothing begun: no step logged, the cache as empty as it was, the project as it was (no .cache/ or out/).
  assert.equal(stdout, "");
  assert.deepEqual(await readdir(cache), []);
  assert.deepEqual(await readdir(dir), ["package.json", "src", "videos"]);
});

test("make --fit only speaks: it names the voice models, not Chrome", async () => {
  const dir = await project("fit");
  const { code, stderr } = await cli(path.join(scratch, "fit-cache"), ["make", path.join(dir, "videos", "sq.yaml"), "--fit"]);
  assert.equal(code, 1, stderr);
  assert.ok(stderr.includes(`the voice model (${MODEL})`), stderr);
  assert.ok(stderr.includes(`the voice model (${SUPERTONIC})`), stderr);
  assert.ok(!stderr.includes("Chrome"), stderr);
});

test("the voice with its model missing says so, rather than fetch it", async () => {
  const empty = path.join(scratch, "no-model");
  await assert.rejects(
    new KokoroProvider(empty).voices(),
    (err: Error) =>
      err.message.startsWith(`The voice model is not complete in ${empty} (`) &&
      /env\.allowRemoteModels=false` and file was not found locally at/.test(err.message) &&
      /Run "npm run video -- setup"/.test(err.message),
  );
});

test("each piece is named on its own, and nothing once all are there", async () => {
  const cache = path.join(scratch, "cache");
  const model = modelDir(cache);
  const supertonic = modelDir(cache, SUPERTONIC);
  const files = async (dir: string, list: string[]) => {
    for (const file of list) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), "");
    }
  };
  await files(model, MODEL_FILES.slice(0, -1));
  const theirs = Object.keys(SUPERTONIC_FILES);
  await files(supertonic, theirs.filter((file) => !file.startsWith("voice_styles/M")));
  // What marks a word's stress is part of the voice: each language's sources.
  const stress = STRESS_FILES.map((pinned) => `${pinned.what} (${pinned.name}): none of its ${Object.keys(pinned.files).length} files in ${modelDir(cache, pinned.name)}`);
  assert.deepEqual(stress.map((line) => line.split(":")[0]), [
    "the Ukrainian stress dictionary (lang-uk/ukrainian-word-stress)",
    "the Ukrainian stress model (TigreGotico/stressonnx-models)",
    "the Russian homographs and their model (ruaccent/accentuator)",
  ]);
  assert.deepEqual(missing(ROOT, cache, ["voice"]), [
    `the voice model (${MODEL}): onnx/model.onnx not in ${model}`,
    `the voice model (${SUPERTONIC}): voice_styles/M1.json, voice_styles/M2.json, voice_styles/M3.json, voice_styles/M4.json, voice_styles/M5.json in ${supertonic}`,
    ...stress,
  ]);
  await files(model, ["onnx/model.onnx"]);
  assert.deepEqual(missing(ROOT, cache, ["voice"]), [`the voice model (${SUPERTONIC}): voice_styles/M1.json, voice_styles/M2.json, voice_styles/M3.json, voice_styles/M4.json, voice_styles/M5.json in ${supertonic}`, ...stress]);
  await files(supertonic, theirs);
  assert.deepEqual(missing(ROOT, cache, ["voice"]), stress);
  assert.ok(!marksReady(cache));
  // One of them with a file missing names the file.
  const [dictionary, ...others] = STRESS_FILES;
  await files(modelDir(cache, dictionary!.name), ["LICENSE"]);
  for (const pinned of others) await files(modelDir(cache, pinned.name), Object.keys(pinned.files));
  assert.deepEqual(missing(ROOT, cache, ["voice"]), [`the Ukrainian stress dictionary (lang-uk/ukrainian-word-stress): ukrainian_word_stress/data/stress.trie in ${modelDir(cache, dictionary!.name)}`]);
  assert.ok(!marksReady(cache));
  await files(modelDir(cache, dictionary!.name), Object.keys(dictionary!.files));
  assert.deepEqual(missing(ROOT, cache, ["voice"]), []);
  assert.ok(marksReady(cache));
  assert.deepEqual(ready(ROOT, cache, ["voice"]), {});

  const record = cachePaths(cache).record;
  const browser = path.join(scratch, "chrome-headless-shell.exe");
  assert.deepEqual(missing(ROOT, cache, ["voice", "browser"]), [`HyperFrames' Chrome: none found by setup (no ${record})`]);
  await writeFile(record, JSON.stringify({ hyperframes: HYPERFRAMES, browser }));
  assert.deepEqual(missing(ROOT, cache, ["browser"]), [`HyperFrames' Chrome: ${browser} is gone`]);
  await writeFile(browser, "");
  assert.deepEqual(missing(ROOT, cache, ["voice", "browser"]), []);
  // HyperFrames gets its Chrome by path, so it never looks for one to download.
  assert.deepEqual(ready(ROOT, cache, ["voice", "browser"]), { HYPERFRAMES_BROWSER_PATH: browser });

  // Another HyperFrames may pin another Chrome: setup again.
  await writeFile(record, JSON.stringify({ hyperframes: "0.0.1", browser }));
  assert.deepEqual(missing(ROOT, cache, ["browser"]), [`HyperFrames' Chrome: setup found it for HyperFrames 0.0.1, and this is ${HYPERFRAMES}, which may pin another`]);
  assert.throws(() => ready(ROOT, cache, ["browser"]), /Missing, and not fetched:\n {2}- HyperFrames' Chrome: .*\nRun "npm run video -- setup"/);
});
