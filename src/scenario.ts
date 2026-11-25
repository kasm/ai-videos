// A scenario written as a script (AGENTS.md, "A script"): its lines and blocks as they are read
// (read.ts), and the check, the pass before the voices and the only one that refuses. The grammar,
// what values come to (values.ts), `say` and when things happen (plan.ts) are the tool's; every other
// action is the plugin's, named in its `script` with what it takes.
//
// It needs none of the tool's packages: plugin.ts gives it to the plugins' tests.
import { shownAs, type Span } from "./formula.ts";
import { listed, nearest } from "./names.ts";
import { timeIssues } from "./plan.ts";
import type { Library, Schema } from "./plugin.ts";
import { SAY, isBlock } from "./read.ts";
import type { Shown } from "./shown.ts";
import { valuesTaken, workOut, type WorkedLine } from "./values.ts";

/** The speaker nobody draws: its lines are said in the video's voice. */
export const NARRATOR = "narrator";

/** A moment of something above: where a line or a block begins in place of its block's rule, or what a move arrives at. */
export interface Anchor {
  /** A label of its scene, `prev` (the line or the block just above) or `block` (the block it is in). */
  of: string;
  /** Its start, its end, a share of its length, 0 to 1, or where it says a word (or several in a row). */
  at: "start" | "end" | { share: number } | { word: string };
  /** Seconds after that, or below 0 before it. */
  plus: Span;
}

/** A moment as it is read: what comes after it is a formula, as written (`- beat / 2`), or nothing. */
export type WrittenAnchor = Omit<Anchor, "plus"> & { plus?: string };

/** What a line and a block of a script have alike, as it is read, or worked out (`Placed<Anchor>`). */
export interface Placed<A = WrittenAnchor> {
  /** Its line in the video file, from 1: a block's is its header's. */
  line: number;
  /** What an anchor calls it, once in its scene. */
  label?: string;
  anchor?: A;
}

/** One line of a script: one thing one character does or says. */
export interface ScriptLine extends Placed {
  who: string;
  action: string;
  /** Its values by name, each a formula as written before the colon (formula.ts). */
  values: Record<string, string>;
  /** What follows the colon, to the end of the line, as written; none when nothing does. */
  text?: string;
}

/** A block of a script: lines and blocks each after those above it, or all begun together; or lines all ended together. */
export interface ScriptBlock<L extends Placed<unknown> = ScriptLine> extends Placed<NonNullable<L["anchor"]>> {
  order: "in order" | "together" | "ending together";
  /** It goes on under the rest of the block it is in, and stops where that ends. */
  under?: true;
  /** The lines `&` joins: it has no header, and its line is its first's. */
  joined?: true;
  /** The values set on its header, by name, each a formula as written: they hold for all in it. */
  values?: Record<string, string>;
  /** Worked out, for one in order: the pause between what is in it. */
  pause?: Span;
  items: ScriptItem<L>[];
}

export type ScriptItem<L extends Placed<unknown> = ScriptLine> = L | ScriptBlock<L>;

/** The lines of a script, in the order written, whichever blocks they are in. */
export const linesIn = <L extends Placed<unknown>>(items: ScriptItem<L>[]): L[] => items.flatMap((item) => (isBlock(item) ? linesIn(item.items) : [item]));

/** A value set on the cartoon or a scene: its line in the file, and its formula as written. */
export interface WrittenValue {
  line: number;
  text: string;
}

/** A mistake in a scenario: the line of the video file it is in, the other lines it is between, what is wrong, and how to mend it. */
export interface Issue {
  line: number;
  also?: number[];
  message: string;
  hint: string;
}

/** A scene as written: its line in the file, its own keys (all but `script` and `values`), the values set on it, and its script's lines and blocks. */
export interface WrittenScene {
  line: number;
  setting: Record<string, unknown>;
  values?: Record<string, WrittenValue>;
  items: ScriptItem[];
}

/** A scenario as written: the values set on the whole of it, its scenes, and what could not be read of them. */
export interface WrittenScript {
  values?: Record<string, WrittenValue>;
  scenes: WrittenScene[];
  issues: Issue[];
}

/** One of a plugin's actions, described once: the check, the guide and the prompt come from that. */
export interface Action {
  /** What it does, for a person or a model writing a script. */
  description: string;
  /** One line that uses it, as a script writes it (`pip walk to=middle`): its values pass `values`. */
  example: string;
  /**
   * What values a line gives it, by name, each a number, a name or a construction (formula.ts, Worked).
   * One that its JSON Schema names may be set on any level (AGENTS.md, "Values"). The tool's own
   * (`takes`, `speed`, `arrive`) are not among them.
   */
  values: Schema;
}

/** One of a plugin's constructions, described once: a value worked out from others, `left-of(pip, near)`. */
export interface ConstructionOf {
  /** What it is, and what its parentheses take, for a person or a model writing a script. */
  description: string;
  /** One, as a formula writes it. */
  example: string;
}

/** A line with one of the plugin's actions, as the plugin's check gets it: its values as the action's schema gives them. */
export interface ActionLine {
  line: number;
  who: string;
  action: string;
  values: unknown;
}

/** A scene as the plugin's check gets it: its own keys as written, what is in the plugin's tables worked out, and its lines with one of the plugin's actions, in order. */
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
  /** Its names for numbers, which any value may use (`slow: 0.6`), unless the file sets them otherwise. */
  names?: Record<string, number>;
  /**
   * Its constructions, by name: the tool reads one and works out what is in its parentheses, and the
   * plugin's check says what it comes to, or that it has no answer.
   */
  constructions?: Record<string, ConstructionOf>;
  /**
   * The scene's own keys that are tables of formulas, each by whose it is (`places: { mo: left }`): the
   * check gets each worked out at the scene's level, as a value of an action is.
   */
  tables?: string[];
  /**
   * Its part of the guide to writing a script (guide.ts), in Markdown: what its videos can show, a
   * scene's own keys, and a whole video file as an example. The tool adds how a script's lines are
   * written, the actions and the constructions.
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

/**
 * A line checked: what is said, or one of the plugin's actions in plain numbers with its own length,
 * seconds. An action that is given how long it lasts has that (`takes`), or the moment it arrives at.
 */
export type CheckedLine = Placed<Anchor> & { who: string; action: string } & ({ text: string } | { values: Plain; length: number; takes?: Span; arrive?: Anchor });

/** A scene checked: how it begins, in plain numbers, its pauses (AGENTS.md, "Values"), and its lines and blocks. */
export interface CheckedScene {
  line: number;
  setting: Plain;
  /** Before its first line, between what is in order, and after its last line. */
  lead: Span;
  pause: Span;
  tail: Span;
  items: ScriptItem<CheckedLine>[];
}

/** A value that nothing sets, what it is then, and the lines that take it. */
export interface Default {
  name: string;
  value: string;
  lines: number[];
}

/** A scenario checked, with the defaults it takes, or every mistake found in it. */
export type Checked = { scenes: CheckedScene[]; defaults: Default[] } | { issues: Issue[] };

/** The video's pauses, seconds, where a script sets none (script.ts, settings). */
export interface Timing {
  lead: number;
  gap: number;
  tail: number;
}

/**
 * Mistakes as they are shown, in the file's order: each with the file and its line (`file` as it is
 * to be shown), the line as written when the file's `text` is given, what is wrong, the other lines
 * it is between, and the hint.
 */
export function issuesText(file: string, text: string | undefined, issues: Issue[]): string {
  const lines = text?.split(/\r?\n/);
  const shown = (line: number) => `${file}:${line}:${lines?.[line - 1] ? ` ${lines[line - 1]!.trim()}` : ""}`;
  const items = issues
    .toSorted((a, b) => a.line - b.line)
    .map(({ line, also = [], message, hint }) => [shown(line), `  ${message}`, ...also.map((other) => `  ${shown(other)}`), `  Hint: ${hint}`].join("\n"));
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
 * The check (AGENTS.md, "A script"): every line's action known, its values worked out (values.ts) and
 * what the action takes, who speaks someone with a voice (`speakers`, the cast's names, or the
 * narrator), and a time for everything (plan.ts); then the plugin's own check, of the scenes' settings
 * and its actions against the library. It gives the scenario worked out, with the defaults it took
 * (`timing`, the video's pauses, among them), or every mistake with its line and a hint. The values
 * and the times are tried on a script whose every row reads, and the plugin's check runs only on one
 * with no mistake before it: it follows the lines in the order written, so one missing would mislead it.
 */
export async function checkScenario(plugin: ScriptPlugin, script: WrittenScript, library: Library | undefined, speakers: string[], timing: Timing): Promise<Checked> {
  const issues = [...script.issues];
  const actions = [SAY, ...Object.keys(plugin.actions)];
  const { names = {}, constructions = {}, tables = [] } = plugin;
  const worked = workOut(script, { actions: valuesTaken(plugin.actions), names, constructions, tables, speakers, timing });
  const workedLines = new Map(worked.scenes.flatMap((scene) => linesIn(scene.items)).map((line) => [line.line, line]));
  const acted: SceneActions[] = [];
  for (const [n, scene] of script.scenes.entries()) {
    const own: ActionLine[] = [];
    for (const { line, who, action, values, text } of linesIn(scene.items)) {
      const issue = (message: string, hint: string, also: number[] = []) => void issues.push({ line, ...(also.length > 0 ? { also } : {}), message, hint });
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
      // What has no answer is said where it is worked out: the rest is not held to the schema without it.
      const taken = workedLines.get(line)?.values;
      if (!taken) continue;
      const checked = await known.values["~standard"].validate(Object.fromEntries(Object.entries(taken).map(([name, { value }]) => [name, value])));
      if (checked.issues) {
        for (const found of checked.issues) {
          const name = pathOf(found.path);
          const value = Object.hasOwn(taken, name) ? taken[name] : undefined;
          issue(`${action}${name ? `, ${name}${value ? `=${shownAs(value.value)}` : ""}` : ""}: ${found.message}`, hint, value && value.line !== line ? [value.line] : []);
        }
        continue;
      }
      own.push({ line, who, action, values: checked.value });
    }
    acted.push({ line: scene.line, setting: worked.scenes[n]!.setting, actions: own });
  }
  // A row that does not read may be the one a label or a value is on.
  if (script.issues.length === 0) issues.push(...worked.issues, ...timeIssues(worked.scenes));
  // One line may make a mistake twice, as where it begins and where it arrives: it is said once.
  const once = issues.filter((one, k) => issues.findIndex(({ line, message }) => line === one.line && message === one.message) === k);
  if (once.length > 0) return { issues: once };

  const result = plugin.check(acted, library);
  if ("issues" in result) {
    if (result.issues.length === 0) throw new Error("the plugin's check of the script refused it with no mistake named");
    return { issues: result.issues };
  }
  // What the plugin gives is the tool's to trust from here on: a scene for each, an action for each, in plain numbers.
  const wrong = (what: string) => new Error(`the plugin's check of the script gave ${what}`);
  if (result.scenes.length !== acted.length) throw wrong(`${result.scenes.length} scenes for ${acted.length}`);
  const scenes = worked.scenes.map(({ items, ...scene }, i): CheckedScene => {
    const { setting, actions: did } = result.scenes[i]!;
    const where = `scene ${i + 1} (line ${scene.line})`;
    if (!isPlain(setting)) throw wrong(`${where} a setting that is not numbers and names alone`);
    if (did.length !== acted[i]!.actions.length) throw wrong(`${where} ${did.length} actions for ${acted[i]!.actions.length}`);
    let next = 0;
    const check = (item: ScriptItem<WorkedLine>): ScriptItem<CheckedLine> => {
      if (isBlock(item)) return { ...item, items: item.items.map(check) };
      const { values: _values, text, lasts, ...rest } = item;
      const { line, action } = item;
      if (action === SAY) return { ...rest, text: text! };
      const { values, length } = did[next++]!;
      if (!isPlain(values)) throw wrong(`line ${line} values that are not numbers and names alone`);
      if (!(Number.isFinite(length) && length > 0)) throw wrong(`line ${line} the length ${length}: an action's own length is seconds, above 0`);
      // A speed is so many times its own, so it says how long it lasts too.
      const how = lasts && ("speed" in lasts ? { takes: length / lasts.speed } : lasts);
      return { ...rest, values, length, ...how };
    };
    return { ...scene, setting, items: items.map(check) };
  });
  return { scenes, defaults: worked.defaults };
}
