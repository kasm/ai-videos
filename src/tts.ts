// Narration: text in, cached wav out. Two engines, behind TtsProvider: Kokoro for English, and
// Supertonic (supertonic.ts) for Ukrainian and Russian; a voice's name says whose it is.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Language } from "./script.ts";
import { isSupertonicVoice, SupertonicProvider, SUPERTONIC_VOICES } from "./supertonic.ts";

export interface TtsRequest {
  text: string;
  voice: string;
  speed: number;
}

export interface TtsAudio {
  samples: Float32Array;
  sampleRate: number;
}

export interface TtsProvider {
  /** Part of the cache key: change it when output would change. */
  readonly id: string;
  synth(req: TtsRequest): Promise<TtsAudio>;
  voices(): Promise<string[]>;
}

export interface SpokenLine {
  file: string;
  /** Seconds. */
  duration: number;
  cached: boolean;
}

/** The voice model, on Hugging Face, and the files transformers.js reads of it for the fp32 weights. */
export const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const MODEL_FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"];

/** What transformers.js reports while it fetches the model: a file's progress in percent, or that it is done. */
export interface ModelProgress {
  status: string;
  file?: string;
  progress?: number;
  total?: number;
}

/**
 * Kokoro-82M through ONNX Runtime in Node, on the CPU. The model is read from `modelDir` alone (its
 * files under the model's name); only `setup` makes a provider with `download`, which fetches what
 * is not there. The voices come with kokoro-js, from npm.
 */
export class KokoroProvider implements TtsProvider {
  readonly id = "kokoro-82m-v1.0-onnx-fp32";
  #model: Promise<any> | undefined;
  readonly #dir: string;
  readonly #download: boolean;
  readonly #progress: ((info: ModelProgress) => void) | undefined;

  constructor(modelDir: string, opts: { download?: boolean; progress?: (info: ModelProgress) => void } = {}) {
    this.#dir = modelDir;
    this.#download = opts.download ?? false;
    this.#progress = opts.progress;
  }

  #load(): Promise<any> {
    this.#model ??= (async () => {
      // kokoro-js loads through this same transformers.js, so its settings hold. setup downloads
      // into its file cache, which keeps each file under the model's name in the folder; every
      // other command reads that folder as local models, with the network off. Both lay the files
      // out alike, and a file missing locally is "not found locally at <its path>".
      const { env } = await import("@huggingface/transformers");
      env.allowRemoteModels = this.#download;
      env.allowLocalModels = !this.#download;
      env.useFSCache = this.#download;
      env.cacheDir = this.#dir;
      env.localModelPath = this.#dir;
      const { KokoroTTS } = await import("kokoro-js");
      try {
        return await KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "cpu", progress_callback: this.#progress });
      } catch (err) {
        if (this.#download) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`The voice model is not complete in ${this.#dir} (${reason}). Run "npm run video -- setup" once, with the network on.`);
      }
    })();
    return this.#model;
  }

  async synth(req: TtsRequest): Promise<TtsAudio> {
    const model = await this.#load();
    if (!(req.voice in model.voices)) {
      throw new Error(`Unknown voice "${req.voice}". Run "npm run video -- voices" to list them.`);
    }
    const audio = await model.generate(req.text, { voice: req.voice, speed: req.speed });
    return { samples: audio.audio as Float32Array, sampleRate: audio.sampling_rate as number };
  }

  async voices(): Promise<string[]> {
    const model = await this.#load();
    return Object.keys(model.voices);
  }
}

/**
 * One of the voices the tool speaks in: its name, its language (Kokoro's `en-us` or `en-gb`,
 * Supertonic's `uk` or `ru`), and Kokoro's grade of one of its own (A best).
 */
export interface Voice {
  name: string;
  language: string;
  gender: "Female" | "Male";
  grade?: string;
}

/**
 * The voices kokoro-js speaks, from its own table, read without the model: so a command that only
 * names them (the prompt, import) needs nothing from setup.
 */
export async function kokoroVoices(): Promise<Voice[]> {
  const { KokoroTTS } = await import("kokoro-js");
  // The table is behind a getter of the class that reads nothing of an instance.
  const table = Object.getOwnPropertyDescriptor(KokoroTTS.prototype, "voices")?.get?.call(undefined) as
    | Record<string, { language: string; gender: "Female" | "Male"; overallGrade: string }>
    | undefined;
  if (!table) throw new Error("kokoro-js has no table of its voices: it is not the version package.json pins");
  return Object.entries(table).map(([name, { language, gender, overallGrade }]) => ({ name, language, gender, grade: overallGrade }));
}

/** The language a voice speaks, as a video names it: Kokoro's American and British English are English. */
export const spokenIn = (voice: Voice): Language => voice.language.split("-")[0] as Language;

/** Every voice the tool speaks in, with its language, read without a model: Kokoro's English, then Supertonic's Ukrainian and Russian. */
export async function toolVoices(): Promise<Voice[]> {
  return [...(await kokoroVoices()), ...SUPERTONIC_VOICES];
}

/** The engine that speaks a voice. */
export type Engines = (voice: string) => TtsProvider;

/** The tool's engines, their models in `modelDir`, each loaded when it first speaks: Supertonic its voices, Kokoro the rest, which refuses one it lacks. */
export function enginesIn(modelDir: string): Engines {
  const kokoro = new KokoroProvider(modelDir);
  const supertonic = new SupertonicProvider(modelDir);
  return (voice) => (isSupertonicVoice(voice) ? supertonic : kokoro);
}

const TRIM_VERSION = 1;
const SILENCE = 0.004;
const PAD_SECONDS = 0.03;

/** Cuts leading and trailing silence so line timing is governed by the script, not the model. */
function trimSilence({ samples, sampleRate }: TtsAudio): Float32Array {
  let first = 0;
  let last = samples.length - 1;
  while (first < last && Math.abs(samples[first]!) < SILENCE) first++;
  while (last > first && Math.abs(samples[last]!) < SILENCE) last--;
  const pad = Math.round(PAD_SECONDS * sampleRate);
  return samples.subarray(Math.max(0, first - pad), Math.min(samples.length, last + pad + 1));
}

/** 16-bit mono PCM, after a 44-byte header: a sample outside -1 to 1 is cut to it. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A cached line's samples again, as `encodeWav` wrote them: 16-bit mono after a 44-byte header. */
export async function readWav(file: string): Promise<TtsAudio> {
  const buf = await readFile(file);
  const samples = new Float32Array(buf.readUInt32LE(40) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(44 + i * 2) / 32767;
  return { samples, sampleRate: buf.readUInt32LE(24) };
}

async function wavDuration(file: string): Promise<number> {
  const buf = await readFile(file);
  const byteRate = buf.readUInt32LE(28);
  const dataBytes = buf.readUInt32LE(40);
  return dataBytes / byteRate;
}

/** Speaks one line, reusing the cached wav when text, voice, speed and provider are unchanged. */
export async function speak(
  provider: TtsProvider,
  cacheDir: string,
  req: TtsRequest,
): Promise<SpokenLine> {
  const key = createHash("sha256")
    .update(JSON.stringify([provider.id, TRIM_VERSION, req.voice, req.speed, req.text]))
    .digest("hex")
    .slice(0, 20);
  const file = path.join(cacheDir, `${key}.wav`);
  if (existsSync(file)) {
    return { file, duration: await wavDuration(file), cached: true };
  }
  const audio = await provider.synth(req);
  const trimmed = trimSilence(audio);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, encodeWav(trimmed, audio.sampleRate));
  return { file, duration: trimmed.length / audio.sampleRate, cached: false };
}
