// Runs the HyperFrames CLI and the ffmpeg loudness passes.
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loudnessOf } from "./loudness.ts";
import type { Voice } from "./mouth.ts";
import { foldProgress, type Sink } from "./progress.ts";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(cmd: string, args: string[], opts: { cwd?: string; inherit?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Runs a command, its stderr through `foldProgress` (progress.ts), and gives its exit code. In place,
 * on the terminal itself, its stdout goes there straight: HyperFrames colours only a terminal's.
 * Anywhere else it goes through the fold too, so that a count held back comes before it.
 */
export function runFolded(
  cmd: string,
  args: string[],
  opts: { cwd?: string; out?: Sink; err?: Sink; inPlace?: boolean } = {},
): Promise<number> {
  const { out = process.stdout, err = process.stderr, inPlace = process.stderr.isTTY === true } = opts;
  const straight = inPlace && out === process.stdout;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["inherit", straight ? "inherit" : "pipe", "pipe"],
      windowsHide: true,
    });
    const fold = foldProgress({ out, err, inPlace });
    child.stdout?.setEncoding("utf8").on("data", (d: string) => fold.stdout(d));
    child.stderr?.setEncoding("utf8").on("data", (d: string) => fold.stderr(d));
    child.on("error", reject);
    child.on("close", (code) => {
      fold.end();
      resolve(code ?? 1);
    });
  });
}

/** The HyperFrames CLI the tool pins, run with this Node (never npx, which could fetch another). */
export const hyperframesBin = (root: string) => path.join(root, "node_modules", "hyperframes", "bin", "hyperframes.mjs");

/**
 * Runs a HyperFrames CLI command inside a generated project, streaming its output. With `fold`, the
 * check's progress comes a line per phase (progress.ts).
 */
export async function hyperframes(root: string, project: string, args: string[], opts: { fold?: boolean } = {}): Promise<number> {
  const command = [hyperframesBin(root), ...args];
  if (opts.fold) return runFolded(process.execPath, command, { cwd: project });
  const { code } = await run(process.execPath, command, { cwd: project, inherit: true });
  return code;
}

export async function renderProject(
  root: string,
  project: string,
  output: string,
  opts: { fps: number; draft: boolean },
): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const code = await hyperframes(root, project, [
    "render",
    "--output", output,
    "--fps", String(opts.fps),
    "--quality", opts.draft ? "draft" : "high",
    "--strict",
    "--quiet",
  ]);
  if (code !== 0) throw new Error(`HyperFrames render failed (exit ${code})`);
}

/**
 * The filters that bring `input`'s sound to `loudness` LUFS, its peaks kept 1.5 dB below full
 * scale: `before`, which the sound goes through first, then loudnorm. The first of two passes
 * measures it, so the second applies one gain to the whole. Silence has no level to bring anywhere:
 * it goes through `before` alone.
 */
async function loudnessFilter(input: string, loudness: number, before: string): Promise<string> {
  const target = `I=${loudness}:TP=-1.5:LRA=11`;
  const measure = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", input,
    "-af", `${before},loudnorm=${target}:print_format=json`,
    "-vn", "-f", "null", "-",
  ]);
  const json = measure.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0];
  if (measure.code !== 0 || !json) throw new Error(`ffmpeg loudness measurement failed:\n${measure.stderr.slice(-600)}`);
  const m = JSON.parse(json) as Record<string, string>;
  if (m.input_i === "-inf") return before;
  return (
    `${before},loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
  );
}

/** How a finished file's sound is encoded: AAC at 48 kHz, which every player and browser plays. */
const AAC = ["-ar", "48000", "-c:a", "aac", "-b:a", "192k"];

/**
 * A mono sound file brought to `loudness` LUFS in two passes, its peaks kept 1.5 dB below full
 * scale, into `output`, an .m4a: stereo, the sound in both channels whole.
 */
export async function levelSound(input: string, output: string, loudness: number): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const filter = await loudnessFilter(input, loudness, "pan=stereo|c0=c0|c1=c0");
  const encode = await run("ffmpeg", ["-hide_banner", "-nostats", "-y", "-i", input, "-vn", "-af", filter, ...AAC, "-map_metadata", "-1", "-movflags", "+faststart", output]);
  if (encode.code !== 0) throw new Error(`ffmpeg loudness pass failed:\n${encode.stderr.slice(-600)}`);
}

/** The most a sound's peaks may be, dB over full scale. */
const PEAK = -1.5;
/** How near its loudness a mix is brought, LU, and in how many rounds at most. */
const NEAR = 0.02;
const ROUNDS = 20;

/** How a mix came to its loudness: the gain, dB, what its highest peak was lowered by, dB, and the loudness it came to, LUFS. */
export interface Levelled {
  gain: number;
  lowered: number;
  loudness: number;
}

/**
 * A mix, mono and however high its peaks, brought to `loudness` LUFS by one gain for the whole, its
 * peaks kept 1.5 dB below full scale by a limiter, into `output`, an .m4a: stereo, the sound in both
 * channels whole. So what is quieter in it stays as much quieter, but for what the limiter takes of the
 * louder; it lets go soon, so it takes a peak and little else. What it takes of the whole, the gain makes
 * up for: it is found in rounds. Silence has no level to bring anywhere.
 */
export async function levelMix({ samples, sampleRate }: Voice, output: string, loudness: number): Promise<Levelled> {
  await mkdir(path.dirname(output), { recursive: true });
  const [mixed, levelled] = [`${output}.mix.f32`, `${output}.levelled.f32`];
  const raw = (file: string, rate: number) => ["-f", "f32le", "-ar", String(rate), "-ac", "1", "-i", file];
  const ffmpeg = async (args: string[]) => {
    const { code, stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-y", ...args]);
    if (code !== 0) throw new Error(`ffmpeg could not level the mix:\n${stderr.slice(-600)}`);
    return stderr;
  };
  /** The mix by a gain, limited, at 48 kHz: the limiter sees the peaks between the samples too. */
  const limited = async (gain: number): Promise<Float32Array> => {
    const limiter = `aresample=192000,alimiter=level=false:limit=${PEAK}dB:attack=1:release=10:latency=true,aresample=48000`;
    await ffmpeg([...raw(mixed, sampleRate), "-af", `volume=${gain.toFixed(4)}dB:precision=double,${limiter}`, "-f", "f32le", levelled]);
    const bytes = await readFile(levelled);
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  };
  try {
    await writeFile(mixed, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
    const measured = await ffmpeg([...raw(mixed, sampleRate), "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
    const highest = Number(measured.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1] ?? -Infinity);
    const own = loudnessOf({ samples, sampleRate }, 2);
    let gain = Number.isFinite(own) ? loudness - own : 0;
    let at = -Infinity;
    for (let round = 1; ; round++) {
      at = loudnessOf({ samples: await limited(gain), sampleRate: 48000 }, 2);
      // The limiter takes a part of each dB more, so it comes nearer round by round.
      if (!Number.isFinite(at) || Math.abs(loudness - at) <= NEAR || round === ROUNDS) break;
      gain += loudness - at;
    }
    await ffmpeg([...raw(levelled, 48000), "-af", "pan=stereo|c0=c0|c1=c0", ...AAC, "-map_metadata", "-1", "-movflags", "+faststart", output]);
    return { gain, lowered: Math.max(0, highest + gain - PEAK), loudness: at };
  } finally {
    await Promise.all([mixed, levelled].map((file) => rm(file, { force: true })));
  }
}

/** The picture of `video` with the sound of `sound`, both copied as they are, into `output`. */
export async function muxSound(video: string, sound: string, output: string): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const mux = await run("ffmpeg", ["-hide_banner", "-nostats", "-y", "-i", video, "-i", sound, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart", output]);
  if (mux.code !== 0) throw new Error(`ffmpeg could not put the sound with the picture:\n${mux.stderr.slice(-600)}`);
}
