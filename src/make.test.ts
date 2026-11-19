// make's calls to a project's maker: which a video needs, where their files go, and the command line
// each becomes. The steps themselves run the voice and HyperFrames, so `make clip-demo` is their test.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { commandLine, makerCalls, makerOf } from "./make.ts";
import { loadVideo } from "./script.ts";

const VIDEOS = path.resolve(import.meta.dirname, "..", "videos");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-make-"));
after(() => rm(scratch, { recursive: true, force: true }));

test("the demo's calls: its scene's files in its clips/, the sizes from the formats", async () => {
  const video = await loadVideo(path.join(VIDEOS, "clip-demo"));
  assert.deepEqual(makerOf(video), { maker: "node make-clip.ts", dir: VIDEOS });
  const clips = path.join(VIDEOS, "clip-demo", "clips");
  assert.deepEqual(makerCalls(video, ["landscape", "portrait"], "data"), [
    { scene: "square", call: { step: "data", name: "square", format: "landscape", data: path.join(clips, "square-landscape.json") } },
    { scene: "square", call: { step: "data", name: "square", format: "portrait", data: path.join(clips, "square-portrait.json") } },
  ]);
  assert.deepEqual(makerCalls(video, ["portrait"], "draw"), [
    {
      scene: "square",
      call: {
        step: "draw",
        name: "square",
        format: "portrait",
        width: 1080,
        height: 1920,
        request: path.join(clips, "square-portrait.request.json"),
        clip: path.join(clips, "square-portrait.mp4"),
        data: path.join(clips, "square-portrait.json"),
      },
    },
  ]);
});

test("a video with no made clip needs no maker", async () => {
  const video = await loadVideo(path.join(VIDEOS, "scroll-demo"));
  assert.equal(makerOf(video), undefined);
  assert.deepEqual(makerCalls(video, ["landscape"], "data"), []);
});

/** The demo's script in a new project folder `name`, with this project file (none if undefined). */
async function demoIn(name: string, projectYaml?: string) {
  const dir = path.join(scratch, name, "clip-demo");
  await mkdir(dir, { recursive: true });
  await cp(path.join(VIDEOS, "clip-demo", "video.yaml"), path.join(dir, "video.yaml"));
  if (projectYaml !== undefined) await writeFile(path.join(scratch, name, "project.yaml"), projectYaml);
  return loadVideo(dir);
}

test("a made clip needs a project file, and a maker in it", async () => {
  const alone = await demoIn("alone");
  assert.throws(() => makerOf(alone), /Scene "square" is made \(make: square\), but no project\.yaml is beside .* to name the maker/);
  const noMaker = await demoIn("no-maker", "voice: af_heart\n");
  assert.throws(() => makerOf(noMaker), /but .*project\.yaml names no maker/);
});

test("the command line: the maker, then the call, quoting a path with a space and refusing a % or a quote", () => {
  const data = path.join(scratch, "a folder", "clips", "square-landscape.json");
  const call = { step: "data", name: "square", format: "landscape", data } as const;
  assert.equal(commandLine("npm run -s tutorial:video --", call), `npm run -s tutorial:video -- square --format=landscape "--data=${data}"`);
  const plain = path.join(scratch, "clips", "square-landscape.json");
  if (!/\s/.test(plain)) assert.equal(commandLine("node make-clip.ts", { ...call, data: plain }), `node make-clip.ts square --format=landscape --data=${plain}`);
  assert.throws(() => commandLine("node make-clip.ts", { ...call, data: path.join(scratch, "100%", "x.json") }), /can't go on a command line/);
});
