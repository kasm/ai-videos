// A video file's one sound track (sound.ts): each line's voice laid from where it begins, brought to
// the video's loudness by ffmpeg.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { run } from "./render.ts";
import { mix, writeSound } from "./sound.ts";
import { encodeWav } from "./tts.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-sound-"));
after(() => rm(scratch, { recursive: true, force: true }));

test("the sound lays each line's voice from its start, on a track as long as the video", () => {
  const first = { samples: new Float32Array([0.5, 0.5]), start: 0.1 };
  // The second line runs past the video's end: it is cut there.
  const second = { samples: new Float32Array([0.25, 0.25, 0.25]), start: 0.3 };
  assert.deepEqual([...mix([first, second], 10, 0.5)], [0, 0.5, 0.5, 0.25, 0.25]);
  // Silence where no line is, and nothing at all with no line.
  assert.deepEqual([...mix([], 10, 0.3)], [0, 0, 0]);
});
/** Where a sound file is silent, seconds, as ffmpeg finds it: its starts and its ends. */
async function silences(file: string) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-50dB:d=0.2", "-f", "null", "-"]);
  return [...stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)].map(([, what, at]) => [what, Math.round(Number(at) * 10) / 10]);
}

test("each voice is in the sound where it begins, the whole as long as the video", async () => {
  // Half a second of a tone, twice: at 0.5 s and at 2 s.
  const voice = path.join(scratch, "tone.wav");
  await writeFile(voice, encodeWav(Float32Array.from({ length: 12000 }, (_, i) => 0.3 * Math.sin(i / 10)), 24000));
  const file = path.join(scratch, "sound.m4a");
  await writeSound([{ file: voice, start: 0.5 }, { file: voice, start: 2 }], 3, file, -20);
  assert.deepEqual(await silences(file), [["start", 0], ["end", 0.5], ["start", 1], ["end", 2], ["start", 2.5], ["end", 3]]);
  // The mix before its level is not kept.
  assert.deepEqual((await readdir(scratch)).sort(), ["sound.m4a", "tone.wav"]);
});

test("where nobody speaks, the sound is silence as long as the video", async () => {
  const file = path.join(scratch, "silent.m4a");
  await writeSound([], 2, file, -14);
  const [[start, from], [end, to]] = (await silences(file)) as [[string, number], [string, number]];
  assert.deepEqual([start, from, end], ["start", 0, "end"]);
  assert.ok(to >= 2 && to < 2.2, `it lasts ${to} s`);
});
