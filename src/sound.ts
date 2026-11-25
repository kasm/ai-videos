// A video file's one sound track (AGENTS.md, "The cache"): each line's voice placed where it
// begins, and the whole brought to the video's loudness, once. The video and its web page both play
// it (make's two modes): the video's render gives the picture alone.
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { saidLines, type Compiled } from "./compile.ts";
import { levelSound } from "./render.ts";
import { encodeWav, readWav } from "./tts.ts";

/** Seconds a cut voice takes to fade out before its cut: short enough to be heard as one, long enough not to click. */
const FADE = 0.03;

/**
 * The voices laid on one track of `duration` seconds: each line's samples added from its `start`, and
 * none after its own `duration`, where a voice that is longer is cut.
 */
export function mix(lines: { samples: Float32Array; start: number; duration?: number | undefined }[], sampleRate: number, duration: number): Float32Array {
  const track = new Float32Array(Math.round(duration * sampleRate));
  for (const { samples, start, duration: lasts = Infinity } of lines) {
    const at = Math.round(start * sampleRate);
    const stop = Math.min(samples.length, Math.round(lasts * sampleRate));
    const fade = stop < samples.length ? Math.round(FADE * sampleRate) : 0;
    const end = Math.min(stop, track.length - at);
    for (let i = 0; i < end; i++) track[at + i]! += samples[i]! * (stop - i < fade ? (stop - i) / fade : 1);
  }
  return track;
}

/** A line's voice: its file, when it begins, seconds from the video's start, and how long it sounds, when it may be cut. */
export interface PlacedVoice {
  file: string;
  start: number;
  duration?: number;
}

/** A compiled scenario's voices, their files in `dir`: each sounds from its line's frame, in its frames and no longer. */
export const compiledVoices = ({ fps, scenes }: Compiled, dir: string): PlacedVoice[] =>
  saidLines(scenes).map(({ file, from, frames }) => ({ file: path.join(dir, file), start: from / fps, duration: frames / fps }));

/** The voices' sound, as long as the video (`duration` seconds) and at `loudness` LUFS, into `file` (.m4a): silence when there is none. */
export async function writeSound(lines: PlacedVoice[], duration: number, file: string, loudness: number): Promise<void> {
  const voices = await Promise.all(lines.map((line) => readWav(line.file)));
  const rates = [...new Set(voices.map((v) => v.sampleRate))];
  if (rates.length > 1) throw new Error(`the voices come at several sample rates (${rates.join(", ")} Hz): one track needs one`);
  const sampleRate = rates[0] ?? 24000;
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
