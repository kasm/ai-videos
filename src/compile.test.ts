// The compiled scenario (compile.ts): a checked scenario's lines laid on the video's frames, in the
// order written, with the pauses of the video's timing, and each said line's mouth and captions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, compiledText, saidLines } from "./compile.ts";
import type { CheckedScene } from "./scenario.ts";

/** Ten frames a second: half a second before a scene's first line, 0.3 s between lines, a second after its last. */
const SETTINGS = { fps: 10, loudness: -14, lead: 0.5, gap: 0.3, tail: 1 };

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
  { file: "aa.wav", duration: 1.21, mouth: [0, 0.5, 1, 0.5, 0, 0, 0.2, 0.4, 0.6, 0.8, 1, 0.5, 0] },
  { file: "bb.wav", duration: 0.4, mouth: [0.1, 1, 0.5, 0] },
];

test("lines follow each other in whole frames: the lead, each line, a gap between two, and the tail", () => {
  assert.deepEqual(compile(SCENES, VOICES, SETTINGS, "../../videos/sq.yaml"), {
    format: "ai-videos-compiled",
    version: 1,
    made: { by: "ai-videos compile", from: "../../videos/sq.yaml" },
    fps: 10,
    frames: 65,
    loudness: -14,
    scenes: [
      {
        from: 0,
        frames: 46,
        setting: { colour: "#d04040", at: [20, 30] },
        lines: [
          // The lead, 5 frames; the slide's own 1.5 s; the gap, 3 frames; the voice's 1.21 s sounds in 13 frames; the tail, 10.
          { line: 5, who: "sq", action: "slide", from: 5, frames: 15, values: { from: [20, 30], to: [120, 30] } },
          {
            line: 6,
            who: "sq",
            action: "say",
            from: 23,
            frames: 13,
            text: "Here I am.",
            file: "aa.wav",
            mouth: [0, 0.5, 1, 0.5, 0, 0, 0.2, 0.4, 0.6, 0.8, 1, 0.5, 0],
            // Up from its first word to a second after its last: the scene ends then too.
            captions: [{ text: "Here I am.", from: 23, frames: 23 }],
          },
        ],
      },
      {
        // The next scene begins where the one before ended; a voice that ends on a frame's edge takes no frame more.
        from: 46,
        frames: 19,
        setting: { colour: "#4040d0", at: [120, 30] },
        lines: [
          { line: 10, who: "narrator", action: "say", from: 51, frames: 4, text: "And it stays.", file: "bb.wav", mouth: [0.1, 1, 0.5, 0], captions: [{ text: "And it stays.", from: 51, frames: 14 }] },
        ],
      },
    ],
  });
});

test("captions are on whole frames: a long line's in proportion, each up to the next one, a second after its words or the scene's end", () => {
  // 60 characters and 40: too long for one caption, so the 50 frames of the voice are shared 30 and 20.
  const long = `${"a".repeat(59)}, ${"b".repeat(39)}.`;
  const scenes: CheckedScene[] = [{ line: 1, setting: {}, lines: [{ line: 2, who: "sq", action: "say", text: long }, { line: 3, who: "narrator", action: "say", text: "Hi." }] }];
  const voices = [{ file: "a.wav", duration: 5, mouth: [] }, { file: "b.wav", duration: 0.4, mouth: [] }];
  const compiled = compile(scenes, voices, { ...SETTINGS, gap: 2, tail: 0.5 }, "sq.yaml");
  assert.deepEqual(saidLines(compiled.scenes).map((line) => line.captions), [
    [
      { text: `${"a".repeat(59)},`, from: 5, frames: 30 },
      // Its words end on frame 55, and the next line begins on 75: it stays a second, 10 frames.
      { text: `${"b".repeat(39)}.`, from: 35, frames: 30 },
    ],
    // The scene ends half a second after the words, on frame 84.
    [{ text: "Hi.", from: 75, frames: 9 }],
  ]);
  // With a shorter gap, it stays to the next one.
  const close = saidLines(compile(scenes, voices, SETTINGS, "sq.yaml").scenes);
  assert.deepEqual(close[0]!.captions[1], { text: `${"b".repeat(39)}.`, from: 35, frames: 23 });
  assert.equal(close[1]!.captions[0]!.from, 58);
});

test("a line lasts a frame at least, and pauses go to the nearest frame", () => {
  const quick: CheckedScene[] = [{ line: 1, setting: {}, lines: [{ line: 2, who: "sq", action: "slide", values: {}, length: 0.01 }, { line: 3, who: "sq", action: "say", text: "Hi." }] }];
  const { frames, scenes } = compile(quick, [{ file: "a.wav", duration: 0.001, mouth: [0] }], { fps: 24, loudness: -14, lead: 0.6, gap: 0.4, tail: 1 }, "sq.yaml");
  // 0.6 s is 14.4 frames, 0.4 s is 9.6.
  assert.deepEqual(scenes[0]!.lines.map((l) => [l.from, l.frames]), [[14, 1], [25, 1]]);
  assert.equal(frames, 50);
});

test("a voice for each said line, in order: another count is a mistake of the tool's", () => {
  assert.throws(() => compile(SCENES, VOICES.slice(0, 1), SETTINGS, "sq.yaml"), /the scenario says 2 lines, and 1 voices were measured/);
});

test("its text is JSON a person reads, a point and a mouth on one line", () => {
  const compiled = compile(SCENES, VOICES, SETTINGS, "../../videos/sq.yaml");
  const text = compiledText(compiled);
  assert.deepEqual(JSON.parse(text), compiled);
  assert.match(text, /\n {8}"at": \[20, 30\]\n/);
  assert.match(text, /"to": \[120, 30\]/);
  assert.match(text, /\n {10}"mouth": \[0\.1, 1, 0\.5, 0\],\n/);
  assert.ok(text.endsWith("}\n"));
});
