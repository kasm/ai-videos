// What a project's plugin is (AGENTS.md, "Plugins"): the module that draws a project's scenes, run
// by the tool in a child process of its own (host.ts). A plugin holds what is its own: its source's
// check, its commands and its guide, the plan of its beats and the picture of a moment. The tool
// does the rest.
//
// A project imports this file for its types alone (package.json, "exports"), so nothing here runs,
// and a plugin needs none of the tool's packages: a schema is any library's that follows the
// Standard Schema and Standard JSON Schema interfaces (standardschema.dev), as zod 4's do.
import type { ClipEvent, ClipText, Moment } from "./frames.ts";

export type { ClipEvent, ClipText, Moment };

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
 * A plugin, the module's default export. `Source` is the plugin's own scenario, as `check` gives
 * it. Every function is pure: no Node APIs, no clock, no unseeded randomness. So a frame is the same
 * in every run, and the same code can draw in a web page.
 */
export interface Plugin<Source = unknown> {
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
  /** A moment's picture as an SVG of the whole stage, `width` by `height` pixels. */
  frame(source: Source, moment: Moment, size: { width: number; height: number }): string;
}
