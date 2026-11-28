// Ukrainian: which vowel of a word is stressed (AGENTS.md, "A word's stress"), from this disk alone.
//
// 1. A few pronouns by the tool's own table, below: forms the dictionary lacks or has one-sidedly, and those
//    whose stress moves after a preposition (мене́, до ме́не).
// 2. The dictionary: lang-uk's ukrainian-word-stress (MIT), its trie of 2.9 million forms, read as its
//    stressify_.py reads it. A form with one stress has it. A form with two, either of them right
//    (за́вжди́), has the one the model below would say, else the first.
// 3. A form the dictionary has under two stresses by what it means (гні́зда, гнізда́), or lacks, is a guess:
//    Silero's stress model (snakers4/silero-stress, MIT), which reads the word's letters and no line. Silero
//    publishes it for PyTorch alone: these are its weights as TigreGotico/stressonnx-models exports them to
//    ONNX, read as stressonnx's backends/silero.py reads them (Apache-2.0). A guess is said only when it is
//    one of the dictionary's own stresses for the word, and the word is one the tool was not sure of.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { Marisa } from "./marisa.ts";
import type { Asked, Source, Stress } from "./marks.ts";
import { pinnedDir, type Pinned } from "./pinned.ts";
import { vowelsOf, withStress } from "./stress.ts";

const DICTIONARY_REVISION = "541d33edf89042913006c50968f91fd48a2b71db";
const TRIE = "ukrainian_word_stress/data/stress.trie";

/** The dictionary, on GitHub, at the commit fetched. */
export const UK_DICTIONARY: Pinned = {
  what: "the Ukrainian stress dictionary",
  name: "lang-uk/ukrainian-word-stress",
  url: (file) => `https://raw.githubusercontent.com/lang-uk/ukrainian-word-stress/${DICTIONARY_REVISION}/${file}`,
  files: {
    [TRIE]: { size: 12584944, sha256: "c84b7add428b9fc1698b3abdac5a13f53361114d687eaa9b5e6116f1ca4fbbec" },
    LICENSE: { size: 1064, sha256: "2f4c8cca038e1748c35bacabc7eef608abdba63684041b7d24f2514ddae82f3f" },
  },
};

const GUESSES_REVISION = "cb1594ddf81928e678a3a7ee7a22415e6e3a218f";

/** Silero's model as ONNX, on Hugging Face, at the revision fetched. */
export const UK_GUESSES: Pinned = {
  what: "the Ukrainian stress model",
  name: "TigreGotico/stressonnx-models",
  url: (file) => `https://huggingface.co/TigreGotico/stressonnx-models/resolve/${GUESSES_REVISION}/${file}`,
  files: {
    "ukr/accentor.onnx": { size: 74749, sha256: "1de8dc05665c457da1ad448f081447aa4ca15a13a96a10cdf4b2b7295bca4d1f" },
    "ukr/embedding.npy": { size: 8364544, sha256: "95b4fab814cea91b4cb1d2bf7213ad1adddd102a8c6749642becf62e52155255" },
    "ukr/exceptions.txt.gz": { size: 352153, sha256: "8bfd4412a6c0588449f419cbfa334d32c2285e3652cff9ada3052b82491a8104" },
    "ukr/ngram_dict.txt.gz": { size: 727379, sha256: "a8a8ad82b57e30f536c60c8bc9be45cf1d593118cce58f10fad6afcbc35ca6f3" },
    "ukr/meta.json": { size: 1776, sha256: "af135d0f9d5260c7299d9a6b6713d37115e0758fc755e52ed302da7e746a6067" },
    "ukr/LICENSE.silero-stress": { size: 1075, sha256: "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b" },
  },
};

// --- The tool's own: pronouns.

/** Forms the dictionary lacks, or has with a stress that is not theirs, each with its one stress: його́, ньо́го. */
const OWN: Record<string, number> = { його: 1, йому: 1, ньому: 0, нього: 0, її: 1, неї: 0, нею: 0, нами: 0, вами: 0, ними: 0 };

/** Forms that are two words, of which the dictionary has one: ні́кого (there is nobody to) and ніко́го (nobody). */
const OWN_READINGS: Record<string, number[][]> = { нікого: [[0], [1]] };

/** Forms stressed on their last vowel, and after a preposition on the one before it: мене́, до ме́не; того́, після то́го. */
const MOVING = new Set(["мене", "тебе", "себе", "кого", "чого", "того", "цього", "всього", "усього", "мого", "твого", "свого"]);
const PREPOSITIONS = new Set("без біля в від відо для до з за зі із зо коло крізь крім між на над о об од окрім перед під після по поза попри при про проти серед у через щодо".split(" "));

/** The same of the forms in -ому, after a preposition that takes the locative: кому́, на ко́му; цьому́, у цьо́му. */
const MOVING_IN = new Set(["кому", "чому", "тому", "цьому", "всьому", "усьому"]);
const LOCATIVE = new Set(["на", "у", "в", "по", "при", "о", "об"]);

/** After по-, stressed on their first vowel: по-мо́єму. */
const AFTER_PO = new Set(["моєму", "твоєму", "своєму"]);

// --- The dictionary.

/** The vowels a reading of a word stresses, counted from 0. */
type Reading = number[];

const plainApostrophe = (word: string) => word.replace(/[’ʼ`]/g, "'");
const capitalized = (word: string) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();

/**
 * The dictionary's trie: a word, a byte 0xFF, and its value are a key. A value is where the word's marks go,
 * a byte each (a mark's place is after its vowel, in the word's letters); or, of a word stressed by what it
 * means, each reading: its marks, 0xFE, its tags, 0xFF.
 */
class Dictionary {
  readonly #trie: Marisa;
  constructor(trie: Marisa) {
    this.#trie = trie;
  }

  /** An entry's readings, each with a stress; none for a word it lacks. */
  entry(word: string): Reading[] | undefined {
    const [value] = this.#trie.after(Buffer.concat([Buffer.from(word, "utf8"), Buffer.from([0xff])]));
    if (!value) return undefined;
    const letters = Array.from(word);
    const vowels = vowelsOf(word);
    // A place is counted in letters, and a vowel's number in the word's vowels.
    const vowelAt = (place: number) => vowels.indexOf(letters.slice(0, place - 1).join("").length);
    const reading = (places: Uint8Array): Reading => Array.from(places, vowelAt).filter((vowel) => vowel >= 0);
    const readings: Reading[] = [];
    if (!value.includes(0xff)) readings.push(reading(value));
    else {
      let from = 0;
      for (let at = value.indexOf(0xff); at >= 0; from = at + 1, at = value.indexOf(0xff, from)) {
        const item = value.subarray(from, at);
        const tags = item.indexOf(0xfe);
        readings.push(reading(tags < 0 ? item : item.subarray(0, tags)));
      }
    }
    const stressed = readings.filter((one) => one.length > 0);
    return stressed.length > 0 ? stressed : undefined;
  }

  /**
   * A word's readings, by how it is written. A lowercase word, or a sentence's first, has those of the
   * lowercase entry, and of the capitalized one only when there is no other. A capitalized word inside a
   * sentence may be a name or a common word written as one (the Mole, Кріт), so it has both.
   */
  readings(word: string, first: boolean): Reading[] | undefined {
    const plain = plainApostrophe(word);
    const low = this.entry(plain.toLowerCase());
    const cap = this.entry(capitalized(plain));
    const name = plain[0] !== plain[0]!.toLowerCase() && !first;
    if (!name) return low ?? cap;
    return low || cap ? [...(low ?? []), ...(cap ?? [])] : undefined;
  }
}

// --- The model.

type Ort = typeof import("onnxruntime-node");
type Session = import("onnxruntime-node").InferenceSession;

/** A NumPy file of 32-bit floats in rows: how wide a row is, and the numbers. */
function readRows(file: Buffer): { width: number; numbers: Float32Array } {
  const two = file[6] !== 1;
  const from = (two ? 12 : 10) + (two ? file.readUInt32LE(8) : file.readUInt16LE(8));
  const header = file.subarray(two ? 12 : 10, from).toString("latin1");
  const shape = header.match(/'shape':\s*\((\d+),\s*(\d+)\)/);
  if (file.subarray(0, 6).toString("latin1") !== "\x93NUMPY" || !/'descr':\s*'<f4'/.test(header) || /'fortran_order':\s*True/.test(header) || !shape) throw new Error(`no rows of 32-bit floats: ${header.trim()}`);
  const count = Number(shape[1]) * Number(shape[2]);
  return { width: Number(shape[2]), numbers: new Float32Array(file.buffer.slice(file.byteOffset + from, file.byteOffset + from + count * 4)) };
}

/** Silero's model: a word's stress from its letters, by its table of exceptions, else by its network. */
class Guesses {
  readonly #ort: Ort;
  readonly #session: Session;
  readonly #width: number;
  readonly #vectors: Float32Array;
  readonly #ngrams = new Map<string, number>();
  /** A word, in its own letters alone, to the letter of it that is stressed. */
  readonly #exceptions = new Map<string, number>();
  readonly #other: RegExp;
  readonly #vowels: string;

  constructor(ort: Ort, session: Session, files: { meta: string; vectors: Buffer; ngrams: string; exceptions: string }) {
    this.#ort = ort;
    this.#session = session;
    const meta = JSON.parse(files.meta) as { alpha: string; vowels: string };
    this.#other = new RegExp(`[^${meta.alpha.replace(/[\]\\^-]/g, "\\$&")}]`, "g");
    this.#vowels = meta.vowels;
    const rows = readRows(files.vectors);
    this.#width = rows.width;
    this.#vectors = rows.numbers;
    for (const row of files.ngrams.split("\n")) {
      const tab = row.lastIndexOf("\t");
      if (tab > 0) this.#ngrams.set(row.slice(0, tab), Number(row.slice(tab + 1)));
    }
    for (const row of files.exceptions.split("\n")) {
      const [word, letter] = row.split("\t");
      if (word && letter !== undefined) this.#exceptions.set(word, Number(letter));
    }
  }

  static async in(dir: string): Promise<Guesses> {
    const ort = await import("onnxruntime-node");
    const file = (name: string) => readFile(path.join(dir, "ukr", name));
    const unzipped = async (name: string) => gunzipSync(await file(name)).toString("utf8");
    const session = await ort.InferenceSession.create(path.join(dir, "ukr", "accentor.onnx"));
    return new Guesses(ort, session, { meta: (await file("meta.json")).toString("utf8"), vectors: await file("embedding.npy"), ngrams: await unzipped("ngram_dict.txt.gz"), exceptions: await unzipped("exceptions.txt.gz") });
  }

  /** The vowel of a word it would stress, counted from 0; none when it is no surer of one than of the rest. */
  async guess(word: string): Promise<number | undefined> {
    const lower = word.toLowerCase();
    // The model's own letters of the word, and where each is in it.
    const kept = Array.from(lower, (_, i) => i).filter((i) => lower[i]!.replace(this.#other, "") !== "");
    const own = kept.map((i) => lower[i]).join("");
    const vowelAt = (letter: number | undefined) => (letter === undefined ? undefined : vowelsOf(lower).indexOf(letter));
    const found = (vowel: number | undefined) => (vowel === undefined || vowel < 0 ? undefined : vowel);
    const exception = this.#exceptions.get(own);
    if (exception !== undefined) return found(vowelAt(kept[exception]));
    if (own === "") return undefined;

    // The vectors of every run of the word's letters, with < before it and > after, averaged; one that is in no row is the unknown one's.
    const framed = `<${own}>`;
    const ids: number[] = [];
    for (let length = 1; length <= framed.length; length++) {
      for (let from = 0; from + length <= framed.length; from++) {
        const id = this.#ngrams.get(framed.slice(from, from + length));
        if (id !== undefined) ids.push(id);
      }
    }
    if (ids.length === 0) ids.push(this.#ngrams.get("UNK")!);
    const pooled = new Float32Array(this.#width);
    for (const id of ids) for (let d = 0; d < this.#width; d++) pooled[d]! += this.#vectors[id * this.#width + d]! / ids.length;
    const got = await this.#session.run({ pooled: new this.#ort.Tensor("float32", pooled, [1, this.#width]) });
    const scores = Array.from(got[this.#session.outputNames[0]!]!.data as Float32Array);
    // Its answer is a vowel's number among its own vowels, with how sure it is: as a share of all its answers.
    const highest = Math.max(...scores);
    const shares = scores.map((score) => Math.exp(score - highest));
    const best = scores.indexOf(highest);
    if (1 / shares.reduce((sum, share) => sum + share, 0) <= 0.5) return undefined;
    const theirs = Array.from(lower, (_, i) => i).filter((i) => this.#vowels.includes(lower[i]!));
    return found(vowelAt(theirs[best]));
  }
}

// --- The source.

/** A line's words: letters, and an apostrophe between two. */
const WORDS = /\p{L}+(?:['’ʼ]\p{L}+)*/gu;

/** What is between a sentence's last word and the next one's first. */
const SENTENCE_END = /[.!?…]\s*["«„“”—–-]?\s*$/;

export class UkStress implements Source {
  readonly #dictionaryDir: string;
  readonly #guessesDir: string;
  #dictionary: Promise<Dictionary> | undefined;
  #guesses: Promise<Guesses> | undefined;

  constructor(modelDir: string) {
    this.#dictionaryDir = pinnedDir(modelDir, UK_DICTIONARY);
    this.#guessesDir = pinnedDir(modelDir, UK_GUESSES);
  }

  /** A piece of it, read once; one that is not all there says so, and nothing is fetched. */
  #read<T>(what: Pinned, dir: string, read: () => Promise<T>): Promise<T> {
    return read().catch((err: unknown) => {
      throw new Error(`${what.what[0]!.toUpperCase()}${what.what.slice(1)} (${what.name}) is not complete in ${dir} (${err instanceof Error ? err.message : String(err)}). Run "npm run video -- setup" once, with the network on.`);
    });
  }

  #dictionaryRead(): Promise<Dictionary> {
    return (this.#dictionary ??= this.#read(UK_DICTIONARY, this.#dictionaryDir, async () => new Dictionary(new Marisa(await readFile(path.join(this.#dictionaryDir, TRIE))))));
  }

  #guess(word: string): Promise<number | undefined> {
    this.#guesses ??= this.#read(UK_GUESSES, this.#guessesDir, () => Guesses.in(this.#guessesDir));
    return this.#guesses.then((guesses) => guesses.guess(word));
  }

  async stresses(line: string, asked: Asked[]): Promise<Stress[]> {
    const dictionary = await this.#dictionaryRead();
    const words = Array.from(line.matchAll(WORDS));
    const numbered = new Map(words.map((word, i) => [word.index, i]));
    const found: Stress[] = [];
    for (const { at, word } of asked) {
      const i = numbered.get(at);
      const before = i !== undefined && i > 0 ? words[i - 1]! : undefined;
      const between = before ? line.slice(before.index + before[0].length, at) : "";
      const first = !before || SENTENCE_END.test(between);
      found.push(await this.#one(dictionary, word, first, before?.[0].toLowerCase(), between));
    }
    return found;
  }

  /** One word's stress: `before` is the word before it in the line, in lowercase, and `between` what is between the two. */
  async #one(dictionary: Dictionary, word: string, first: boolean, before: string | undefined, between: string): Promise<Stress> {
    const low = plainApostrophe(word.toLowerCase());
    const last = vowelsOf(word).length - 1;
    if (Object.hasOwn(OWN, low)) return { vowel: OWN[low]! };
    if (before === "по" && between === "-" && AFTER_PO.has(low)) return { vowel: 0 };
    const after = before !== undefined && /^\s+$/.test(between) ? before : undefined;
    if (MOVING.has(low)) return { vowel: after !== undefined && PREPOSITIONS.has(after) ? last - 1 : last };
    if (MOVING_IN.has(low)) return { vowel: after !== undefined && LOCATIVE.has(after) ? last - 1 : last };

    const readings = Object.hasOwn(OWN_READINGS, low) ? OWN_READINGS[low]! : dictionary.readings(word, first);
    if (!readings) {
      const guess = await this.#guess(word);
      return { ...(guess === undefined ? {} : { vowel: guess }), unsure: "not in the dictionary" };
    }
    // A vowel that every reading stresses is the word's, whatever it means here.
    const shared = readings[0]!.filter((vowel) => readings.every((reading) => reading.includes(vowel)));
    if (shared.length === 1) return { vowel: shared[0]! };
    const guess = await this.#guess(word);
    if (shared.length > 1) return { vowel: guess !== undefined && shared.includes(guess) ? guess : Math.min(...shared) };
    const all = Array.from(new Set(readings.flat())).sort((a, b) => a - b);
    const said = (vowels: number[]) => vowels.map((vowel) => withStress(word, [vowel]));
    if (guess !== undefined && all.includes(guess)) return { vowel: guess, unsure: `or ${said(all.filter((vowel) => vowel !== guess)).join(", ")}` };
    return { unsure: said(all).join(" or ") };
  }
}
