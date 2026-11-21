// A plugin's video as one file (AGENTS.md, "A video file"): videos/<name>.yaml, with `use:` naming
// its plugin, its own settings, and the rest the plugin's source. Settings come in layers, each
// over the one before: the server's (the tool's defaults), the project's (its package.json's
// "ai-videos"), the file's, and the profile picked when making. Each line is written once, in the
// source: the plugin's plan gives the lines, and this file makes them the script the pipeline reads.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { ClipJson } from "./clip.ts";
import { pluginOf, type PluginFile } from "./make.ts";
import { FORMATS, overlay, settings, slug, type FormatName, type VideoScript } from "./script.ts";

/** The server's profiles: settings over all the layers, picked when making (`make <file> --profile quiet`). */
export const PROFILES = {
  /** The level YouTube and most platforms play at: for a project or a video that sets another. */
  youtube: { loudness: -14 },
  /** Quieter. */
  quiet: { loudness: -20 },
  /** A fast, lower-quality render, for iteration. */
  draft: { quality: "draft" },
} as const satisfies Record<string, Partial<FileSettingsScript>>;
export type ProfileName = keyof typeof PROFILES;

const { formats: _formats, ...shared } = settings;

/** A video file's settings: a video.yaml's, but the formats (its plugin's stage gives its one), and how it is rendered. */
export const FileSettings = z.strictObject({
  ...shared,
  /** How the video is rendered: `high`, or `draft` (fast, for iteration). */
  quality: z.enum(["high", "draft"]).default("high"),
});
export type FileSettingsScript = z.infer<typeof FileSettings>;

/** The project's layer: package.json's "ai-videos", the plugin's path and the settings its videos share. */
const ProjectSettings = z.strictObject({ plugin: z.string(), ...FileSettings.shape });

/** The keys of a video file that are the tool's; every other key is the plugin's source. */
export const TOOL_KEYS = ["use", ...Object.keys(FileSettings.shape)];

export interface VideoFile {
  /** The file's name without `.yaml`: it names its folder in the cache and the finished files. */
  name: string;
  file: string;
  plugin: PluginFile;
  /** The scene the file says its plugin draws. */
  use: string;
  /** The file, parsed, without the tool's keys: what the plugin checks. */
  source: Record<string, unknown>;
  /** The server's settings, the project's over them, the file's, then the profile's. */
  settings: FileSettingsScript;
  profile: ProfileName | undefined;
  /** Where its made files go: `.cache/<name>/` in the project's folder. */
  cache: string;
  /** Its finished files, without the extension: `out/<name>` in the project's folder, `out/<name>-<profile>` with a profile. */
  out: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a video file and its project's settings, the profile over them. Errors name the file that holds the mistake. */
export async function readVideoFile(file: string, profile?: string): Promise<VideoFile> {
  const name = slug.safeParse(path.basename(file).replace(/\.yaml$/, ""));
  if (!file.endsWith(".yaml") || !name.success || name.data === "main" || name.data === "root") {
    throw new Error(`${file}: a video file is <name>.yaml, its name in lowercase letters, digits and dashes (not main or root): it names the video's files`);
  }
  if (profile !== undefined && !Object.hasOwn(PROFILES, profile)) {
    throw new Error(`No profile "${profile}": the profiles are ${Object.keys(PROFILES).join(", ")}`);
  }
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`No video file at ${file}`);
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new Error(`${file} is not YAML: ${e instanceof Error ? e.message : e}`);
  }
  if (!isRecord(raw)) throw new Error(`${file}: a video file is a mapping: use:, its settings, and its plugin's source`);

  const plugin = await pluginOf(file);
  if (!plugin) throw new Error(`${file}: no package.json above it names a plugin ("ai-videos": { "plugin" }), and a video file is a plugin's`);
  // The project's settings are checked on their own, so whatever the schema refuses below is the file's.
  const project = ProjectSettings.safeParse(plugin.settings);
  if (!project.success) throw new Error(`${plugin.package}: "ai-videos" is not valid:\n${z.prettifyError(project.error)}`);

  const { use, ...rest } = raw;
  const used = slug.safeParse(use);
  if (!used.success) throw new Error(`${file}: write use: <the scene its plugin draws> on top, in lowercase letters, digits and dashes`);
  const own: Record<string, unknown> = {};
  const source: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) (Object.hasOwn(FileSettings.shape, key) ? own : source)[key] = value;
  const { plugin: _plugin, ...projectSettings } = project.data;
  const layered = FileSettings.safeParse(overlay(projectSettings, own));
  if (!layered.success) throw new Error(`${file}: a setting is not valid:\n${z.prettifyError(layered.error)}`);
  const picked = profile as ProfileName | undefined;
  const base = path.join(plugin.dir, "out", picked ? `${name.data}-${picked}` : name.data);
  return {
    name: name.data,
    file,
    plugin,
    use: used.data,
    source,
    settings: picked ? FileSettings.parse(overlay(layered.data, PROFILES[picked])) : layered.data,
    profile: picked,
    cache: path.join(plugin.dir, ".cache", name.data),
    out: base,
  };
}

/** The format of a plugin's stage: the one of its shape. */
export function formatOf(scene: string, stage: { width: number; height: number }): FormatName {
  const formats = Object.keys(FORMATS) as FormatName[];
  const format = formats.find((f) => FORMATS[f].width * stage.height === FORMATS[f].height * stage.width);
  if (format) return format;
  const sizes = formats.map((f) => `${f} ${FORMATS[f].width} by ${FORMATS[f].height}`).join(", ");
  throw new Error(`the ${scene} stage is ${stage.width} by ${stage.height}: no format has its shape (${sizes})`);
}

/**
 * A line per text, cued to the event it begins at: the last one at or before its `from` (the first
 * event is at 0, so there is always one). In the clip's time order, so no cue goes back. A text
 * with a speaker gives the line its speaker, written first, as in a play.
 */
export function linesOf(data: ClipJson): { speaker?: string; text: string; cue: string }[] {
  return data.texts
    .toSorted((a, b) => a.from - b.from)
    .map(({ text, speaker, from }) => {
      // A millisecond's slack, for a maker that rounds an event's time and its text's apart.
      const event = data.events.findLast((e) => e.at <= from + 1e-3)!;
      return { ...(speaker ? { speaker } : {}), text, cue: event.name };
    });
}

/**
 * The script the pipeline reads, from the video file and its plan: one made clip scene, by the
 * file's name, its lines the plan's texts. A speaker the cast gives no voice is refused.
 */
export function scriptOf(video: VideoFile, format: FormatName, plan: ClipJson): VideoScript {
  const lines = linesOf(plan);
  if (lines.length === 0) throw new Error(`${video.file} has no line to say: its plan gives no text`);
  const { quality: _quality, ...script } = video.settings;
  const cast = Object.keys(script.cast);
  const voiceless = lines.find((l) => l.speaker !== undefined && !Object.hasOwn(script.cast, l.speaker));
  if (voiceless) {
    throw new Error(
      `${video.file}: ${voiceless.speaker} says "${voiceless.text}", and the cast (${cast.join(", ") || "it is empty"}) gives ${voiceless.speaker} no voice: ` +
        `give one under cast:, in the file or in ${video.plugin.package}'s "ai-videos"`,
    );
  }
  return {
    title: video.name,
    ...script,
    formats: [format],
    scenes: [{ id: video.name, scene: "clip", make: video.name, limits: {}, narration: lines.map((line) => ({ ...line, pause: 0 })) }],
  };
}
