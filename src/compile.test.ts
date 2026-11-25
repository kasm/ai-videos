// The compiled scenario (compile.ts): a checked scenario's lines laid on the video's frames, in the
// order written, with the pauses of the video's timing, and each said line's mouth and captions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, compiledText, saidLines } from "./compile.ts";
import type { CheckedScene } from "./scenario.ts";

/** Ten frames a second. */
const SETTINGS = { fps: 10, loudness: -14, moves: { slowest: 0.5, fastest: 2 } };
/** A scene's pauses: half a second before its first line, 0.3 s between lines, a second after its last. */
const PAUSES = { lead: 0.5, pause: 0.3, tail: 1 };

const SCENES: CheckedScene[] = [
  {
    line: 3,
    setting: { colour: "#d04040", at: [20, 30] },
    ...PAUSES,
    items: [
      { line: 5, who: "sq", action: "slide", values: { from: [20, 30], to: [120, 30] }, length: 1.5 },
      { line: 6, who: "sq", action: "say", text: "Here I am." },
    ],
  },
  { line: 8, setting: { colour: "#4040d0", at: [120, 30] }, ...PAUSES, items: [{ line: 10, who: "narrator", action: "say", text: "And it stays." }] },
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
  const items: CheckedScene["items"] = [{ line: 2, who: "sq", action: "say", text: long }, { line: 3, who: "narrator", action: "say", text: "Hi." }];
  const voices = [{ file: "a.wav", duration: 5, mouth: [] }, { file: "b.wav", duration: 0.4, mouth: [] }];
  const compiled = compile([{ line: 1, setting: {}, lead: 0.5, pause: 2, tail: 0.5, items }], voices, SETTINGS, "sq.yaml");
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
  const close = saidLines(compile([{ line: 1, setting: {}, ...PAUSES, items }], voices, SETTINGS, "sq.yaml").scenes);
  assert.deepEqual(close[0]!.captions[1], { text: `${"b".repeat(39)}.`, from: 35, frames: 23 });
  assert.equal(close[1]!.captions[0]!.from, 58);
});

test("a line lasts a frame at least, and pauses go to the nearest frame", () => {
  const quick: CheckedScene[] = [{ line: 1, setting: {}, lead: 0.6, pause: 0.4, tail: 1, items: [{ line: 2, who: "sq", action: "slide", values: {}, length: 0.01 }, { line: 3, who: "sq", action: "say", text: "Hi." }] }];
  const { frames, scenes } = compile(quick, [{ file: "a.wav", duration: 0.001, mouth: [0] }], { ...SETTINGS, fps: 24 }, "sq.yaml");
  // 0.6 s is 14.4 frames, 0.4 s is 9.6.
  assert.deepEqual(scenes[0]!.lines.map((l) => [l.from, l.frames]), [[14, 1], [25, 1]]);
  assert.equal(frames, 50);
});

/** A voice `frames` long at ten frames a second, its mouth as open in each frame as its place in it. */
const voiced = (file: string, frames: number) => ({ file, duration: frames / 10, mouth: Array.from({ length: frames }, (_, k) => (k + 1) / 100) });
const say = (line: number, who: string, text: string) => ({ line, who, action: "say", text });

test("what is at once: a joined action fitted to the words, a voice over another, and one cut where its block ends", () => {
  const scenes: CheckedScene[] = [
    {
      line: 1,
      setting: {},
      ...PAUSES,
      items: [
        { line: 2, order: "together", joined: true, items: [{ line: 2, who: "sq", action: "slide", values: { x: 1 }, length: 2 }, say(3, "narrator", "It slides.")] },
        {
          line: 4,
          order: "in order",
          pause: 0.3,
          items: [
            { line: 5, order: "in order", pause: 0.3, under: true, items: [say(6, "radio", "News."), say(7, "radio", "More."), say(8, "radio", "And more.")] },
            { ...say(9, "sq", "Here I am."), label: "a" },
            { ...say(10, "mo", "Hm?"), anchor: { of: "a", at: { share: 0.5 }, plus: 0.2 } },
          ],
        },
      ],
    },
  ];
  const voices = [voiced("slides.wav", 14), voiced("news.wav", 9), voiced("more.wav", 20), voiced("and.wav", 5), voiced("here.wav", 12), voiced("hm.wav", 6)];
  const { scenes: [scene], frames } = compile(scenes, voices, SETTINGS, "sq.yaml");
  assert.deepEqual(scene!.lines.map((line) => [line.line, line.from, line.frames]), [
    // The lead, 5; the words' 14 frames, and the slide's 20 hurried to them.
    [2, 5, 14],
    [3, 5, 14],
    // The gap, 3; the block's 14 frames: Pip's 12, and from 8 of them Mo's 6. The radio's second line is cut there.
    [6, 22, 9],
    [7, 34, 2],
    [9, 22, 12],
    [10, 30, 6],
  ]);
  assert.equal(frames, 46, "the tail, 10");
  // The third never begins: it is not there. What is cut has as much of its mouth as it has frames.
  const mouths = saidLines([scene!]).map((line) => [line.file, line.mouth.length]);
  assert.deepEqual(mouths, [["slides.wav", 14], ["news.wav", 9], ["more.wav", 2], ["here.wav", 12], ["hm.wav", 6]]);
  assert.deepEqual(saidLines([scene!])[2]!.mouth, [0.01, 0.02]);
});

test("an action joined to words is no faster than the video's fastest and no slower than its slowest, and alone goes at its own speed", () => {
  const joined = (length: number, frames: number, moves = SETTINGS.moves) => {
    const slide = { line: 2, who: "sq", action: "slide", values: {}, length };
    const scenes: CheckedScene[] = [{ line: 1, setting: {}, ...PAUSES, items: [{ line: 2, order: "together", joined: true, items: [slide, say(3, "sq", "Go.")] }, { ...slide, line: 4 }] }];
    return compile(scenes, [voiced("go.wav", frames)], { ...SETTINGS, moves }, "sq.yaml").scenes[0]!.lines.filter((line) => line.action === "slide").map((line) => line.frames);
  };
  assert.deepEqual(joined(2, 3), [10, 20]);
  assert.deepEqual(joined(2, 15), [15, 20]);
  assert.deepEqual(joined(2, 99), [40, 20]);
  assert.deepEqual(joined(2.1, 3), [11, 21], "21 frames, at most twice as fast: 10.5, and no faster");
  assert.deepEqual(joined(2, 3, { slowest: 1, fastest: 1 }), [20, 20]);
  assert.deepEqual(joined(2, 99, { slowest: 1, fastest: 1 }), [20, 20]);
});

test("captions of what is said at once: one shows, the line's begun last, and a cut line's goes with its voice", () => {
  const captions = (items: CheckedScene["items"], voices: ReturnType<typeof voiced>[]) =>
    saidLines(compile([{ line: 1, setting: {}, ...PAUSES, tail: 2, items }], voices, SETTINGS, "sq.yaml").scenes).map((line) => line.captions.map((c) => [c.from, c.frames]));
  // Begun on one frame: the one written later shows, and the other has none.
  assert.deepEqual(captions([{ line: 2, order: "together", items: [say(3, "sq", "Hi!"), say(4, "mo", "Hi!")] }], [voiced("a.wav", 8), voiced("b.wav", 6)]), [[], [[5, 16]]]);
  // One begun part-way into another takes its place, and the other's next words theirs: frames 5 to 55 are 30 of a and 20 of b.
  const long = `${"a".repeat(59)}, ${"b".repeat(39)}.`;
  const over = [{ ...say(2, "sq", long), label: "l" }, { ...say(3, "mo", "Hm?"), anchor: { of: "l", at: { share: 0.2 }, plus: 0 } }];
  assert.deepEqual(captions(over, [voiced("a.wav", 50), voiced("b.wav", 4)]), [[[5, 10], [35, 30]], [[15, 14]]]);
  // Cut on frame 45: its second caption is up to there, and no longer.
  const cut: CheckedScene["items"] = [{ line: 2, order: "together", items: [{ line: 3, order: "in order", pause: 0.3, under: true, items: [say(4, "sq", long)] }, say(5, "mo", "Hm?")] }, say(6, "mo", "Oh.")];
  assert.deepEqual(captions(cut, [voiced("a.wav", 50), voiced("b.wav", 40), voiced("c.wav", 5)]), [[[35, 10]], [[5, 30]], [[48, 15]]]);
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
