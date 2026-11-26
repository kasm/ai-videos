// A plugin's video as one file (AGENTS.md, "A video file"): videos/<name>.yaml, with `use:` naming
// its plugin, its own settings, and the rest the plugin's source. What it names is in the project's
// library (library.yaml), its characters' voices among it, and the sounds a script plays. Settings come in layers, each over the
// one before: the server's (the tool's defaults), the project's (its package.json's "ai-videos",
// and the library's voices as its cast), the file's, and the profile picked when making. Each line
// is written once, in the source: the plugin's plan gives the lines, and this file makes them the
// script the pipeline reads.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LineCounter, isMap, isScalar, isSeq, parse, parseDocument, visit, type Pair } from "yaml";
import { z } from "zod";
import type { ClipJson } from "./clip.ts";
import { Wrong, exact, readFormula } from "./formula.ts";
import { pluginOf, type PluginFile } from "./make.ts";
import { listed, nearest } from "./names.ts";
import type { Library } from "./plugin.ts";
import { readScript } from "./read.ts";
import { NARRATOR, type Issue, type WrittenOver, type WrittenScene, type WrittenScript, type WrittenValue } from "./scenario.ts";
import { FORMATS, overlay, settings, slug, Speaker, voicesGiven, type EventLimitsScript, type FormatName, type VideoScript, type Voices } from "./script.ts";
import { volumeWrong } from "./values.ts";

/** The project's library, beside its package.json. */
export const LIBRARY_FILE = "library.yaml";

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

/** What make writes of a video file, each on or off: the video, and its web page (AGENTS.md, "The web page"). */
const Outputs = z.strictObject({ video: z.boolean().default(true), web: z.boolean().default(false) }).prefault({});

/** A video file's settings: the server's (script.ts, settings), how it is rendered, and what is made. */
export const FileSettings = z.strictObject({
  ...settings,
  /** How the video is rendered: `high`, or `draft` (fast, for iteration). */
  quality: z.enum(["high", "draft"]).default("high"),
  /** What make writes: the video (on by default) and its web page (off by default). `--as` makes one of them, whatever this says. */
  outputs: Outputs,
});
export type FileSettingsScript = z.infer<typeof FileSettings>;

/**
 * The project's layer: package.json's "ai-videos", the plugin's path and the settings its videos
 * share. Its cast is the library's: a character's voice has one home.
 */
const ProjectSettings = z.strictObject({
  plugin: z.string(),
  ...FileSettings.shape,
  cast: z.never({ error: `a character's voice is in ${LIBRARY_FILE}, beside this package.json: voice: under the character` }).optional(),
});

/** A volume in the library, dB, from its text: a character's, or a sound's. */
const libraryVolume = (whose: string) => {
  const form = `${whose} volume is in decibels, -4dB: 0dB is as loud as any voice`;
  return z
    .string({ error: form })
    .regex(/^[-+]?\d+(\.\d+)?dB$/, form)
    .transform((text) => exact(Number(text.slice(0, -2))))
    .superRefine((dB, ctx) => {
      const wrong = volumeWrong(dB);
      if (wrong) ctx.addIssue({ code: "custom", message: wrong });
    });
};
const NAME_FORM = (whose: string) => (issue: { code?: string }) => (issue.code === "invalid_key" ? `${whose} name is lowercase letters, digits and dashes, a letter first` : undefined);

/** What the tool reads of a library: each character's voice, and how loud it is. The rest is the plugin's. */
const LibraryVoices = z.looseObject({
  characters: z
    .record(
      Speaker,
      z.looseObject({
        voice: voicesGiven("give each character its voice: one of the tool's (npm run video -- voices lists them), or one in each language it speaks: { en: am_puck, uk: uk_m1 }"),
        volume: libraryVolume("a character's").optional(),
      }),
      { error: NAME_FORM("a character's") },
    )
    .optional(),
});

/** The library's sounds, the tool's alone: each with its file, and how loud it is. */
const LibrarySounds = z
  .record(
    Speaker,
    z.strictObject({
      file: z
        .string({ error: "give each sound its file, a path from this folder: file: sounds/door.flac" })
        .min(1, "give each sound its file, a path from this folder: file: sounds/door.flac")
        .refine((file) => !path.isAbsolute(file), "a sound's file is a path from this folder, not an absolute one"),
      volume: libraryVolume("a sound's").optional(),
    }),
    { error: NAME_FORM("a sound's") },
  )
  .optional();

/** library.yaml as written: its path, its text and the text parsed. */
export interface LibraryFile {
  file: string;
  text: string;
  raw: Record<string, unknown>;
}

/** The project's library.yaml, as written; none when the project has none. */
async function readLibraryFile(dir: string): Promise<LibraryFile | undefined> {
  const file = path.join(dir, LIBRARY_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return undefined;
    throw e;
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new Error(`${file} is not YAML: ${e instanceof Error ? e.message : e}`);
  }
  // An empty file is a library with nothing in it yet.
  if (raw === null) raw = {};
  if (!isRecord(raw)) throw new Error(`${file}: a library is a mapping: characters:, each with its voice, and what else its plugin keeps there`);
  return { file, text, raw };
}

/** What the tool takes out of a library: its voices as the cast, its sounds, each with its file, a path from its folder, and the volumes of both, dB. */
export interface LibraryParts {
  cast: Record<string, Voices>;
  sounds: Record<string, string>;
  volumes: Record<string, number>;
}

/** A library, parsed: what is the tool's taken out, and the rest the plugin's. Errors name `file`. */
export function libraryOf(file: string, whole: Record<string, unknown>): { library: Library } & LibraryParts {
  const { sounds: written, ...raw } = whole;
  const voices = LibraryVoices.safeParse(raw);
  if (!voices.success) throw new Error(`${file}: its characters are not valid:\n${z.prettifyError(voices.error)}`);
  const cast: Record<string, Voices> = {};
  const volumes: Record<string, number> = {};
  const characters: Record<string, unknown> = {};
  for (const [who, { voice, volume, ...drawn }] of Object.entries(voices.data.characters ?? {})) {
    cast[who] = voice;
    if (volume !== undefined) volumes[who] = volume;
    characters[who] = drawn;
  }
  const parsed = LibrarySounds.safeParse(written);
  if (!parsed.success) throw new Error(`${file}: its sounds are not valid:\n${z.prettifyError(parsed.error)}`);
  const sounds: Record<string, string> = {};
  for (const [name, sound] of Object.entries(parsed.data ?? {})) {
    // A volume set for a name is for all that it is.
    if (name === NARRATOR || Object.hasOwn(cast, name)) throw new Error(`${file}: ${name} is ${name === NARRATOR ? "the narrator" : "a character"} and a sound: call the sound something else`);
    sounds[name] = sound.file;
    if (sound.volume !== undefined) volumes[name] = sound.volume;
  }
  return { library: { file, raw: voices.data.characters ? { ...raw, characters } : raw }, cast, sounds, volumes };
}

/** A project with a plugin: what its videos share. */
export interface Project {
  plugin: PluginFile;
  /** library.yaml as written; none when the project has none. */
  libraryFile: LibraryFile | undefined;
  /** The library without its voices, its sounds and its volumes, for the plugin; none without a library.yaml. */
  library: Library | undefined;
  /** The library's sounds, each with its file, a path from the project's folder: a script's. */
  sounds: Record<string, string>;
  /** The library's volumes, dB, by whose they are: a script's. */
  volumes: Record<string, number>;
  /** The project's layer over the server's: package.json's "ai-videos", and the library's voices as its cast. */
  settings: Record<string, unknown> & { cast: Record<string, Voices>; voice: Voices };
}

/** The project of a plugin: its settings and its library. Errors name the file that holds the mistake. */
export async function readProject(plugin: PluginFile): Promise<Project> {
  // The project's settings are checked on their own, so whatever a video file's schema refuses is the file's.
  const project = ProjectSettings.safeParse(plugin.settings);
  if (!project.success) throw new Error(`${plugin.package}: "ai-videos" is not valid:\n${z.prettifyError(project.error)}`);
  const libraryFile = await readLibraryFile(plugin.dir);
  const { library, cast, sounds, volumes } = libraryFile ? libraryOf(libraryFile.file, libraryFile.raw) : { library: undefined, cast: {}, sounds: {}, volumes: {} };
  const { plugin: _plugin, cast: _cast, ...settings } = project.data;
  return { plugin, libraryFile, library, sounds, volumes, settings: { ...settings, cast } };
}

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
  /** The file as written, when it was read from the disk: a mistake is shown with its line. */
  text?: string;
  /** Its scenes and their lines, when it is written as a script (AGENTS.md, "A script") and was read from the disk. */
  script?: WrittenScript;
  /** The project's library, without its voices, its sounds and its volumes: what the plugin finds the names in. None without a library.yaml. */
  library: Library | undefined;
  /** The library's sounds, each with its file, a path from the project's folder: a script's. */
  sounds: Record<string, string>;
  /** The library's volumes, dB, by whose they are: a script's. */
  volumes: Record<string, number>;
  /** The server's settings, the project's over them, the file's, then the profile's. */
  settings: FileSettingsScript;
  profile: ProfileName | undefined;
  /** Where its made files go: `.cache/<name>/` in the project's folder. */
  cache: string;
  /** Its finished files, without the extension: `out/<name>` in the project's folder, `out/<name>-<profile>` with a profile. */
  out: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A video file's name, from its path: it names the video's files. */
function nameOf(file: string): string {
  const name = slug.safeParse(path.basename(file).replace(/\.yaml$/, ""));
  if (!file.endsWith(".yaml") || !name.success || name.data === "main" || name.data === "root") {
    throw new Error(`${file}: a video file is <name>.yaml, its name in lowercase letters, digits and dashes (not main or root): it names the video's files`);
  }
  return name.data;
}

function checkProfile(profile: string | undefined): ProfileName | undefined {
  if (profile !== undefined && !Object.hasOwn(PROFILES, profile)) {
    throw new Error(`No profile "${profile}": the profiles are ${Object.keys(PROFILES).join(", ")}`);
  }
  return profile as ProfileName | undefined;
}

/** Reads a video file and its project's settings, the profile over them. Errors name the file that holds the mistake. */
export async function readVideoFile(file: string, profile?: string): Promise<VideoFile> {
  nameOf(file);
  checkProfile(profile);
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
  const script = writtenScript(text);
  return { ...videoFileOf(await readProject(plugin), file, raw, profile), text, ...(script ? { script } : {}) };
}

/**
 * A value that a comma has cut: between `{` and `}` YAML ends a value at it, and has the rest as keys
 * with no value. `{ meet: midpoint(pip, mo) }` is so cut: its pairs, and what is wrong.
 */
function cutValues(node: unknown, lineOf: (node: unknown) => number): { pairs: Pair[]; issue: Issue }[] {
  if (!isMap(node) || !node.flow) return [];
  const open = (text: string) => text.split("(").length - text.split(")").length;
  const cut: { pairs: Pair[]; issue: Issue }[] = [];
  const pairs = node.items as Pair[];
  for (const [k, { key, value }] of pairs.entries()) {
    if (!isScalar(value)) continue;
    const first = String(value.value);
    let whole = first;
    let end = k + 1;
    for (; open(whole) > 0 && pairs[end]?.value === null; end++) whole += `, ${pairs[end]!.key}`;
    if (end === k + 1) continue;
    cut.push({
      pairs: pairs.slice(k, end),
      issue: { line: lineOf(key), message: `between { and } a comma ends a value: ${key} is "${first}", and no more`, hint: `write it in quotes, ${key}: "${whole}", or on a row of its own` },
    });
  }
  return cut;
}

/** The values of a file or a scene (`values:`), each a formula with its line in the file. */
function writtenValues(node: unknown, lineOf: (node: unknown) => number): { values: Record<string, WrittenValue>; issues: Issue[] } {
  const values: Record<string, WrittenValue> = {};
  const issues: Issue[] = [];
  const form = "a value is written by its name: values: { pause: 0.3s, walk.speed: slow }";
  if (!isMap(node)) return { values, issues: [{ line: lineOf(node), message: "these values are not a mapping", hint: form }] };
  const cut = cutValues(node, lineOf);
  issues.push(...cut.map(({ issue }) => issue));
  for (const pair of node.items) {
    if (cut.some(({ pairs }) => pairs.includes(pair))) continue;
    const { key, value } = pair;
    const line = lineOf(key);
    const name = String(isScalar(key) ? key.value : key);
    const issue = (message: string, hint: string) => void issues.push({ line, message, hint });
    if (isMap(value)) issue(`${name} has values of its own`, `write each on a row: ${value.items.map((inner) => `${name}.${inner.key}: ${inner.value}`).join(", ")}`);
    else if (!isScalar(value) || value.value === null || typeof value.value === "boolean") issue(`${name} has no value`, form);
    else {
      // A number as it is written, and not as YAML has it.
      const text = typeof value.value === "number" ? (value.source ?? String(value.value)) : String(value.value);
      try {
        readFormula(text);
        values[name] = { line, text: text.trim() };
      } catch (e) {
        if (!(e instanceof Wrong)) throw e;
        issue(`${name}=${text}: ${e.message}`, e.hint);
      }
    }
  }
  return { values, issues };
}

/**
 * A video file's scenes and their lines, when it is written as a script (AGENTS.md, "A script"):
 * `scenes:` is a list, and one of them has a `script:`. Each scene is its own keys but `script` and
 * `values`, and its script's lines and blocks, each with its line in the file. A script is a block of
 * lines (`script: |`), so that a line of it is a line of the file. Beside its scenes the file has the
 * tool's keys, its own `values` and a `script` of its own, which goes on over them, and no other. Undefined
 * for any other file.
 */
export function writtenScript(text: string): WrittenScript | undefined {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter });
  const list = document.get("scenes", true);
  if (!isSeq(list) || !list.items.some((item) => isMap(item) && item.has("script"))) return undefined;
  const lineOf = (node: unknown) => lineCounter.linePos((node as { range: [number, number, number] }).range[0]).line;
  const scenes: WrittenScene[] = [];
  const issues: Issue[] = [];
  const valuesOf = (node: unknown) => {
    if (node === undefined) return {};
    const read = writtenValues(node, lineOf);
    issues.push(...read.issues);
    return { values: read.values };
  };
  const top = document.contents as { items: { key: unknown }[] };
  const keys = [...TOOL_KEYS, "values", "script", "scenes"];
  for (const { key } of top.items) {
    const name = String(key);
    if (keys.includes(name)) continue;
    const near = nearest(name, keys);
    issues.push({ line: lineOf(key), message: `nothing reads "${name}"`, hint: `on top of a script are ${listed(keys)}${near ? `: did you mean ${near}?` : ""}` });
  }
  const own = valuesOf(document.get("values", true));
  const block = "write its lines under script: |, one under another";
  /** The lines and blocks of a `script:`, a block of lines. */
  const itemsOf = (script: unknown): WrittenScene["items"] => {
    if (!isScalar(script) || script.type !== "BLOCK_LITERAL" || typeof script.value !== "string") {
      issues.push({ line: lineOf(script), message: "this script is not a block of lines", hint: block });
      return [];
    }
    // The block's first line is the one under its `|`.
    const read = readScript(script.value, lineOf(script) + 1);
    issues.push(...read.issues);
    if (read.items.length === 0 && read.issues.length === 0) issues.push({ line: lineOf(script), message: "this script has no line", hint: block });
    return read.items;
  };
  const script = document.get("script", true);
  const over: { over?: WrittenOver } = script === undefined ? {} : { over: { line: lineOf(script), items: itemsOf(script) } };
  for (const item of list.items) {
    const line = lineOf(item);
    if (!isMap(item)) {
      issues.push({ line, message: "this scene is not a mapping", hint: `a scene has its own keys and its script: ${block}` });
      continue;
    }
    const { script: _script, values: _values, ...setting } = item.toJS(document) as Record<string, unknown>;
    for (const key of Object.keys(setting)) {
      visit(item.get(key, true) as Parameters<typeof visit>[0], { Map: (_, map) => void issues.push(...cutValues(map, lineOf).map(({ issue }) => issue)) });
    }
    const values = valuesOf(item.get("values", true));
    const script = item.get("script", true);
    if (script === undefined) issues.push({ line, message: "this scene has no script", hint: block });
    scenes.push({ line, setting, ...values, items: script === undefined ? [] : itemsOf(script) });
  }
  return { ...own, ...over, scenes, issues };
}

/**
 * A video file of `project`, parsed (`raw`), whether it is on the disk yet or not (import checks
 * one before it writes it): its `use:`, its settings over the project's, and its source.
 */
export function videoFileOf(project: Project, file: string, raw: Record<string, unknown>, profile?: string): VideoFile {
  const name = nameOf(file);
  const picked = checkProfile(profile);
  const { use, ...rest } = raw;
  const used = slug.safeParse(use);
  if (!used.success) throw new Error(`${file}: write use: <the scene its plugin draws> on top, in lowercase letters, digits and dashes`);
  const own: Record<string, unknown> = {};
  const source: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) (Object.hasOwn(FileSettings.shape, key) ? own : source)[key] = value;
  const layered = FileSettings.safeParse(overlay(project.settings, own));
  if (!layered.success) throw new Error(`${file}: a setting is not valid:\n${z.prettifyError(layered.error)}`);
  const { plugin } = project;
  const base = path.join(plugin.dir, "out", picked ? `${name}-${picked}` : name);
  return {
    name,
    file,
    plugin,
    use: used.data,
    source,
    library: project.library,
    sounds: project.sounds,
    volumes: project.volumes,
    settings: picked ? FileSettings.parse(overlay(layered.data, PROFILES[picked])) : layered.data,
    profile: picked,
    cache: path.join(plugin.dir, ".cache", name),
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
export function linesOf(data: Pick<ClipJson, "events" | "texts">): { speaker?: string; text: string; cue: string }[] {
  return data.texts
    .toSorted((a, b) => a.from - b.from)
    .map(({ text, speaker, from }) => {
      // A millisecond's slack, for a plugin that rounds an event's time and its text's apart.
      const event = data.events.findLast((e) => e.at <= from + 1e-3)!;
      return { ...(speaker ? { speaker } : {}), text, cue: event.name };
    });
}

/**
 * The script the pipeline reads, from the video file and its plan: one scene, the plugin's clip,
 * by the file's name, its lines the plan's texts, its limits the plan's (the host has checked
 * them). A speaker the cast gives no voice is refused.
 */
export function scriptOf(video: VideoFile, plan: Pick<ClipJson, "events" | "texts">, limits: Record<string, EventLimitsScript> = {}): VideoScript {
  const lines = linesOf(plan);
  if (lines.length === 0) throw new Error(`${video.file} has no line to say: its plan gives no text`);
  const { quality: _quality, outputs: _outputs, ...script } = video.settings;
  const cast = Object.keys(script.cast);
  const voiceless = lines.find((l) => l.speaker !== undefined && !Object.hasOwn(script.cast, l.speaker));
  if (voiceless) {
    throw new Error(
      `${video.file}: ${voiceless.speaker} says "${voiceless.text}", and the cast (${cast.join(", ") || "it is empty"}) gives ${voiceless.speaker} no voice: ` +
        `give ${voiceless.speaker} a voice: under the character in ${path.join(video.plugin.dir, LIBRARY_FILE)}, or under cast: in the file`,
    );
  }
  return { title: video.name, ...script, scenes: [{ id: video.name, limits, narration: lines }] };
}
