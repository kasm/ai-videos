// The child process a plugin runs in (AGENTS.md, "Plugins"). make.ts forks it with the plugin's
// file and sends it make's calls (make.ts, Call), one at a time, each with the video's source. It
// does for every plugin what is the same in each: has the source checked, writes the plan as the
// clip's data, and draws the clip to the request, a moment at a time, encoded by frames.ts: a
// drawing plugin's SVG turned into pixels by resvg, a recording plugin's PNG as it is.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { z } from "zod";
import type { requestDocument } from "./fit.ts";
import { encoder, moments, writeClipData, type ClipText } from "./frames.ts";
import type { Call } from "./make.ts";
import type { DrawingPlugin, EventLimits as Limits, Library, Plan, Plugin, RecordingPlugin, Schema } from "./plugin.ts";
import { EventLimits, FORMATS, slug } from "./script.ts";

/**
 * A call for the plugin, with the video file and its source (the file, parsed, without the tool's
 * keys), and the project's library, when it has one: one of make's (make.ts), or import's check,
 * which mends, checks and plans the source and writes nothing.
 */
export interface Job {
  call: Call | { step: "check" };
  file: string;
  source: unknown;
  library?: Library;
}

/** What a plugin says of itself when it is ready: its scene, its stage, how it pictures, and its part of the prompt. */
export interface Described {
  scene: string;
  stage: { width: number; height: number };
  /** `drawn` as SVG (its `frame`), or `recorded` by its camera. */
  picture: "drawn" | "recorded";
  guide: string;
  /** Each command's description and example (its schema stays in the plugin's process). */
  commands: Record<string, { description: string; example: unknown }>;
}

/** What a job did: the drawing's frames, what was mended, and for the plan its limits and the files it is made from. */
export interface Done {
  frames?: number;
  drawn?: number;
  seconds?: number;
  repaired?: string[];
  plan?: Plan;
  limits?: Record<string, Limits>;
  inputs?: string[];
}

/** What the host says: once that it is ready (or why not), then once for each job. */
export type Reply = { ready: Described } | { failed: string } | { done: Done } | { error: string };

/** The clip's quality (x264's crf, lower is closer to the pixels): a plugin's picture is a drawing, and its edges stay clean. */
const CRF = 17;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isSchema = (v: unknown): v is Schema => {
  const standard = (v as Partial<Schema> | null)?.["~standard"];
  return typeof standard?.validate === "function" && typeof standard.jsonSchema?.input === "function";
};
const fn = z.custom<never>((v) => typeof v === "function", "give a function");
const pixels = z.number().int().positive();

/** What the tool reads of a plugin's default export (plugin.ts): one that draws (`frame`) or records (`camera`). */
const PluginShape = z
  .object({
    scene: slug,
    stage: z.object({ width: pixels, height: pixels }),
    commands: z.record(
      slug,
      z.object({
        description: z.string().min(1),
        example: z.custom((v) => v !== undefined, "give an example"),
        schema: z.custom<Schema>(isSchema, "give a schema with ~standard.validate and ~standard.jsonSchema (as zod 4's have)"),
      }),
    ),
    guide: z.string().trim().min(1, "give the plugin's part of the prompt (plugin.ts, guide)"),
    check: fn,
    repair: fn.optional(),
    plan: fn,
    inputs: fn.optional(),
    frame: fn.optional(),
    camera: fn.optional(),
  })
  .refine((p) => (p.frame === undefined) !== (p.camera === undefined), {
    message: "give frame (a moment drawn as an SVG) or camera (a moment recorded as a PNG), one of the two",
    path: ["frame"],
  });

/** What a plan's `inputs` may be: paths from the project's folder, each a file or a folder there or above. */
const Inputs = z.array(
  z
    .string()
    .min(1)
    .refine((p) => !path.isAbsolute(p), "a path from the project's folder (the package.json's), not an absolute one"),
);

/**
 * The plan's limits: each names one of the plan's events, a move's `slowest` and `fastest`, a
 * hold's `least`.
 */
function checkLimits(plan: Plan): void {
  for (const [name, limits] of Object.entries(plan.limits ?? {})) {
    const where = `the plan's limits for "${name}"`;
    const event = plan.events.find((e) => e.name === name);
    if (!event) throw new Error(`${where}: no event of the plan has that name (its events: ${plan.events.map((e) => e.name).join(", ")})`);
    const parsed = EventLimits.safeParse(limits);
    if (!parsed.success) throw new Error(`${where} are not valid:\n${z.prettifyError(parsed.error)}`);
    const wrong = Object.keys(parsed.data).filter((key) => (event.span === "hold" ? key !== "least" : key === "least"));
    if (wrong.length) throw new Error(`${where}: it is a ${event.span}, which takes ${event.span === "hold" ? "least" : "slowest and fastest"}, not ${wrong.join(" or ")}`);
  }
}

/** The issues a schema found, a line each, with where. */
const issuesText = (issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }>) =>
  issues
    .map(({ message, path: at }) => {
      const where = (at ?? []).map((p) => String(typeof p === "object" ? p.key : p)).join(".");
      return `  ${where ? `${where}: ` : ""}${message}`;
    })
    .join("\n");

/**
 * Imports the plugin and checks it: its shape, and each command's description, which every use
 * of it trusts. Its example passes its schema, and the schema writes itself as JSON Schema.
 */
export async function loadPlugin(file: string): Promise<Plugin> {
  let module: { default?: unknown };
  try {
    module = await import(pathToFileURL(file).href);
  } catch (e) {
    throw new Error(`the plugin ${file} does not load: ${message(e)}`);
  }
  const shape = PluginShape.safeParse(module.default);
  if (!shape.success) throw new Error(`${file} is not a plugin (its default export; AGENTS.md, "Plugins"):\n${z.prettifyError(shape.error)}`);
  const plugin = module.default as Plugin;
  for (const [name, { example, schema }] of Object.entries(plugin.commands)) {
    const checked = await schema["~standard"].validate(example);
    if (checked.issues) throw new Error(`${file}: the command "${name}" fails its own example:\n${issuesText(checked.issues)}`);
    try {
      schema["~standard"].jsonSchema.input({ target: "draft-2020-12" });
    } catch (e) {
      throw new Error(`${file}: the command "${name}" has a schema that does not write itself as JSON Schema: ${message(e)}`);
    }
  }
  return plugin;
}

/** A format's size, or a call's, has the stage's shape: the picture fills it. */
function fills(plugin: Plugin, format: string, { width, height }: { width: number; height: number }) {
  const stage = plugin.stage;
  if (width * stage.height !== height * stage.width) {
    throw new Error(`the ${plugin.scene} stage is ${stage.width} by ${stage.height}: it does not fill ${format} (${width} by ${height})`);
  }
}

type Request = ReturnType<typeof requestDocument>;

function readRequest(file: string): Request {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no request at ${file}: make writes it (make <file> --fit)`);
  }
  return JSON.parse(text) as Request;
}

/** Whole milliseconds, as a request's times are. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * The plan's texts as the request times them: a time in a beat moves with the beat, in proportion
 * to how far into it it was. An end goes with the beat it ends, a start with the one it begins.
 */
function retime(plan: Plan, request: Request): ClipText[] {
  const at = (t: number, end: boolean) => {
    const i = Math.max(0, plan.events.findLastIndex((e) => (end ? e.at < t : e.at <= t)));
    const from = plan.events[i]!.at;
    const length = (plan.events[i + 1]?.at ?? plan.duration) - from;
    const span = request.spans[i]!;
    return ms(span.at + ((t - from) / length) * span.duration);
  };
  return plan.texts.map((text) => ({ ...text, from: at(text.from, false), to: Math.min(at(text.to, true), request.duration) }));
}

/**
 * Draws the source to the request into `call.clip`, a moment at a time. A frame whose SVG is the one
 * before is not drawn again. Beside the clip's `.frames`, `<clip>.svgs` holds a hash of each frame's
 * SVG, a line a frame: what a web page of the video draws (page.ts) is compared with it.
 */
async function draw(plugin: DrawingPlugin, source: unknown, call: Extract<Call, { step: "draw" }>, request: Request) {
  const size = { width: call.width, height: call.height };
  const out = encoder(call.clip, { ...size, fps: request.fps, crf: CRF });
  let drawn = 0;
  let svg = "";
  let picture: Uint8Array | undefined;
  const svgs: string[] = [];
  let hash = "";
  try {
    for (const moment of moments(request)) {
      const next = plugin.frame(source, moment, size);
      if (next !== svg || !picture) {
        svg = next;
        hash = svgHash(svg);
        // No fonts: a plugin's picture holds no text (the tool draws the captions).
        const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
        if (image.width !== size.width || image.height !== size.height) {
          throw new Error(`a frame came out ${image.width} by ${image.height}, not ${size.width} by ${size.height}`);
        }
        picture = image.pixels;
        drawn++;
      }
      svgs.push(hash);
      // The same buffer again is a hold: the encoder hashes it once.
      await out.frame(picture);
    }
  } catch (e) {
    out.abort();
    throw e;
  }
  const frames = await out.end();
  writeFileSync(`${call.clip}.svgs`, `${svgs.join("\n")}\n`);
  return { frames, drawn };
}

/**
 * Records the source to the request into `call.clip`: the plugin's camera opened, each moment's
 * PNG encoded as it is, and `.frames` the hash of each PNG; the camera closed, whatever happened.
 * A frame whose PNG is the buffer of the one before is a hold, recorded once.
 */
async function record(plugin: RecordingPlugin, source: unknown, call: Extract<Call, { step: "draw" }>, request: Request) {
  const size = { width: call.width, height: call.height };
  const out = encoder(call.clip, { ...size, fps: request.fps, crf: CRF, input: "png" });
  let drawn = 0;
  let last: Uint8Array | undefined;
  try {
    const camera = await plugin.camera(source, request, size);
    try {
      for (const moment of moments(request)) {
        const shot = await camera.shot(moment);
        if (shot !== last) drawn++;
        last = shot;
        await out.frame(shot);
      }
    } finally {
      await camera.close();
    }
  } catch (e) {
    out.abort();
    throw e;
  }
  return { frames: await out.end(), drawn };
}

/** A frame's SVG as `<clip>.svgs` holds it: the md5 of its text, as UTF-8. */
export const svgHash = (svg: string) => createHash("md5").update(svg).digest("hex");

/**
 * One of make's calls: step one writes the plan as the clip's data, and says what the plugin
 * mended in the source, the plan's limits and the files it is made from; step two draws the clip
 * and writes its data again. Each has the source mended, then checked. Import's check gives what
 * was mended and the plan, and writes nothing.
 */
export async function runJob(plugin: Plugin, pluginFile: string, job: Job): Promise<Done> {
  const { call, file } = job;
  if (call.step !== "check") fills(plugin, call.format, call.step === "draw" ? call : FORMATS[call.format]);
  const repaired = plugin.repair?.(job.source, job.library) ?? { source: job.source, did: [] };
  const source = plugin.check(repaired.source, file, job.library);
  const plan = plugin.plan(source);
  checkLimits(plan);
  if (call.step === "check") return { repaired: repaired.did, plan };
  const shown = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");
  const made = { by: `the ${plugin.scene} plugin, ${shown(pluginFile)}`, from: shown(file) };
  if (call.step === "data") {
    const inputs = Inputs.safeParse(plugin.inputs?.(source) ?? []);
    if (!inputs.success) throw new Error(`the files the plan is made from (the plugin's inputs) are not valid:\n${z.prettifyError(inputs.error)}`);
    writeClipData(call.data, { ...made, ...plan });
    return { repaired: repaired.did, limits: plan.limits ?? {}, inputs: inputs.data };
  }
  const request = readRequest(call.request);
  // The tool writes the request from this plan's data, so they differ only when the source changed since.
  const kinds = (list: { name: string; span: string }[]) => list.map((s) => `${s.name} (${s.span})`).join(", ");
  const asked = kinds(request.spans.map((s) => ({ name: s.event, span: s.span })));
  if (asked !== kinds(plan.events)) throw new Error(`the request's spans (${asked}) are not the source's beats (${kinds(plan.events)}): make the video again`);
  const began = performance.now();
  const { frames, drawn } = plugin.camera ? await record(plugin, source, call, request) : await draw(plugin, source, call, request);
  writeClipData(call.data, {
    ...made,
    request: call.request,
    duration: request.duration,
    events: request.spans.map((s) => ({ name: s.event, at: ms(s.at), span: s.span, natural: s.natural })),
    texts: retime(plan, request),
  });
  return { frames, drawn, seconds: (performance.now() - began) / 1000 };
}

// Run as a child (make.ts, startHost): the plugin's file is the argument, the jobs come as messages.
if (import.meta.main) {
  const send = (reply: Reply) => new Promise<void>((resolve) => process.send!(reply, () => resolve()));
  const file = process.argv[2]!;
  // The tool closes the channel when make is done, or stopped.
  process.on("disconnect", () => process.exit());
  try {
    const plugin = await loadPlugin(file);
    let queue = Promise.resolve();
    process.on("message", (job: Job) => {
      queue = queue.then(() =>
        runJob(plugin, file, job).then(
          (done) => send({ done }),
          (e: unknown) => send({ error: message(e) }),
        ),
      );
    });
    const commands = Object.fromEntries(Object.entries(plugin.commands).map(([name, { description, example }]) => [name, { description, example }]));
    await send({ ready: { scene: plugin.scene, stage: plugin.stage, picture: plugin.camera ? "recorded" : "drawn", guide: plugin.guide, commands } });
  } catch (e) {
    await send({ failed: message(e) });
    process.exit(1);
  }
}
