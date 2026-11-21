// `make`'s calls to what draws a project's clips: its plugin (AGENTS.md, "Plugins"), or its maker
// (AGENTS.md, "The maker"). Which calls a video folder needs, and running one: a plugin's in its
// host process (host.ts), a maker's as a command line. cli.ts runs make's steps in order.
import { fork, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { madeFiles } from "./clip.ts";
import type { Job, Reply } from "./host.ts";
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

/**
 * A project's plugin: its file, and the package.json that names it, in the project's folder. Its
 * `"ai-videos"` is the project's settings too (video-file.ts), the plugin's path among them.
 */
export interface PluginFile {
  file: string;
  dir: string;
  package: string;
  settings: Record<string, unknown>;
}

/**
 * The plugin the project of a video names: the nearest package.json above its file or folder, its
 * `"ai-videos": { "plugin": <a path from there> }`. Undefined when that package.json names none,
 * or there is no package.json above it.
 */
export async function pluginOf(video: string): Promise<PluginFile | undefined> {
  for (let dir = path.dirname(path.resolve(video)); ; dir = path.dirname(dir)) {
    const file = path.join(dir, "package.json");
    let text: string | undefined;
    try {
      text = await readFile(file, "utf8");
    } catch (e) {
      if ((e as { code?: string }).code !== "ENOENT") throw e;
    }
    if (text !== undefined) {
      let pkg: { "ai-videos"?: Record<string, unknown> };
      try {
        pkg = JSON.parse(text);
      } catch (e) {
        throw new Error(`${file} is not JSON: ${(e as Error).message}`);
      }
      const settings = pkg["ai-videos"];
      if (settings === undefined) return undefined;
      const named = settings?.plugin;
      if (typeof named !== "string" || named === "") throw new Error(`${file}: "ai-videos": { "plugin" } is the plugin's file, a path from that folder`);
      const plugin = path.resolve(dir, named);
      if (!existsSync(plugin)) throw new Error(`${file} names the plugin ${named}, and there is no ${plugin}`);
      return { file: plugin, dir, package: file, settings };
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** What draws a video folder's made clips: its project's maker, one call at a time. */
export interface Drawer {
  /** Runs one call, its progress logged: undefined when it is done, else why it failed, as the end of a sentence. */
  run(call: MakerCall, log: (msg: string) => void): Promise<string | undefined>;
}

/** The maker of a project file, run through the shell in the project file's folder. */
export function makerDrawer({ maker, dir }: { maker: string; dir: string }): Drawer {
  return {
    async run(call, log) {
      const line = commandLine(maker, call);
      log(`${line}
  (in ${dir})`);
      const code = await runShell(line, dir);
      return code === 0 ? undefined : ` with exit code ${code}; it says why above.`;
    },
  };
}

/** The host process, run by this file's own Node. */
const HOST = path.join(import.meta.dirname, "host.ts");

/** The plugin's host, started in the project's folder: each reply is waited for, one at a time. */
function startHost(plugin: PluginFile) {
  // No execArgv: what this process was started with (a test runner's flags) is not the host's.
  const child = fork(HOST, [plugin.file], { cwd: plugin.dir, execArgv: [], stdio: ["ignore", "inherit", "inherit", "ipc"] });
  let waiting: ((reply: Reply) => void) | undefined;
  let gone: string | undefined;
  const end = (why: string) => {
    gone ??= why;
    waiting?.({ error: gone });
  };
  child.on("message", (reply: Reply) => waiting?.(reply));
  child.on("error", (e) => end(`its process failed: ${e.message}`));
  child.on("exit", (code) => end(`its process ended with exit code ${code}`));
  const next = () => new Promise<Reply>((resolve) => (gone ? resolve({ error: gone }) : (waiting = resolve)));
  return {
    ready: next(),
    send(job: Job): Promise<Reply> {
      if (gone) return Promise.resolve({ error: gone });
      const reply = next();
      child.send(job);
      return reply;
    },
    close() {
      if (child.connected) child.disconnect();
    },
  };
}

/** A project's plugin in its own process: what it draws, and its calls, one at a time. */
export interface PluginHost {
  scene: string;
  stage: { width: number; height: number };
  /**
   * Runs one call on a video's source (its file, parsed, without the tool's keys) and library, its
   * progress logged; throws why it failed. A plan's call gives what the plugin mended in the source.
   */
  run(job: Job, log: (msg: string) => void): Promise<{ repaired: string[] }>;
  /** Ends its process. */
  close(): void;
}

/** Starts the project's plugin in a process of its own, and waits until it is ready: throws why not. */
export async function startPlugin(plugin: PluginFile, log: (msg: string) => void): Promise<PluginHost> {
  const host = startHost(plugin);
  const ready = await host.ready;
  if (!("ready" in ready)) {
    host.close();
    throw new Error(`the plugin did not start: ${"failed" in ready ? ready.failed : "error" in ready ? ready.error : "it said something else"}`);
  }
  const { scene, stage, commands } = ready.ready;
  log(`Plugin: ${scene}, ${plugin.file} (its commands: ${commands.join(", ") || "none"})`);
  const shown = (file: string) => path.relative(plugin.dir, file);
  return {
    scene,
    stage,
    async run(job, log) {
      const { call } = job;
      log(`${scene}: ${call.step === "data" ? `the plan of ${call.name}` : `${call.name}, drawn to ${path.basename(call.request)}`} (${call.format})`);
      const reply = await host.send(job);
      if (!("done" in reply)) throw new Error("error" in reply ? reply.error : "it did not answer");
      const { frames, drawn, seconds, repaired = [] } = reply.done;
      if (call.step === "data") log(`  ${shown(call.data)}`);
      else log(`  ${shown(call.clip)}: ${frames} frames (${drawn} drawn) in ${seconds?.toFixed(1)} s; and its JSON`);
      return { repaired };
    },
    close: () => host.close(),
  };
}

/**
 * What draws a video folder's made clips: its project's maker. Undefined when it has none. A
 * project whose package.json names a plugin has its videos as files (video-file.ts), not folders.
 */
export async function drawerOf(video: LoadedVideo): Promise<Drawer | undefined> {
  if (madeScenes(video).length === 0) return undefined;
  const plugin = await pluginOf(video.dir);
  if (plugin) throw new Error(`${plugin.package} names a plugin: its videos are files, each made with make <its folder>/<name>.yaml, not folders`);
  return makerDrawer(makerOf(video)!);
}
