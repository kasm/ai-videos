// The project file beside the video folders: what it may set, and how a video reads it. A video
// holds no copy of the shared settings; a setting its video.yaml writes overrides the project's.
// The cast is one of them: each speaker's voice, and the lines that name a speaker.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadVideo, readProject, voiceOf } from "./script.ts";
import { narrate } from "./timeline.ts";
import type { TtsProvider } from "./tts.ts";

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

/** A video of one page with these lines, each written as YAML: `{ speaker: pip, text: Hi. }`. */
const spokenBy = (...lines: string[]) => `
title: A test
scenes:
  - id: one
    scene: page-scroll
    page: page.html
    narration:
${lines.map((line) => `      - ${line}`).join("\n")}
`;

test("the cast gives each speaker a voice, and a line with no speaker keeps the video's", async () => {
  const lines = spokenBy("{ text: Once. }", "{ speaker: pip, text: Hi. }", "{ speaker: mo, text: Hello. }", "{ speaker: pip, text: Loud!, voice: am_fenrir }");
  const dir = await project("cast", "voice: bf_emma\ncast:\n  pip: am_puck\n  mo: af_bella\n", lines);
  assert.deepEqual((await readProject(dir))?.script.cast, { pip: "am_puck", mo: "af_bella" });
  const { script } = await loadVideo(path.join(dir, "intro"));
  assert.deepEqual(
    script.scenes[0]!.narration.map((line) => [line.speaker, voiceOf(script, line)]),
    [[undefined, "bf_emma"], ["pip", "am_puck"], ["mo", "af_bella"], ["pip", "am_fenrir"]],
    "the video's voice, each speaker's, and a line's own voice over its speaker's",
  );

  // Each line is spoken in that voice, and keeps its speaker for the request.
  const asked: string[] = [];
  const provider: TtsProvider = {
    id: "test",
    synth: async (req) => (asked.push(req.voice), { samples: new Float32Array(2400).fill(0.5), sampleRate: 24000 }),
    voices: async () => [],
  };
  const said: string[] = [];
  const spoken = await narrate(script, provider, path.join(scratch, "voices"), (msg) => said.push(msg));
  assert.deepEqual(asked, ["bf_emma", "am_puck", "af_bella", "am_fenrir"]);
  assert.deepEqual(spoken[0]!.map((line) => line.speaker), [undefined, "pip", "mo", "pip"]);
  assert.ok(!("speaker" in spoken[0]![0]!), "a line with no speaker has no such key");
  assert.match(said[0]!, /^ {2}line 1: /);
  assert.match(said[1]!, /^ {2}line 2 \(pip, am_puck\): /);
});

test("a video.yaml overrides a speaker's voice and adds its own, and keeps the project's others", async () => {
  const lines = spokenBy("{ speaker: pip, text: Hi. }", "{ speaker: mo, text: Hello. }", "{ speaker: owl, text: Who? }");
  const dir = await project("cast-override", "cast:\n  pip: am_puck\n  mo: af_bella\n", `${lines}cast:\n  pip: bm_george\n  owl: bm_fable\n`);
  const { script } = await loadVideo(path.join(dir, "intro"));
  assert.deepEqual(script.cast, { pip: "bm_george", mo: "af_bella", owl: "bm_fable" });
  assert.deepEqual(script.scenes[0]!.narration.map((line) => voiceOf(script, line)), ["bm_george", "af_bella", "bm_fable"]);
  // With no project file the video's own cast is the whole of it.
  const alone = await project("cast-alone", undefined, `${spokenBy("{ speaker: pip, text: Hi. }")}cast:\n  pip: am_puck\n`);
  assert.deepEqual((await loadVideo(path.join(alone, "intro"))).script.cast, { pip: "am_puck" });
});

test("a speaker the cast does not name is refused, with the line and the cast", async () => {
  const unknown = await project("cast-unknown", "cast:\n  pip: am_puck\n  mo: af_bella\n", spokenBy("{ speaker: pip, text: Hi. }", "{ speaker: owl, text: Who? }"));
  await assert.rejects(
    loadVideo(path.join(unknown, "intro")),
    (err: Error) =>
      /intro[\\/]video\.yaml is not a valid video script/.test(err.message) &&
      /"owl" is not in the cast \(pip, mo\): give "owl" a voice under cast:/.test(err.message) &&
      /scenes\[0\]\.narration\[1\]\.speaker/.test(err.message),
  );
  // No cast at all: the speaker is still refused, not said in the video's voice.
  const none = await project("cast-none", "voice: bf_emma\n", spokenBy("{ speaker: pip, text: Hi. }"));
  await assert.rejects(loadVideo(path.join(none, "intro")), /"pip" is not in the cast \(it is empty\)/);
  // A clip scene's lines are checked as a page's are.
  const clip = await project("cast-clip", undefined, clipScene("    make: square").replace("- text: Hello.", "- { speaker: pip, text: Hello. }"));
  await assert.rejects(loadVideo(path.join(clip, "intro")), /"pip" is not in the cast/);
  // A cast is names and voices: a name that is not one, or a speaker with no voice, is refused where it is written.
  for (const [what, yaml] of Object.entries({ "a name with a space": 'cast:\n  "Pip the First": am_puck\n', "no voice": 'cast:\n  pip: ""\n', "a list": "cast: [pip]\n" })) {
    const dir = await project(`cast-wrong-${what.replace(/\W+/g, "-")}`, yaml);
    await assert.rejects(readProject(dir), /project\.yaml is not a valid project file/, what);
  }
});

/** A video with one clip scene, given these lines in place of its clip. */
const clipScene = (lines: string) => `
title: A test
scenes:
  - id: one
    scene: clip
${lines}
    narration:
      - text: Hello.
`;

test("a clip scene gives clip: or make:, one of the two", async () => {
  const made = await loadVideo(path.join(await project("made", undefined, clipScene("    make: first-shadow")), "intro"));
  const scene = made.script.scenes[0]!;
  assert.equal(scene.scene === "clip" && scene.make, "first-shadow");
  const neither = await project("neither", undefined, clipScene(""));
  await assert.rejects(loadVideo(path.join(neither, "intro")), /clip: \(a clip drawn elsewhere\) or make: \(one the project's maker draws\), one of the two/);
  const both = await project("both", undefined, clipScene("    make: first-shadow\n    clip: a.mp4"));
  await assert.rejects(loadVideo(path.join(both, "intro")), /one of the two/);
  const badName = await project("bad-name", undefined, clipScene("    make: First Shadow"));
  await assert.rejects(loadVideo(path.join(badName, "intro")), /it goes on a command line/);
});
