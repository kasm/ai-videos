// A project's plugin (AGENTS.md, "Plugins"): the one the package.json above a video file names,
// run in a host process of its own (host.ts), and make's calls to it, one at a time. cli.ts runs
// make's stages.
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Described, Job, Reply } from "./host.ts";
import type { EventLimits, Library, Plan } from "./plugin.ts";
import { FORMATS, slug, type FormatName } from "./script.ts";

/** The host runs in the project's folder, not the tool's, so every file is named in full. */
const file = z.string().refine((p) => path.isAbsolute(p), "give an absolute path");

const format = z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]);

const pixels = z.number().int().positive();

/** Step one: the plan, written as the clip's data (its events and texts at its own pace), before anything is drawn. */
const DataCall = z.strictObject({
  step: z.literal("data"),
  /** The video file's name. */
  name: slug,
  /** The format of the plugin's stage. */
  format,
  /** Where to write the clip's data (ai-videos-clip, src/clip.ts). */
  data: file,
});

/** Step two: the clip drawn to the tool's request, and its data again, now with each event's `natural`. */
const DrawCall = z.strictObject({
  step: z.literal("draw"),
  name: slug,
  format,
  /** The size to draw at: the format's. */
  width: pixels,
  height: pixels,
  /** The request to draw to (ai-videos-request, src/fit.ts). */
  request: file,
  /** Where to write the clip. */
  clip: file,
  /** Where to write the clip's data. */
  data: file,
});

/** One of make's calls to the plugin's host. */
export const Call = z.discriminatedUnion("step", [DataCall, DrawCall]);
export type Call = z.infer<typeof Call>;

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
 * The plugin the project of a video names: the nearest package.json above its file, its
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

/** A project's plugin in its own process: what it draws, its part of the prompt, and its calls, one at a time. */
export interface PluginHost extends Described {
  /**
   * Runs one of make's calls on a video's source (its file, parsed, without the tool's keys) and
   * library, its progress logged; throws why it failed. A plan's call gives what the plugin mended
   * in the source, the plan's limits on the fit, and the files it is made from (plugin.ts, inputs).
   */
  run(job: Job & { call: Call }, log: (msg: string) => void): Promise<{ repaired: string[]; limits: Record<string, EventLimits>; inputs: string[] }>;
  /** Mends, checks and plans a video's source, writing nothing: what was mended, and the plan. Throws why it was refused. */
  check(file: string, source: unknown, library: Library | undefined): Promise<{ repaired: string[]; plan: Plan }>;
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
  const { scene, commands } = ready.ready;
  log(`Plugin: ${scene}, ${plugin.file} (its commands: ${Object.keys(commands).join(", ") || "none"})`);
  const shown = (file: string) => path.relative(plugin.dir, file);
  return {
    ...ready.ready,
    async check(file, source, library) {
      const reply = await host.send({ call: { step: "check" }, file, source, ...(library ? { library } : {}) });
      if (!("done" in reply)) throw new Error("error" in reply ? reply.error : "it did not answer");
      return { repaired: reply.done.repaired ?? [], plan: reply.done.plan! };
    },
    async run(job, log) {
      const { call } = job;
      log(`${scene}: ${call.step === "data" ? `the plan of ${call.name}` : `${call.name}, drawn to ${path.basename(call.request)}`} (${call.format})`);
      const reply = await host.send(job);
      if (!("done" in reply)) throw new Error("error" in reply ? reply.error : "it did not answer");
      const { frames, drawn, seconds, repaired = [], limits = {}, inputs = [] } = reply.done;
      if (call.step === "data") log(`  ${shown(call.data)}`);
      else log(`  ${shown(call.clip)}: ${frames} frames (${drawn} ${ready.ready.picture}) in ${seconds?.toFixed(1)} s; and its JSON`);
      return { repaired, limits, inputs };
    },
    close: () => host.close(),
  };
}
