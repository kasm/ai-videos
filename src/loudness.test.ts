// How loud a voice is (loudness.ts), beside what the standard says of a tone and what ffmpeg's meter
// says of voices with pauses.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loudnessIn, loudnessOf } from "./loudness.ts";
import { run } from "./render.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-loudness-"));
after(() => rm(scratch, { recursive: true, force: true }));

const near = (actual: number, expected: number, within: number, what = "") => assert.ok(Math.abs(actual - expected) <= within, `${what} ${actual}, not ${expected}`);
const tone = (hz: number, seconds: number, rate: number, level = 1) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => level * Math.sin((2 * Math.PI * hz * i) / rate));

test("a full tone of 997 Hz is -3.01 LUFS in one channel and 0 in two, at any sample rate; half as high is 6 dB less", () => {
  for (const sampleRate of [24000, 44100, 48000]) {
    near(loudnessOf({ samples: tone(997, 2, sampleRate), sampleRate }), -3.01, 0.05);
    near(loudnessOf({ samples: tone(997, 2, sampleRate), sampleRate }, 2), 0, 0.05);
    near(loudnessOf({ samples: tone(997, 2, sampleRate, 0.5), sampleRate }), -9.03, 0.05);
  }
});

test("treble is heard louder than it is, and bass quieter", () => {
  const at = (hz: number) => loudnessOf({ samples: tone(hz, 2, 48000), sampleRate: 48000 });
  near(at(5000) - at(997), 3.3, 0.2);
  near(at(40) - at(997), -6.6, 0.4);
});

test("a pause is left out, a quiet part only when it is far under the rest, and silence has no loudness", () => {
  const sampleRate = 24000;
  const quiet = (level: number) => Float32Array.from([...tone(997, 3, sampleRate, 0.5), ...tone(997, 3, sampleRate, level)]);
  near(loudnessOf({ samples: quiet(0), sampleRate }), -9.03, 0.2, "with a pause as long");
  // 20 dB under, it is left out, and 6 dB under, it is in the mean: half the power at 1, and half at a quarter.
  near(loudnessOf({ samples: quiet(0.05), sampleRate }), -9.03, 0.2);
  near(loudnessOf({ samples: quiet(0.25), sampleRate }), -9.03 + 10 * Math.log10(0.625), 0.1);
  assert.equal(loudnessOf({ samples: new Float32Array(48000), sampleRate }), -Infinity);
  assert.equal(loudnessOf({ samples: tone(997, 1, sampleRate, 1e-5), sampleRate }), -Infinity, "quieter than any voice");
  assert.equal(loudnessOf({ samples: new Float32Array(0), sampleRate }), -Infinity);
});

test("a sound in two channels is as loud as the two together: one that is silent adds nothing, and the same in both is 3 dB more", async () => {
  const sampleRate = 48000;
  const [left, right] = [tone(997, 2, sampleRate, 0.5), tone(997, 2, sampleRate, 0.25)];
  const silent = new Float32Array(left.length);
  near(loudnessIn({ left, right: silent, sampleRate }), -9.03, 0.05);
  near(loudnessIn({ left: silent, right: left, sampleRate }), -9.03, 0.05);
  near(loudnessIn({ left, right: left, sampleRate }), -6.02, 0.05);
  near(loudnessIn({ left, right, sampleRate }), -9.03 + 10 * Math.log10(1.25), 0.05);
  assert.equal(loudnessIn({ left, right: left, sampleRate }), loudnessOf({ samples: left, sampleRate }, 2));
  assert.equal(loudnessIn({ left: silent, right: silent, sampleRate }), -Infinity);
  // What ffmpeg's meter says of one with a pause in one channel and a quiet part in the other.
  const both = Float32Array.from({ length: 2 * 4 * sampleRate }, (_, i) => {
    const t = Math.floor(i / 2) / sampleRate;
    return i % 2 === 0 ? (t < 2 ? 0.3 * Math.sin(2 * Math.PI * 300 * t) : 0) : (t < 1 ? 0.02 : 0.2) * Math.sin(2 * Math.PI * 2100 * t);
  });
  const file = path.join(scratch, "stereo.f32");
  await writeFile(file, Buffer.from(both.buffer));
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-f", "f32le", "-ar", String(sampleRate), "-ac", "2", "-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
  const channel = (n: number) => both.filter((_, i) => i % 2 === n);
  near(loudnessIn({ left: channel(0), right: channel(1), sampleRate }), Number(/I:\s+(-?[\d.]+) LUFS/.exec(stderr)![1]), 0.1);
});

test("a voice too short for a block is one block", () => {
  near(loudnessOf({ samples: tone(997, 0.2, 24000), sampleRate: 24000 }), -3.01, 0.3);
  assert.ok(Number.isFinite(loudnessOf({ samples: tone(997, 0.01, 24000), sampleRate: 24000 })));
});

test("it is what ffmpeg's meter says", async () => {
  // Syllables of several tones, with pauses, a loud part and a quiet one.
  const sampleRate = 24000;
  for (const [n, pace] of [3, 4.3, 2.2].entries()) {
    const samples = Float32Array.from({ length: 5 * sampleRate }, (_, i) => {
      const t = i / sampleRate;
      const syllable = Math.max(0, Math.sin(2 * Math.PI * pace * t)) ** 2 * (Math.floor(t * 0.9) % 3 === 2 ? 0.02 : 1);
      return 0.3 * syllable * (Math.sin(2 * Math.PI * (130 + 20 * n) * t) + 0.6 * Math.sin(2 * Math.PI * 900 * t) + 0.3 * Math.sin(2 * Math.PI * 3100 * t));
    });
    const file = path.join(scratch, `${n}.f32`);
    await writeFile(file, Buffer.from(samples.buffer));
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-f", "f32le", "-ar", String(sampleRate), "-ac", "1", "-i", file, "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
    near(loudnessOf({ samples, sampleRate }), Number(/I:\s+(-?[\d.]+) LUFS/.exec(stderr)![1]), 0.1);
  }
});
