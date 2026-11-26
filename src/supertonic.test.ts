// Supertonic (supertonic.ts), with no model: its voices, a text as the model reads it, a long one in
// parts, and what it says when it cannot speak. What it says is heard: npm run video -- voices.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { isSupertonicVoice, modelText, partsOf, SupertonicProvider, SUPERTONIC, SUPERTONIC_VOICES } from "./supertonic.ts";
import { enginesIn, KokoroProvider, toolVoices } from "./tts.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-supertonic-"));
after(() => rm(scratch, { recursive: true, force: true }));

test("its ten voices are named in each of its two languages, and join Kokoro's in the table", async () => {
  assert.equal(SUPERTONIC_VOICES.length, 20);
  assert.deepEqual(SUPERTONIC_VOICES[0], { name: "uk_f1", language: "uk", gender: "Female" });
  assert.deepEqual(SUPERTONIC_VOICES.at(-1), { name: "ru_m5", language: "ru", gender: "Male" });
  assert.ok(isSupertonicVoice("uk_m3") && isSupertonicVoice("ru_f5"));
  for (const not of ["uk_f6", "en_f1", "uk-f1", "UK_F1", "am_puck", "F1"]) assert.ok(!isSupertonicVoice(not), not);

  const voices = await toolVoices();
  assert.equal(voices.length, 48);
  assert.deepEqual(new Set(voices.map((v) => v.language)), new Set(["en-us", "en-gb", "uk", "ru"]));
  assert.equal(new Set(voices.map((v) => v.name)).size, 48);
});

test("a voice's name picks its engine", () => {
  const engines = enginesIn(scratch);
  assert.ok(engines("uk_f1") instanceof SupertonicProvider);
  assert.equal(engines("ru_m2"), engines("uk_f1"));
  assert.ok(engines("am_puck") instanceof KokoroProvider);
  // Kokoro is asked for any other, and refuses one it lacks.
  assert.ok(engines("nobody") instanceof KokoroProvider);
});

test("a text is read as its example reads it: decomposed, its marks evened, ended, in its language's tags", () => {
  assert.equal(modelText("Це Піп.", "uk"), "<uk>Це Піп.</uk>");
  // й and ї are a letter and a mark, as the model knows them.
  assert.equal(modelText("й", "uk"), "<uk>й.</uk>");
  assert.equal(modelText("Привіт — Кроте", "uk"), "<uk>Привіт - Кроте.</uk>");
  // Ukrainian's apostrophe and low quote, which it lacks, are its own.
  assert.equal(modelText("Мʼята „чай“", "uk"), "<uk>М'ята \"чай\"</uk>".normalize("NFKD"));
  assert.equal(modelText("  Гонка !  ", "ru"), "<ru>Гонка!</ru>");
  assert.equal(modelText("«Да»", "ru"), "<ru>«Да»</ru>");
});

test("a long text is said in parts of at most 300 characters, split between sentences", () => {
  const sentence = "Это одно предложение, в котором ровно пятьдесят б."; // 50 characters
  assert.equal(sentence.length, 50);
  const text = Array.from({ length: 7 }, () => sentence).join(" ");
  const parts = partsOf(text);
  // Five sentences and the spaces between them; a sixth would make 305.
  assert.deepEqual(parts.map((p) => p.length), [254, 101]);
  assert.equal(parts.join(" "), text);
  assert.deepEqual(partsOf("Раз. Два!"), ["Раз. Два!"]);
  assert.deepEqual(partsOf("Раз.\n\nДва."), ["Раз.", "Два."]);
});

test("with its model missing it says so, rather than fetch it, and it refuses a voice it lacks first", async () => {
  const empty = path.join(scratch, "no-model");
  const provider = new SupertonicProvider(empty);
  await assert.rejects(provider.synth({ text: "Привіт.", voice: "uk_f7", speed: 1 }), /Unknown voice "uk_f7"/);
  await assert.rejects(
    provider.synth({ text: "Привіт.", voice: "uk_f1", speed: 1 }),
    (err: Error) => err.message.startsWith(`The voice model ${SUPERTONIC} is not complete in ${path.join(empty, "Supertone", "supertonic-3")} (`) && /Run "npm run video -- setup"/.test(err.message),
  );
});
