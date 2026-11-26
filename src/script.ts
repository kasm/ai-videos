// The script the pipeline reads: a video file's lines and settings, made from the file and its
// plugin's plan (video-file.ts, scriptOf), never written by hand. And the names, limits and sizes
// the tool's modules share.
import { z } from "zod";

/** A video's name and a scene's id: they name files and HyperFrames' compositions. */
export const slug = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and dashes");

/** Who says a line: a name of the cast (`cast`, below), as a plugin's plan names its characters. */
export const Speaker = slug;

/** Limits for one event's span, over the video's `timing.moves` (AGENTS.md, "Fitting a clip to the voice"). */
export const EventLimits = z.strictObject({
  /** A move: the slowest it may play, as a multiple of its own speed. */
  slowest: z.number().positive().max(1).optional(),
  /** A move: the fastest it may play, as a multiple of its own speed. */
  fastest: z.number().min(1).max(10).optional(),
  /** A hold: the shortest it may shrink to, seconds (else a frame). */
  least: z.number().min(0).optional(),
});
export type EventLimitsScript = z.infer<typeof EventLimits>;

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

/** The shapes a plugin's stage may have, and the size a video of each is rendered at. */
export const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;
export type FormatName = keyof typeof FORMATS;

/** The languages a video may be in, by their codes (a page's `lang`), each with its name. */
export const LANGUAGES = { en: "English", uk: "Ukrainian", ru: "Russian" } as const;
export type Language = keyof typeof LANGUAGES;
const LanguageCode = z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]], { error: `a language is ${Object.keys(LANGUAGES).join(", ")}` });

const VOICES = `a voice is one of the tool's (am_puck), or one in each language: { en: am_puck, uk: uk_m1 }`;
const unknownLanguage = (issue: { code?: string; keys?: string[] }) =>
  issue.code === "unrecognized_keys" ? `a language is ${Object.keys(LANGUAGES).join(", ")}, not ${issue.keys!.join(", ")}` : undefined;

/** A voice as written: one, which speaks its own language, or one in each language, by its code. `missing` is said when there is none. */
export const voicesGiven = (missing = VOICES) =>
  z.union([z.string().min(1), z.partialRecord(LanguageCode, z.string().min(1), { error: unknownLanguage })], { error: (issue) => (issue.input === undefined ? missing : VOICES) });
export type Voices = z.infer<ReturnType<typeof voicesGiven>>;

/** The voice a line of a video in `language` is said in, of those `given`: its one voice, whatever that speaks, or its voice in that language. None when it has none in it. */
export const voiceIn = (given: Voices, language: Language): string | undefined => (typeof given === "string" ? given : given[language]);

/**
 * The settings of what a video sounds and moves like, the server's defaults (AGENTS.md, "Settings
 * in layers"): a project and a video file set them over these (video-file.ts, FileSettings).
 */
export const settings = {
  /** The language its lines are in: each is said in a voice of it. */
  language: LanguageCode.default("en"),
  /** The voice of every line that names no speaker (a narrator's). */
  voice: voicesGiven().default("af_heart"),
  /** The cast: each speaker's voice, by name. A line's `speaker` is one of these. */
  cast: z.record(Speaker, voicesGiven()).default({}),
  speed: z.number().min(0.5).max(2).default(1),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  /** How loud the finished soundtrack is, in LUFS: -14 is what YouTube and most platforms play at; lower is quieter. */
  loudness: z.number().min(-30).max(-9).default(-14),
  timing: Timing.prefault({}),
};

/** A line the voice says: its text, the event it waits for, and who says it (none: the narrator). */
export interface LineScript {
  text: string;
  /** An event of the clip: the line waits for the clip to reach it. None: it follows on. */
  cue?: string;
  speaker?: string;
}

/** A scene: the plugin's clip, played muted with its lines as captions, fitted to their voice. */
export interface SceneScript {
  id: string;
  /** Single events' own limits on the fit, by name: the plan's (plugin.ts, limits). */
  limits: Record<string, EventLimitsScript>;
  narration: LineScript[];
}

export interface VideoScript {
  title: string;
  language: Language;
  voice: Voices;
  cast: Record<string, Voices>;
  speed: number;
  fps: 24 | 25 | 30 | 60;
  loudness: number;
  timing: z.infer<typeof Timing>;
  scenes: SceneScript[];
}

/** The voice a line is said in: its speaker's in the cast, else the video's, in the video's language. None when that has none in it. */
export function voiceOf(script: Pick<VideoScript, "voice" | "cast" | "language">, line: { speaker?: string }): string | undefined {
  const given = line.speaker !== undefined && Object.hasOwn(script.cast, line.speaker) ? script.cast[line.speaker]! : script.voice;
  return voiceIn(given, script.language);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `over` on top of `under`: tables merge key by key (timing.moves.fastest keeps timing.gap); anything else replaces. */
export function overlay(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over === undefined ? under : over;
  const out = { ...under };
  for (const [key, value] of Object.entries(over)) out[key] = overlay(under[key], value);
  return out;
}

/** The video the pipeline makes: its name, its file and its script. */
export interface LoadedVideo {
  /** The video file's name: it names the build's compositions. */
  slug: string;
  /** The video file, which the build and the request name as their source. */
  file: string;
  script: VideoScript;
}
