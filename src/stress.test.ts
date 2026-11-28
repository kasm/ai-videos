// A word's stress (stress.ts): the mark right after a vowel, which the voice reads, and which no
// caption shows and no word has.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { captionsOf } from "./captions.ts";
import { compile, saidLines } from "./compile.ts";
import { sceneCaptions } from "./compose.ts";
import { GUIDE_WORDS } from "./guide.ts";
import { unmarked } from "./marks.ts";
import type { VideoScript } from "./script.ts";
import { STRESS, mismarked, unstressed } from "./stress.ts";
import { modelText } from "./supertonic.ts";
import { narrate } from "./timeline.ts";
import type { TtsProvider, TtsRequest } from "./tts.ts";
import { sharesOf, wordList } from "./words.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-stress-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A text with a stress wherever it has an apostrophe after a letter. */
const marked = (text: string) => text.replaceAll("'", STRESS);

test("a stress is the mark right after a vowel, of either case, and a text without its stresses is as written before them", () => {
  assert.equal(STRESS, "\u0301");
  assert.equal(unstressed(marked("Це за'мок, а не замо'к.")), "Це замок, а не замок.");
  assert.equal(unstressed(marked("А'тлас і атла'с, Я'ЛТА")), "Атлас і атлас, ЯЛТА");
  // Every vowel of the two languages, and a word with two stresses.
  for (const vowel of "аеёиоуыэюяіїє") assert.equal(unstressed(`${vowel}${STRESS}`), vowel, vowel);
  assert.equal(unstressed(marked("тё'мно-си'ний")), "тёмно-синий");
  // ї and ё written as a letter and its two dots keep the dots.
  for (const word of ["Украї'на", "ё'ж"]) assert.equal(unstressed(marked(word).normalize("NFD")), word.replaceAll("'", "").normalize("NFD"), word);
  // A text with none is itself, and so is a mark that is no stress: another alphabet's, a consonant's.
  for (const text of ["Це замок.", "It is a café.", "cafe\u0301", marked("замок'"), "краи\u0306'".replace("'", STRESS)]) assert.equal(unstressed(text), text, text);
});

test("a mark that is no stress is found, with its word: after a letter that is no vowel, or a second one after a vowel", () => {
  assert.equal(mismarked(marked("Це замок', а не за'мок.")), marked("замок'"));
  assert.equal(mismarked(marked("Це за''мок.")), marked("за''мок"));
  // й is no vowel, written as one letter or as и and its mark.
  assert.equal(mismarked(marked("Мій' край")), marked("Мій'"));
  assert.equal(mismarked(marked("край'").normalize("NFD")), marked("край'").normalize("NFD"));
  for (const good of ["Це замок.", marked("Це за'мок, а не замо'к."), marked("Украї'на").normalize("NFD"), marked("тё'мно-си'ний"), "It is a café.", "cafe\u0301 і за\u0301мок", ""]) {
    assert.equal(mismarked(good), undefined, good);
  }
});

test("a word is the line's without its stress, which weighs nothing: an anchor names it with the mark or without", () => {
  const line = marked("Вчора я бачив за'мок, а на две'рях був замо'к.");
  const plain = "Вчора я бачив замок, а на дверях був замок.";
  assert.deepEqual(wordList(line), wordList(plain));
  assert.deepEqual(wordList(line).slice(3, 4), ["замок"]);
  for (const said of ["бачив", "дверях", marked("две'рях"), "замок", "замок а", marked("замо'к а"), "був замок"]) assert.deepEqual(sharesOf(line, said), sharesOf(plain, said), said);
  assert.equal(sharesOf(line, "замок").length, 2);
  assert.equal(sharesOf(line, "дверях").length, 1);
});

test("the voice reads the mark, and no caption shows it: a plan's line", async () => {
  const text = marked("Це за'мок, а не замо'к.");
  // What Supertonic's model is given has the marks, as written.
  assert.equal(modelText(text, "uk"), `<uk>${text}</uk>`);
  const asked: TtsRequest[] = [];
  const voice: TtsProvider = {
    id: "a voice that says nothing",
    synth: async (req) => (asked.push(req), { samples: new Float32Array(2400).fill(0.5), sampleRate: 24000 }),
    voices: async () => ["uk_f1"],
  };
  const script: VideoScript = {
    title: "stress",
    language: "uk",
    voice: "uk_f1",
    cast: {},
    speed: 1,
    fps: 30,
    loudness: -14,
    timing: { lead: 0.6, gap: 0.4, tail: 1, moves: { slowest: 0.5, fastest: 2 } },
    scenes: [{ id: "one", limits: {}, narration: [{ text }] }],
  };
  const [lines] = await narrate(script, () => voice, scratch, () => {}, unmarked);
  assert.deepEqual(asked, [{ text, voice: "uk_f1", speed: 1 }]);
  const captions = sceneCaptions({ id: "one", start: 0, duration: 3, lines: lines!.map((line) => ({ ...line, start: 0.6, localStart: 0.6 })) });
  assert.deepEqual(captions.map((caption) => caption.text), ["Це замок, а не замок."]);
});

test("the voice reads the mark, and no caption shows it: a script's line, alone and in a row", () => {
  const text = marked("Це за'мок, а не замо'к.");
  const say = (line: number, who: string) => ({ line, who, action: "say", text, volume: 0 });
  const voices = [{ file: "a.wav", duration: 2, mouth: [] }, { file: "b.wav", duration: 2, mouth: [] }, { file: "c.wav", duration: 2, mouth: [] }];
  // One alone, then two at once, each in a row.
  const items = [say(2, "narrator"), { order: "together" as const, line: 3, items: [say(4, "pip"), say(5, "mo")] }];
  const compiled = compile([{ line: 1, setting: {}, lead: 0.5, pause: 0.3, tail: 1, items }], voices, { fps: 10, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "stress.yaml");
  const said = saidLines(compiled.scenes);
  assert.equal(said.length, 3);
  // A said line is as written: its voice was asked for that text.
  for (const line of said) assert.equal(line.text, text);
  assert.deepEqual(said.map((line) => line.captions.map((caption) => [caption.text, caption.row])), [[["Це замок, а не замок.", undefined]], [["Це замок, а не замок.", 1]], [["Це замок, а не замок.", 2]]]);
  assert.ok(!JSON.stringify(said.flatMap((line) => line.captions)).includes(STRESS));
  // A caption is timed by what it shows: a line marked all through is split as one with no mark.
  const long = "Вчора ввечері я бачив борсука біля ставка, і він помахав мені лапою, наче добре мене знає.";
  const all = long.replace(/[аеиоуіяює]/g, (vowel) => vowel + STRESS);
  assert.deepEqual(captionsOf(all, 0, 10), captionsOf(long, 0, 10));
  assert.deepEqual(captionsOf(all, 0, 10, true), captionsOf(long, 0, 10, true));
});

test("the guide says how a word's stress is marked, in each language, and what is refused", () => {
  for (const [language, { script }] of Object.entries(GUIDE_WORDS)) {
    assert.ok(script.includes(`за${STRESS}мок`) && script.includes(`замо${STRESS}к`), language);
  }
  assert.match(GUIDE_WORDS.en.script, /an acute right after the stressed vowel, as in .* The voice reads the mark, and the captions leave it out\.\n/);
  assert.match(GUIDE_WORDS.en.script, /\n- A stress mark that is not right after a vowel\.\n/);
});
