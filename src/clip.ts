// A clip scene's video files and the JSON beside each: what made the clip, its events and its texts.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { run } from "./render.ts";
import type { FormatName, LoadedVideo } from "./script.ts";

const name = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and dashes");
const seconds = z.number().min(0);

export const SPAN_KINDS = ["hold", "move"] as const;

/** The JSON beside a clip: `<clip>.mp4` has `<clip>.json`. Written by whatever made the clip. */
export const ClipData = z
  .strictObject({
    format: z.literal("ai-videos-clip"),
    version: z.literal(1),
    /** What made the clip, and from what: a tool or script, and the file or project it drew. */
    made: z.strictObject({ by: z.string().min(1), from: z.string().min(1) }),
    /** The clip's length, seconds. It must match the video file's, to a frame. */
    duration: z.number().positive(),
    /**
     * Named moments, in order, the first at 0. The span from each to the next (from the last, to the
     * clip's end) is a `hold`, where nothing moves, or a `move`. A clip drawn to a request gives each
     * span's `natural` length, its length at the clip's own pace, so fitting it again starts from that.
     */
    events: z.array(z.strictObject({ name, at: seconds, span: z.enum(SPAN_KINDS), natural: z.number().positive().optional() })).min(1),
    /** The texts that go with the clip, each with when it applies: from and to, seconds. */
    texts: z.array(z.strictObject({ text: z.string().min(1), from: seconds, to: seconds })).default([]),
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

/** One video file of a clip scene, with its data. */
export interface Clip {
  file: string;
  dataFile: string;
  data: ClipJson;
  /** The file's picture, when it was read: `request` needs only the JSON, as the clip may not be drawn yet. */
  video?: Probe;
}

/** A clip scene's clips, one per format, and what they agree on: their length and their events. */
export interface SceneClips {
  byFormat: Partial<Record<FormatName, Clip>>;
  duration: number;
  events: ClipEvent[];
}

const exists = (file: string) => stat(file).then((s) => s.isFile(), () => false);

async function loadClip(sceneId: string, dir: string, rel: string, readVideo: boolean): Promise<Clip> {
  const file = path.resolve(dir, rel);
  if (readVideo && !(await exists(file))) throw new Error(`Scene "${sceneId}": clip ${rel} is not at ${file}`);
  const dataFile = dataFileOf(file);
  if (!(await exists(dataFile))) {
    throw new Error(
      `Scene "${sceneId}": clip ${rel} has no JSON beside it (${dataFile}). ` +
        `The JSON says what made the clip, its events and its texts; see "Clips" in the tool's AGENTS.md.`,
    );
  }
  const data = await readClipData(dataFile);
  if (!readVideo) return { file, dataFile, data };
  const video = await probe(file);
  // ffprobe's length and a frame count can differ by a frame, and the JSON may round.
  if (Math.abs(video.duration - data.duration) > 1 / video.fps + 0.001) {
    throw new Error(`${dataFile} says the clip lasts ${data.duration} s, but ${file} lasts ${video.duration} s: is the JSON from another run?`);
  }
  return { file, dataFile, data, video };
}

/** The formats' clips must agree on length and events (names, kinds, times and natural lengths within half a frame). */
function agree(sceneId: string, a: Clip, b: Clip, fps: number): void {
  const slack = 0.5 / fps;
  const where = `Scene "${sceneId}": ${path.basename(a.dataFile)} and ${path.basename(b.dataFile)}`;
  if (Math.abs(a.data.duration - b.data.duration) > slack) {
    throw new Error(`${where} differ in length (${a.data.duration} s, ${b.data.duration} s); the formats share one timeline`);
  }
  const names = (c: Clip) => c.data.events.map((e) => `${e.name} (${e.span})`).join(", ");
  if (names(a) !== names(b)) throw new Error(`${where} differ in events:
  ${names(a)}
  ${names(b)}`);
  a.data.events.forEach((e, i) => {
    const other = b.data.events[i]!;
    if (Math.abs(e.at - other.at) > slack) throw new Error(`${where} put "${e.name}" at ${e.at} s and ${other.at} s`);
    if (Math.abs((e.natural ?? 0) - (other.natural ?? 0)) > slack) {
      throw new Error(`${where} give "${e.name}" natural lengths ${e.natural ?? "(none)"} and ${other.natural ?? "(none)"}`);
    }
  });
}

/**
 * Every clip scene's clips, read and checked before any narration is made: each clip and its JSON
 * exist, the JSON passes the schema and matches the clip's length, the formats' clips agree, and
 * every narration cue names one of the events, never one before an earlier line's (a clip plays
 * forward), and every limit names an event of its kind (`least` a hold, `slowest` and `fastest` a
 * move). With `readVideo: false` only the JSON is read: the clips may not be drawn yet.
 */
export async function loadClips(
  video: LoadedVideo,
  formats: FormatName[],
  { readVideo = true }: { readVideo?: boolean } = {},
): Promise<Map<string, SceneClips>> {
  const clips = new Map<string, SceneClips>();
  let n = 0;
  for (const scene of video.script.scenes) {
    if (scene.scene !== "clip") {
      n += scene.narration.length;
      continue;
    }
    const byFormat: Partial<Record<FormatName, Clip>> = {};
    const loaded = new Map<string, Clip>();
    for (const format of formats) {
      const rel = typeof scene.clip === "string" ? scene.clip : scene.clip[format];
      if (!rel) throw new Error(`Scene "${scene.id}" has no clip for ${format}`);
      const clip = loaded.get(rel) ?? (await loadClip(scene.id, video.dir, rel, readVideo));
      loaded.set(rel, clip);
      byFormat[format] = clip;
    }
    const [first, ...rest] = [...loaded.values()];
    for (const other of rest) agree(scene.id, first!, other, video.script.fps);
    const events = first!.data.events;
    let reached: ClipEvent = events[0]!;
    for (const line of scene.narration) {
      n++;
      if (!line.cue) continue;
      const event = events.find((e) => e.name === line.cue);
      if (!event) {
        throw new Error(
          `Scene "${scene.id}", line ${n}: cue "${line.cue}" is not an event of ${path.basename(first!.dataFile)} ` +
            `(its events: ${events.map((e) => e.name).join(", ")})`,
        );
      }
      if (event.at < reached.at) {
        throw new Error(`Scene "${scene.id}", line ${n}: cue "${event.name}" comes before "${reached.name}", cued earlier; a clip plays forward`);
      }
      reached = event;
    }
    for (const [name, limits] of Object.entries(scene.limits)) {
      const event = events.find((e) => e.name === name);
      const where = `Scene "${scene.id}", limits: "${name}"`;
      if (!event) throw new Error(`${where} is not an event of ${path.basename(first!.dataFile)} (its events: ${events.map((e) => e.name).join(", ")})`);
      const wrong = Object.keys(limits).filter((key) => (event.span === "hold" ? key !== "least" : key === "least"));
      if (wrong.length) throw new Error(`${where} is a ${event.span}: it takes ${event.span === "hold" ? "least" : "slowest and fastest"}, not ${wrong.join(" or ")}`);
    }
    clips.set(scene.id, { byFormat, duration: first!.data.duration, events });
  }
  return clips;
}
