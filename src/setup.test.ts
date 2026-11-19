// What the tool needs on the disk to run offline (setup.ts): a command with a piece missing names
// it and stops before it writes or fetches anything. `setup` itself uses the network, so its test
// is `npm run video -- setup`, then `make clip-demo`, on empty caches (AGENTS.md, "Offline").
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { VIDEOS } from "./demo.ts";
import { run } from "./render.ts";
import { cachePaths, missing, ready } from "./setup.ts";
import { KokoroProvider, MODEL, MODEL_FILES } from "./tts.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-setup-"));
after(() => rm(scratch, { recursive: true, force: true }));

const modelDir = (cache: string) => path.join(cachePaths(cache).models, ...MODEL.split("/"));
const HYPERFRAMES = JSON.parse(await readFile(path.join(ROOT, "node_modules", "hyperframes", "package.json"), "utf8")).version;

/** The tool's CLI, its cache in `cache`. */
const cli = (cache: string, args: string[]) =>
  run(process.execPath, [path.join(ROOT, "src", "cli.ts"), ...args], { cwd: ROOT, env: { ...process.env, AI_VIDEOS_CACHE: cache } });

/** A copy of the tool's demo project (its project file, its maker, clip-demo's script): make would run its maker. */
async function demoProject(name: string) {
  const project = path.join(scratch, name);
  await mkdir(path.join(project, "clip-demo"), { recursive: true });
  for (const file of ["project.yaml", "make-clip.ts", "clip-demo/video.yaml"]) await cp(path.join(VIDEOS, file), path.join(project, file));
  return path.join(project, "clip-demo");
}

test("make on empty caches names the voice model and Chrome, and starts nothing", async () => {
  const video = await demoProject("empty");
  const cache = path.join(scratch, "empty-cache");
  await mkdir(cache);
  const { code, stdout, stderr } = await cli(cache, ["make", video]);
  assert.equal(code, 1, stderr);
  assert.ok(stderr.includes("Missing, and not fetched:"), stderr);
  assert.ok(stderr.includes(`the voice model (${MODEL}): ${MODEL_FILES.join(", ")} not in ${modelDir(cache)}`), stderr);
  assert.ok(stderr.includes(`HyperFrames' Chrome: none found by setup (no ${cachePaths(cache).record})`), stderr);
  assert.ok(stderr.includes(`Run "npm run video -- setup" once, with the network on`), stderr);
  // Nothing begun: no step logged, the cache as empty as it was, the folder holding its script alone.
  assert.equal(stdout, "");
  assert.deepEqual(await readdir(cache), []);
  assert.deepEqual(await readdir(video), ["video.yaml"]);
});

test("make --fit only speaks: it names the voice model, not Chrome", async () => {
  const video = await demoProject("fit");
  const { code, stderr } = await cli(path.join(scratch, "fit-cache"), ["make", video, "--fit"]);
  assert.equal(code, 1, stderr);
  assert.ok(stderr.includes(`the voice model (${MODEL})`), stderr);
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
  for (const file of MODEL_FILES.slice(0, -1)) {
    await mkdir(path.dirname(path.join(model, file)), { recursive: true });
    await writeFile(path.join(model, file), "");
  }
  assert.deepEqual(missing(ROOT, cache, ["voice"]), [`the voice model (${MODEL}): onnx/model.onnx not in ${model}`]);
  await mkdir(path.join(model, "onnx"), { recursive: true });
  await writeFile(path.join(model, "onnx", "model.onnx"), "");
  assert.deepEqual(missing(ROOT, cache, ["voice"]), []);
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
