// What a script's values come to (AGENTS.md, "Values"): each is found on the nearest level that sets
// it, the line's own, its blocks', its scene's, the cartoon's, and above them the plugin's names and
// the video's pauses, and its formula is worked out for the line that reads it. So a formula set on
// the cartoon holds for all in it, by what its names stand for there. A line's length is measured
// later: what is worked out from one stays a sum of lengths here.
//
// It needs none of the tool's packages, as scenario.ts: plugin.ts gives both to the plugins' tests.
import { Wrong, calculate, exact, minus, namesIn, readFormula, spanOf, type Amount, type Formula, type Span } from "./formula.ts";
import { momentIssue, named, nameOf, placesOf, unnamed, type Place } from "./labels.ts";
import { listed, nearest } from "./names.ts";
import { SAY, SET, isBlock } from "./read.ts";
import { NARRATOR, linesIn, type Action, type Anchor, type Default, type Issue, type Placed, type ScriptItem, type ScriptLine, type Timing, type WrittenScript, type WrittenValue } from "./scenario.ts";

/** The tool's own values that are a block's or a scene's: seconds. */
export const PAUSES = ["pause", "lead", "tail"] as const;
/** The tool's own values that say how long an action lasts, one of them: seconds, times its own speed, or a moment it arrives at. */
export const LENGTHS = ["takes", "speed", "arrive"] as const;
/** The tool's own values: no action of a plugin's takes one of these names. */
export const OWN: readonly string[] = [...PAUSES, ...LENGTHS];

/** How long an action lasts, when it is given: seconds, times its own speed, or the moment it arrives at. */
export type Lasts = { takes: Span } | { speed: number } | { arrive: Anchor };

/** A line with its values worked out. */
export interface WorkedLine extends Placed<Anchor> {
  who: string;
  action: string;
  text?: string;
  /** What its action is given, by name, and the line of the file that sets it; none when one of them has no answer. */
  values?: Record<string, { value: number | string; line: number }>;
  /** None for what is said, and for an action that is given no length. */
  lasts?: Lasts;
}

/** A scene with its values worked out. */
export interface WorkedScene {
  line: number;
  lead: Span;
  pause: Span;
  tail: Span;
  items: ScriptItem<WorkedLine>[];
}

/** What a script is worked out with. */
export interface Given {
  /** The values each action takes, by name, each with its default when the action gives one. */
  actions: Record<string, Record<string, { default?: unknown }>>;
  /** The plugin's names for numbers. */
  names: Record<string, number>;
  /** Who has a voice. */
  speakers: string[];
  /** The video's pauses, seconds. */
  timing: Timing;
}

/** The values each action takes, by name, as its JSON Schema has them: none for a schema that names none. */
export function valuesTaken(actions: Record<string, Action>): Given["actions"] {
  return Object.fromEntries(
    Object.entries(actions).map(([name, { values }]) => {
      const { properties } = values["~standard"].jsonSchema.input({ target: "draft-2020-12" });
      return [name, (properties ?? {}) as Record<string, { default?: unknown }>];
    }),
  );
}

/** The values a line writes, with no level around it, as an action's schema takes them: its own numbers and names. */
export function plainValues(values: Record<string, string>): Record<string, number | string> {
  const { scenes, issues } = workOut({ scenes: [{ line: 1, setting: {}, items: [{ line: 1, who: "a", action: "b", values }] }], issues: [] }, { actions: {}, names: {}, speakers: [], timing: { lead: 0, gap: 0, tail: 0 } });
  if (issues.length > 0) throw new Error(issues[0]!.message);
  const [line] = linesIn(scenes[0]!.items);
  return Object.fromEntries(Object.entries(line!.values ?? {}).map(([name, { value }]) => [name, value]));
}

/** What a formula comes to: an amount, a name that stands for no value (a mark), or a moment. */
type Worth = { is: "amount"; amount: Amount } | { is: "name"; name: string; by: Found } | { is: "moment"; moment: Anchor };

/** The values set on one level, and the level around it. */
interface Level {
  values: Record<string, WrittenValue>;
  around: Level | undefined;
}

/** Where a value is worked out: on a level, for a line's character and action, with what its labels name there. */
interface Cell {
  level: Level;
  who?: string;
  action?: string;
  place?: Place<ScriptLine>;
  /** What has been worked out here. */
  known: Map<string, Worth>;
}

/** A value found: the name it is set by (`walk.speed`), and where. */
interface Found {
  key: string;
  set: WrittenValue;
}

/** A mistake in a value, at the line of the file that sets it. */
class Refused extends Error {
  readonly issue: Issue;
  constructor(issue: Issue) {
    super(issue.message);
    this.issue = issue;
  }
}

/** What is written after an anchor's moment has no name: this in its place. */
const AFTER = "@";
const valueOf = ({ key, set }: Found) => (key === AFTER ? `"${set.text}"` : `${key}=${set.text}`);
const refused = (found: Found, message: string, hint: string, also: number[] = []) => new Refused({ line: found.set.line, also, message, hint });
const IN_SECONDS = "write it in seconds: 0.5s";

/** The plugin's and the video's: the level around the cartoon. */
const outermost = ({ names, timing }: Given): Level => ({
  values: Object.fromEntries(
    Object.entries({ ...Object.fromEntries(Object.entries(names).map(([name, number]) => [name, `${number}`])), pause: `${timing.gap}s`, lead: `${timing.lead}s`, tail: `${timing.tail}s` }).map(([name, text]) => [name, { line: 0, text }]),
  ),
  around: undefined,
});

/** The values set on a row, each with the row's line. */
const ofRow = (values: Record<string, string> = {}, line: number) => Object.fromEntries(Object.entries(values).map(([name, text]) => [name, { line, text }]));

/** The value a name has on the nearest level; of one level, the character's, the action's, then everything's. */
function find(name: string, { level, who, action }: Cell): (Found & { on: Level }) | undefined {
  const keys = [...(who === undefined ? [] : [`${who}.${name}`]), ...(action === undefined ? [] : [`${action}.${name}`]), name];
  for (let on: Level | undefined = level; on; on = on.around) {
    const key = keys.find((one) => Object.hasOwn(on!.values, one));
    if (key !== undefined) return { key, set: on.values[key]!, on };
  }
  return undefined;
}

/** How an action is told to last, on the nearest level that says: the character's, the action's, then everything's. One of the three, or several, which is a mistake. */
function lengthsOf({ level, who, action }: Cell): Found[] {
  for (let on: Level | undefined = level; on; on = on.around) {
    for (const whose of [`${who}.`, `${action}.`, ""]) {
      const found = LENGTHS.map((name) => `${whose}${name}`).filter((key) => Object.hasOwn(on!.values, key));
      if (found.length > 0) return found.map((key) => ({ key, set: on!.values[key]! }));
    }
  }
  return [];
}

/**
 * A script's values worked out: every line's, every block's and every scene's, with the defaults taken
 * and every mistake, each at the line of the file that sets the value, and the lines that read it. The
 * rest is worked out as if a value with a mistake had none.
 */
export function workOut(script: WrittenScript, given: Given): { scenes: WorkedScene[]; defaults: Default[]; issues: Issue[] } {
  const issues: Issue[] = [];
  /** A mistake, once: the lines that read it are gathered. */
  const report = ({ line, also = [], message, hint }: Issue) => {
    const others = also.filter((other) => other !== line && other > 0);
    const same = issues.find((one) => one.line === line && one.message === message);
    const all = [...new Set([...(same?.also ?? []), ...others])].sort((a, b) => a - b);
    if (same) Object.assign(same, all.length > 0 ? { also: all } : {});
    else issues.push({ line, ...(all.length > 0 ? { also: all } : {}), message, hint });
  };
  /** What `work` gives; a mistake in it is said, with the line that reads the value. */
  const attempt = <T>(line: number, work: () => T): T | undefined => {
    try {
      return work();
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      report({ ...e.issue, also: [...(e.issue.also ?? []), line] });
      return undefined;
    }
  };
  const defaults = new Map<string, Default>();
  const byDefault = (name: string, value: string, line: number) => {
    const key = `${name} ${value}`;
    const taken = defaults.get(key) ?? { name, value, lines: [] };
    defaults.set(key, { ...taken, lines: [...taken.lines, line] });
  };

  const base = outermost(given);
  const cartoon: Level = { values: script.values ?? {}, around: base };
  const all = script.scenes.map((scene, n) => placesOf(scene, n));
  const cellOf = new Map<ScriptItem, Cell>();

  /** Every name that has a value for a cell, for a hint. */
  const namesFor = ({ level, who, action }: Cell) => {
    const names: string[] = [];
    for (let on: Level | undefined = level; on; on = on.around) {
      for (const key of Object.keys(on.values)) {
        const [whose, name] = key.includes(".") ? key.split(".") : [undefined, key];
        if (whose === undefined || whose === who || whose === action) names.push(name!);
      }
    }
    return [...new Set(names)];
  };

  /** How many times a cell has the length of what `of` names: a line that is said, or an action that is given its length. */
  const lengthOf = (of: string, found: Found, { place }: Cell): Amount => {
    const n = all.findIndex((places) => place !== undefined && places.includes(place));
    if (!place) throw refused(found, `${valueOf(found)}: no line is above the scene's own values`, "set it on a block, or on a line");
    const target = named(of, place, all[n]!);
    if (!target) {
      const issue = unnamed(of, place, all, n, "reads");
      throw new Refused(found.set.line === issue.line ? issue : { ...issue, line: found.set.line, also: [issue.line, ...(issue.also ?? [])], message: `${valueOf(found)}: for line ${issue.line}, ${issue.message}` });
    }
    const whose = target === "scene" ? "the scene" : nameOf(target.item);
    const label = "a line that is said, or an action given its length (takes, speed), has a length that is known before everything has its place: label one of those";
    if (target === "scene" || isBlock(target.item)) throw refused(found, `${valueOf(found)}: how long ${whose} lasts is known only once all in it has its place`, label, target === "scene" ? [] : [target.item.line]);
    const { line, action } = target.item;
    const told = lengthsOf(cellOf.get(target.item)!);
    if (action !== SAY && !told.some(({ key }) => !key.endsWith("arrive"))) {
      throw refused(found, `${valueOf(found)}: how long ${whose} lasts is ${told.length > 0 ? "what it needs to arrive" : "its own, or what the words beside it take"}, known only once they have their place`, label, [line]);
    }
    return { unit: "s", number: 0, lengths: new Map([[line, 1]]) };
  };

  /** What a name comes to in a cell; undefined when no level sets it. `through` is what reads it, the outer first. */
  const worthOf = (name: string, cell: Cell, through: Found[] = []): Worth | undefined => {
    const known = cell.known.get(name);
    if (known) return known;
    const found = find(name, cell);
    if (!found) return undefined;
    const from = through.findIndex(({ set }) => set === found.set);
    if (from >= 0) {
      const round = through.slice(from);
      const first = round.indexOf(round.toSorted((a, b) => a.set.line - b.set.line || a.key.localeCompare(b.key))[0]!);
      const chain = [...round.slice(first), ...round.slice(0, first)];
      const line = Math.max(...chain.map(({ set }) => set.line));
      throw new Refused({ line, also: chain.map(({ set }) => set.line), message: `the values go round: ${listed(chain.map(({ key, set }) => `${key} is ${set.text}`))}`, hint: chain.length > 1 ? "give one of them a value that reads none of the others" : "a value does not read itself: give one of the two another name" });
    }
    const worth = work(readFormula(found.set.text), found, cell, [...through, found]);
    cell.known.set(name, worth);
    return worth;
  };

  /** A formula's number, in a cell. */
  const amountOf = (formula: Formula, found: Found, cell: Cell, through: Found[]): Amount => {
    const worth = work(formula, found, cell, through);
    if (worth.is === "amount") return worth.amount;
    if (worth.is === "moment") throw refused(found, `${valueOf(found)}: a moment of a line is no number`, "how long a line lasts is a.length; only arrive takes a moment, by itself");
    const { name, by } = worth;
    const near = nearest(name, namesFor(cell));
    const meant = near ? `did you mean ${near}?` : `set it on the cartoon, a scene or a block (${name}: 2), or write a number`;
    throw refused(by, `${valueOf(by)}: no value is called "${name}"`, `${name.includes("-") ? "a minus has a space on each side; " : ""}${meant}`, [found.set.line]);
  };

  const work = (formula: Formula, found: Found, cell: Cell, through: Found[]): Worth => {
    if (formula.is === "number") return { is: "amount", amount: { unit: formula.unit, number: formula.number, lengths: new Map() } };
    if (formula.is === "name") return worthOf(formula.name, cell, through) ?? { is: "name", name: formula.name, by: found };
    if (formula.is === "length") return { is: "amount", amount: lengthOf(formula.of, found, cell) };
    if (formula.is === "moment") {
      const { plus, ...moment } = formula.moment;
      return { is: "moment", moment: { ...moment, plus: plus === undefined ? 0 : afterOf(plus, found, cell, through) } };
    }
    if (formula.is === "minus") return { is: "amount", amount: minus(amountOf(formula.of, found, cell, through)) };
    const [left, right] = [amountOf(formula.left, found, cell, through), amountOf(formula.right, found, cell, through)];
    try {
      return { is: "amount", amount: calculate(formula.is, left, right) };
    } catch (e) {
      throw e instanceof Wrong ? refused(found, `${valueOf(found)}: ${e.message}`, e.hint) : e;
    }
  };

  /** Seconds, and the lines' lengths they are worked out from. */
  const secondsIn = (amount: Amount, found: Found): Span => {
    if (amount.unit !== "s") throw refused(found, `${valueOf(found)}: it is a number, and not a time`, IN_SECONDS);
    return spanOf(amount);
  };

  /** The seconds after a moment, or before it, from what is written after it. */
  const afterOf = (plus: string, found: Found, cell: Cell, through: Found[]): Span => {
    const amount = amountOf(readFormula(plus), found, cell, through);
    if (amount.unit !== "s") throw refused(found, `"${plus}" is not a time`, `write it in seconds: ${/^[-+]\s*[\d.]+$/.test(plus) ? `${plus}s` : "- 0.5s"}`);
    return secondsIn(amount, found);
  };

  /** A pause, as the nearest level sets it. */
  const pauseOf = (name: (typeof PAUSES)[number], cell: Cell, line: number, taken = true): Span => {
    const found = find(name, cell)!;
    if (found.on === base && taken) byDefault(name, found.set.text, line);
    const span = attempt(line, () => {
      const span = secondsIn(amountOf(readFormula(found.set.text), found, cell, [found]), found);
      if (typeof span === "number" && span < 0) throw refused(found, `${valueOf(found)}: it is less than 0`, IN_SECONDS);
      return span;
    });
    return span ?? 0;
  };

  /** An action's own values, by name: what any level sets of those it takes, and what its line has besides. */
  const takenBy = (line: ScriptLine, cell: Cell): Pick<WorkedLine, "values"> => {
    const takes = Object.hasOwn(given.actions, line.action) ? given.actions[line.action]! : {};
    const values: NonNullable<WorkedLine["values"]> = {};
    let right = true;
    for (const name of new Set([...Object.keys(takes), ...Object.keys(line.values)])) {
      if (OWN.includes(name)) continue;
      const found = find(name, cell);
      if (!found) {
        if (takes[name]?.default !== undefined) byDefault(`${line.action} ${name}`, JSON.stringify(takes[name].default), line.line);
        continue;
      }
      const value = attempt(line.line, () => {
        const worth = worthOf(name, cell)!;
        if (worth.is === "name") return worth.name;
        if (worth.is === "moment") throw refused(found, `${valueOf(found)}: only arrive takes a moment of a line`, `${name} is a number or a name`);
        const { unit, number, lengths } = worth.amount;
        if (lengths.size > 0) throw refused(found, `${valueOf(found)}: ${name} is known before anything is spoken, and a line's length is not`, "only a time reads a line's length: takes, pause, or an anchor");
        if (unit === "s") throw refused(found, `${valueOf(found)}: ${name} is no time, and has no unit`, `write it without the s`);
        return exact(number);
      });
      if (value === undefined) right = false;
      else values[name] = { value, line: found.set.line };
    }
    return right ? { values } : {};
  };

  /** How long an action lasts, when it is given. */
  const lastsOf = (line: ScriptLine, cell: Cell): Pick<WorkedLine, "lasts"> => {
    const told = lengthsOf(cell);
    const [found, another] = told;
    if (!found) {
      byDefault("speed", "1, or what the words beside it take", line.line);
      return {};
    }
    const lasts = attempt(line.line, (): Lasts => {
      if (another) {
        const names = told.map(({ key }) => key);
        throw refused(told.toSorted((a, b) => b.set.line - a.set.line)[0]!, `${line.who} ${line.action} is given ${names.length > 2 ? listed(names) : `both ${listed(names)}`}, and each says how long it lasts`, "keep one of them on this level: the others are worked out from it", told.map(({ set }) => set.line));
      }
      const name = found.key.split(".").at(-1) as (typeof LENGTHS)[number];
      if (name === "arrive") {
        const worth = worthOf(name, cell)!;
        if (worth.is !== "moment") throw refused(found, `${valueOf(found)}: it is no moment of something above`, "an action arrives at a moment: arrive=a.end, arrive=a.word(mole) - 0.5s");
        const issue = momentIssue(worth.moment, cell.place!, all, nOf(cell), "arrives");
        if (issue) throw new Refused(found.set.line === issue.line ? issue : { ...issue, line: found.set.line, also: [issue.line, ...(issue.also ?? [])] });
        return { arrive: worth.moment };
      }
      const amount = amountOf(readFormula(found.set.text), found, cell, [found]);
      if (name === "takes") {
        const takes = secondsIn(amount, found);
        if (typeof takes === "number" && takes <= 0) throw refused(found, `${valueOf(found)}: an action takes more than 0`, IN_SECONDS);
        return { takes };
      }
      if (amount.lengths.size > 0) throw refused(found, `${valueOf(found)}: a speed is known before anything is spoken, and a line's length is not`, "give it its time: takes=a.length / 2");
      if (amount.unit === "s") throw refused(found, `${valueOf(found)}: it is a time, and a speed is so many times its own`, "a speed is a number: 0.5 is half its own speed, and 2 twice; its time is takes=2s");
      const speed = exact(amount.number);
      if (speed <= 0) throw refused(found, `${valueOf(found)}: a speed is more than 0`, "0.5 is half its own speed, and 2 twice");
      return { speed };
    });
    // One that has no answer is given all the same: the times are tried as they would be with it.
    return { lasts: lasts ?? { speed: 1 } };
  };
  const nOf = ({ place }: Cell) => all.findIndex((places) => places.includes(place!));

  /** Where an anchor's seconds are worked out: joined lines have their first one's. */
  const anchorCell = (item: ScriptItem): Cell => (isBlock(item) && item.joined ? anchorCell(item.items[0]!) : cellOf.get(item)!);
  const anchored = (item: ScriptItem): Placed<Anchor> => {
    const { line, label, anchor } = item;
    const placed = { line, ...(label === undefined ? {} : { label }) };
    if (!anchor) return placed;
    const { plus, ...moment } = anchor;
    if (plus === undefined) return { ...placed, anchor: { ...moment, plus: 0 } };
    const found = { key: AFTER, set: { line, text: plus } };
    return { ...placed, anchor: { ...moment, plus: attempt(line, () => afterOf(plus, found, anchorCell(item), [])) ?? 0 } };
  };

  const scenes = script.scenes.map((scene, n): WorkedScene => {
    const placeOf = new Map(all[n]!.map((place) => [place.item, place]));
    /** Each line's and block's cell, those above first. */
    const enter = (items: ScriptItem[], around: Level) => {
      for (const item of items) {
        const level: Level = isBlock(item) && item.joined ? around : { values: ofRow(item.values, item.line), around };
        cellOf.set(item, { level, ...(isBlock(item) ? {} : { who: item.who, action: item.action }), place: placeOf.get(item)!, known: new Map() });
        if (isBlock(item)) enter(item.items, level);
      }
    };
    const own: Level = { values: scene.values ?? {}, around: cartoon };
    enter(scene.items, own);
    const worked = (item: ScriptItem): ScriptItem<WorkedLine> => {
      const cell = cellOf.get(item)!;
      const placed = anchored(item);
      if (isBlock(item)) {
        const { order, under, joined, items } = item;
        // One thing in order has no pause to take.
        const pause = order === "in order" ? { pause: pauseOf("pause", cell, item.line, items.length > 1) } : {};
        return { ...placed, order, ...(under ? { under } : {}), ...(joined ? { joined } : {}), ...pause, items: items.map(worked) };
      }
      const { who, action, text } = item;
      const line = { ...placed, who, action, ...(text === undefined ? {} : { text }) };
      if (action === SAY) return line;
      for (const name of PAUSES.filter((name) => Object.hasOwn(item.values, name))) {
        report({ line: item.line, message: `${action} takes no ${name}`, hint: name === "pause" ? "a pause is a block's: set it on its header, or begin the next row later (@ prev.end + 1s)" : `${name} is a scene's: set it on the scene or the cartoon` });
      }
      return { ...line, ...takenBy(item, cell), ...lastsOf(item, cell) };
    };
    const cell: Cell = { level: own, known: new Map() };
    return { line: scene.line, lead: pauseOf("lead", cell, scene.line), pause: pauseOf("pause", cell, scene.line, scene.items.length > 1), tail: pauseOf("tail", cell, scene.line), items: scene.items.map(worked) };
  });
  issues.push(...setIssues(script, given, base, worthOf).filter((one) => !issues.some(({ line, message }) => line === one.line && message === one.message)));
  return { scenes, defaults: [...defaults.values()], issues };
}

/**
 * What is wrong with the values set on the cartoon, the scenes and the blocks, whether or not a line
 * reads them: a name nothing reads, whose no character or action is, or that is another level's; and
 * values that go round.
 */
function setIssues(script: WrittenScript, given: Given, base: Level, worthOf: (name: string, cell: Cell) => Worth | undefined): Issue[] {
  const issues: Issue[] = [];
  const read = new Set<string>();
  const reads = (text: string) => namesIn(readFormula(text)).forEach((name) => read.add(name));
  const look = (item: ScriptItem) => {
    if (item.anchor?.plus !== undefined) reads(item.anchor.plus);
    for (const text of Object.values(item.values ?? {})) reads(text);
    if (isBlock(item)) item.items.forEach(look);
  };
  const scenes = script.scenes.map((scene) => ({ ...scene, values: scene.values ?? {} }));
  for (const { text } of [script, ...scenes].flatMap(({ values }) => Object.values(values ?? {}))) reads(text);
  scenes.forEach((scene) => scene.items.forEach(look));

  const taken = Object.values(given.actions).flatMap((values) => Object.keys(values));
  const actions = [SAY, ...Object.keys(given.actions)];
  const people = [NARRATOR, ...given.speakers, ...scenes.flatMap((scene) => linesIn(scene.items)).map(({ who }) => who)];

  const set = (values: Record<string, WrittenValue>, level: "cartoon" | "scene" | "block", around: Level): Level => {
    const own: Level = { values, around };
    for (const [key, value] of Object.entries(values)) {
      const issue = (message: string, hint: string) => void issues.push({ line: value.line, message, hint });
      if (!SET.test(key)) {
        issue(`"${key}" is not a value's name`, "a name is lowercase letters, digits and dashes, and for a character or an action its name and a dot before it: walk.speed");
        continue;
      }
      const [whose, name] = key.includes(".") ? (key.split(".") as [string, string]) : [undefined, key];
      const ours = OWN.includes(name);
      if (whose !== undefined && !people.includes(whose) && !actions.includes(whose)) {
        const near = nearest(whose, [...new Set([...people, ...actions])]);
        issue(`"${whose}" is neither a character nor an action`, `a value is for everything (${name}), for a character (pip.${name}) or an action (${actions.at(-1)}.${name})${near ? `: did you mean ${near}?` : ""}`);
      } else if (whose !== undefined && (PAUSES as readonly string[]).includes(name)) issue(`${name} is nobody's own: it is the same for everyone`, `write ${name}`);
      else if (whose === SAY && ours) issue(`${SAY} takes no ${name}: a voice lasts as long as its words`, `${name} is an action's: leave it out`);
      else if (level === "block" && (name === "lead" || name === "tail")) issue(`${name} is a scene's, and not a block's`, "set it on the scene or the cartoon; a block has a pause");
      else if (!ours && !taken.includes(name) && !read.has(name)) {
        const near = nearest(name, [...OWN, ...taken, ...read]);
        issue(`nothing reads "${name}"`, `a value is one of the tool's (${OWN.join(", ")}), one an action takes${taken.length > 0 ? ` (${[...new Set(taken)].join(", ")})` : ""}, or one that a formula reads${near ? `: did you mean ${near}?` : ""}`);
      }
      // Values that go round are refused though nothing reads them; whatever else is wrong with one is said where it is read.
      try {
        worthOf(name, { level: own, ...(whose === undefined ? {} : people.includes(whose) ? { who: whose } : { action: whose }), known: new Map() });
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        if (e.issue.message.startsWith("the values go round")) issues.push({ ...e.issue, also: [...new Set(e.issue.also)].filter((line) => line !== e.issue.line).sort((a, b) => a - b) });
      }
    }
    return own;
  };
  const blocks = (items: ScriptItem[], around: Level) => {
    for (const item of items) if (isBlock(item)) blocks(item.items, item.joined ? around : set(ofRow(item.values, item.line), "block", around));
  };
  const cartoon = set(script.values ?? {}, "cartoon", base);
  for (const scene of scenes) blocks(scene.items, set(scene.values, "scene", cartoon));
  const once = new Map(issues.map(({ also, ...issue }) => [`${issue.line} ${issue.message}`, also && also.length > 0 ? { ...issue, also } : issue]));
  return [...once.values()];
}
