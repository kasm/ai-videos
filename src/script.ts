// Loads and validates a video script (<video folder>/video.yaml) and the project file beside its folder.
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

const ClipLine = z.strictObject({
  /** What the voice says. Keep to one or two sentences. */
  text: z.string().min(1),
  /** The name of an event in the clip's JSON: the line waits for the clip to reach it. Omit to follow on. */
  cue: z.string().optional(),
  /** Extra silence before this line, seconds. */
  pause: z.number().min(0).max(5).default(0),
  /** Per-line voice override. */
  voice: z.string().optional(),
});

const clipFile = z.string().min(1);

/** Limits for one event's span, over the video's `timing.moves` (see "Fitting a clip to the voice"). */
const EventLimits = z.strictObject({
  /** A move: the slowest it may play, as a multiple of its own speed. */
  slowest: z.number().positive().max(1).optional(),
  /** A move: the fastest it may play, as a multiple of its own speed. */
  fastest: z.number().min(1).max(10).optional(),
  /** A hold: the shortest it may shrink to, seconds (else a frame). */
  least: z.number().min(0).optional(),
});
export type EventLimitsScript = z.infer<typeof EventLimits>;

/** What a project's maker draws, in its own words (a RayCraft tutorial's name). It goes on a command line. */
export const MakerName = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and dashes: it goes on a command line");

const ClipScene = z
  .strictObject({
    id: slug,
    scene: z.literal("clip"),
    /**
     * A clip drawn elsewhere: the video file to play, relative to the video folder, one for every
     * format or one per format. Beside each lies its JSON (the same name, ending in .json).
     */
    clip: z
      .union([
        clipFile,
        z
          .strictObject({ landscape: clipFile.optional(), portrait: clipFile.optional() })
          .refine((c) => c.landscape || c.portrait, { message: "name a clip for landscape, portrait or both" }),
      ])
      .optional(),
    /**
     * A made clip: what the project's maker draws. `make` calls the maker, and the clip's files are
     * the folder's clips/<id>-<format>.* (madeFiles, src/clip.ts).
     */
    make: MakerName.optional(),
    /** Limits for single events of the clip, by name: one move faster than the rest, a hold kept longer. */
    limits: z.record(z.string(), EventLimits).default({}),
    narration: z.array(ClipLine).min(1),
  })
  .refine((s) => (s.clip === undefined) !== (s.make === undefined), {
    message: "a clip scene gives clip: (a clip drawn elsewhere) or make: (one the project's maker draws), one of the two",
  });
export type ClipSceneScript = z.infer<typeof ClipScene>;

const Timing = z.strictObject({
  /** Silence before the first line of a scene, seconds. */
  lead: z.number().min(0).default(0.6),
  /** Pause between lines, seconds. */
  gap: z.number().min(0).default(0.4),
  /** Hold after the last line of a scene, seconds. */
  tail: z.number().min(0).default(1.0),
  /** How slow and how fast a clip's move may play when the clip is fitted to the voice, as multiples of its own speed. */
  moves: z
    .strictObject({
      slowest: z.number().positive().max(1).default(0.5),
      fastest: z.number().min(1).max(10).default(2),
    })
    .prefault({}),
});

export const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;
export type FormatName = keyof typeof FORMATS;

/**
 * The settings a video.yaml shares with its project file (AGENTS.md, "Projects"): set in either,
 * the video.yaml's win; set in neither, these defaults.
 */
const settings = {
  voice: z.string().default("af_heart"),
  speed: z.number().min(0.5).max(2).default(1),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  formats: z.array(z.enum(["landscape", "portrait"])).min(1).default(["landscape", "portrait"]),
  /** How loud the finished soundtrack is, in LUFS: -14 is what YouTube and most platforms play at; lower is quieter. */
  loudness: z.number().min(-30).max(-9).default(-14),
  timing: Timing.prefault({}),
};

const Video = z.strictObject({
  title: z.string().min(1),
  ...settings,
  scenes: z.array(z.discriminatedUnion("scene", [PageScrollScene, ClipScene])).min(1),
});

export type VideoScript = z.infer<typeof Video>;
export type SceneScript = VideoScript["scenes"][number];
export type PageScrollSceneScript = z.infer<typeof PageScrollScene>;

/** The project file's name. It lies beside the video folders: the parent of each. */
export const PROJECT_FILE = "project.yaml";

/** The project file: what a project's videos share, and the command that draws its clips. */
export const ProjectFile = z.strictObject({
  /** The project's maker, run in the project file's folder with a call appended (src/maker.ts). */
  maker: z.string().min(1).optional(),
  ...settings,
});
export type ProjectScript = z.infer<typeof ProjectFile>;

export interface LoadedProject {
  /** The folder that holds the project file and the video folders. The maker runs here. */
  dir: string;
  /** Its project.yaml. */
  file: string;
  script: ProjectScript;
}

/** Reads the project file in `dir`, or undefined when there is none: then a video stands alone. */
export async function readProject(dir: string): Promise<LoadedProject | undefined> {
  const file = path.join(dir, PROJECT_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return undefined;
    throw e;
  }
  // A file whose every line is a comment parses to null: a project that sets nothing yet.
  const result = ProjectFile.safeParse(parse(raw) ?? {});
  if (!result.success) {
    throw new Error(`${file} is not a valid project file:\n${z.prettifyError(result.error)}`);
  }
  return { dir, file, script: result.data };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `over` on top of `under`: tables merge key by key (timing.moves.fastest keeps timing.gap); anything else replaces. */
function overlay(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over === undefined ? under : over;
  const out = { ...under };
  for (const [key, value] of Object.entries(over)) out[key] = overlay(under[key], value);
  return out;
}

export interface LoadedVideo {
  /** The video folder's name: it names the build folder and the finished files. */
  slug: string;
  /** The video folder, anywhere on the disk. Pages, styles and assets are relative to it. */
  dir: string;
  /** Its video.yaml. */
  file: string;
  /** The project file beside the folder, if there is one. */
  project: LoadedProject | undefined;
  /** The video.yaml over the project file's settings. */
  script: VideoScript;
}

/**
 * Loads the video whose folder is `dir`: its video.yaml over the project file beside the folder
 * (read, never copied into it) and, relative to it, everything it names.
 */
export async function loadVideo(dir: string): Promise<LoadedVideo> {
  const file = path.join(dir, "video.yaml");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`No script found at ${file}`);
  }
  const name = slug.safeParse(path.basename(dir));
  if (!name.success) {
    throw new Error(`${dir}: the folder's name names the video's files, so use lowercase letters, digits and dashes`);
  }
  const project = await readProject(path.dirname(path.resolve(dir)));
  // The project's settings are valid on their own (readProject), so whatever the schema refuses
  // below was written in the video.yaml.
  const { maker: _maker, ...shared }: Partial<ProjectScript> = project?.script ?? {};
  const result = Video.safeParse(overlay(shared, parse(raw)));
  if (!result.success) {
    throw new Error(`${file} is not a valid video script:\n${z.prettifyError(result.error)}`);
  }
  const ids = result.data.scenes.map((s) => s.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`${file}: scene id "${dup}" is used twice`);
  if (ids.includes("main") || ids.includes("root")) {
    throw new Error(`${file}: scene ids "main" and "root" are reserved`);
  }
  return { slug: name.data, dir, file, project, script: result.data };
}
