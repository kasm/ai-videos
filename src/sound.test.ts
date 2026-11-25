// A video file's one sound track (sound.ts): each line's voice laid from where it begins, and no
// further than it is cut, brought to the video's loudness by ffmpeg.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { compile, saidLines } from "./compile.ts";
import { mouthTrack } from "./mouth.ts";
import { readScript } from "./read.ts";
import { run } from "./render.ts";
import { linesIn, type CheckedLine, type ScriptItem } from "./scenario.ts";
import { compiledVoices, mix, writeSound } from "./sound.ts";
import { encodeWav, readWav } from "./tts.ts";

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

test("a voice longer than it may sound is cut there, fading to nothing just before, and the rest of the track is the others'", () => {
  const ones = new Float32Array(1000).fill(1);
  const track = mix([{ samples: ones, start: 0.1, duration: 0.5 }, { samples: ones.subarray(0, 100), start: 0.8, duration: 0.1 }], 1000, 1.2);
  assert.ok(track.subarray(100, 570).every((s) => s === 1), "whole until 30 ms before the cut");
  for (let i = 571; i < 600; i++) assert.ok(track[i]! < track[i - 1]!, "then down");
  assert.ok(track[599]! < 0.04);
  assert.ok(track.subarray(600, 800).every((s) => s === 0), "nothing after the cut");
  assert.ok(track.subarray(800, 900).every((s) => s === 1), "one as long as it may sound is not cut");
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

/** How loud a tone of `hz` is in each tenth of a second of a sound file, against its loudest: 0 to 1 (Goertzel's). */
async function toneIn(samples: Float32Array, rate: number, hz: number): Promise<number[]> {
  const step = Math.round(rate / 10);
  const levels: number[] = [];
  for (let at = 0; at + step <= samples.length; at += step) {
    const c = 2 * Math.cos((2 * Math.PI * hz) / rate);
    let [a, b] = [0, 0];
    for (let i = 0; i < step; i++) [a, b] = [samples[at + i]! + c * a - b, a];
    levels.push(Math.sqrt(Math.max(0, a * a + b * b - c * a * b)));
  }
  const loudest = Math.max(...levels);
  return levels.map((level) => level / loudest);
}

test("each voice of a script is in the sound at its compiled time, and what is cut is silent after the cut", async () => {
  // A chorus, an interruption at a word, a murmur of two lines under three cut where they end, and a
  // radio the talk waits for: each voice a tone of its own.
  const script = [
    "together:",
    "  ann say: Hello!",
    "  ben say: Hello there!",
    "[a] ann say: abcd efgh ijkl mnop",
    "cat say @ a.word(ijkl): No!",
    "in order:",
    "  under:",
    "    dan say: One, two, three.",
    "    dan say: Four, five, six.",
    "  ann say: Is it counting?",
    "  ben say: It is.",
    "  ann say: Still.",
    "together:",
    "  radio say: And now the news, all of it.",
    "  in order:",
    "    ann say: Hush.",
    "    ben say: What?",
    "cat say: It is over.",
  ];
  const { items, issues } = readScript(script.join("\n"));
  assert.deepEqual(issues, []);
  // As the check gives it: a said line without its values.
  const checked = (item: ScriptItem): ScriptItem<CheckedLine> => ("items" in item ? { ...item, items: item.items.map(checked) } : { ...item, text: item.text! });
  const lines = linesIn(items);
  const lengths: Record<number, number> = { 2: 1, 3: 1.4, 4: 2.4, 5: 1.5, 8: 1.8, 9: 5, 10: 1, 11: 0.8, 12: 0.9, 14: 5, 16: 0.7, 17: 0.9, 18: 0.6 };
  /** Every line its own tone, so that each is found in the mix by itself: 300 Hz, and 150 more for each after it. */
  const hz = new Map(lines.map((line, k) => [line.line, 300 + 150 * k]));
  const voices = await Promise.all(
    lines.map(async ({ line }) => {
      const file = `line-${line}.wav`;
      const samples = Float32Array.from({ length: Math.round(lengths[line]! * 24000) }, (_, i) => 0.15 * Math.sin((2 * Math.PI * hz.get(line)! * i) / 24000));
      await writeFile(path.join(scratch, file), encodeWav(samples, 24000));
      return { file, duration: lengths[line]!, mouth: mouthTrack({ samples, sampleRate: 24000 }, 0, 30).open };
    }),
  );
  const settings = { fps: 30, loudness: -20, lead: 0.6, gap: 0.4, tail: 1, moves: { slowest: 0.5, fastest: 2 } };
  const compiled = compile([{ line: 1, setting: {}, items: items.map(checked) }], voices, settings, "x.yaml");
  const said = saidLines(compiled.scenes);
  assert.equal(said.length, lines.length);
  // The laws' times: seconds. The murmur's second line has 5 s, and 1.3 of them before the cut.
  const spans = new Map(said.map((line) => [line.line, [line.from / 30, (line.from + line.frames) / 30] as const]));
  const tenths = (line: number) => spans.get(line)!.map((t) => Math.round(t * 10) / 10);
  assert.deepEqual([2, 3].map(tenths), [[0.6, 1.6], [0.6, 2]]);
  assert.deepEqual([4, 5].map(tenths), [[2.4, 4.8], [3.7, 5.2]]);
  assert.deepEqual([8, 9, 10, 11, 12].map(tenths), [[5.6, 7.4], [7.8, 9.1], [5.6, 6.6], [7, 7.8], [8.2, 9.1]]);
  assert.deepEqual([14, 16, 17, 18].map(tenths), [[9.5, 14.5], [9.5, 10.2], [10.6, 11.5], [14.9, 15.5]]);

  const file = path.join(scratch, "at-once.m4a");
  await writeSound(compiledVoices(compiled, scratch), compiled.frames / 30, file, settings.loudness);
  const wav = path.join(scratch, "at-once.wav");
  const decoded = await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-bitexact", wav]);
  assert.equal(decoded.code, 0, decoded.stderr);
  const { samples, sampleRate } = await readWav(wav);
  assert.ok(Math.abs(samples.length / sampleRate - compiled.frames / 30) < 0.1);
  for (const { line } of said) {
    const [from, to] = spans.get(line)!;
    const levels = await toneIn(samples, sampleRate, hz.get(line)!);
    levels.forEach((level, k) => {
      // Its tone fills the tenths that are all its own, and is in none that has nothing of it.
      if (k / 10 >= from && (k + 1) / 10 <= to - 0.03) assert.ok(level > 0.8, `line ${line}, ${k / 10} s: ${level}, from ${from} to ${to}`);
      else if ((k + 1) / 10 < from - 0.02 || k / 10 > to + 0.02) assert.ok(level < 0.1, `line ${line}, ${k / 10} s: ${level}, silent before ${from} and after ${to}`);
    });
  }
});

test("where nobody speaks, the sound is silence as long as the video", async () => {
  const file = path.join(scratch, "silent.m4a");
  await writeSound([], 2, file, -14);
  const [[start, from], [end, to]] = (await silences(file)) as [[string, number], [string, number]];
  assert.deepEqual([start, from, end], ["start", 0, "end"]);
  assert.ok(to >= 2 && to < 2.2, `it lasts ${to} s`);
});
