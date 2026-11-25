// A video file's one sound track (sound.ts): each line's voice laid from where it begins, and no
// further than it is cut, brought to the video's loudness. A script's voices and the sounds it plays are
// first as loud as each other, then at their volumes, and one gain with a limiter keeps them so far apart; a
// sound keeps its channels, and all of its treble.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { compile, playedLines, saidLines, type Compiled } from "./compile.ts";
import { loudnessOf } from "./loudness.ts";
import { mouthTrack } from "./mouth.ts";
import { readScript } from "./read.ts";
import { run } from "./render.ts";
import { checkScenario, linesIn, type CheckedLine, type ScriptItem, type ScriptPlugin } from "./scenario.ts";
import { pictureOf } from "./shown.ts";
import { compiledSounds, compiledVoices, gainOf, measureSound, mix, mixKey, readSound, writeMix, writeSound } from "./sound.ts";
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

test("what is looped is laid again and again for as long as it sounds, and fades to nothing just before its end", () => {
  const three = new Float32Array([1, 2, 3]);
  assert.deepEqual([...mix([{ samples: three, start: 0.2, duration: 0.7, loop: true }], 10, 1)], [0, 0, 1, 2, 3, 1, 2, 3, 1, 0]);
  assert.deepEqual([...mix([{ samples: three, start: 0.2, duration: 0.7 }], 10, 1)], [0, 0, 1, 2, 3, 0, 0, 0, 0, 0]);
  // Longer than the track, it stops with that.
  assert.deepEqual([...mix([{ samples: three, start: 0.1, duration: 5, loop: true, gain: 2 }], 10, 0.5)], [0, 2, 4, 6, 2]);
  const track = mix([{ samples: new Float32Array(100).fill(1), start: 0, duration: 0.5, loop: true }], 1000, 0.6);
  assert.ok(track.subarray(0, 470).every((s) => s === 1), "whole until 30 ms before its end, over where the file ends");
  for (let i = 471; i < 500; i++) assert.ok(track[i]! < track[i - 1]!, "then down");
  assert.ok(track.subarray(500).every((s) => s === 0), "nothing after it");
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

/** A tone as samples. */
const toneOf = (hz: number, seconds: number, rate = 48000, level = 0.15) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => level * Math.sin((2 * Math.PI * hz * i) / rate));
/** A sound file of the format its name says, from its channels. */
async function soundFile(name: string, channels: Float32Array[], rate = 48000): Promise<string> {
  const raw = path.join(scratch, `${name}.raw`);
  const both = Float32Array.from({ length: channels[0]!.length * channels.length }, (_, i) => channels[i % channels.length]![Math.floor(i / channels.length)]!);
  await writeFile(raw, Buffer.from(both.buffer));
  const { code, stderr } = await run("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(rate), "-ac", String(channels.length), "-i", raw, path.join(scratch, name)]);
  assert.equal(code, 0, stderr);
  return name;
}
/** How high a tone of `hz` is in a part of a sound, dB: 0 for a full one. */
const levelOf = ({ samples, sampleRate }: { samples: Float32Array; sampleRate: number }, hz: number, from: number, to: number) => {
  const part = samples.subarray(Math.round(from * sampleRate), Math.round(to * sampleRate));
  let [re, im] = [0, 0];
  part.forEach((s, i) => {
    re += s * Math.cos((2 * Math.PI * hz * i) / sampleRate);
    im += s * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  });
  return 20 * Math.log10((2 * Math.hypot(re, im)) / part.length);
};
/** A plugin with no actions, which draws nothing. */
const bare: ScriptPlugin = { actions: {}, guide: "Nothing is drawn.", check: (scenes) => ({ scenes: scenes.map(() => ({ setting: {}, actions: [] })) }), draw: () => () => "<svg/>" };

/** Tones, each its own: the sounds' files, by name, and how long each lasts. */
const TONES = { bell: { hz: 3100, seconds: 0.8 }, high: { hz: 15200, seconds: 0.6 }, rain: { hz: 5300, seconds: 0.5 }, gong: { hz: 1900, seconds: 4 }, hum: { hz: 900, seconds: 2 } };
/** A script's sounds and voices compiled, its files written: what is played and said, and the tone of each, by its line. */
async function playedScript() {
  const own = ["tune loop volume=-9dB", "hum play @ block.end - 1s"];
  const rows = [
    ["bell play volume=-3dB", "in order:", "  rain loop volume=-6dB", "  [a] ann say: One, two, three.", "  high play @ a.50%", "  ben say: Four.", "ann say: Five."],
    ["in order:", "  under:", "    gong play volume=-12dB", "  ben say volume=-4dB: Six.", "rain play", "ann say: Seven."],
  ];
  let first = 2;
  const scripts = [own, ...rows].map((script) => {
    const { items, issues } = readScript(script.join("\n"), first);
    assert.deepEqual(issues, []);
    first += script.length + 1;
    return { line: first, setting: {}, items };
  });
  const [over, ...scenes] = scripts;
  const files: Record<string, string> = {};
  for (const [name, { hz, seconds }] of Object.entries(TONES)) files[name] = await soundFile(`${name}.flac`, name === "high" ? [toneOf(hz, seconds), toneOf(hz, seconds)] : [toneOf(hz, seconds)]);
  // The tune has a tone of its own in each channel.
  files.tune = await soundFile("tune.flac", [toneOf(700, 1.3), toneOf(1300, 1.3)]);
  const lengths: Record<string, number> = {};
  for (const file of Object.values(files)) lengths[file] = (await measureSound(path.join(scratch, file))) as number;
  const checked = await checkScenario(bare, { over: over!, scenes, issues: [] }, undefined, ["ann", "ben"], { lead: 0.6, gap: 0.4, tail: 1 }, {}, files);
  assert.ok("scenes" in checked, JSON.stringify(checked));
  const said = checked.scenes.flatMap((scene) => linesIn(scene.items)).filter((line) => "text" in line);
  const hz = new Map(said.map((line, k) => [line.line, 300 + 60 * k]));
  const voices = await Promise.all(
    said.map(async ({ line }) => {
      const samples = toneOf(hz.get(line)!, 1.5, 24000);
      await writeFile(path.join(scratch, `said-${line}.wav`), encodeWav(samples, 24000));
      return { file: `said-${line}.wav`, duration: 1.5, mouth: [] };
    }),
  );
  const compiled = compile(checked.scenes, voices, { fps: 30, loudness: -26, moves: { slowest: 0.5, fastest: 2 } }, "x.yaml", lengths, checked.over);
  const toneIn = (line: ReturnType<typeof playedLines>[number]) => (line.who === "tune" ? 700 : TONES[line.who as keyof typeof TONES].hz);
  const tones = [...saidLines(compiled.scenes).map((line) => ({ ...line, hz: hz.get(line.line)! })), ...playedLines(compiled).map((line) => ({ ...line, hz: toneIn(line) }))];
  return { compiled, tones, seconds: compiled.frames / 30 };
}
const heardOf = (compiled: Compiled) => [...compiledVoices(compiled, scratch), ...compiledSounds(compiled, scratch)];

test("each sound a script plays is in the sound at its time and its level, beside the voices, one above 12 kHz among them", async () => {
  const { compiled, tones, seconds } = await playedScript();
  // The laws' times, seconds: the first scene waits for the bell, and the rain ends with its block; the gong is cut with its.
  const at = (who: string, action: string) => tones.filter((line) => line.who === who && line.action === action).map(({ from, frames }) => [from / 30, (from + frames) / 30].map((t) => Math.round(t * 100) / 100));
  assert.deepEqual(at("bell", "play"), [[0.6, 1.4]]);
  assert.deepEqual(at("rain", "loop"), [[1.8, 5.2]]);
  // Half of Ann's 45 frames is 23.
  assert.deepEqual(at("high", "play"), [[2.57, 3.17]]);
  assert.deepEqual(at("gong", "play"), [[8.7, 10.2]]);
  assert.deepEqual(at("rain", "play"), [[10.6, 11.1]]);
  assert.deepEqual(at("tune", "loop"), [[0, 14]]);
  assert.deepEqual(at("hum", "play"), [[13, 14]]);
  assert.equal(seconds, 14);
  assert.deepEqual(compiledSounds(compiled, scratch).map(({ file, sound }) => `${path.basename(file, ".flac")} ${sound}`), ["tune loop", "hum once", "bell once", "rain loop", "high once", "gong once", "rain once"]);

  const file = path.join(scratch, "played.m4a");
  const { lowered } = await writeMix(heardOf(compiled), seconds, file, -26);
  assert.equal(lowered, 0, "so quiet that nothing is limited");
  const sound = await heard(file, 48000);
  assert.ok(Math.abs(sound.samples.length / 48000 - seconds) < 0.1);
  for (const hz of new Set(tones.map((line) => line.hz))) {
    const spans = tones.filter((line) => line.hz === hz).map(({ from, frames }) => [from / 30, (from + frames) / 30] as const);
    // Its tone fills the tenths that are all its own, and is in none that has nothing of it.
    for (let t = 0; t + 0.1 <= seconds; t += 0.1) {
      const level = levelOf(sound, hz, t, t + 0.1);
      if (spans.some(([from, to]) => t >= from + 0.02 && t + 0.1 <= to - 0.04)) assert.ok(level > -60, `${hz} Hz at ${t.toFixed(1)} s: ${level}`);
      else if (spans.every(([from, to]) => t + 0.1 < from - 0.02 || t > to + 0.02)) assert.ok(level < -65, `${hz} Hz at ${t.toFixed(1)} s: ${level}`);
    }
  }
  // At 0 dB all are as loud as each other, as an ear hears them: a tone's height is what that leaves, then its volume.
  const heardAs = (hz: number, channels: number) => loudnessOf({ samples: toneOf(hz, 2, 48000, 1), sampleRate: 48000 }, channels);
  const over = tones.map(({ who, hz, volume, from, frames }) => {
    const [start, end] = [from / 30 + 0.1, (from + frames) / 30 - 0.1];
    // The tune's two tones, one in each channel, are as loud as it together.
    const own = who === "tune" ? 10 * Math.log10(10 ** (heardAs(700, 1) / 10) + 10 ** (heardAs(1300, 1) / 10)) : heardAs(hz, 2);
    return { who, hz, off: levelOf(sound, hz, start, Math.min(end, start + 1)) - (volume - own) };
  });
  const base = over[0]!.off;
  for (const { who, hz, off } of over) near(off - base, 0, 0.6, `${who}, ${hz} Hz, is off by`);
  assert.equal(over.length, 12);
});

test("a sound keeps its two channels, and a voice, or a sound that has one, is in both", async () => {
  const { compiled, seconds } = await playedScript();
  const file = path.join(scratch, "stereo.m4a");
  await writeMix(heardOf(compiled), seconds, file, -26);
  const [left, right] = [await heard(file, 48000, 0), await heard(file, 48000, 1)];
  // The tune's, in a pause of all else but it.
  near(levelOf(left, 700, 7.2, 7.9), levelOf(right, 1300, 7.2, 7.9), 0.5);
  assert.ok(levelOf(left, 1300, 7.2, 7.9) < levelOf(left, 700, 7.2, 7.9) - 40);
  assert.ok(levelOf(right, 700, 7.2, 7.9) < levelOf(right, 1300, 7.2, 7.9) - 40);
  for (const [hz, from, to] of [[3100, 0.7, 1.3], [15200, 2.65, 3.05], [300, 1.9, 3.1]] as const) near(levelOf(left, hz, from, to), levelOf(right, hz, from, to), 0.2);
});

test("a sound file is of any format, sample rate and number of channels, and one that is none is known before the voices", async () => {
  const measured = async (name: string) => measureSound(path.join(scratch, name));
  const files = [
    await soundFile("a.wav", [toneOf(1000, 0.75)]),
    await soundFile("a.flac", [toneOf(1000, 0.75), toneOf(1000, 0.75)]),
    await soundFile("a-44.wav", [toneOf(1000, 0.75, 44100)], 44100),
    await soundFile("a-8.wav", [toneOf(1000, 0.75, 8000)], 8000),
    await soundFile("a.ogg", [toneOf(1000, 0.75), toneOf(1000, 0.75)]),
    await soundFile("a.mp3", [toneOf(1000, 0.75)]),
  ];
  for (const name of files) {
    near((await measured(name)) as number, 0.75, 0.03, name);
    // Whatever it was, it is the same tone, in both channels.
    const { left, right, sampleRate } = await readSound(path.join(scratch, name));
    assert.equal(sampleRate, 48000);
    near(levelOf({ samples: left, sampleRate }, 1000, 0.1, 0.6), levelOf({ samples: right, sampleRate }, 1000, 0.1, 0.6), 0.05, name);
    assert.ok(levelOf({ samples: left, sampleRate }, 1000, 0.1, 0.6) > levelOf({ samples: left, sampleRate }, 1300, 0.1, 0.6) + 30, name);
  }
  assert.equal(await measured("nowhere.wav"), "missing");
  assert.equal(await measured("."), "missing", "a folder is no file");
  await writeFile(path.join(scratch, "words.wav"), "This is no sound.");
  assert.equal(await measured("words.wav"), "silent");
  await assert.rejects(readSound(path.join(scratch, "words.wav")), /Invalid data/, "in ffmpeg's words");
  await writeFile(path.join(scratch, "empty.wav"), "");
  assert.equal(await measured("empty.wav"), "silent");
  await writeFile(path.join(scratch, "nothing.wav"), encodeWav(new Float32Array(0), 48000));
  assert.equal(await measured("nothing.wav"), "silent");
  // A picture has none.
  assert.equal((await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=16x16:d=0.2", path.join(scratch, "picture.mp4")])).code, 0);
  assert.equal(await measured("picture.mp4"), "silent");
  // One that is silence is a sound, and stays so.
  await soundFile("hush.wav", [new Float32Array(48000)]);
  assert.equal(await measured("hush.wav"), 1);
  const out = path.join(scratch, "hush.m4a");
  assert.deepEqual(await writeMix([{ file: path.join(scratch, "hush.wav"), start: 0, duration: 1, volume: 6, sound: "once" }], 2, out, -14), { gain: 0, lowered: 0, loudness: -Infinity });
});

test("a looped sound goes on over the end of its file, again and again, at every sample rate the frames have", async () => {
  // Half of it a tone and half of it silence: a tone each half a second.
  const file = path.join(scratch, await soundFile("beat.wav", [Float32Array.from([...toneOf(2000, 0.25), ...new Float32Array(12000)])]));
  const out = path.join(scratch, "beat.m4a");
  await writeMix([{ file, start: 0.5, duration: 2.25, volume: 0, sound: "loop" }, { file, start: 3.5, duration: 0.75, volume: 0, sound: "once" }], 4.5, out, -26);
  const sound = await heard(out, 48000);
  const on = Array.from({ length: 18 }, (_, k) => levelOf(sound, 2000, 0.25 * k + 0.05, 0.25 * k + 0.2) > -50);
  // Quarters of a second: from the second on, on and off, to the cut in the eleventh; then once, though its frames are more than its file.
  assert.deepEqual(on.map(Number), [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
});

test("a sound whose file has other bytes makes the sound anew, and draws nothing again: the key of one, and the picture of the other", async () => {
  const { compiled, seconds } = await playedScript();
  const lines = heardOf(compiled);
  const key = () => mixKey(lines, seconds, -26);
  const [before, picture] = [await key(), pictureOf(compiled)];
  assert.equal(await key(), before);
  // As long as it was, and another sound.
  await soundFile("bell.flac", [toneOf(3150, 0.8)]);
  const after = await key();
  assert.notEqual(after, before);
  assert.deepEqual(pictureOf(compiled), picture);
  assert.doesNotMatch(JSON.stringify(picture), /bell|tune|flac/);
  await soundFile("bell.flac", [toneOf(3100, 0.8)]);
  assert.equal(await key(), before, "as it was, it is the same");
  // When, for how long, how loud and whether again and again go into it too; a voice by its file's name.
  const other = async (change: Partial<(typeof lines)[number]>) => assert.notEqual(await mixKey([...lines.slice(0, -1), { ...lines.at(-1)!, ...change }], seconds, -26), before, JSON.stringify(change));
  await other({ start: 0.5 });
  await other({ duration: 0.4 });
  await other({ volume: -1 });
  await other({ sound: lines.at(-1)!.sound === "loop" ? "once" : "loop" });
  assert.notEqual(await mixKey(lines, seconds, -20), before);
  assert.notEqual(await mixKey(lines, seconds + 1, -26), before);
  assert.notEqual(await mixKey([{ ...lines[0]!, file: "another.wav" }, ...lines.slice(1)], seconds, -26), before);
  assert.equal(await mixKey([{ ...lines[0]!, file: path.join("elsewhere", path.basename(lines[0]!.file)) }, ...lines.slice(1)], seconds, -26), before);
});

test("where nobody speaks, the sound is silence as long as the video", async () => {
  const file = path.join(scratch, "silent.m4a");
  await writeSound([], 2, file, -14);
  const [[start, from], [end, to]] = (await silences(file)) as [[string, number], [string, number]];
  assert.deepEqual([start, from, end], ["start", 0, "end"]);
  assert.ok(to >= 2 && to < 2.2, `it lasts ${to} s`);
});
