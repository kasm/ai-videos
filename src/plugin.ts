// What a project's plugin is (AGENTS.md, "Plugins"): the module that draws a project's scenes, run
// by the tool in a child process of its own (host.ts). A plugin holds what is its own: its source's
// check, its commands and its guide, the plan of its beats and the picture of a moment, drawn as
// an SVG or recorded by its camera. The tool does the rest.
//
// A project imports this file for its types alone (package.json, "exports"), so nothing here runs,
// and a plugin needs none of the tool's packages: a schema is any library's that follows the
// Standard Schema and Standard JSON Schema interfaces (standardschema.dev), as zod 4's do.
import type { ClipEvent, ClipText, Moment, Request } from "./frames.ts";

export type { ClipEvent, ClipText, Moment, Request };

/** One problem a schema finds: its message, and where in the value. */
export interface SchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/**
 * A schema: it checks a value, and writes itself as JSON Schema. `Output` is what a value it
 * passes becomes (defaults filled in).
 */
export interface Schema<Output = unknown> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>;
    readonly jsonSchema: {
      readonly input: (options: { readonly target: "draft-2020-12" | "draft-07" | (string & {}) }) => Record<string, unknown>;
      readonly output: (options: { readonly target: "draft-2020-12" | "draft-07" | (string & {}) }) => Record<string, unknown>;
    };
  };
}
export type SchemaResult<Output> = { readonly value: Output; readonly issues?: undefined } | { readonly issues: ReadonlyArray<SchemaIssue> };

/**
 * One command of the plugin's scenario: what a beat may do (a walk, a pose). It is described once,
 * and the checks, the prompt and a JSON Schema for a local model all come from that.
 */
export interface Command {
  /** What it does, for a person or a model writing a scenario. */
  description: string;
  /** One value the command takes, as it is written: its schema passes it. */
  example: unknown;
  /** What it takes. */
  schema: Schema;
}

/** A source's beats at its own pace: the made clip's events and texts (ai-videos-clip, clip.ts). */
export interface Plan {
  /** The clip's length, seconds. */
  duration: number;
  /** One event per beat, in order, the first at 0. */
  events: ClipEvent[];
  /** The source's own words: a line each, and when it applies. */
  texts: ClipText[];
  /**
   * Optional: single events' own limits on the fit, by the event's name, over the video's
   * `timing.moves` (AGENTS.md, "Fitting a clip to the voice"): a move's `slowest` and `fastest`,
   * multiples of its own speed, and a hold's `least`, seconds.
   */
  limits?: Record<string, EventLimits>;
}

/** One event's limits on the fit: a move takes `slowest` and `fastest`, a hold `least`. */
export interface EventLimits {
  slowest?: number;
  fastest?: number;
  least?: number;
}

/**
 * A recorded picture: a camera open on what draws it (a page in a browser), for one clip. The host
 * asks for each frame's moment in order, then closes it, whether the clip was drawn or failed.
 */
export interface Camera {
  /**
   * The moment's picture: a PNG of the whole stage, `width` by `height` pixels, sRGB and opaque.
   * The same buffer as the frame before is that picture held: it is not hashed again.
   */
  shot(moment: Moment): Promise<Uint8Array>;
  /** Closes what it opened. */
  close(): Promise<void>;
}

/**
 * The project's library, `library.yaml` beside its package.json: what its videos name (a cartoon's
 * characters and backgrounds). The tool reads it, takes each character's `voice` for the cast, and
 * gives the plugin the rest.
 */
export interface Library {
  /** The library's file, for an error to name. */
  file: string;
  /** The file, parsed from YAML, without each character's `voice`. */
  raw: unknown;
}

/**
 * What every plugin has: its scene, its commands and guide, its source's check and plan. A drawing
 * plugin's are pure (below); a recording plugin's may read the project's files `inputs` names.
 */
interface PluginBase<Source> {
  /** The scene it draws (lowercase letters, digits and dashes): a video file's `use:` names it. */
  scene: string;
  /** The size its picture is drawn at, px: the video's format is the one of its shape. */
  stage: { width: number; height: number };
  /** The commands of its scenario, by name. */
  commands: Record<string, Command>;
  /**
   * Its part of the prompt (prompt.ts), in Markdown: what its videos can show, the format of its
   * source with an example, how to draw what its library holds, and how to turn a story into it.
   * The tool adds its commands (description and example), the library and the voices.
   */
  guide: string;
  /**
   * The source checked: `raw` is the video file, parsed from YAML, without the tool's keys (`use`
   * and the settings), and what it names is found in `library` (none when the project has no
   * library.yaml). An error names the file that holds the mistake, and every reason.
   */
  check(raw: unknown, file: string, library: Library | undefined): Source;
  /**
   * Optional: what it mends in a source before `check`, only where there is one right answer.
   * `source` is `raw` mended, in the same format, so it could be written back; `did` says what it
   * mended, a sentence each. Without it, nothing is mended.
   */
  repair?(raw: unknown, library: Library | undefined): { source: unknown; did: string[] };
  /** The source's beats as the clip's events and texts, at its own pace. */
  plan(source: Source): Plan;
  /**
   * Optional: the project's files the plan and the picture are made from, beyond the video file,
   * the library and the plugin's own folder (a tutorial the source names, the app that draws it),
   * each a file or a folder, as a path from the project's folder (the package.json's). make hashes
   * them into the plan's and the drawing's keys, so a change to one makes them again.
   */
  inputs?(source: Source): string[];
}

/**
 * A plugin that draws: each moment's picture is an SVG of its own making. Every function is pure:
 * no Node APIs, no clock, no unseeded randomness. So a frame is the same in every run, and the same
 * code draws in the video's web page.
 */
export interface DrawingPlugin<Source = unknown> extends PluginBase<Source> {
  /** A moment's picture as an SVG of the whole stage, `width` by `height` pixels. */
  frame(source: Source, moment: Moment, size: { width: number; height: number }): string;
  camera?: undefined;
}

/**
 * A plugin that records: its camera takes each moment's picture by other means (a page in a
 * browser), in the host's process, with Node. It must give the same picture in every run all the
 * same: `.frames` compares two runs. Its web page plays the clip it drew.
 */
export interface RecordingPlugin<Source = unknown> extends PluginBase<Source> {
  /** Opens the camera on the source, for the clip drawn to `request`, `width` by `height` pixels. */
  camera(source: Source, request: Request, size: { width: number; height: number }): Promise<Camera>;
  frame?: undefined;
}

/** A plugin, the module's default export: one that draws, or one that records. `Source` is its own scenario, as `check` gives it. */
export type Plugin<Source = unknown> = DrawingPlugin<Source> | RecordingPlugin<Source>;
