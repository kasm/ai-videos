// A video file's one sound track (AGENTS.md, "How loud"): each line's voice placed where it
// begins, and the whole brought to the video's loudness, once. The video and its web page both play
// it (make's two modes): the video's render gives the picture alone. A script's voices are each as loud
// as any other, and then at their volumes.
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { saidLines, type Compiled } from "./compile.ts";
import { loudnessOf } from "./loudness.ts";
import { levelMix, levelSound, type Levelled } from "./render.ts";
import { encodeWav, readWav, type TtsAudio } from "./tts.ts";

/** Seconds a cut voice takes to fade out before its cut: short enough to be heard as one, long enough not to click. */
const FADE = 0.03;

/** How loud each of a script's voices is in its mix before its volume, LUFS: any will do, as one gain follows. */
const LEVEL = -23;

/**
 * The voices laid on one track of `duration` seconds: each line's samples, so many times as loud, added
 * from its `start`, and none after its own `duration`, where a voice that is longer is cut.
 */
export function mix(lines: { samples: Float32Array; start: number; duration?: number | undefined; gain?: number }[], sampleRate: number, duration: number): Float32Array {
  const track = new Float32Array(Math.round(duration * sampleRate));
  for (const { samples, start, duration: lasts = Infinity, gain = 1 } of lines) {
    const at = Math.round(start * sampleRate);
    const stop = Math.min(samples.length, Math.round(lasts * sampleRate));
    const fade = stop < samples.length ? Math.round(FADE * sampleRate) : 0;
    const end = Math.min(stop, track.length - at);
    for (let i = 0; i < end; i++) track[at + i]! += gain * samples[i]! * (stop - i < fade ? (stop - i) / fade : 1);
  }
  return track;
}

/** A line's voice: its file, when it begins, seconds from the video's start, and how long it sounds, when it may be cut. */
export interface PlacedVoice {
  file: string;
  start: number;
  duration?: number;
}

/** A script's voice, and its volume, dB. */
export interface MixedVoice extends PlacedVoice {
  volume: number;
}

/** A compiled scenario's voices, their files in `dir`: each sounds from its line's frame, in its frames and no longer, at its volume. */
export const compiledVoices = ({ fps, scenes }: Compiled, dir: string): MixedVoice[] =>
  saidLines(scenes).map(({ file, from, frames, volume }) => ({ file: path.join(dir, file), start: from / fps, duration: frames / fps, volume }));

/** The voices, read from their files, and the one sample rate they have. */
async function readVoices(lines: PlacedVoice[]): Promise<{ voices: TtsAudio[]; sampleRate: number }> {
  const voices = await Promise.all(lines.map((line) => readWav(line.file)));
  const rates = [...new Set(voices.map((v) => v.sampleRate))];
  if (rates.length > 1) throw new Error(`the voices come at several sample rates (${rates.join(", ")} Hz): one track needs one`);
  return { voices, sampleRate: rates[0] ?? 24000 };
}

/** What a voice is multiplied by to be as loud as any other at `volume` 0, and so much louder: silence stays so. */
export function gainOf(voice: TtsAudio, volume: number): number {
  const own = loudnessOf(voice);
  return Number.isFinite(own) ? 10 ** ((LEVEL - own + volume) / 20) : 1;
}

/**
 * A script's sound, as long as the video (`duration` seconds), into `file` (.m4a): its voices, each as
 * loud as any other and then at its volume, brought to `loudness` LUFS by one gain (render.ts,
 * levelMix); silence when there is none. What it was brought by is given back.
 */
export async function writeMix(lines: MixedVoice[], duration: number, file: string, loudness: number): Promise<Levelled> {
  const { voices, sampleRate } = await readVoices(lines);
  const samples = mix(lines.map(({ start, duration, volume }, i) => ({ samples: voices[i]!.samples, start, duration, gain: gainOf(voices[i]!, volume) })), sampleRate, duration);
  return levelMix({ samples, sampleRate }, file, loudness);
}

/** A plan's sound: the voices as they are, as long as the video (`duration` seconds) and at `loudness` LUFS, into `file` (.m4a): silence when there is none. */
export async function writeSound(lines: PlacedVoice[], duration: number, file: string, loudness: number): Promise<void> {
  const { voices, sampleRate } = await readVoices(lines);
  const track = mix(lines.map((line, i) => ({ samples: voices[i]!.samples, start: line.start, duration: line.duration })), sampleRate, duration);
  // The mix before its level, beside the sound only while it is levelled.
  const mixed = `${file}.mix.wav`;
  await writeFile(mixed, encodeWav(track, sampleRate));
  try {
    await levelSound(mixed, file, loudness);
  } finally {
    await rm(mixed, { force: true });
  }
}
