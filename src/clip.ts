// The clip a plugin draws and the JSON beside it (ai-videos-clip): its events and its texts. The
// host writes both (host.ts): the plan as the clip's data, then the clip drawn to the request.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { requestFileOf } from "./fit.ts";
import { run } from "./render.ts";
import { Speaker, type FormatName } from "./script.ts";

const name = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and dashes");
const seconds = z.number().min(0);

export const SPAN_KINDS = ["hold", "move"] as const;

/** The JSON beside a clip: `<clip>.mp4` has `<clip>.json`. */
export const ClipData = z
  .strictObject({
    format: z.literal("ai-videos-clip"),
    version: z.literal(1),
    /** What made the clip, and from what: the plugin, and the video file it drew. */
    made: z.strictObject({ by: z.string().min(1), from: z.string().min(1) }),
    /** The clip's length, seconds. It must match the video file's, to a frame. */
    duration: z.number().positive(),
    /**
     * Named moments, in order, the first at 0. The span from each to the next (from the last, to the
     * clip's end) is a `hold`, where nothing moves, or a `move`. A clip drawn to a request gives each
     * span's `natural` length, its length at the clip's own pace, so fitting it again starts from that.
     */
    events: z.array(z.strictObject({ name, at: seconds, span: z.enum(SPAN_KINDS), natural: z.number().positive().optional() })).min(1),
    /**
     * The texts that go with the clip, each with when it applies (from and to, seconds) and, when
     * one of the clip's characters says it, who: each is a line of the video, said by its speaker.
     */
    texts: z.array(z.strictObject({ text: z.string().min(1), speaker: Speaker.optional(), from: seconds, to: seconds })).default([]),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string, at: (string | number)[]) => ctx.addIssue({ code: "custom", message, path: at });
    if (d.events[0] && d.events[0].at !== 0) issue("the first event is at 0", ["events", 0, "at"]);
    const seen = new Set<string>();
    d.events.forEach((e, i) => {
      if (seen.has(e.name)) issue(`event "${e.name}" is named twice`, ["events", i, "name"]);
      seen.add(e.name);
      const before = d.events[i - 1];
      if (before && e.at <= before.at) issue(`events are in order: "${e.name}" is not after "${before.name}"`, ["events", i, "at"]);
      if (e.at >= d.duration) issue(`"${e.name}" is not before the clip's end (${d.duration} s)`, ["events", i, "at"]);
    });
    d.texts.forEach((t, i) => {
      if (t.from >= t.to) issue("a text's from is before its to", ["texts", i]);
      if (t.to > d.duration) issue(`a text ends after the clip (${d.duration} s)`, ["texts", i, "to"]);
    });
  });
export type ClipJson = z.infer<typeof ClipData>;
export type ClipEvent = ClipJson["events"][number];

/** The JSON that goes with a clip: the same path, with .json for the extension. */
export function dataFileOf(clipFile: string): string {
  const ext = path.extname(clipFile);
  return `${clipFile.slice(0, clipFile.length - ext.length)}.json`;
}

/** A video's clip files in its cache `dir` (AGENTS.md, "The cache"): the clip, its data and its request. */
export function madeFiles(dir: string, name: string, format: FormatName) {
  const clip = path.join(dir, "clips", `${name}-${format}.mp4`);
  return { clip, data: dataFileOf(clip), request: requestFileOf(clip) };
}

/** Reads and validates a clip's JSON. Errors name the file and every reason. */
export async function readClipData(file: string): Promise<ClipJson> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`No clip data at ${file}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} is not JSON: ${err instanceof Error ? err.message : err}`);
  }
  const result = ClipData.safeParse(json);
  if (!result.success) throw new Error(`${file} is not valid clip data:\n${z.prettifyError(result.error)}`);
  return result.data;
}

interface Probe {
  width: number;
  height: number;
  fps: number;
  duration: number;
}

/** The video stream's size, rate and length, from ffprobe. */
async function probe(file: string): Promise<Probe> {
  const args = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,duration", "-of", "json", file];
  const { code, stdout, stderr } = await run("ffprobe", args);
  if (code !== 0) throw new Error(`ffprobe could not read ${file}: ${stderr.trim()}`);
  const stream = (JSON.parse(stdout) as { streams?: Record<string, string | number>[] }).streams?.[0];
  if (!stream) throw new Error(`${file} has no video stream`);
  const [num, den] = String(stream.avg_frame_rate).split("/").map(Number);
  const fps = num && den ? num / den : 0;
  const duration = Number(stream.duration);
  if (!fps || !duration) throw new Error(`ffprobe gives ${file} no frame rate or length`);
  return { width: Number(stream.width), height: Number(stream.height), fps, duration };
}

/** A drawn clip, with its data and its picture's size, rate and length. */
export interface Clip {
  file: string;
  dataFile: string;
  data: ClipJson;
  video: Probe;
}

/** A scene's clip, and what the fit and the timeline read of it: its length and its events. */
export interface SceneClip {
  /** The drawn clip, for the build; none for the timeline of the fit alone. */
  clip?: Clip;
  duration: number;
  events: ClipEvent[];
}

const exists = (file: string) => stat(file).then((s) => s.isFile(), () => false);

/**
 * A drawn clip and its JSON, read and checked: both there, the JSON passes the schema and lasts
 * what the clip does, to a frame (a JSON left from another run does not).
 */
export async function loadClip(file: string): Promise<Clip> {
  if (!(await exists(file))) throw new Error(`No clip at ${file}`);
  const dataFile = dataFileOf(file);
  const data = await readClipData(dataFile);
  const video = await probe(file);
  // ffprobe's length and a frame count can differ by a frame, and the JSON may round.
  if (Math.abs(video.duration - data.duration) > 1 / video.fps + 0.001) {
    throw new Error(`${dataFile} says the clip lasts ${data.duration} s, but ${file} lasts ${video.duration} s: is the JSON from another run?`);
  }
  return { file, dataFile, data, video };
}
