// Loads and validates a video script (videos/<slug>/video.yaml).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const slug = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and dashes");

const fraction = z.number().min(0).max(1);

export const MARK_KINDS = ["circle", "underline", "arrow", "box", "check"] as const;
export const ARROW_FROM = ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"] as const;

/** A hand-drawn mark the scene draws over the page while a line is spoken. */
const Mark = z
  .strictObject({
    /** What to draw. An underline runs along the bottom edge of the area. */
    mark: z.enum(MARK_KINDS),
    /** The data-mark name of the page element to draw on. */
    on: z.string().min(1),
    /** Part of that element, as fractions of its box: [left, top, right, bottom]. Default: all of it. */
    area: z.tuple([fraction, fraction, fraction, fraction]).optional(),
    /** When to start: a word or phrase of the line (drawn as it is said), or seconds after the line starts. */
    at: z.union([z.string().min(1), z.number().min(0)]).optional(),
    /** Arrows only: the side the arrow comes from. Default: left. */
    from: z.enum(ARROW_FROM).optional(),
  })
  .refine((m) => !m.area || (m.area[0] < m.area[2] && m.area[1] < m.area[3]), {
    message: "area is [left, top, right, bottom] with left < right and top < bottom",
  });
export type MarkScript = z.infer<typeof Mark>;

const Line = z.strictObject({
  /** What the voice says. Keep to one or two sentences. */
  text: z.string().min(1),
  /** Where the page should be: "top", "bottom", or the data-cue name of an element. Omit to stay put. */
  cue: z.string().optional(),
  /** Marks drawn while this line is said. They stay until a later line moves the page or draws again. */
  draw: z.array(Mark).optional(),
  /** Extra silence before this line, seconds. The scroll to its cue happens in it, so the page is there first. */
  pause: z.number().min(0).max(5).default(0),
  /** Per-line voice override. */
  voice: z.string().optional(),
});

const PageScrollScene = z.strictObject({
  id: slug,
  scene: z.literal("page-scroll"),
  /** HTML fragment for the page body, relative to the video folder. */
  page: z.string(),
  /** Stylesheet for the page, relative to the video folder. Rules must start with `.page`. */
  css: z.string().optional(),
  /** Text shown in the address bar. */
  url: z.string().default("localhost"),
  narration: z.array(Line).min(1),
});

const Timing = z.strictObject({
  /** Silence before the first line of a scene, seconds. */
  lead: z.number().min(0).default(0.6),
  /** Pause between lines, seconds. */
  gap: z.number().min(0).default(0.4),
  /** Hold after the last line of a scene, seconds. */
  tail: z.number().min(0).default(1.0),
});

export const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;
export type FormatName = keyof typeof FORMATS;

const Video = z.strictObject({
  title: z.string().min(1),
  voice: z.string().default("af_heart"),
  speed: z.number().min(0.5).max(2).default(1),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  formats: z.array(z.enum(["landscape", "portrait"])).min(1).default(["landscape", "portrait"]),
  timing: Timing.prefault({}),
  scenes: z.array(PageScrollScene).min(1),
});

export type VideoScript = z.infer<typeof Video>;
export type SceneScript = VideoScript["scenes"][number];

export interface LoadedVideo {
  slug: string;
  dir: string;
  script: VideoScript;
}

export async function loadVideo(root: string, videoSlug: string): Promise<LoadedVideo> {
  const dir = path.join(root, "videos", videoSlug);
  const file = path.join(dir, "video.yaml");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`No script found at ${file}`);
  }
  const result = Video.safeParse(parse(raw));
  if (!result.success) {
    throw new Error(`${file} is not a valid video script:\n${z.prettifyError(result.error)}`);
  }
  const ids = result.data.scenes.map((s) => s.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`${file}: scene id "${dup}" is used twice`);
  if (ids.includes("main") || ids.includes("root")) {
    throw new Error(`${file}: scene ids "main" and "root" are reserved`);
  }
  return { slug: videoSlug, dir, script: result.data };
}
