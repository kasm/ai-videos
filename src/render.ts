// Runs the HyperFrames CLI and the ffmpeg loudness pass.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
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
 * The loudnorm filter that brings `input`'s sound to `loudness` LUFS, its peaks kept 1.5 dB below
 * full scale: the first of two passes measures it, so the second applies one gain to the whole.
 * `before` is a filter the sound goes through first, in both passes.
 */
async function loudnessFilter(input: string, loudness: number, before = ""): Promise<string> {
  const target = `I=${loudness}:TP=-1.5:LRA=11`;
  const measure = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", input,
    "-af", `${before}loudnorm=${target}:print_format=json`,
    "-vn", "-f", "null", "-",
  ]);
  const json = measure.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0];
  if (measure.code !== 0 || !json) throw new Error(`ffmpeg loudness measurement failed:\n${measure.stderr.slice(-600)}`);
  const m = JSON.parse(json) as Record<string, string>;
  return (
    `${before}loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
  );
}

/** How a finished file's sound is encoded: AAC at 48 kHz, which every player and browser plays. */
const AAC = ["-ar", "48000", "-c:a", "aac", "-b:a", "192k"];

/**
 * Two-pass loudness normalization to `loudness` LUFS, the script's (-14 by default, the level
 * YouTube and most platforms play at), its peaks kept 1.5 dB below full scale.
 * Video is copied untouched; only the audio is re-encoded.
 */
export async function normalizeLoudness(input: string, output: string, loudness = -14): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const filter = await loudnessFilter(input, loudness);
  const encode = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-y", "-i", input,
    "-c:v", "copy",
    "-af", filter, ...AAC,
    "-movflags", "+faststart",
    output,
  ]);
  if (encode.code !== 0) throw new Error(`ffmpeg loudness pass failed:\n${encode.stderr.slice(-600)}`);
}

/**
 * A mono sound file brought to `loudness` LUFS as `normalizeLoudness` does, into `output`, an .m4a.
 * It is measured and written as a render's track is: stereo, the sound in both channels whole.
 */
export async function levelSound(input: string, output: string, loudness: number): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const filter = await loudnessFilter(input, loudness, "pan=stereo|c0=c0|c1=c0,");
  const encode = await run("ffmpeg", ["-hide_banner", "-nostats", "-y", "-i", input, "-vn", "-af", filter, ...AAC, "-map_metadata", "-1", "-movflags", "+faststart", output]);
  if (encode.code !== 0) throw new Error(`ffmpeg loudness pass failed:\n${encode.stderr.slice(-600)}`);
}

/** The picture of `video` with the sound of `sound`, both copied as they are, into `output`. */
export async function muxSound(video: string, sound: string, output: string): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const mux = await run("ffmpeg", ["-hide_banner", "-nostats", "-y", "-i", video, "-i", sound, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart", output]);
  if (mux.code !== 0) throw new Error(`ffmpeg could not put the sound with the picture:\n${mux.stderr.slice(-600)}`);
}
