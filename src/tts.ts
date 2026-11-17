// Narration: text in, cached wav out. Providers are swappable behind TtsProvider.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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

/** Kokoro-82M through ONNX Runtime in Node. Runs on CPU; the model downloads once. */
export class KokoroProvider implements TtsProvider {
  readonly id = "kokoro-82m-v1.0-onnx-fp32";
  #model: Promise<any> | undefined;

  #load(): Promise<any> {
    this.#model ??= (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "fp32",
        device: "cpu",
      });
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

function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
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
