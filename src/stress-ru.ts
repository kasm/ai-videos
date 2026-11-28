// Russian: the stress of a homograph (AGENTS.md, "A word's stress"), from this disk alone, by RUAccent
// (Den4ikAI/ruaccent, MIT), its list of homographs and the network that reads them, as ruaccent/accentuator
// publishes them as ONNX. This is a port of its ruaccent.py and omograph_model.py:
//
// A homograph (за́мок, замо́к), one of the 19,700 words its list has under two stresses or more, is read by
// the network with its sentence, the word marked in it, which scores each reading: the highest is the word's.
//
// Any other word has no mark, and the voice stresses it itself: it gets nearly all of them right, and reads
// some of them wrong once they have a mark (сего́дня with its г, коне́чно with its чн, a ё as е), as a video
// marked all through showed (docs/plans/done/word-stress.md). So RUAccent's dictionary of every word's
// stress is left out, with its network for the words that lacks, the one that says which words get no
// stress, and what puts back a ё written as е.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Asked, Source, Stress } from "./marks.ts";
import { pinnedDir, type Pinned } from "./pinned.ts";
import { vowelsOf } from "./stress.ts";

const REVISION = "b78ae5ea1e62beaf138bed1865cd8c3b0b5ca855";
const LIST = "dictionary/omographs.json.gz";
const NETWORK = "nn/nn_omograph/turbo3.1";

/** RUAccent's files, on Hugging Face, at the revision fetched. Its README says its licence. */
export const RU_HOMOGRAPHS: Pinned = {
  what: "the Russian homographs and their model",
  name: "ruaccent/accentuator",
  url: (file) => `https://huggingface.co/ruaccent/accentuator/resolve/${REVISION}/${file}`,
  files: {
    [LIST]: { size: 219047, sha256: "04a9e81c68d65f65ba493fe0110f99e79087548c2beeec3032e2b66e28706f36" },
    [`${NETWORK}/model.onnx`]: { size: 359306923, sha256: "2cb6a174c4cdb45bd3132b4f7c8a3779fc4b6869863180ed7d0e421bcd453dbd" },
    [`${NETWORK}/tokenizer.json`]: { size: 5532343, sha256: "eb84a77af38a91f6f327486c7827d8541f8d446250f8d408909999b6be817afa" },
    [`${NETWORK}/tokenizer_config.json`]: { size: 492, sha256: "f159df92d0b0be03e1ceb0768222aa4c21dcfd37c5763b6b395b6864e023c7fb" },
    "README.md": { size: 2660, sha256: "13de1b452c87d69d255e0c6b9e7dc6686e672d15746578ea3b20a7d0f4490d7e" },
  },
};

type Tensor = import("onnxruntime-node").Tensor;

/** What the network reads of a sentence: any other character is left out of what it is given. */
const READ = /[a-zA-Z0-9\sа-яА-ЯёЁ—.,!?:;"'(){}\[\]«»„“”-]/;
/** A word all in capitals, which the network is given in lowercase. */
const CAPITALS = /^[A-ZА-ЯЁ]{2,}$/;
/** Where a sentence ends, in a line: each is read alone. */
const SENTENCE_END = /[.!?…]+["»”)]*\s+(?=["«„(]?[A-ZА-ЯЁ])/g;

/** A word or a mark of a sentence, as the network is given it, and where it begins in the sentence. */
interface Token {
  text: string;
  from: number;
  /** A word, written in what the network reads alone. */
  word: boolean;
}

/** How well a reading suits a sentence, the word between its tags: a share of 1. */
type Score = (sentence: string, reading: string) => Promise<number>;

export class RuStress implements Source {
  readonly #dir: string;
  #list: Promise<Record<string, string[]>> | undefined;
  #network: Promise<Score> | undefined;

  constructor(modelDir: string) {
    this.#dir = pinnedDir(modelDir, RU_HOMOGRAPHS);
  }

  /** A piece of it, read once; one that is not all there says so, and nothing is fetched. */
  #read<T>(read: () => Promise<T>): Promise<T> {
    return read().catch((err: unknown) => {
      throw new Error(`The Russian homographs and their model (${RU_HOMOGRAPHS.name}) are not complete in ${this.#dir} (${err instanceof Error ? err.message : String(err)}). Run "npm run video -- setup" once, with the network on.`);
    });
  }

  /** The list: a word, in lowercase, to its readings, each with a `+` before its stressed vowel. */
  #homographs(): Promise<Record<string, string[]>> {
    return (this.#list ??= this.#read(async () => {
      const list = JSON.parse(gunzipSync(await readFile(path.join(this.#dir, LIST))).toString("utf8")) as Record<string, string[]>;
      // As RUAccent mends its list when it loads it.
      list["коса"] = ["к+оса", "кос+а"];
      return list;
    }));
  }

  /** The network, loaded when a line first has a homograph: its tokens are the tool's own transformers.js's. */
  #scores(): Promise<Score> {
    return (this.#network ??= this.#read(async () => {
      const dir = path.join(this.#dir, NETWORK);
      const json = async (file: string) => JSON.parse(await readFile(path.join(dir, file), "utf8"));
      const ort = await import("onnxruntime-node");
      const { PreTrainedTokenizer } = await import("@huggingface/transformers");
      const tokenizer = new PreTrainedTokenizer(await json("tokenizer.json"), await json("tokenizer_config.json"));
      const session = await ort.InferenceSession.create(path.join(dir, "model.onnx"));
      const whole = (numbers: number[]) => new ort.Tensor("int64", BigInt64Array.from(numbers, BigInt), [1, numbers.length]);
      return async (sentence, reading) => {
        const { input_ids: ids } = tokenizer._call(sentence, { text_pair: reading, return_tensor: false, truncation: true, max_length: 512 }) as unknown as { input_ids: number[] };
        // The ids, and of a mask and the kinds of its tokens what the network asks for.
        const all: Record<string, Tensor> = { input_ids: whole(ids), attention_mask: whole(ids.map(() => 1)), token_type_ids: whole(ids.map(() => 0)) };
        const got = await session.run(Object.fromEntries(session.inputNames.map((name) => [name, all[name]!])));
        const [no, yes] = got[session.outputNames[0]!]!.data as Float32Array;
        return 1 / (1 + Math.exp(no! - yes!));
      };
    }));
  }

  async stresses(line: string, asked: Asked[]): Promise<Stress[]> {
    const found = new Map<number, Stress>();
    const wanted = new Set(asked.map(({ at }) => at));
    let from = 0;
    for (const to of [...Array.from(line.matchAll(SENTENCE_END), (end) => end.index + end[0].length), line.length]) {
      for (const [at, stress] of await this.#sentence(line.slice(from, to), from, wanted)) found.set(at, stress);
      from = to;
    }
    return asked.map(({ at }) => found.get(at) ?? {});
  }

  /** The stresses of a sentence's homographs that are wanted, each by where its word begins in the line; `from` is where the sentence begins in it. */
  async #sentence(sentence: string, from: number, wanted: Set<number>): Promise<Map<number, Stress>> {
    const found = new Map<number, Stress>();
    const kept = Array.from(sentence, (_, i) => i).filter((i) => READ.test(sentence[i]!));
    const read = kept.map((i) => sentence[i]).join("");
    const tokens: Token[] = Array.from(read.replaceAll(" - ", " ~ ").matchAll(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+/gu), (match) => {
      const begins = kept[match.index]!;
      const ends = kept[match.index + match[0].length - 1]! + 1;
      return { text: match[0], from: begins, word: /^[\p{L}\p{N}_]/u.test(match[0]) && sentence.slice(begins, ends) === match[0] };
    });
    const asked = tokens.flatMap((token, i) => (token.word && wanted.has(from + token.from) ? [i] : []));
    if (asked.length === 0) return found;
    const list = await this.#homographs();

    for (const i of asked) {
      const low = tokens[i]!.text.toLowerCase();
      const readings = Object.hasOwn(list, low) ? list[low]! : [];
      // A word the list has one reading of is no choice, and is the voice's, as any other word.
      if (readings.length < 2) continue;
      // The sentence as the network reads it, this word between its tags, a mark close to its word.
      const words = tokens.map((token, k) => (k === i ? ` <w>${low}</w> ` : CAPITALS.test(token.text) ? token.text.toLowerCase() : token.text));
      let marking = words.join(" ");
      for (const mark of "!\"#$%&'()*,./:;<=>?@[\\]^_`{|}-") {
        if (mark === "-") marking = marking.replaceAll(" -", "-").replaceAll("- ", "-");
        marking = marking.replaceAll(` ${mark}`, mark);
      }
      marking = marking.replaceAll("~", "-").replace(/\s+(?=[,.?!:;…])/g, "");
      const score = await this.#scores();
      const scores: number[] = [];
      for (const reading of readings) scores.push(await score(marking, reading));
      // The reading is the word with a `+` before its stressed vowel.
      const stressed = readings[scores.indexOf(Math.max(...scores))]!.indexOf("+");
      // A ё says its own stress, and with a mark after it the voice reads an е.
      if (low[stressed] === "ё") continue;
      const vowel = vowelsOf(low).indexOf(stressed);
      if (vowel >= 0) found.set(from + tokens[i]!.from, { vowel });
    }
    return found;
  }
}
