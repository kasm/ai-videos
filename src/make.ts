// `make`'s calls to a project's maker (AGENTS.md, "The maker"): which calls a video needs, the
// command line each becomes, and running one. cli.ts runs make's steps in order.
import { spawn } from "node:child_process";
import path from "node:path";
import { madeFiles } from "./clip.ts";
import { MakerCall, makerArgs } from "./maker.ts";
import { FORMATS, PROJECT_FILE, type FormatName, type LoadedVideo } from "./script.ts";

/** The video's made clips: each clip scene with `make:`, by its id and what the maker draws. */
export function madeScenes(video: LoadedVideo): { id: string; name: string }[] {
  return video.script.scenes.flatMap((s) => (s.scene === "clip" && s.make !== undefined ? [{ id: s.id, name: s.make }] : []));
}

/** The maker of a video with made clips, and the folder it runs in; undefined when it has none. */
export function makerOf(video: LoadedVideo): { maker: string; dir: string } | undefined {
  const [first] = madeScenes(video);
  if (!first) return undefined;
  const scene = `Scene "${first.id}" is made (make: ${first.name})`;
  if (!video.project) throw new Error(`${scene}, but no ${PROJECT_FILE} is beside ${video.dir} to name the maker that draws it`);
  if (!video.project.script.maker) throw new Error(`${scene}, but ${video.project.file} names no maker`);
  return { maker: video.project.script.maker, dir: video.project.dir };
}

/** The maker's calls for step one (the data) or two (the drawing): every made scene, in each format asked. */
export function makerCalls(video: LoadedVideo, formats: FormatName[], step: MakerCall["step"]): { scene: string; call: MakerCall }[] {
  const dir = path.resolve(video.dir);
  return madeScenes(video).flatMap(({ id, name }) =>
    formats.map((format) => {
      const files = madeFiles(dir, id, format);
      const call =
        step === "data"
          ? { step, name, format, data: files.data }
          : { step, name, format, ...FORMATS[format], request: files.request, clip: files.clip, data: files.data };
      // Checked as the maker will check it, so the tool never sends a call its own schema refuses.
      return { scene: id, call: MakerCall.parse(call) };
    }),
  );
}

/** An argument cmd.exe and sh both read as it is: a name, a flag, a path without spaces. */
const PLAIN = /^[\w./\\:=,@+-]+$/;

/** The line the shell runs: the project's maker, then the call, each argument quoted where it needs it. */
export function commandLine(maker: string, call: MakerCall): string {
  const quote = (arg: string) => {
    if (PLAIN.test(arg)) return arg;
    // Inside double quotes cmd.exe still expands %VAR% and sh $VAR and `...`.
    if (/["%$`]/.test(arg)) throw new Error(`${arg} can't go on a command line: it holds a quote, % or $`);
    return `"${arg}"`;
  };
  return [maker, ...makerArgs(call).map(quote)].join(" ");
}

/**
 * Runs a command line through the shell in `dir`, its output shown as it comes, and resolves to its
 * exit code. Through the shell, as a maker is written in the project file (Windows finds npm.cmd).
 */
export function runShell(line: string, dir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(line, { cwd: dir, shell: true, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}
