// The maker run as the video tool runs it: in videos/, through its command line.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const videos = path.join(import.meta.dirname, "../videos");
const scratch = mkdtempSync(path.join(os.tmpdir(), "cartoons-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const maker = (...args: string[]) => spawnSync(process.execPath, ["../src/make.ts", ...args], { cwd: videos, encoding: "utf8" });

test("step one writes hello's data: its beats as events, its lines as texts", () => {
  const data = path.join(scratch, "clips", "hello-landscape.json");
  const run = maker("hello", "--format=landscape", `--data=${data}`);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(data, "utf8")), {
    format: "ai-videos-clip",
    version: 1,
    made: { by: "cartoons: src/make.ts", from: "hello/scenario.yaml" },
    duration: 7,
    events: [
      { name: "walks-in", at: 0, span: "move" },
      { name: "stops", at: 4, span: "hold" },
    ],
    texts: [
      { text: "This is Pip. Pip walks into the meadow.", from: 0, to: 4 },
      { text: "And here, Pip stops.", from: 4, to: 7 },
    ],
  });
});

test("step one names each character's text as its speaker, and the narrator's as nobody's", () => {
  const data = path.join(scratch, "clips", "meet-landscape.json");
  const run = maker("meet", "--format=landscape", `--data=${data}`);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(data, "utf8")).texts, [
    { text: "Pip is waiting in the meadow.", from: 0, to: 3 },
    { text: "Oh, someone is coming! Hello! Who are you?", speaker: "pip", from: 3, to: 6 },
    { text: "I am Mo. I live behind the hill.", speaker: "mo", from: 6, to: 8 },
    { text: "I am Pip. Shall we play?", speaker: "pip", from: 8, to: 10 },
    { text: "Yes, let's play!", speaker: "mo", from: 10, to: 12 },
  ]);
});

test("a cartoon with no scenario stops the maker, with the reason", () => {
  const run = maker("nothing", "--format=landscape", `--data=${path.join(scratch, "nothing.json")}`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /cartoons maker: no scenario at .*nothing/);
});

test("portrait and a call the tool would not send are refused", () => {
  const data = `--data=${path.join(scratch, "x.json")}`;
  assert.match(maker("hello", "--format=portrait", data).stderr, /landscape only/);
  assert.match(maker("hello", "--format=landscape", "--data=clips/x.json").stderr, /not an absolute path/);
  assert.match(maker("--format=landscape", data).stderr, /name one cartoon/);
});

// Step two, small and short: hello's walk in 8 frames with its motion in 6, then 4 frames of the stop.
const SMALL = {
  format: "ai-videos-request",
  version: 1,
  fps: 30,
  duration: 0.4,
  frames: 12,
  spans: [
    { event: "walks-in", span: "move", natural: 4, at: 0, duration: 0.267, move: 0.2 },
    { event: "stops", span: "hold", natural: 3, at: 0.267, duration: 0.133 },
  ],
};
const request = path.join(scratch, "small.request.json");
writeFileSync(request, JSON.stringify(SMALL));
const draw = (clip: string, size = ["--width=320", "--height=180"], to = request) =>
  maker("hello", "--format=landscape", ...size, `--request=${to}`, `--clip=${clip}`, `--data=${clip.replace(/\.mp4$/, ".json")}`);
const framesOf = (clip: string) => readFileSync(`${clip}.frames`, "utf8").trim().split("\n");

test("step two draws the clip to the request: a hash per frame, and the data as the request times it", () => {
  const clip = path.join(scratch, "one", "hello-landscape.mp4");
  const run = draw(clip);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(statSync(clip).size > 1000, "the clip is a video file");

  const frames = framesOf(clip);
  assert.equal(frames.length, 12);
  // The first two frames are the empty meadow, Pip still left of the stage; then each frame of the
  // walk differs; from its end on, through the stop, the picture stays.
  assert.equal(frames[0], frames[1]);
  assert.equal(new Set(frames.slice(1, 7)).size, 6);
  assert.equal(new Set(frames.slice(6)).size, 1);

  const data = JSON.parse(readFileSync(clip.replace(/\.mp4$/, ".json"), "utf8"));
  assert.equal(data.duration, 0.4);
  assert.equal(data.made.from, "hello/scenario.yaml, drawn to small.request.json");
  assert.deepEqual(data.events, [
    { name: "walks-in", at: 0, span: "move", natural: 4 },
    { name: "stops", at: 0.267, span: "hold", natural: 3 },
  ]);
  assert.deepEqual(data.texts.map((t: { from: number; to: number }) => [t.from, t.to]), [[0, 0.267], [0.267, 0.4]]);
});

test("a second run draws the same frames", () => {
  const again = path.join(scratch, "two", "hello-landscape.mp4");
  assert.equal(draw(again).status, 0);
  assert.deepEqual(framesOf(again), framesOf(path.join(scratch, "one", "hello-landscape.mp4")));
});

test("Pip's line opens Pip's mouth in its track's frames, and nowhere else; the narrator's opens none", () => {
  // The same request with a line spoken through the stop: open, closed for a pause, open as wide again.
  const line = { text: "Hi. Pip.", at: 0.267, duration: 0.133, mouth: { frame: 8, open: [0.7, 0, 0.7] } };
  const spoken = path.join(scratch, "spoken.request.json");
  writeFileSync(spoken, JSON.stringify({ ...SMALL, lines: [{ ...line, speaker: "pip" }] }));
  // With no speaker the line is the narrator's: the same track, and the picture of no line at all.
  const narrated = path.join(scratch, "narrated.request.json");
  writeFileSync(narrated, JSON.stringify({ ...SMALL, lines: [line] }));
  const told = path.join(scratch, "five", "hello-landscape.mp4");
  assert.equal(draw(told, undefined, narrated).status, 0);
  assert.deepEqual(framesOf(told), framesOf(path.join(scratch, "one", "hello-landscape.mp4")));

  const clip = path.join(scratch, "four", "hello-landscape.mp4");
  assert.equal(draw(clip, undefined, spoken).status, 0);
  const frames = framesOf(clip);
  const silent = framesOf(path.join(scratch, "one", "hello-landscape.mp4"));
  assert.deepEqual(frames.slice(0, 8), silent.slice(0, 8), "the walk, before the line: as with no line");
  assert.notEqual(frames[8], silent[8], "the mouth is open");
  assert.equal(frames[9], silent[9], "closed in the pause");
  assert.equal(frames[10], frames[8], "open as wide again: the same picture");
  assert.equal(frames[11], silent[11], "closed after the line");
});

test("a size the stage does not fill, and a missing request, stop the maker", () => {
  const clip = path.join(scratch, "three", "x.mp4");
  assert.match(draw(clip, ["--width=180", "--height=320"]).stderr, /does not fill 180 by 320/);
  const none = maker("hello", "--format=landscape", "--width=320", "--height=180", `--request=${path.join(scratch, "none.json")}`, `--clip=${clip}`, `--data=${path.join(scratch, "three", "x.json")}`);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no request at/);
});
