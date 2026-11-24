// The compiled scenario (compile.ts): a checked scenario's lines laid on the video's frames, in the
// order written, with the pauses of the video's timing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, compiledText } from "./compile.ts";
import type { CheckedScene } from "./scenario.ts";

/** Ten frames a second: half a second before a scene's first line, 0.3 s between lines, a second after its last. */
const TIMING = { fps: 10, lead: 0.5, gap: 0.3, tail: 1 };

const SCENES: CheckedScene[] = [
  {
    line: 3,
    setting: { colour: "#d04040", at: [20, 30] },
    lines: [
      { line: 5, who: "sq", action: "slide", values: { from: [20, 30], to: [120, 30] }, length: 1.5 },
      { line: 6, who: "sq", action: "say", text: "Here I am." },
    ],
  },
  { line: 8, setting: { colour: "#4040d0", at: [120, 30] }, lines: [{ line: 10, who: "narrator", action: "say", text: "And it stays." }] },
];
const VOICES = [
  { file: "aa.wav", duration: 1.21 },
  { file: "bb.wav", duration: 0.4 },
];

test("lines follow each other in whole frames: the lead, each line, a gap between two, and the tail", () => {
  assert.deepEqual(compile(SCENES, VOICES, TIMING, "../../videos/sq.yaml"), {
    format: "ai-videos-compiled",
    version: 1,
    made: { by: "ai-videos compile", from: "../../videos/sq.yaml" },
    fps: 10,
    frames: 65,
    scenes: [
      {
        from: 0,
        frames: 46,
        setting: { colour: "#d04040", at: [20, 30] },
        lines: [
          // The lead, 5 frames; the slide's own 1.5 s; the gap, 3 frames; the voice's 1.21 s sounds in 13 frames; the tail, 10.
          { line: 5, who: "sq", action: "slide", from: 5, frames: 15, values: { from: [20, 30], to: [120, 30] } },
          { line: 6, who: "sq", action: "say", from: 23, frames: 13, text: "Here I am.", file: "aa.wav" },
        ],
      },
      // The next scene begins where the one before ended; a voice that ends on a frame's edge takes no frame more.
      { from: 46, frames: 19, setting: { colour: "#4040d0", at: [120, 30] }, lines: [{ line: 10, who: "narrator", action: "say", from: 51, frames: 4, text: "And it stays.", file: "bb.wav" }] },
    ],
  });
});

test("a line lasts a frame at least, and pauses go to the nearest frame", () => {
  const quick: CheckedScene[] = [{ line: 1, setting: {}, lines: [{ line: 2, who: "sq", action: "slide", values: {}, length: 0.01 }, { line: 3, who: "sq", action: "say", text: "Hi." }] }];
  const { frames, scenes } = compile(quick, [{ file: "a.wav", duration: 0.001 }], { fps: 24, lead: 0.6, gap: 0.4, tail: 1 }, "sq.yaml");
  // 0.6 s is 14.4 frames, 0.4 s is 9.6.
  assert.deepEqual(scenes[0]!.lines.map((l) => [l.from, l.frames]), [[14, 1], [25, 1]]);
  assert.equal(frames, 50);
});

test("a voice for each said line, in order: another count is a mistake of the tool's", () => {
  assert.throws(() => compile(SCENES, VOICES.slice(0, 1), TIMING, "sq.yaml"), /the scenario says 2 lines, and 1 voices were measured/);
});

test("its text is JSON a person reads, a point on one line", () => {
  const compiled = compile(SCENES, VOICES, TIMING, "../../videos/sq.yaml");
  const text = compiledText(compiled);
  assert.deepEqual(JSON.parse(text), compiled);
  assert.match(text, /\n {8}"at": \[20, 30\]\n/);
  assert.match(text, /"to": \[120, 30\]/);
  assert.ok(text.endsWith("}\n"));
});
