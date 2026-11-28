// The tool's own stress marks (marks.ts): a word of a line with no mark of the writer's is given the one
// its language's source has for it, and what the source was not sure of is listed. The rules are tried with a
// source that is a table; the sources themselves (stress-uk.ts, stress-ru.ts) on words whose stress is
// known, when setup has fetched their files, as it has wherever a video is made.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { compile, saidLines } from "./compile.ts";
import { sceneCaptions } from "./compose.ts";
import { markWith, markerIn, unsureRows, type Asked, type Marker, type Source, type Stress } from "./marks.ts";
import type { VideoScript } from "./script.ts";
import { cachePaths, cacheRoot, marksReady } from "./setup.ts";
import { STRESS, lineWords, unstressed, vowelsOf, withStress } from "./stress.ts";
import { narrate } from "./timeline.ts";
import type { TtsProvider, TtsRequest } from "./tts.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-marks-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A text with a stress wherever it has a plus after a letter. */
const marked = (text: string) => text.replaceAll("+", STRESS);

/** A source that is a table of words, in lowercase, and says what it was asked. */
function table(stresses: Record<string, Stress>): Source & { asked: { line: string; asked: Asked[] }[] } {
  const asked: { line: string; asked: Asked[] }[] = [];
  return {
    asked,
    stresses: async (line, words) => {
      asked.push({ line, asked: words });
      return words.map(({ word }) => stresses[word.toLowerCase()] ?? {});
    },
  };
}

test("a word's vowels are counted from 0, and a stress goes after the one numbered", () => {
  assert.deepEqual(vowelsOf("замок"), [1, 3]);
  assert.deepEqual(vowelsOf("в'язі"), [2, 4]);
  assert.deepEqual(vowelsOf("край"), [2]);
  assert.equal(withStress("замок", [0]), marked("за+мок"));
  assert.equal(withStress("Замок", [1]), marked("Замо+к"));
  assert.equal(withStress("завжди", [0, 1]), marked("за+вжди+"));
});

test("a line's words are its runs of letters, an apostrophe between two, each with where its vowels end", () => {
  const text = marked("Це за+мок, а в'язі — ні.");
  const words = lineWords(text);
  assert.deepEqual(words.map((word) => [word.bare, word.marked]), [["Це", false], ["замок", true], ["а", false], ["в'язі", false], ["ні", false]]);
  // A stress put where a vowel ends is that vowel's.
  const vyazi = words[3]!;
  assert.equal(text.slice(vyazi.from, vyazi.to), "в'язі");
  assert.deepEqual(vyazi.ends.map((end) => text.slice(vyazi.from, end)), ["в'я", "в'язі"]);
  // й, ї and ё written as a letter and its mark are one letter each: й is no vowel, and ї's stress goes after its dots.
  const dotted = "Україна й ёж";
  assert.deepEqual(lineWords(dotted).map((word) => [word.bare, word.ends.length]), [["Україна", 4], ["й", 0], ["ёж", 1]]);
  assert.equal(dotted.slice(0, lineWords(dotted)[0]!.ends[2]), "Украї");
});

test("each word with no mark is given the source's, in the line as written: a writer's mark is kept, and a word of one vowel or of other letters is not asked about", async () => {
  const source = table({ замок: { vowel: 1 }, старий: { vowel: 1 }, біля: { vowel: 0 } });
  const text = marked("Старий за+мок — не замок біля cafe, а дім.");
  const { text: said, unsure } = await markWith(text, source);
  assert.equal(said, marked("Стари+й за+мок — не замо+к бі+ля cafe, а дім."));
  assert.deepEqual(unsure, []);
  // The source reads the line with no marks, and is asked only of the words that have none and two vowels or more.
  assert.deepEqual(source.asked, [{ line: "Старий замок — не замок біля cafe, а дім.", asked: [{ at: 0, word: "Старий" }, { at: 18, word: "замок" }, { at: 24, word: "біля" }] }]);
  // What is shown is the line as written, whatever was marked.
  assert.equal(unstressed(said), unstressed(text));

  // A word the source says nothing of is as written; so is one whose vowel it numbers wrong.
  assert.equal((await markWith("Старий замок, новий замок.", table({ старий: { vowel: 5 } }))).text, "Старий замок, новий замок.");
  // A line with nothing to ask asks nothing: every word marked, short, or of other letters.
  const never: Source = { stresses: async () => assert.fail("asked") };
  for (const line of [marked("За+мок і дім."), "Так, це він!", "Hello there, café.", ""]) assert.deepEqual(await markWith(line, never), { text: line, unsure: [] });
  // ї written as і and its dots is stressed after the dots, and the line without stresses is as written.
  const dotted = "Україна";
  assert.equal((await markWith(dotted, table({ україна: { vowel: 2 } }))).text, `Украї${STRESS}на`);
});

test("a word the source was not sure of is listed as it is said, with why, and the lines that say it", async () => {
  const source = table({ гнізда: { vowel: 1, unsure: marked("or гні+зда") }, ропухових: { vowel: 2, unsure: "not in the dictionary" }, самого: { unsure: marked("са+мого or само+го") }, пташині: { vowel: 1 } });
  const lines = ["Пташині гнізда високо.", "Біля Ропухових хащів самого лісу.", "Гнізда, гнізда всюди."];
  const said = [];
  for (const [i, line] of lines.entries()) said.push({ line: i + 3, ...(await markWith(line, source)) });
  assert.deepEqual(said.map(({ text }) => text), [marked("Пташи+ні гнізда+ високо."), marked("Біля Ропухо+вих хащів самого лісу."), marked("Гнізда+, гнізда+ всюди.")]);
  assert.deepEqual(said[1]!.unsure, [
    { word: marked("Ропухо+вих"), why: "not in the dictionary", left: false },
    { word: "самого", why: marked("са+мого or само+го"), left: true },
  ]);
  // A row for each word as it is said, its capital too, with every line that says it, once.
  assert.deepEqual(unsureRows(said), [
    marked("гнізда+ (or гні+зда): lines 3, 5"),
    marked("Ропухо+вих (not in the dictionary): line 4"),
    marked("самого (са+мого or само+го), left to the voice: line 4"),
    marked("Гнізда+ (or гні+зда): line 5"),
  ]);
  assert.deepEqual(unsureRows([{ line: 1, unsure: [] }]), []);
});

test("the voice is asked for a line with the tool's marks, and no caption shows them: a plan's line and a script's", async () => {
  const mark: Marker = (text) => markWith(text, table({ замок: { vowel: 0, unsure: marked("or замо+к") }, старий: { vowel: 1 } }));
  const asked: TtsRequest[] = [];
  const voice: TtsProvider = {
    id: "a voice that says nothing",
    synth: async (req) => (asked.push(req), { samples: new Float32Array(2400).fill(0.5), sampleRate: 24000 }),
    voices: async () => ["uk_f1"],
  };
  const script: VideoScript = {
    title: "marks",
    language: "uk",
    voice: "uk_f1",
    cast: {},
    speed: 1,
    fps: 30,
    loudness: -14,
    timing: { lead: 0.6, gap: 0.4, tail: 1, moves: { slowest: 0.5, fastest: 2 } },
    scenes: [{ id: "one", limits: {}, narration: [{ text: "Старий замок." }] }],
  };
  const [lines] = await narrate(script, () => voice, scratch, () => {}, mark);
  assert.deepEqual(asked, [{ text: marked("Стари+й за+мок."), voice: "uk_f1", speed: 1 }]);
  assert.deepEqual(lines!.map(({ text, unsure }) => [text, unsure]), [[marked("Стари+й за+мок."), [{ word: marked("за+мок"), why: marked("or замо+к"), left: false }]]]);
  const captions = sceneCaptions({ id: "one", start: 0, duration: 3, lines: lines!.map((line) => ({ ...line, start: 0.6, localStart: 0.6 })) });
  assert.deepEqual(captions.map((caption) => caption.text), ["Старий замок."]);

  // A script's line: the compiled scenario has it as the voice was given it, and its captions as written.
  const items = [{ line: 2, who: "narrator", action: "say", text: "Старий замок.", volume: 0 }];
  const compiled = compile([{ line: 1, setting: {}, lead: 0.5, pause: 0.3, tail: 1, items }], [{ file: "a.wav", duration: 2, mouth: [], text: marked("Стари+й за+мок.") }], { fps: 10, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "marks.yaml");
  const [said] = saidLines(compiled.scenes);
  assert.equal(said!.text, marked("Стари+й за+мок."));
  assert.deepEqual(said!.captions.map((caption) => caption.text), ["Старий замок."]);
});

test("a line in English is as written, with no file read; one in Ukrainian or Russian with its files missing says so, and fetches nothing", async () => {
  const empty = path.join(scratch, "no-models");
  const mark = markerIn(empty);
  assert.deepEqual(await mark("Hello there, everybody.", "en"), { text: "Hello there, everybody.", unsure: [] });
  // A line with nothing to mark reads nothing either.
  assert.deepEqual(await mark("Так, це він!", "uk"), { text: "Так, це він!", unsure: [] });
  await assert.rejects(mark("Привіт усім.", "uk"), (err: Error) => err.message.startsWith(`The Ukrainian stress dictionary (lang-uk/ukrainian-word-stress) is not complete in ${path.join(empty, "lang-uk", "ukrainian-word-stress")} (`) && /Run "npm run video -- setup"/.test(err.message));
  await assert.rejects(mark("Привет всем, друзья.", "ru"), (err: Error) => err.message.startsWith(`The Russian homographs and their model (ruaccent/accentuator) are not complete in ${path.join(empty, "ruaccent", "accentuator")} (`) && /Run "npm run video -- setup"/.test(err.message));
});

// --- The sources themselves, on the files setup fetched.

const cache = cacheRoot(ROOT);
const fetched = marksReady(cache);
const skip = fetched ? false : `what marks a word's stress is not in ${cachePaths(cache).models}: npm run video -- setup`;
const real = markerIn(cachePaths(cache).models);

test("Ukrainian: a word with one stress has it, a pronoun the tool's own, and a word with two accepted one of them", { skip }, async () => {
  const say = async (text: string) => (await real(text, "uk")).text;
  assert.equal(await say("Привіт, як справи?"), marked("Приві+т, як спра+ви?"));
  assert.equal(await say("Цілий ранок він прибирав свою нірку."), marked("Ці+лий ра+нок він прибира+в свою+ ні+рку."));
  // The tool's own: forms the dictionary lacks or has otherwise, and those whose stress moves after a preposition.
  assert.equal(await say("Його бачать, а йому весело."), marked("Його+ ба+чать, а йому+ ве+село."));
  assert.equal(await say("Він бачить мене. Він іде до мене."), marked("Він ба+чить мене+. Він іде+ до ме+не."));
  assert.equal(await say("Чого ти хочеш? Для чого це?"), marked("Чого+ ти хо+чеш? Для чо+го це?"));
  assert.equal(await say("Кому це треба? На кому шапка?"), marked("Кому+ це тре+ба? На ко+му ша+пка?"));
  assert.equal(await say("По-моєму, так."), marked("По-мо+єму, так."));
  // A word with two accepted stresses has one mark.
  for (const word of ["завжди", "помилка", "високо"]) assert.equal((await say(word)).split(STRESS).length - 1, 1, word);
  // A writer's mark is kept, whatever the dictionary has.
  assert.equal(await say(marked("Йо+го і за+вжди+.")), marked("Йо+го і за+вжди+."));
});

test("Ukrainian: a word stressed by what it means is a guess of the dictionary's own stresses, listed; so is one the dictionary lacks", { skip }, async () => {
  const castle = await real("Старий замок стоїть.", "uk");
  assert.equal(castle.unsure.length, 1);
  const [{ word, why, left }] = castle.unsure as [{ word: string; why: string; left: boolean }];
  assert.ok([marked("за+мок"), marked("замо+к")].includes(word), word);
  assert.equal(why, `or ${word === marked("за+мок") ? marked("замо+к") : marked("за+мок")}`);
  assert.equal(left, false);
  assert.ok(castle.text.includes(word));
  // With the writer's mark there is nothing to guess.
  assert.deepEqual(await real(marked("Старий замо+к стоїть."), "uk"), { text: marked("Стари+й замо+к стої+ть."), unsure: [] });
  const made = await real("Це бурмоглик.", "uk");
  assert.deepEqual(made.unsure.map(({ word, why }) => [unstressed(word), why]), [["бурмоглик", "not in the dictionary"]]);
});

test("Russian: a homograph has the stress its sentence gives it, and any other word no mark, so the voice stresses it itself", { skip }, async () => {
  const say = async (text: string) => (await real(text, "ru")).text;
  assert.equal(await say("Старинный замок стоял на высоком холме."), marked("Старинный за+мок стоял на высоком холме."));
  assert.equal(await say("Он повесил на дверь новый замок."), marked("Он повесил на дверь новый замо+к."));
  assert.equal(await say("Бабушка купила муку и испекла пирог."), marked("Бабушка купила муку+ и испекла пирог."));
  assert.equal(await say("Завтра не могу. У меня важные дела."), marked("Завтра не могу. У меня важные дела+."));
  // Words the voice reads by rules of its own, which a mark breaks (a ё, сегодня's г, конечно's чн), have none.
  for (const line of ["Привет, как тебя зовут?", "Серёга, сегодня я, конечно, никого другого не жду.", "По-моему, это он."]) assert.equal(await say(line), line);
  // A ё says its own stress: the one homograph that has one is never marked on it.
  assert.ok(!(await say("Сёгун правил страной.")).includes(`ё${STRESS}`));
  // A writer's mark is kept, on a homograph and on any other word.
  assert.equal(await say(marked("Старинный замо+к. Мо+лодость!")), marked("Старинный замо+к. Мо+лодость!"));
  // Nothing is listed: a word its list lacks is the voice's, and a homograph the network's to decide.
  assert.deepEqual(await real("Это Мейсис у окна.", "ru"), { text: marked("Это Мейсис у окна+."), unsure: [] });
});
