// What each frame of a compiled scenario shows (shown.ts): its scene's setting, the actions begun by
// then and how far through they are, and whose mouth is open; and the part of the compiled scenario
// the picture is drawn from.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, type Compiled } from "./compile.ts";
import type { CheckedScene } from "./scenario.ts";
import { pictureOf, shownAt } from "./shown.ts";

const PAUSES = { lead: 0.5, pause: 0.3, tail: 0.2 };
const SCENES: CheckedScene[] = [
  {
    line: 3,
    setting: { colour: "#d04040" },
    ...PAUSES,
    items: [
      { line: 5, who: "sq", action: "slide", values: { x: 120 }, channels: ["place"], length: 1 },
      { line: 6, who: "sq", action: "say", text: "Here I am." },
      { line: 7, who: "sq", action: "slide", values: { x: 20 }, channels: ["place"], length: 0.5 },
    ],
  },
  { line: 9, setting: { colour: "#4040d0" }, ...PAUSES, items: [{ line: 11, who: "narrator", action: "say", text: "And it stays." }] },
];
const VOICES = [
  { file: "aa.wav", duration: 0.4, mouth: [0.25, 1, 0, 0.5] },
  { file: "bb.wav", duration: 0.3, mouth: [0.5, 0.5, 0] },
];
/**
 * Ten frames a second. The first scene's 32 frames: the slide from 5 for 10, the words from 18 for 4
 * and the slide back from 25 for 5, then 2 frames more. The second scene's 10: the words from 37 for 3.
 */
const compiled = compile(SCENES, VOICES, { fps: 10, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "sq.yaml");
const picture = pictureOf(compiled);

test("a frame shows its scene's setting and the actions begun by it, each as far through as it is", () => {
  assert.deepEqual(compiled.scenes.map((s) => [s.from, s.frames]), [[0, 32], [32, 10]]);
  assert.deepEqual(shownAt(picture, 4), { time: 0.4, setting: { colour: "#d04040" }, actions: [], mouths: {} });
  assert.deepEqual(shownAt(picture, 5).actions, [{ who: "sq", action: "slide", values: { x: 120 }, progress: 0, into: 0, length: 1 }]);
  assert.deepEqual(shownAt(picture, 12).actions, [{ who: "sq", action: "slide", values: { x: 120 }, progress: 0.7, into: 0.7, length: 1 }]);
  // Its last frame is 14: from 15 on it is done, and stays so, under the one that follows it.
  assert.equal(shownAt(picture, 14).actions[0]!.progress, 0.9);
  assert.equal(shownAt(picture, 15).actions[0]!.progress, 1);
  assert.deepEqual(shownAt(picture, 27).actions, [
    { who: "sq", action: "slide", values: { x: 120 }, progress: 1, into: 2.2, length: 1 },
    { who: "sq", action: "slide", values: { x: 20 }, progress: 0.4, into: 0.2, length: 0.5 },
  ]);
  // The next scene begins anew.
  assert.equal(shownAt(picture, 31).actions.length, 2);
  assert.deepEqual(shownAt(picture, 32), { time: 3.2, setting: { colour: "#4040d0" }, actions: [], mouths: {} });
});

test("how far through an action was at any moment before a frame is worked out from how long ago it began, and how long it lasts", () => {
  // The slide's 10 frames are 5 to 14, and the slide back's 5 are 25 to 29.
  const [late] = shownAt(picture, 27).actions;
  for (const frame of [5, 9, 14, 15, 20]) {
    const ago = (27 - frame) / 10;
    const [then] = shownAt(picture, frame).actions;
    assert.ok(Math.abs(Math.min(1, (late!.into - ago) / late!.length) - then!.progress) < 1e-9, `frame ${frame}`);
  }
});

test("a speaker's mouth is open as its line's track has it in that frame, and closed in every other", () => {
  const open = (frame: number) => shownAt(picture, frame).mouths;
  assert.deepEqual([17, 18, 19, 20, 21, 22].map(open), [{}, { sq: 0.25 }, { sq: 1 }, {}, { sq: 0.5 }, {}]);
  assert.deepEqual([36, 37, 38, 39, 40].map(open), [{}, { narrator: 0.5 }, { narrator: 0.5 }, {}, {}]);
  // Where two of one speaker's lines sound in a frame, the wider mouth shows.
  const twice = structuredClone(picture);
  twice.scenes[0]!.mouths.push({ who: "sq", from: 18, open: [0.75, 0.5] });
  assert.deepEqual([18, 19].map((frame) => shownAt(twice, frame).mouths), [{ sq: 0.75 }, { sq: 1 }]);
});

test("every frame of the video shows one scene, and a frame it does not have is refused", () => {
  for (let frame = 0; frame < compiled.frames; frame++) assert.deepEqual(shownAt(picture, frame).setting, SCENES[frame < 32 ? 0 : 1]!.setting, `frame ${frame}`);
  for (const frame of [-1, compiled.frames]) assert.throws(() => shownAt(picture, frame), new RegExp(`the compiled scenario has no frame ${frame}`));
});

test("the picture's part has no words, files, captions, loudness or lines: a change to them draws nothing again", () => {
  const texts: string[] = [];
  JSON.stringify(picture, (key, value) => (texts.push(key), value));
  for (const key of ["text", "file", "captions", "loudness", "line", "made"]) assert.ok(!texts.includes(key), key);
  const other = (edit: (c: Compiled) => void) => {
    const copy = structuredClone(compiled);
    edit(copy);
    return pictureOf(copy);
  };
  assert.deepEqual(other((c) => (c.loudness = -20)), picture);
  assert.deepEqual(other((c) => (c.scenes[0]!.lines[1]!.line = 60)), picture);
  assert.notDeepEqual(other((c) => (c.scenes[0]!.lines[0]!.from = 6)), picture);
});
