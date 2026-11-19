// The project file beside the video folders: what it may set, and how a video reads it. A video
// holds no copy of the shared settings; a setting its video.yaml writes overrides the project's.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadVideo, readProject } from "./script.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-project-"));
after(() => rm(scratch, { recursive: true, force: true }));

const SAMPLE = `
maker: npm run -s tutorial:video --
voice: bf_emma
loudness: -22
formats: [landscape]
timing:
  gap: 0.8
`;

const SCENES = `
title: A test
scenes:
  - id: one
    scene: page-scroll
    page: page.html
    narration:
      - text: Hello.
`;

/** A project folder named `name` with this project file (none if undefined), holding one video, `intro`. */
async function project(name: string, projectYaml: string | undefined, videoYaml = SCENES) {
  const dir = path.join(scratch, name);
  await mkdir(path.join(dir, "intro"), { recursive: true });
  if (projectYaml !== undefined) await writeFile(path.join(dir, "project.yaml"), projectYaml);
  await writeFile(path.join(dir, "intro", "video.yaml"), videoYaml);
  return dir;
}

test("a sample project file is read, with the tool's defaults for what it leaves out", async () => {
  const dir = await project("sample", SAMPLE);
  const read = await readProject(dir);
  assert.ok(read);
  assert.equal(read.file, path.join(dir, "project.yaml"));
  assert.equal(read.script.maker, "npm run -s tutorial:video --");
  assert.equal(read.script.voice, "bf_emma");
  assert.equal(read.script.loudness, -22);
  assert.deepEqual(read.script.formats, ["landscape"]);
  assert.deepEqual(read.script.timing, { lead: 0.6, gap: 0.8, tail: 1, moves: { slowest: 0.5, fastest: 2 } });
  assert.equal(read.script.speed, 1);
  assert.equal(read.script.fps, 30);
});

test("a project file that is all comments sets nothing, and a folder without one has no project", async () => {
  assert.equal((await readProject(await project("comments", "# voice: bf_emma\n")))?.script.voice, "af_heart");
  assert.equal(await readProject(await project("none", undefined)), undefined);
});

test("a project file is refused for what only a video.yaml says, or for a value out of range", async () => {
  const wrong = {
    title: "title: Intro\n",
    scenes: "scenes: []\n",
    "an empty maker": 'maker: ""\n',
    "a quiet loudness": "loudness: -40\n",
    "a format that is not one": "formats: [square]\n",
    "a move too fast": "timing:\n  moves:\n    fastest: 20\n",
  };
  for (const [what, yaml] of Object.entries(wrong)) {
    const dir = await project(`wrong-${what.replace(/\W+/g, "-")}`, yaml);
    await assert.rejects(readProject(dir), /project\.yaml is not a valid project file/, what);
    await assert.rejects(loadVideo(path.join(dir, "intro")), /project\.yaml is not a valid project file/, what);
  }
});

test("with no project file beside it, a video stands alone on the tool's defaults", async () => {
  const video = await loadVideo(path.join(await project("alone", undefined), "intro"));
  assert.equal(video.project, undefined);
  assert.equal(video.script.voice, "af_heart");
  assert.equal(video.script.loudness, -14);
  assert.deepEqual(video.script.formats, ["landscape", "portrait"]);
});

test("a video reads its settings from the project file, and a setting its video.yaml writes overrides it", async () => {
  const projectYaml = "voice: bf_emma\nloudness: -22\nformats: [landscape, portrait]\ntiming:\n  gap: 0.8\n";
  const videoYaml = `${SCENES}voice: af_heart\nformats: [portrait]\ntiming:\n  moves:\n    fastest: 1\n`;
  const dir = await project("override", projectYaml, videoYaml);
  const video = await loadVideo(path.join(dir, "intro"));
  assert.equal(video.project?.file, path.join(dir, "project.yaml"));
  assert.equal(video.script.voice, "af_heart", "the video's voice, over the project's bf_emma");
  assert.equal(video.script.loudness, -22, "the project's");
  assert.deepEqual(video.script.formats, ["portrait"], "a list is replaced whole, not merged");
  assert.deepEqual(
    video.script.timing,
    { lead: 0.6, gap: 0.8, tail: 1, moves: { slowest: 0.5, fastest: 1 } },
    "the video's moves.fastest, the project's gap, the tool's defaults for the rest",
  );
});

test("a bad setting in a video.yaml is reported against the video.yaml, not the project file", async () => {
  const dir = await project("bad-video", SAMPLE, `${SCENES}loudness: 5\n`);
  await assert.rejects(loadVideo(path.join(dir, "intro")), /intro[\\/]video\.yaml is not a valid video script/);
});
