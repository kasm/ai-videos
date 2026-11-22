// A video file's one sound track (AGENTS.md, "The cache"): each line's voice placed where the
// timeline starts it, and the whole brought to the video's loudness, once. The video and its web
// page both play it (make's two modes): the video's render gives the picture alone.
import { rm, writeFile } from "node:fs/promises";
import { levelSound } from "./render.ts";
import type { Timeline } from "./timeline.ts";
import { encodeWav, readWav } from "./tts.ts";

/** The voices laid on one track of `duration` seconds: each line's samples added from its `start`. */
export function mix(lines: { samples: Float32Array; start: number }[], sampleRate: number, duration: number): Float32Array {
  const track = new Float32Array(Math.round(duration * sampleRate));
  for (const { samples, start } of lines) {
    const at = Math.round(start * sampleRate);
    const end = Math.min(samples.length, track.length - at);
    for (let i = 0; i < end; i++) track[at + i]! += samples[i]!;
  }
  return track;
}

/** The timeline's sound, as long as the video and at `loudness` LUFS, into `file` (.m4a). */
export async function writeSound(timeline: Timeline, file: string, loudness: number): Promise<void> {
  const lines = timeline.scenes.flatMap((scene) => scene.lines);
  const voices = await Promise.all(lines.map((line) => readWav(line.audioFile)));
  const rates = [...new Set(voices.map((v) => v.sampleRate))];
  if (rates.length > 1) throw new Error(`the voices come at several sample rates (${rates.join(", ")} Hz): one track needs one`);
  const sampleRate = rates[0] ?? 24000;
  const track = mix(lines.map((line, i) => ({ samples: voices[i]!.samples, start: line.start })), sampleRate, timeline.duration);
  // The mix before its level, beside the sound only while it is levelled.
  const mixed = `${file}.mix.wav`;
  await writeFile(mixed, encodeWav(track, sampleRate));
  try {
    await levelSound(mixed, file, loudness);
  } finally {
    await rm(mixed, { force: true });
  }
}
