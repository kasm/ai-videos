// A line's mouth track: open while its voice sounds and closed in its pauses, a number for each
// frame of the clip; and how a request carries it, with the line's length.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { ClipEvent } from "./clip.ts";
import { fitClip, requestDocument, requestText, type FitTiming } from "./fit.ts";
import { mouthTrack, type Voice } from "./mouth.ts";
import { readWav, speak, type TtsProvider } from "./tts.ts";

const RATE = 24000;
const FPS = 30;

/**
 * A voice from parts, each `[seconds, level]`: a tone that loud, or silence at 0. At 300 Hz a
 * frame of 30 fps holds ten whole waves (and half a frame five), so a part's frames are equally loud.
 */
function voice(...parts: [seconds: number, level: number][]): Voice {
  const samples = new Float32Array(parts.reduce((sum, [seconds]) => sum + Math.round(seconds * RATE), 0));
  let i = 0;
  for (const [seconds, level] of parts) {
    for (const end = i + Math.round(seconds * RATE); i < end; i++) samples[i] = level * Math.sin((2 * Math.PI * 300 * i) / RATE);
  }
  return { samples, sampleRate: RATE };
}

/** Two sentences with a pause between them: 0.5 s of voice, 0.3 s of silence, 0.4 s of voice. */
const TWO_SENTENCES = voice([0.5, 0.6], [0.3, 0], [0.4, 0.6]);
const frames = (seconds: number) => Math.round(seconds * FPS);
const ones = (n: number) => new Array<number>(n).fill(1);
const zeros = (n: number) => new Array<number>(n).fill(0);

test("the mouth is open while the voice sounds, and closed in the line's pauses", () => {
  // The line begins 1 s into the clip: in frame 30.
  const track = mouthTrack(TWO_SENTENCES, 1, FPS);
  assert.equal(track.frame, 30);
  assert.equal(track.open.length, frames(1.2), "a number for each frame the line sounds in");
  assert.deepEqual(track.open.slice(0, 15), ones(15), "the first sentence");
  assert.deepEqual(track.open.slice(15, 24), zeros(9), "the pause: closed");
  assert.deepEqual(track.open.slice(24), ones(12), "the second sentence");
});

test("a quieter sound opens the mouth less, and 30 dB under the line's loudest is closed", () => {
  // A tenth is 20 dB under, a half 6 dB under, and 0.03 just past 30 dB under.
  const track = mouthTrack(voice([0.1, 1], [0.1, 0.1], [0.1, 0.03], [0.1, 0.5]), 0, FPS);
  assert.deepEqual(track.open, [1, 1, 1, 0.33, 0.33, 0.33, 0, 0, 0, 0.8, 0.8, 0.8]);
  // The line's own level does not matter: ten times quieter, the same track.
  assert.deepEqual(mouthTrack(voice([0.1, 0.1], [0.1, 0.01], [0.1, 0.003], [0.1, 0.05]), 0, FPS), track);
});

test("a line that begins within a frame: its track begins in that frame, quieter for the silent part", () => {
  // Half a frame after frame 30 begins, for 0.2 s: half of frame 30 and half of frame 36, 3 dB under.
  const track = mouthTrack(voice([0.2, 0.6]), 1 + 0.5 / FPS, FPS);
  assert.equal(track.frame, 30);
  assert.deepEqual(track.open, [0.9, 1, 1, 1, 1, 1, 0.9]);
});

test("a silent line keeps the mouth closed, and no voice at all gives no frame", () => {
  assert.deepEqual(mouthTrack(voice([0.1, 0]), 2, FPS), { frame: 60, open: zeros(3) });
  assert.deepEqual(mouthTrack(voice(), 2, FPS), { frame: 60, open: [] });
});

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-mouth-"));
after(() => rm(scratch, { recursive: true, force: true }));

test("a spoken line, read back from the voice cache, has its pause closed", async () => {
  const provider: TtsProvider = { id: "test", synth: async () => TWO_SENTENCES, voices: async () => [] };
  const spoken = await speak(provider, scratch, { text: "One. Two.", voice: "test", speed: 1 });
  const audio = await readWav(spoken.file);
  assert.equal(audio.sampleRate, RATE);
  assert.equal(audio.samples.length / RATE, spoken.duration, "the samples the line's length was measured on");
  assert.ok(Math.abs(spoken.duration - 1.2) < 0.001, `the line lasts ${spoken.duration} s`);
  const { open } = mouthTrack(audio, 0, FPS);
  assert.ok(open.slice(0, 15).every((x) => x > 0.95), "the first sentence");
  assert.deepEqual(open.slice(15, 24), zeros(9), "the pause: closed");
  assert.ok(open.slice(24, 35).every((x) => x > 0.95), "the second sentence");
});

const TIMING: FitTiming = { fps: FPS, lead: 0.6, gap: 0.4, tail: 1.0, slowest: 0.5, fastest: 2 };
const EVENTS: ClipEvent[] = [
  { name: "start", at: 0, span: "hold" },
  { name: "slide", at: 2, span: "move" },
  { name: "there", at: 3, span: "hold" },
];

test("a request gives each line its length, and its mouth track from the frame the line begins in", () => {
  const lines = [
    { text: "One. Two.", cue: "start", duration: 1.2, voice: TWO_SENTENCES },
    { text: "Three.", cue: "slide", duration: 0.2004, voice: voice([0.2, 0.3]) },
  ];
  const fit = fitClip(EVENTS, 4, lines, TIMING);
  // The first line begins after the lead, the second a gap after it, as its event comes.
  assert.deepEqual(fit.lines.map((l) => [l.at, l.duration, l.mouth?.frame]), [[0.6, 1.2, 18], [2.2, 0.2, 66]]);
  assert.deepEqual(fit.lines[0]!.mouth!.open, [...ones(15), ...zeros(9), ...ones(12)]);
  assert.deepEqual(fit.lines[1]!.mouth!.open, ones(6));

  // Without the voice a line has only its length, and the fit is the same.
  const bare = fitClip(EVENTS, 4, lines.map(({ voice: _, ...line }) => line), TIMING);
  assert.ok(bare.lines.every((l) => !("mouth" in l)));
  assert.deepEqual(bare.spans, fit.spans);
  assert.deepEqual(bare.lines, fit.lines.map(({ mouth: _, ...line }) => line));
});

test("the request's text keeps a mouth track on one line, and reads back as the request", () => {
  const fit = fitClip(EVENTS, 4, [{ text: "Three [1, 2].", cue: "start", duration: 0.2, voice: voice([0.2, 0.3]) }], TIMING);
  const document = requestDocument(fit, { from: "videos/square.yaml, scene square", clip: "square.json", fps: FPS });
  const text = requestText(document);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(document)));
  assert.match(text, /^ +"open": \[1, 1, 1, 1, 1, 1\]$/m);
  assert.equal(document.version, 1, "the version stays 1: a line's length and mouth are optional");
});

test("a request names each line's speaker, so a plugin moves that mouth only; a line with none has no such key", () => {
  const lines = [
    { text: "Two friends meet.", cue: "start", duration: 0.2, voice: voice([0.2, 0.3]) },
    { text: "Hello!", speaker: "pip", cue: "slide", duration: 0.2, voice: voice([0.2, 0.3]) },
    { text: "Hello, Pip.", speaker: "mo", duration: 0.2, voice: voice([0.2, 0.3]) },
  ];
  const fit = fitClip(EVENTS, 4, lines, TIMING);
  const document = requestDocument(fit, { from: "videos/square.yaml, scene square", clip: "square.json", fps: FPS });
  assert.deepEqual(document.lines.map((l) => [l.speaker, l.mouth?.open.length]), [[undefined, 6], ["pip", 6], ["mo", 6]]);
  assert.deepEqual(Object.keys(document.lines[0]!), ["text", "cue", "at", "waits", "duration", "mouth"]);
  assert.deepEqual(Object.keys(document.lines[1]!), ["text", "speaker", "cue", "at", "waits", "duration", "mouth"]);
  assert.equal(document.version, 1, "the version stays 1: the speaker is optional too");
  // Who speaks changes nothing in the timing.
  assert.deepEqual(fitClip(EVENTS, 4, lines.map(({ speaker: _, ...line }) => line), TIMING).spans, fit.spans);
});
