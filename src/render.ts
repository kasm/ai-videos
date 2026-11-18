// Runs the HyperFrames CLI and the ffmpeg loudness pass.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(cmd: string, args: string[], opts: { cwd?: string; inherit?: boolean } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
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

/** Runs a HyperFrames CLI command inside a generated project, streaming its output. */
export async function hyperframes(root: string, project: string, args: string[]): Promise<number> {
  const bin = path.join(root, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
  const { code } = await run(process.execPath, [bin, ...args], { cwd: project, inherit: true });
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

const TARGET = "I=-14:TP=-1.5:LRA=11";

/**
 * Two-pass loudness normalization to -14 LUFS (the level YouTube and most platforms play at).
 * Video is copied untouched; only the audio is re-encoded.
 */
export async function normalizeLoudness(input: string, output: string): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  const measure = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", input,
    "-af", `loudnorm=${TARGET}:print_format=json`,
    "-vn", "-f", "null", "-",
  ]);
  const json = measure.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0];
  if (measure.code !== 0 || !json) throw new Error(`ffmpeg loudness measurement failed:\n${measure.stderr.slice(-600)}`);
  const m = JSON.parse(json) as Record<string, string>;
  const filter =
    `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const encode = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-y", "-i", input,
    "-c:v", "copy",
    "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ]);
  if (encode.code !== 0) throw new Error(`ffmpeg loudness pass failed:\n${encode.stderr.slice(-600)}`);
}
