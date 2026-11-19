// `new`: a video's first script from its clip's texts. The scaffold runs the demo's real maker,
// step one only (its data, nothing drawn), in a project folder of its own.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { parse } from "yaml";
import { loadClips, type ClipJson } from "./clip.ts";
import { linesOf, newVideo } from "./new.ts";
import { loadVideo } from "./script.ts";

const MAKER = path.resolve(import.meta.dirname, "..", "videos", "make-clip.ts").split(path.sep).join("/");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-new-"));
after(() => rm(scratch, { recursive: true, force: true }));
const quiet = () => {};

/** A project folder `name` in the scratch folder, with this project file (none if undefined). */
async function project(name: string, projectYaml?: string): Promise<string> {
  const dir = path.join(scratch, name);
  await mkdir(dir, { recursive: true });
  if (projectYaml !== undefined) await writeFile(path.join(dir, "project.yaml"), projectYaml);
  return dir;
}

test("each text becomes a line cued to the event it begins at, in time order", () => {
  const data: ClipJson = {
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
      { text: "Rounded apart from its event.", from: 4.0004, to: 6 },
      { text: "First.", from: 0, to: 2 },
      { text: "Between two events: the last before it.", from: 3, to: 4 },
      { text: "A second on the same event.", from: 3.5, to: 4 },
    ],
  };
  assert.deepEqual(linesOf(data), [
    { text: "First.", cue: "start" },
    { text: "Between two events: the last before it.", cue: "turn" },
    { text: "A second on the same event.", cue: "turn" },
    { text: "Rounded apart from its event.", cue: "rest" },
  ]);
});

test("new writes the clip's texts as lines, and none of the project's settings", async () => {
  const root = await project("demo", `maker: node "${MAKER}"\nvoice: am_michael\nloudness: -20\nformats: [portrait]\n`);
  const dir = path.join(root, "first-video");
  const file = await newVideo(dir, { make: "square" }, quiet);
  assert.equal(file, path.join(dir, "video.yaml"));
  // Only the title and the scene: the voice, the formats and the loudness stay in the project file.
  assert.deepEqual(parse(await readFile(file, "utf8")), {
    title: "first-video",
    scenes: [
      {
        id: "square",
        scene: "clip",
        make: "square",
        narration: [
          { text: "A square waits on the left.", cue: "start" },
          { text: "It slides to the right.", cue: "slide" },
          { text: "Then it rises.", cue: "rise" },
        ],
      },
    ],
  });
  // The data came from the project's first format; make writes it again.
  assert.ok(existsSync(path.join(dir, "clips", "square-portrait.json")));
  const video = await loadVideo(dir);
  assert.equal(video.script.voice, "am_michael");
  assert.equal(video.script.loudness, -20);
  assert.deepEqual(video.script.formats, ["portrait"]);
  // Every cue names one of the clip's events, as make's fit needs.
  assert.equal((await loadClips(video, ["portrait"], { readVideo: false })).get("square")?.events.length, 5);
});

test("new never writes over a script, and needs a maker in a project file", async () => {
  const root = await project("refusals", `maker: node "${MAKER}"\n`);
  const made = path.join(root, "square");
  await newVideo(made, {}, quiet); // the folder's name is what the maker draws
  await assert.rejects(newVideo(made, {}, quiet), /video\.yaml is there already/);
  await assert.rejects(newVideo(path.join(root, "bad"), { make: "Square" }, quiet), /--make Square: use lowercase/);
  const alone = await project("alone");
  await assert.rejects(newVideo(path.join(alone, "square"), {}, quiet), /No project\.yaml beside .* to name the maker/);
  const noMaker = await project("no-maker", "voice: af_heart\n");
  await assert.rejects(newVideo(path.join(noMaker, "square"), {}, quiet), /project\.yaml names no maker/);
  const failing = await project("failing", `maker: node -e "process.exit(3)"\n`);
  await assert.rejects(newVideo(path.join(failing, "square"), {}, quiet), /the maker failed writing "square"'s data \(landscape\) with exit code 3/);
  assert.ok(!existsSync(path.join(failing, "square", "video.yaml")));
});
