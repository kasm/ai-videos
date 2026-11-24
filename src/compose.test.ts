// The build of a compiled scenario (compose.ts): the clip drawn from it, on the video's own frames,
// with the compiled captions over it, each in the frames it has, as HyperFrames counts them.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { compile } from "./compile.ts";
import { compiledCaptions, composeCompiled, frameTime } from "./compose.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-compose-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** HyperFrames' count of a length's frames. */
const counted = (seconds: number, fps: number) => Math.ceil(seconds * fps);

test("a frame's time is a whole millisecond before it and after the one before, so HyperFrames counts and shows it exactly", () => {
  assert.equal(frameTime(0, 30), 0);
  assert.equal(frameTime(143, 30), 4.766);
  assert.equal(frameTime(222, 30), 7.399);
  for (const fps of [24, 25, 30, 60]) {
    for (let frame = 1; frame < 20000; frame++) {
      const at = frameTime(frame, fps);
      assert.ok(at < frame / fps && at > (frame - 1) / fps && Number.isInteger(Math.round(at * 1e6) / 1000), `${frame} at ${fps}: ${at}`);
      assert.equal(counted(at, fps), frame, `${frame} at ${fps}`);
    }
  }
});

test("a compiled scenario's build: its clip for its frames, its captions on theirs, and no sound", async () => {
  const scenes = [
    { line: 3, setting: {}, lines: [{ line: 5, who: "sq", action: "say", text: "Here I am, <b>here</b>." }] },
    { line: 7, setting: {}, lines: [{ line: 9, who: "narrator", action: "say", text: "And it stays." }] },
  ];
  const voices = [{ file: "a.wav", duration: 1.21, mouth: [] }, { file: "b.wav", duration: 0.5, mouth: [] }];
  const compiled = compile(scenes, voices, { fps: 30, loudness: -14, lead: 0.6, gap: 0.4, tail: 1 }, "../../videos/sq.yaml");
  // The build takes the clip as it is: its bytes, not what they show.
  const file = path.join(scratch, "sq-landscape.mp4");
  await writeFile(file, Buffer.from("not really a clip"));
  const clip = { file, video: { width: 1920, height: 1080, fps: 30, duration: compiled.frames / 30 } };
  const buildDir = path.join(scratch, ".cache", "sq", "build");
  // A build left from a file that was not a script has a timeline and voices: they go.
  await mkdir(path.join(buildDir, "landscape", "assets", "vo"), { recursive: true });
  await writeFile(path.join(buildDir, "landscape", "timeline.json"), "{}");
  const project = await composeCompiled(ROOT, { name: "sq", file: path.join(scratch, "videos", "sq.yaml") }, compiled, clip, "landscape", buildDir);
  assert.equal(project, path.join(buildDir, "landscape"));
  assert.equal(existsSync(path.join(project, "timeline.json")), false);
  assert.equal(existsSync(path.join(project, "assets", "vo")), false);
  assert.equal(await readFile(path.join(project, "assets", "clips", "sq.mp4"), "utf8"), "not really a clip");

  const index = await readFile(path.join(project, "index.html"), "utf8");
  const scene = await readFile(path.join(project, "compositions", "sq.html"), "utf8");
  const lengths = [...index.matchAll(/data-duration="([\d.]+)"/g), ...scene.matchAll(/<video [^>]*data-duration="([\d.]+)"/g)].map((m) => counted(Number(m[1]), 30));
  assert.deepEqual(lengths, [compiled.frames, compiled.frames, compiled.frames], "the video's, the scene's and the clip's");
  assert.doesNotMatch(index, /<audio/);
  assert.doesNotMatch(scene, /-hold"/);
  assert.match(index, /<!-- Generated from \.\.\/\.\.\/\.\.\/\.\.\/videos\/sq\.yaml\./);

  const boxes = [...scene.matchAll(/<div id="(sq-cap-\d)" class="clip cl-cap" data-start="([\d.]+)" data-duration="([\d.]+)" data-track-index="2"><p>(.*?)<\/p>/g)];
  assert.deepEqual(boxes.map((m) => [m[1], m[4]]), [["sq-cap-1", "Here I am, &lt;b&gt;here&lt;/b&gt;."], ["sq-cap-2", "And it stays."]]);
  // The frames each is up in, counted as HyperFrames shows an element: from its start up to its end.
  const up = boxes.map(([, , start, duration]) => {
    const [from, to] = [Number(start), Number(start) + Number(duration)];
    const frames = Array.from({ length: compiled.frames }, (_, n) => n).filter((n) => n / 30 >= from && n / 30 < to);
    return [frames[0], frames.length];
  });
  const captions = compiled.scenes.flatMap((s) => s.lines).flatMap((line) => ("captions" in line ? line.captions : []));
  assert.deepEqual(up, captions.map((c) => [c.from, c.frames]));
  assert.deepEqual(compiledCaptions("sq", compiled).map((c) => c.id), ["sq-cap-1", "sq-cap-2"]);
});
