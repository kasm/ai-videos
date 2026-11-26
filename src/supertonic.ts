// Supertonic 3 (Supertone's, on Hugging Face), the tool's voice for Ukrainian and Russian: four ONNX
// models, run by onnxruntime-node on the CPU as the official Node example runs them (helper.js of
// supertone-inc/supertonic, archived): the text as code points in a language's tags, its length
// predicted, noise denoised in 8 steps into the voice's latent, and that made a wave. Ten voices,
// each in both languages. The noise is seeded from the line, so a line is the same in every run.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TtsAudio, TtsProvider, TtsRequest, Voice } from "./tts.ts";

/** The model, on Hugging Face, at the revision fetched: its repository on GitHub is archived, so its files are pinned. */
export const SUPERTONIC = "Supertone/supertonic-3";
export const SUPERTONIC_REVISION = "3cadd1ee6394adea1bd021217a0e650ede09a323";

/** Its files the tool reads, and its licence, each with its size and sha256: setup checks them. */
export const SUPERTONIC_FILES: Record<string, { size: number; sha256: string }> = {
  "onnx/duration_predictor.onnx": { size: 3700147, sha256: "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db" },
  "onnx/text_encoder.onnx": { size: 36416150, sha256: "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff" },
  "onnx/vector_estimator.onnx": { size: 256534781, sha256: "883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c" },
  "onnx/vocoder.onnx": { size: 101424195, sha256: "085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba" },
  "onnx/tts.json": { size: 8253, sha256: "42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09" },
  "onnx/unicode_indexer.json": { size: 277676, sha256: "9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f" },
  "voice_styles/F1.json": { size: 292046, sha256: "bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2" },
  "voice_styles/F2.json": { size: 292423, sha256: "7c722c6a72707b1a77f035d67f0d1351ba187738e06f7683e8c72b1df3477fc6" },
  "voice_styles/F3.json": { size: 290794, sha256: "12f6ef2573baa2defa1128069cb59f203e3ab67c92af77b42df8a0e3a2f7c6ab" },
  "voice_styles/F4.json": { size: 291808, sha256: "c2fa764c1225a76dfc3e2c73e8aa4f70d9ee48793860eb34c295fff01c2e032b" },
  "voice_styles/F5.json": { size: 291479, sha256: "45966e73316415626cf41a7d1c6f3b4c70dbc1ba2bee5c1978ef0ce33244fc8d" },
  "voice_styles/M1.json": { size: 291748, sha256: "e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b" },
  "voice_styles/M2.json": { size: 292055, sha256: "b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50" },
  "voice_styles/M3.json": { size: 290198, sha256: "ea1ac35ccb91b0d7ecad533a2fbd0eec10c91513d8951e3b25fbba99954e159b" },
  "voice_styles/M4.json": { size: 291522, sha256: "ca8eefad4fcd989c9379032ff3e50738adc547eeb5e221b82593a6d7b3bac303" },
  "voice_styles/M5.json": { size: 291469, sha256: "dd22b92740314321f8ae11c5e87f8dd60d060f15dd3a632b5adf77f471f77af2" },
  LICENSE: { size: 15007, sha256: "0d944a9110fed9a9602d60e0423a272903e7bd21ab060490774efc77c2275e9f" },
};

/** The languages the tool speaks in it, and its voices, each in every one of them. */
const LANGUAGES = ["uk", "ru"] as const;
const STYLES = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"] as const;

/** Its voices as the tool names them, `<language>_<voice>` (uk_f1 … ru_m5), read without the model. */
export const SUPERTONIC_VOICES: Voice[] = LANGUAGES.flatMap((language) =>
  STYLES.map((style) => ({ name: `${language}_${style.toLowerCase()}`, language, gender: style.startsWith("F") ? ("Female" as const) : ("Male" as const) })),
);

/** A voice's language and its style's file, or none when it is no voice of Supertonic's. */
function voiceOf(name: string): { language: string; style: string } | undefined {
  const [language, style] = name.split("_");
  const known = SUPERTONIC_VOICES.some((voice) => voice.name === name);
  return known ? { language: language!, style: style!.toUpperCase() } : undefined;
}

export const isSupertonicVoice = (name: string): boolean => voiceOf(name) !== undefined;

/** Denoising steps, and its own pace, as its example says a line: a video's `speed` multiplies it. */
const STEPS = 8;
const PACE = 1.05;
/** The longest text it says at once, characters, and the silence between two, seconds, as its example has them. */
const LONGEST = 300;
const BETWEEN = 0.3;

/** What the example replaces before a text is read, and what it lacks that Ukrainian writes: its apostrophe and its low quote. */
const REPLACED: Record<string, string> = {
  "–": "-", "‑": "-", "—": "-", _: " ", "“": '"', "”": '"', "‘": "'", "’": "'", "´": "'", "`": "'",
  "[": " ", "]": " ", "|": " ", "/": " ", "#": " ", "→": " ", "←": " ",
  "ʼ": "'", "„": '"',
};
const EXPRESSIONS: Record<string, string> = { "@": " at ", "e.g.,": "for example, ", "i.e.,": "that is, " };
const EMOJI = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

/** A text as the model reads it, as the example's `_preprocessText` makes it: decomposed, its marks evened, ended, in its language's tags. */
export function modelText(text: string, language: string): string {
  let t = text.normalize("NFKD").replace(EMOJI, "");
  for (const [from, to] of Object.entries(REPLACED)) t = t.replaceAll(from, to);
  t = t.replace(/[♥☆♡©\\]/g, "");
  for (const [from, to] of Object.entries(EXPRESSIONS)) t = t.replaceAll(from, to);
  t = t.replace(/ ([,.!?;:'])/g, "$1");
  while (t.includes('""')) t = t.replace('""', '"');
  while (t.includes("''")) t = t.replace("''", "'");
  t = t.replace(/\s+/g, " ").trim();
  if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(t)) t += ".";
  return `<${language}>${t}</${language}>`;
}

/** A text in parts of at most `longest` characters, as the example's `chunkText` splits it: by paragraph, then between sentences. */
export function partsOf(text: string, longest = LONGEST): string[] {
  const parts: string[] = [];
  for (const paragraph of text.trim().split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)) {
    const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/);
    let part = "";
    for (const sentence of sentences) {
      if (part.length + sentence.length + 1 <= longest) part += (part ? " " : "") + sentence;
      else {
        if (part) parts.push(part.trim());
        part = sentence;
      }
    }
    if (part) parts.push(part.trim());
  }
  return parts;
}

/** Numbers evenly from 0 to 1, the same for the same seed (mulberry32). */
function randomFrom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed of a part of a line: its voice, speed and text, and which part it is. */
const seedOf = (req: TtsRequest, part: number) => createHash("sha256").update(JSON.stringify([req.voice, req.speed, req.text, part])).digest().readUInt32LE(0);

type Ort = typeof import("onnxruntime-node");
type Session = import("onnxruntime-node").InferenceSession;
type Tensor = import("onnxruntime-node").Tensor;

interface Model {
  ort: Ort;
  sampleRate: number;
  /** Samples a latent frame stands for, and the numbers in one. */
  chunk: number;
  latentDim: number;
  /** A code point's index, or -1 for one the model lacks. */
  indexer: number[];
  predictor: Session;
  encoder: Session;
  estimator: Session;
  vocoder: Session;
}

interface Style {
  ttl: Tensor;
  dp: Tensor;
}

/**
 * Supertonic 3 through ONNX Runtime in Node, on the CPU. The model is read from `modelDir` alone
 * (its files under the model's name), and loaded when it first speaks; setup fetches it.
 */
export class SupertonicProvider implements TtsProvider {
  readonly id = `supertonic-3-${SUPERTONIC_REVISION.slice(0, 7)}-fp32-${STEPS}-steps-seeded`;
  readonly #dir: string;
  #model: Promise<Model> | undefined;
  readonly #styles = new Map<string, Promise<Style>>();

  constructor(modelDir: string) {
    this.#dir = path.join(modelDir, ...SUPERTONIC.split("/"));
  }

  #load(): Promise<Model> {
    this.#model ??= (async () => {
      try {
        const ort = await import("onnxruntime-node");
        const json = async (file: string) => JSON.parse(await readFile(path.join(this.#dir, file), "utf8"));
        const config = await json("onnx/tts.json");
        const [predictor, encoder, estimator, vocoder] = await Promise.all(
          ["duration_predictor", "text_encoder", "vector_estimator", "vocoder"].map((name) => ort.InferenceSession.create(path.join(this.#dir, "onnx", `${name}.onnx`))),
        );
        return {
          ort,
          sampleRate: config.ae.sample_rate,
          chunk: config.ae.base_chunk_size * config.ttl.chunk_compress_factor,
          latentDim: config.ttl.latent_dim * config.ttl.chunk_compress_factor,
          indexer: await json("onnx/unicode_indexer.json"),
          predictor: predictor!,
          encoder: encoder!,
          estimator: estimator!,
          vocoder: vocoder!,
        };
      } catch (err) {
        this.#model = undefined;
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`The voice model ${SUPERTONIC} is not complete in ${this.#dir} (${reason}). Run "npm run video -- setup" once, with the network on.`);
      }
    })();
    return this.#model;
  }

  #style(model: Model, name: string): Promise<Style> {
    let style = this.#styles.get(name);
    if (!style) {
      style = (async () => {
        const { style_ttl, style_dp } = JSON.parse(await readFile(path.join(this.#dir, "voice_styles", `${name}.json`), "utf8"));
        const tensor = ({ data, dims }: { data: number[][][]; dims: number[] }) => new model.ort.Tensor("float32", Float32Array.from(data.flat(2)), dims);
        return { ttl: tensor(style_ttl), dp: tensor(style_dp) };
      })();
      this.#styles.set(name, style);
    }
    return style;
  }

  /** One part of a line, as the example's `_infer` says one text, its noise from `random`; the wave as long as the predicted length. */
  async #say(model: Model, style: Style, text: string, language: string, speed: number, random: () => number): Promise<Float32Array> {
    const { ort, sampleRate, chunk, latentDim } = model;
    const read = [...modelText(text, language)];
    const ids = read.map((ch) => {
      const code = ch.codePointAt(0)!;
      const id = model.indexer[code] ?? -1;
      if (id < 0) throw new Error(`Supertonic cannot say "${ch}" (U+${code.toString(16).toUpperCase().padStart(4, "0")}), in "${text}": write it otherwise`);
      return id;
    });
    const n = ids.length;
    const textIds = new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, n]);
    const textMask = new ort.Tensor("float32", new Float32Array(n).fill(1), [1, 1, n]);
    const { duration } = await model.predictor.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const seconds = (duration!.data as Float32Array)[0]! / speed;
    const { text_emb } = await model.encoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
    const length = Math.floor(seconds * sampleRate);
    const frames = Math.floor((seconds * sampleRate + chunk - 1) / chunk);
    const masked = Math.floor((length + chunk - 1) / chunk);
    const mask = Float32Array.from({ length: frames }, (_, t) => (t < masked ? 1 : 0));
    // Normal noise by Box and Muller, in the example's order.
    let latent = new Float32Array(latentDim * frames);
    for (let d = 0; d < latentDim; d++) {
      for (let t = 0; t < frames; t++) {
        const u1 = Math.max(1e-10, random());
        const u2 = random();
        latent[d * frames + t] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * mask[t]!;
      }
    }
    const latentMask = new ort.Tensor("float32", mask, [1, 1, frames]);
    const total = new ort.Tensor("float32", Float32Array.from([STEPS]), [1]);
    for (let step = 0; step < STEPS; step++) {
      const { denoised_latent } = await model.estimator.run({
        noisy_latent: new ort.Tensor("float32", latent, [1, latentDim, frames]),
        text_emb: text_emb!,
        style_ttl: style.ttl,
        text_mask: textMask,
        latent_mask: latentMask,
        total_step: total,
        current_step: new ort.Tensor("float32", Float32Array.from([step]), [1]),
      });
      latent = Float32Array.from(denoised_latent!.data as Float32Array);
    }
    const { wav_tts } = await model.vocoder.run({ latent: new ort.Tensor("float32", latent, [1, latentDim, frames]) });
    const wave = wav_tts!.data as Float32Array;
    return Float32Array.from(wave.subarray(0, Math.min(wave.length, length)));
  }

  async synth(req: TtsRequest): Promise<TtsAudio> {
    const voice = voiceOf(req.voice);
    if (!voice) throw new Error(`Unknown voice "${req.voice}". Run "npm run video -- voices" to list them.`);
    const model = await this.#load();
    const style = await this.#style(model, voice.style);
    const parts = partsOf(req.text);
    const waves: Float32Array[] = [];
    for (const [k, part] of parts.entries()) waves.push(await this.#say(model, style, part, voice.language, PACE * req.speed, randomFrom(seedOf(req, k))));
    // The parts, a silence between each two.
    const between = Math.floor(BETWEEN * model.sampleRate);
    const samples = new Float32Array(waves.reduce((sum, wave) => sum + wave.length, 0) + between * Math.max(0, waves.length - 1));
    let at = 0;
    for (const wave of waves) {
      samples.set(wave, at);
      at += wave.length + between;
    }
    return { samples, sampleRate: model.sampleRate };
  }

  async voices(): Promise<string[]> {
    await this.#load();
    return SUPERTONIC_VOICES.map((voice) => voice.name);
  }
}
