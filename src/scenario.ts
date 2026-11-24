// A scenario written as a script (AGENTS.md, "A script"): a scene's lines read from its text, and
// the check, the pass before the voices and the only one that refuses. The grammar and `say` are
// the tool's; every other action is the plugin's, named in its `script` with what it takes.
//
// This file imports nothing that runs, so plugin.ts gives it to the plugins' tests, which have none
// of the tool's packages.
import type { Library, Schema } from "./plugin.ts";
import type { Shown } from "./shown.ts";

/** The tool's own action: a character says the line's text, in its voice. */
export const SAY = "say";

/** The speaker nobody draws: its lines are said in the video's voice. */
export const NARRATOR = "narrator";

/** A value as a script writes it: a number or a name. */
export type Written = number | string;

/** One line of a script: one thing one character does or says. */
export interface ScriptLine {
  /** Its line in the video file, from 1. */
  line: number;
  who: string;
  action: string;
  /** Its values by name, as written before the colon. */
  values: Record<string, Written>;
  /** What follows the colon, to the end of the line, as written; none when nothing does. */
  text?: string;
}

/** A mistake in a scenario: the line of the video file it is in, what is wrong, and how to mend it. */
export interface Issue {
  line: number;
  message: string;
  hint: string;
}

/** A scene as written: its line in the file, its own keys (all but `script`), and its script's lines. */
export interface WrittenScene {
  line: number;
  setting: Record<string, unknown>;
  lines: ScriptLine[];
}

/** A scenario as written: its scenes, and what could not be read of them. */
export interface WrittenScript {
  scenes: WrittenScene[];
  issues: Issue[];
}

/** One of a plugin's actions, described once: the check, the guide and the prompt come from that. */
export interface Action {
  /** What it does, for a person or a model writing a script. */
  description: string;
  /** One line that uses it, as a script writes it (`pip walk to=middle`): its values pass `values`. */
  example: string;
  /** What values a line gives it, by name. */
  values: Schema;
}

/** A line with one of the plugin's actions, as the plugin's check gets it: its values as the action's schema gives them. */
export interface ActionLine {
  line: number;
  who: string;
  action: string;
  values: unknown;
}

/** A scene as the plugin's check gets it: its own keys as written, and its lines with one of the plugin's actions, in order. */
export interface SceneActions {
  line: number;
  setting: Record<string, unknown>;
  actions: ActionLine[];
}

/** What a compiled scenario holds: numbers, and names and texts, in lists and tables. */
export type Plain = number | string | Plain[] | { [key: string]: Plain };

/**
 * A scene as the plugin's check gives it back, worked out: how it begins, and each of its actions,
 * in the order given, in plain numbers (a place as a point), with the action's own length, seconds.
 */
export interface SceneChecked {
  setting: Plain;
  actions: { values: Plain; length: number }[];
}

/** A plugin's part of a script (plugin.ts, `script`): its actions, its guide, its check and its picture. */
export interface ScriptPlugin {
  /** The actions a line may name, besides the tool's `say`. */
  actions: Record<string, Action>;
  /**
   * Its part of the guide to writing a script (guide.ts), in Markdown: what its videos can show, a
   * scene's own keys, and a whole video file as an example. The tool adds how a script's lines are
   * written, and the actions.
   */
  guide: string;
  /**
   * The script checked against the library, and worked out: every scene, in order, or every mistake
   * with its line and a hint. A library that cannot be read is thrown, naming its file.
   */
  check(scenes: SceneActions[], library: Library | undefined): { scenes: SceneChecked[] } | { issues: Issue[] };
  /**
   * Its picture: from the library, the function that draws what a frame shows (shown.ts) as an SVG
   * of the whole stage, `width` by `height` pixels. What a frame shows is plain: the scene's setting
   * and the actions' values as `check` gave them. Pure, as a drawing plugin's `frame` is: the video
   * and the web page draw with it.
   */
  draw(library: Library | undefined): (shown: Shown, size: { width: number; height: number }) => string;
}

/** A line checked: what is said, or one of the plugin's actions in plain numbers with its own length, seconds. */
export type CheckedLine = { line: number; who: string; action: string } & ({ text: string } | { values: Plain; length: number });

/** A scene checked: how it begins, in plain numbers, and its lines. */
export interface CheckedScene {
  line: number;
  setting: Plain;
  lines: CheckedLine[];
}

/** A scenario checked, or every mistake found in it. */
export type Checked = { scenes: CheckedScene[] } | { issues: Issue[] };

const NAME = /^[a-z][a-z0-9-]*$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/** `a, b and c`. */
export const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

/** How many letters put in, left out or changed make `a` into `b`. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let corner = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, corner + (a[i - 1] === b[j - 1] ? 0 : 1));
      corner = above;
    }
  }
  return row[b.length]!;
}

/** The name of `names` that `name` was most likely meant to be: a slip of a letter or two, for a hint. None when none is near. */
export function nearest(name: string, names: string[]): string | undefined {
  const near = names.map((other) => [distance(name, other), other] as const).filter(([d, other]) => d <= 2 && d < Math.max(name.length, other.length));
  return near.sort((a, b) => a[0] - b[0])[0]?.[1];
}

/**
 * A script's lines, read from its text; `first` is the line of the file its first line is on. A
 * line is `who action name=value ...: text`: what is before the first colon is read, and what is
 * after it is the text, as written. An empty line, or one that begins with `#`, is passed over.
 */
export function readScript(script: string, first = 1): { lines: ScriptLine[]; issues: Issue[] } {
  const lines: ScriptLine[] = [];
  const issues: Issue[] = [];
  script.split(/\r?\n/).forEach((raw, k) => {
    const written = raw.trim();
    if (written === "" || written.startsWith("#")) return;
    const line = first + k;
    const issue = (message: string, hint: string) => void issues.push({ line, message, hint });
    if (/^\s/.test(raw)) return issue("the line is indented", "begin every line of a script at its left edge");
    const colon = written.indexOf(":");
    const [who, action, ...rest] = (colon < 0 ? written : written.slice(0, colon)).trim().split(/\s+/);
    const text = colon < 0 ? "" : written.slice(colon + 1).trim();
    const form = "a line is who, the action, its values, and after a colon its words: pip say: Hello!";
    if (!who || !NAME.test(who)) return issue(`"${who ?? ""}" is not a name: a line begins with who does it`, form);
    if (!action) return issue(`${who} does nothing: the action comes after the name`, form);
    if (!NAME.test(action)) return issue(`"${action}" is not an action's name`, form);
    const values: Record<string, Written> = {};
    for (const part of rest) {
      const equals = part.indexOf("=");
      const [name, value] = [part.slice(0, equals), part.slice(equals + 1)];
      if (equals < 0 || !NAME.test(name)) {
        return issue(`"${part}" is not a value`, `write a value as name=value, before the colon, and what is said after it: ${who} say: Hello!`);
      }
      if (Object.hasOwn(values, name)) return issue(`${name} is given twice`, `a line gives a value once: keep one ${name}=`);
      if (NUMBER.test(value)) values[name] = Number(value);
      else if (NAME.test(value)) values[name] = value;
      else return issue(`${name}=${value}: "${value}" is neither a number nor a name`, "a value is a number (2, 1.5) or a name in lowercase letters, digits and dashes (middle)");
    }
    lines.push({ line, who, action, values, ...(text === "" ? {} : { text }) });
  });
  return { lines, issues };
}

/**
 * Mistakes as they are shown, in the file's order: each with the file and its line (`file` as it is
 * to be shown), the line as written when the file's `text` is given, what is wrong, and the hint.
 */
export function issuesText(file: string, text: string | undefined, issues: Issue[]): string {
  const lines = text?.split(/\r?\n/);
  const items = issues
    .toSorted((a, b) => a.line - b.line)
    .map(({ line, message, hint }) => `${file}:${line}:${lines?.[line - 1] ? ` ${lines[line - 1]!.trim()}` : ""}\n  ${message}\n  Hint: ${hint}`);
  return `${issues.length} ${issues.length === 1 ? "mistake" : "mistakes"} in ${file}:\n\n${items.join("\n\n")}`;
}

/** Whether `value` is plain: a finite number, a string, or a list or a table of such. */
function isPlain(value: unknown): value is Plain {
  if (typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlain);
  return typeof value === "object" && value !== null && Object.values(value).every(isPlain);
}

/** Where in a value a schema found its issue, as a script names it: a value's name. */
const pathOf = (path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined) => (path ?? []).map((p) => String(typeof p === "object" ? p.key : p)).join(".");

/**
 * The check (AGENTS.md, "A script"): every line's action known, its values what the action takes,
 * and who speaks someone with a voice (`speakers`, the cast's names, or the narrator); then the
 * plugin's own check, of the scenes' settings and its actions against the library. It gives the
 * scenario worked out, or every mistake with its line and a hint. The plugin's check runs only on
 * a script with no mistake before it: it follows the lines in order, so one missing would mislead it.
 */
export async function checkScenario(plugin: ScriptPlugin, script: WrittenScript, library: Library | undefined, speakers: string[]): Promise<Checked> {
  const issues = [...script.issues];
  const actions = [SAY, ...Object.keys(plugin.actions)];
  const acted: SceneActions[] = [];
  for (const scene of script.scenes) {
    const own: ActionLine[] = [];
    for (const { line, who, action, values, text } of scene.lines) {
      const issue = (message: string, hint: string) => void issues.push({ line, message, hint });
      if (action === SAY) {
        const named = Object.keys(values);
        if (named.length > 0) issue(`${SAY} takes no ${listed(named)}`, `write only who says it, and the words: ${who} ${SAY}: Hello!`);
        if (text === undefined) issue(`${who} says nothing`, `write the words after a colon: ${who} ${SAY}: Hello!`);
        if (who !== NARRATOR && !speakers.includes(who)) {
          const near = nearest(who, [NARRATOR, ...speakers]);
          const has = speakers.length > 0 ? `the characters with a voice are ${listed(speakers)}` : "no character has a voice";
          issue(`"${who}" is neither the ${NARRATOR} nor a character with a voice`, `${has}${near ? `: did you mean ${near}?` : ""}`);
        }
        continue;
      }
      const known = Object.hasOwn(plugin.actions, action) ? plugin.actions[action] : undefined;
      if (!known) {
        const near = nearest(action, actions);
        issue(`no action is named "${action}"`, `the actions are ${listed(actions)}${near ? `: did you mean ${near}?` : ""}`);
        continue;
      }
      const hint = `as in: ${known.example}`;
      if (text !== undefined) issue(`${action} takes no words after a colon: only ${SAY} does`, hint);
      const checked = await known.values["~standard"].validate(values);
      if (checked.issues) {
        for (const found of checked.issues) {
          const name = pathOf(found.path);
          const value = Object.hasOwn(values, name) ? `=${values[name]}` : "";
          issue(`${action}${name ? `, ${name}${value}` : ""}: ${found.message}`, hint);
        }
        continue;
      }
      own.push({ line, who, action, values: checked.value });
    }
    acted.push({ line: scene.line, setting: scene.setting, actions: own });
  }
  if (issues.length > 0) return { issues };

  const worked = plugin.check(acted, library);
  if ("issues" in worked) {
    if (worked.issues.length === 0) throw new Error("the plugin's check of the script refused it with no mistake named");
    return { issues: worked.issues };
  }
  // What the plugin gives is the tool's to trust from here on: a scene for each, an action for each, in plain numbers.
  const wrong = (what: string) => new Error(`the plugin's check of the script gave ${what}`);
  if (worked.scenes.length !== acted.length) throw wrong(`${worked.scenes.length} scenes for ${acted.length}`);
  const scenes = script.scenes.map((scene, i): CheckedScene => {
    const { setting, actions: given } = worked.scenes[i]!;
    const where = `scene ${i + 1} (line ${scene.line})`;
    if (!isPlain(setting)) throw wrong(`${where} a setting that is not numbers and names alone`);
    if (given.length !== acted[i]!.actions.length) throw wrong(`${where} ${given.length} actions for ${acted[i]!.actions.length}`);
    let next = 0;
    const lines = scene.lines.map(({ line, who, action, text }): CheckedLine => {
      if (action === SAY) return { line, who, action, text: text! };
      const { values, length } = given[next++]!;
      if (!isPlain(values)) throw wrong(`line ${line} values that are not numbers and names alone`);
      if (!(Number.isFinite(length) && length > 0)) throw wrong(`line ${line} the length ${length}: an action's own length is seconds, above 0`);
      return { line, who, action, values, length };
    });
    return { line: scene.line, setting, lines };
  });
  return { scenes };
}
