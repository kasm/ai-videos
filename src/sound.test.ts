// A video file's one sound track (sound.ts): each line's voice laid from where it begins, and no
// further than it is cut, brought to the video's loudness. A script's voices are first as loud as each
// other, then at their volumes, and one gain with a limiter keeps them so far apart.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { compile, saidLines } from "./compile.ts";
import { loudnessOf } from "./loudness.ts";
import { mouthTrack } from "./mouth.ts";
import { readScript } from "./read.ts";
import { run } from "./render.ts";
import { linesIn, type CheckedLine, type ScriptItem } from "./scenario.ts";
import { compiledVoices, gainOf, mix, writeMix, writeSound } from "./sound.ts";
import { encodeWav } from "./tts.ts";
import { workOut, type WorkedLine } from "./values.ts";

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

test("a line's samples are so many times as loud as they are", () => {
  const ones = new Float32Array([1, 1]);
  assert.deepEqual([...mix([{ samples: ones, start: 0, gain: 0.5 }, { samples: ones, start: 0.1, gain: 2 }, { samples: ones, start: 0.1 }], 10, 0.4)], [0.5, 3.5, 3, 0]);
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
  assert.deepEqual((await readdir(scratch)).filter((name) => name.startsWith("sound") || name.startsWith("tone")).sort(), ["sound.m4a", "tone.wav"]);
});

/** A sound file as it is heard, in one of its channels. */
async function heard(file: string, rate = 24000, channel = 0) {
  const raw = path.join(scratch, "heard.f32");
  const { code, stderr } = await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-af", `pan=mono|c0=c${channel}`, "-ar", String(rate), "-f", "f32le", raw]);
  assert.equal(code, 0, stderr);
  const bytes = await readFile(raw);
  return { samples: new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)), sampleRate: rate };
}

/** A sound file's highest peak, between its samples too, dB over full scale, as ffmpeg's meter says it. */
async function peakOf(file: string) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  return Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(stderr)![1]);
}

/**
 * A voice as Kokoro's are, its highest peak `level`: tones of `hz` and its multiples, all under 2 kHz, in
 * four syllables a second, some louder than others. In half of its hundredths of a second the peak is 6
 * dB over its loudness (Kokoro's narrator: 7), in a tenth 12 (12), in a hundredth 15.5 (15).
 */
const voiceLike = (hz: number, seconds: number, level: number) => {
  const tones = Math.floor(2000 / hz);
  const loud = [0.5, 0.75, 0.4, 1, 0.55, 0.3, 0.65, 0.45];
  const samples = Float32Array.from({ length: Math.round(seconds * 24000) }, (_, i) => {
    const t = i / 24000;
    const n = Math.floor(t * 4);
    let sum = 0;
    for (let k = 1; k <= tones; k++) sum += Math.cos(2 * Math.PI * k * hz * t + 1.3 * k * k) / Math.sqrt(k);
    return loud[n % loud.length]! * Math.sin(Math.PI * (t * 4 - n)) * sum;
  });
  const highest = samples.reduce((most, s) => Math.max(most, Math.abs(s)), 0);
  return { samples: samples.map((s) => (level * s) / highest), sampleRate: 24000 };
};
const written = async (name: string, voice: { samples: Float32Array; sampleRate: number }) => {
  const file = path.join(scratch, name);
  await writeFile(file, encodeWav(voice.samples, voice.sampleRate));
  return file;
};
/** The loudness of a part of a sound, LUFS, in two channels. */
const partOf = ({ samples, sampleRate }: { samples: Float32Array; sampleRate: number }, from: number, to: number) => loudnessOf({ samples: samples.slice(Math.round(from * sampleRate), Math.round(to * sampleRate)), sampleRate }, 2);
const near = (actual: number, expected: number, within: number, what = "") => assert.ok(Math.abs(actual - expected) <= within, `${what} ${actual}, not ${expected}`);

/** How far a voice's highest peak is over its loudness, dB. */
const crest = (voice: ReturnType<typeof voiceLike>) => 20 * Math.log10(voice.samples.reduce((most, s) => Math.max(most, Math.abs(s)), 0)) - loudnessOf(voice);

test("two lines written 12 dB apart come out 12 dB apart at -14 LUFS, with peaks as high over their loudness as Kokoro's", async () => {
  const script = ["ann say: One.", "ben say volume=-12dB: Two."];
  const { items } = readScript(script.join("\n"));
  const { scenes: worked } = workOut({ scenes: [{ line: 1, setting: {}, items }], issues: [] }, { actions: {}, names: {}, speakers: ["ann", "ben"], timing: { lead: 0.6, gap: 0.4, tail: 1 } });
  const [ann, ben] = [voiceLike(117, 3, 0.8), voiceLike(140, 3, 0.3)];
  // Kokoro's are 13 to 20 dB over, half of them 15.5 or more.
  for (const voice of [ann, ben]) assert.ok(crest(voice) > 15.3 && crest(voice) < 17, `${crest(voice)}`);
  const files = await Promise.all([ann, ben].map((voice, k) => written(`apart-${k}.wav`, voice)));
  const voices = files.map((file) => ({ file: path.basename(file), duration: 3, mouth: [] }));
  const lines = worked.map((scene) => ({ ...scene, setting: {}, items: scene.items.map((item) => ({ ...item, text: (item as WorkedLine).text!, volume: (item as WorkedLine).volume! }) as CheckedLine) }));
  const compiled = compile(lines, voices, { fps: 30, loudness: -14, moves: { slowest: 0.5, fastest: 2 } }, "x.yaml");
  assert.deepEqual(compiledVoices(compiled, "").map(({ start, duration, volume }) => [start, duration, volume]), [[0.6, 3, 0], [4, 3, -12]]);

  const file = path.join(scratch, "apart.m4a");
  const { gain, lowered, loudness } = await writeMix(compiledVoices(compiled, scratch), compiled.frames / 30, file, -14);
  const sound = await heard(file, 48000);
  near(loudnessOf(sound, 2), -14, 0.1, "the whole is");
  near(loudness, -14, 0.1, "it is said to be");
  // The voice is in both channels, whole.
  const right = (await heard(file, 48000, 1)).samples;
  assert.ok(sound.samples.every((s, i) => Math.abs(s - right[i]!) < 1e-3));
  near(partOf(sound, 0.6, 3.6) - partOf(sound, 4, 7), 12, 1, "the second is under the first by");
  // One gain and a limiter at work: the peaks would be past full scale.
  assert.ok(gain > 8 && lowered > 2, `${gain}, ${lowered}`);
  assert.ok((await peakOf(file)) <= -1, `${await peakOf(file)}`);
});

test("every voice is as loud as any other, then at its volume, and what is written apart stays so", async () => {
  const [loud, quiet, short] = [voiceLike(110, 2, 0.9), voiceLike(140, 2, 0.1), voiceLike(125, 0.35, 0.5)];
  assert.ok(loudnessOf(loud) - loudnessOf(quiet) > 15);
  const files = [await written("loud.wav", loud), await written("quiet.wav", quiet), await written("short.wav", short)];
  const lines = [0, -6.5, 3, 0, -20].map((volume, k) => ({ file: files[k % 3]!, start: 0.5 + 2.5 * k, volume }));
  const file = path.join(scratch, "levelled.m4a");
  // So quiet that nothing is limited.
  const { lowered } = await writeMix(lines, 13, file, -26);
  assert.equal(lowered, 0);
  const sound = await heard(file, 48000);
  const [a, b, c, d, e] = lines.map(({ start }, k) => partOf(sound, start, start + (k === 2 ? 0.35 : 2))) as [number, number, number, number, number];
  near(b - a, -6.5, 0.2);
  near(c - a, 3, 0.4);
  near(d - a, 0, 0.2);
  near(e - a, -20, 0.3);
  // What a voice is multiplied by, and none for one that is silence.
  near(20 * Math.log10(gainOf(loud, 0) / gainOf(quiet, 0)), loudnessOf(quiet) - loudnessOf(loud), 0.01);
  near(20 * Math.log10(gainOf(loud, -6) / gainOf(loud, 6)), -12, 0.01);
  assert.equal(gainOf({ samples: new Float32Array(100), sampleRate: 24000 }, 3), 1);
});

/** How much of a sound is over 4 kHz, dB under the whole of it: what a cut top makes, where the voices have nothing. */
async function over4k(file: string) {
  const { samples, sampleRate } = await heard(file, 48000);
  const high = path.join(scratch, "high.f32");
  await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-af", "pan=mono|c0=c0,highpass=f=4000:p=2,highpass=f=4000:p=2,highpass=f=4000:p=2", "-ar", String(sampleRate), "-f", "f32le", high]);
  const bytes = await readFile(high);
  const above = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  const power = (list: Float32Array) => list.reduce((sum, s) => sum + s * s, 0);
  return 10 * Math.log10(power(above) / power(samples));
}

test("two full voices at once are not clipped, nor two at the most a volume may be: the mix has room for any peak", async () => {
  const [ann, ben] = [await written("ann.wav", voiceLike(100, 3, 0.99)), await written("ben.wav", voiceLike(125, 3, 0.99))];
  for (const volume of [0, 12]) {
    const file = path.join(scratch, `both-${volume}.m4a`);
    const lines = [ann, ben].map((voice) => ({ file: voice, start: 0.5, volume }));
    const { loudness, lowered } = await writeMix(lines, 4, file, -10);
    near(loudness, -10, 0.1);
    // All of it at one volume is as all of it at another: what the limiter takes is the same.
    near(lowered, 5.07, 0.1);
    assert.ok((await peakOf(file)) <= -1, `${await peakOf(file)}`);
    const above = await over4k(file);
    // Cut at full scale, the louder mix has -37.
    assert.ok(above < -45, `${above} dB of it is over 4 kHz`);
  }
});

test("a peak between two samples is a peak too", async () => {
  // Bursts of 6 kHz, at 24 kHz a sample every quarter of a wave: each is taken 3 dB under the top of it.
  const samples = Float32Array.from({ length: 72000 }, (_, i) => (i % 12000 < 480 ? 0.5 * Math.sin((Math.PI / 2) * i + Math.PI / 4) * Math.sin((Math.PI * (i % 12000)) / 480) : 0));
  const file = path.join(scratch, "between.m4a");
  const { lowered } = await writeMix([{ file: await written("between.wav", { samples, sampleRate: 24000 }), start: 0.1, volume: 0 }], 3.2, file, -11);
  assert.ok(lowered > 3, `${lowered}`);
  assert.ok((await peakOf(file)) <= -0.9, `${await peakOf(file)}`);
});

test("a line about as far under the rest as the meter leaves out is mixed to its loudness too", async () => {
  // A line as long as the others, 12.5 to 13 dB under them, is on the edge of what their loudness counts.
  const files = [await written("edge-a.wav", voiceLike(110, 3, 0.9)), await written("edge-b.wav", voiceLike(135, 3, 0.5))];
  for (const volume of [-12.25, -12.75, -13.25]) {
    const { loudness } = await writeMix(files.map((file, k) => ({ file, start: 0.5 + 3.4 * k, volume: k * volume })), 8, path.join(scratch, "edge.m4a"), -12);
    near(loudness, -12, 0.1, `at ${volume} dB`);
  }
});

test("the voices are where they are laid: neither the gain nor the limiter moves them", async () => {
  const voice = voiceLike(117, 1.5, 0.9);
  const file = path.join(scratch, "placed.m4a");
  const { lowered } = await writeMix([{ file: await written("placed.wav", voice), start: 1, volume: 0 }], 3, file, -10);
  assert.ok(lowered > 4, `${lowered}`);
  const { samples, sampleRate } = await heard(file, 24000);
  near(samples.length / sampleRate, 3, 0.1);
  let best = { lag: 0, sum: -Infinity };
  for (let lag = -120; lag <= 120; lag++) {
    const sum = voice.samples.reduce((total, s, i) => total + s * (samples[24000 + lag + i] ?? 0), 0);
    if (sum > best.sum) best = { lag, sum };
  }
  assert.ok(Math.abs(best.lag) <= 4, `${best.lag / 24} ms off`);
});

test("a mix that cannot come to its loudness comes as near as it can, and one that is silence stays so", async () => {
  // A click in a silence: whatever the gain, the limiter takes it.
  const click = { samples: Float32Array.from({ length: 24000 }, (_, i) => (i === 12000 ? 0.9 : 0)), sampleRate: 24000 };
  const { loudness } = await writeMix([{ file: await written("click.wav", click), start: 0, volume: 0 }], 2, path.join(scratch, "click.m4a"), -9);
  assert.ok(Number.isFinite(loudness));
  const silent = path.join(scratch, "nobody.m4a");
  assert.deepEqual(await writeMix([], 2, silent, -14), { gain: 0, lowered: 0, loudness: -Infinity });
  assert.deepEqual((await silences(silent)).map(([what]) => what), ["start", "end"]);
  const none = { samples: new Float32Array(24000), sampleRate: 24000 };
  assert.equal((await writeMix([{ file: await written("none.wav", none), start: 0, volume: 0 }], 2, silent, -14)).gain, 0);
  // Nothing is left beside the sounds.
  assert.deepEqual((await readdir(scratch)).filter((name) => /mix|levelled\.f32/.test(name)), []);
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
  const { scenes: worked } = workOut({ scenes: [{ line: 1, setting: {}, items }], issues: [] }, { actions: {}, names: {}, speakers: ["ann", "ben", "cat", "dan", "radio"], timing: { lead: 0.6, gap: 0.4, tail: 1 } });
  const checked = (item: ScriptItem<WorkedLine>): ScriptItem<CheckedLine> => ("items" in item ? { ...item, items: item.items.map(checked) } : { ...item, text: item.text!, volume: item.volume! });
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
  const settings = { fps: 30, loudness: -20, moves: { slowest: 0.5, fastest: 2 } };
  const compiled = compile(worked.map((scene) => ({ ...scene, setting: {}, items: scene.items.map(checked) })), voices, settings, "x.yaml");
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
  await writeMix(compiledVoices(compiled, scratch), compiled.frames / 30, file, settings.loudness);
  const { samples, sampleRate } = await heard(file);
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
