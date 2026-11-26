// A video file's one sound track (AGENTS.md, "How loud"): each line's voice placed where it
// begins, and the whole brought to the video's loudness, once. The video and its web page both play
// it (make's two modes): the video's render gives the picture alone. A script's voices and the sounds it
// plays are each as loud as any other, and then at their volumes.
import { createHash } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { playedLines, saidLines, type Compiled } from "./compile.ts";
import { loudnessIn, loudnessOf, type Stereo } from "./loudness.ts";
import { LOOP } from "./read.ts";
import { bytesOf, ffmpegBytes, levelMix, levelSound, samplesOf, stereoOf, type Levelled } from "./render.ts";
import { keyOf } from "./stages.ts";
import { encodeWav, readWav, type TtsAudio } from "./tts.ts";

/** Seconds what is cut takes to fade out before its cut: short enough to be heard as one, long enough not to click. */
const FADE = 0.03;

/** How loud each of a script's voices and sounds is in its mix before its volume, LUFS in two channels: any will do, as one gain follows. */
const LEVEL = -20;

/** A script's mix is at this sample rate, in two channels: a sound is heard as its file has it. */
export const RATE = 48000;

/** What is laid on a track: samples, when they begin and how long they sound, seconds, so many times as loud, and whether again and again. */
interface Laid {
  samples: Float32Array;
  start: number;
  duration?: number | undefined;
  gain?: number;
  loop?: boolean;
}

/**
 * Samples laid on one track of `duration` seconds: each line's, so many times as loud, added from its
 * `start`, and none after its own `duration`, where one that is longer is cut, and one that is looped always is.
 */
export function mix(lines: Laid[], sampleRate: number, duration: number): Float32Array {
  const track = new Float32Array(Math.round(duration * sampleRate));
  for (const { samples, start, duration: lasts = Infinity, gain = 1, loop = false } of lines) {
    const at = Math.round(start * sampleRate);
    const whole = Math.round(lasts * sampleRate);
    const stop = loop ? whole : Math.min(samples.length, whole);
    const fade = loop || stop < samples.length ? Math.round(FADE * sampleRate) : 0;
    const end = Math.min(stop, track.length - at);
    for (let i = 0; i < end; i++) track[at + i]! += gain * samples[i % samples.length]! * (stop - i < fade ? (stop - i) / fade : 1);
  }
  return track;
}

/** A line's voice: its file, when it begins, seconds from the video's start, and how long it sounds, when it may be cut. */
export interface PlacedVoice {
  file: string;
  start: number;
  duration?: number;
}

/** A script's voice, and its volume, dB; or one of the sounds it plays, once, or again and again for as long as it lasts. */
export interface MixedLine extends PlacedVoice {
  volume: number;
  sound?: "once" | "loop";
}

/** A compiled scenario's voices, their files in `dir`: each sounds from its line's frame, in its frames and no longer, at its volume. */
export const compiledVoices = ({ fps, scenes }: Compiled, dir: string): MixedLine[] =>
  saidLines(scenes).map(({ file, from, frames, volume }) => ({ file: path.join(dir, file), start: from / fps, duration: frames / fps, volume }));

/** The sounds a compiled scenario plays, over its scenes and in them, their files in the project's folder `dir`, as its voices are. */
export const compiledSounds = (compiled: Compiled, dir: string): MixedLine[] =>
  playedLines(compiled).map(({ action, sound, from, frames, volume }) => ({ file: path.join(dir, sound), start: from / compiled.fps, duration: frames / compiled.fps, volume, sound: action === LOOP ? "loop" : "once" }));

/** The voices, read from their files. */
const readVoices = (lines: PlacedVoice[]): Promise<TtsAudio[]> => Promise.all(lines.map((line) => readWav(line.file)));

/** Samples at another sample rate, by ffmpeg's resampler. */
async function resampled(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  if (from === to || samples.length === 0) return samples;
  return samplesOf(await ffmpegBytes(["-f", "f32le", "-ar", String(from), "-ac", "1", "-i", "pipe:0", "-ar", String(to), "-f", "f32le"], bytesOf(samples)));
}

/**
 * Voices laid on one track of `duration` seconds at `sampleRate`: those of each sample rate laid
 * together at theirs (Kokoro's 24 kHz, Supertonic's 44.1), and that resampled once and added.
 */
async function voiceTrack(laid: (Laid & { sampleRate: number })[], sampleRate: number, duration: number): Promise<Float32Array> {
  const track = new Float32Array(Math.round(duration * sampleRate));
  for (const rate of new Set(laid.map((voice) => voice.sampleRate))) {
    const part = await resampled(mix(laid.filter((voice) => voice.sampleRate === rate), rate, duration), rate, sampleRate);
    for (let i = 0; i < Math.min(track.length, part.length); i++) track[i]! += part[i]!;
  }
  return track;
}

/** A sound's file, of any format ffmpeg reads, in two channels at the mix's sample rate. Throws when there is no sound in it. */
export async function readSound(file: string): Promise<Stereo> {
  const sound = stereoOf(samplesOf(await ffmpegBytes(["-i", file, "-map", "0:a:0", "-ac", "2", "-ar", String(RATE), "-f", "f32le"])), RATE);
  if (sound.left.length === 0) throw new Error(`${file} has no sound in it`);
  return sound;
}

/**
 * How long a sound's file lasts, seconds, or why it is none: `missing` when there is no such file,
 * `silent` when ffmpeg reads no sound in it.
 */
export async function measureSound(file: string): Promise<number | "missing" | "silent"> {
  const there = await stat(file).catch(() => undefined);
  if (!there?.isFile()) return "missing";
  try {
    const { left } = await readSound(file);
    return left.length / RATE;
  } catch (e) {
    // ffmpeg itself missing is no fault of the file's.
    if ((e as { code?: string }).code === "ENOENT") throw e;
    return "silent";
  }
}

/** What is multiplied by to be as loud as any other at `volume` 0, and so much louder, from how loud it is, LUFS: silence stays so. */
const gainTo = (own: number, volume: number) => (Number.isFinite(own) ? 10 ** ((LEVEL - own + volume) / 20) : 1);

/** What a voice is multiplied by to be as loud as any other voice or sound at `volume` 0, and so much louder. */
export const gainOf = (voice: TtsAudio, volume: number): number => gainTo(loudnessOf(voice, 2), volume);

/**
 * A script's sound, as long as the video (`duration` seconds), into `file` (.m4a): its voices, in both
 * channels, and the sounds it plays, in their own, each as loud as any other and then at its volume, brought
 * to `loudness` LUFS by one gain (render.ts, levelMix); silence when there is none. What it was brought by is
 * given back.
 */
export async function writeMix(lines: MixedLine[], duration: number, file: string, loudness: number): Promise<Levelled> {
  const said = lines.filter(({ sound }) => sound === undefined);
  const voices = await readVoices(said);
  const spoken = await voiceTrack(said.map(({ start, duration, volume }, i) => ({ ...voices[i]!, start, duration, gain: gainOf(voices[i]!, volume) })), RATE, duration);

  const played = lines.filter(({ sound }) => sound !== undefined);
  const sounds = new Map(await Promise.all([...new Set(played.map((line) => line.file))].map(async (one) => [one, await readSound(one)] as const)));
  const gains = new Map([...sounds].map(([one, sound]) => [one, loudnessIn(sound)]));
  const track = (channel: "left" | "right") => {
    const laid = mix(played.map(({ file: one, start, duration, volume, sound }) => ({ samples: sounds.get(one)![channel], start, duration, gain: gainTo(gains.get(one)!, volume), loop: sound === "loop" })), RATE, duration);
    for (let i = 0; i < Math.min(laid.length, spoken.length); i++) laid[i]! += spoken[i]!;
    return laid;
  };
  return levelMix({ left: track("left"), right: track("right"), sampleRate: RATE }, file, loudness);
}

/** What a script's sound is made from, as a stage's key: a voice by its file's name, which is of what it says, and a sound by its file's bytes. */
export async function mixKey(lines: MixedLine[], duration: number, loudness: number): Promise<string> {
  const bytes = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");
  const made = await Promise.all(lines.map(async ({ file, start, duration, volume, sound }) => [sound ? await bytes(file) : path.basename(file), start, duration, volume, sound ?? "voice"]));
  return keyOf(`mix at ${RATE}`, made, duration, loudness);
}

/**
 * A plan's sound: the voices as they are, as long as the video (`duration` seconds) and at `loudness`
 * LUFS, into `file` (.m4a): silence when there is none. Voices of one sample rate are mixed at it, of
 * several at a script's.
 */
export async function writeSound(lines: PlacedVoice[], duration: number, file: string, loudness: number): Promise<void> {
  const voices = await readVoices(lines);
  const rates = [...new Set(voices.map((voice) => voice.sampleRate))];
  const sampleRate = rates.length === 1 ? rates[0]! : rates.length === 0 ? 24000 : RATE;
  const track = await voiceTrack(lines.map((line, i) => ({ ...voices[i]!, start: line.start, duration: line.duration })), sampleRate, duration);
  // The mix before its level, beside the sound only while it is levelled.
  const mixed = `${file}.mix.wav`;
  await writeFile(mixed, encodeWav(track, sampleRate));
  try {
    await levelSound(mixed, file, loudness);
  } finally {
    await rm(mixed, { force: true });
  }
}
