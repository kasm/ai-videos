// A script's lines and blocks as a plan of what happens at once (times.ts; AGENTS.md, "What happens
// at once"): what each anchor names found, each line on its channels. compile.ts lays the plan with
// the lengths measured; here its shape alone is checked, which no length changes, so that everything
// that has no timing is refused before the voices, with the lines it is between.
import { listed, nearest } from "./names.ts";
import { BLOCK, PREV, SAY, isBlock } from "./read.ts";
import type { Anchor, Issue, Placed, ScriptBlock, ScriptItem, ScriptLine, WrittenScene } from "./scenario.ts";
import { refusals, type Block, type Fitted, type Item, type Moment, type Refusal } from "./times.ts";
import { sharesOf, wordList } from "./words.ts";

/** A line of a script as the plan reads it, written or checked. */
type PlanLine = Placed & { who: string; text?: string | undefined };

interface PlanScene<L extends PlanLine> {
  items: ScriptItem<L>[];
}

/** What a line is to the plan, and how long it lasts, frames: a move is fitted where something fits it. */
export type Lasting = { kind: "voice"; length: number } | { kind: "move"; length: Fitted };

/** The pauses a plan is laid with, seconds, and the frames they are laid in. */
export interface Pauses {
  fps: number;
  /** Before a scene's first line. */
  lead: number;
  /** Between what is in order. */
  gap: number;
  /** After a scene's last line. */
  tail: number;
}

/** A line or a block where it is written: what it is called in the plan, and what `prev` and `block` are to it. */
interface Place<L extends PlanLine> {
  item: ScriptItem<L>;
  name: string;
  /** None for the first of a block. */
  prev: Place<L> | undefined;
  /** None for what is the scene's own. */
  block: Place<L> | undefined;
}

/** A scene's name in the plan. */
const sceneName = (n: number) => `scene ${n + 1}`;

/**
 * A scene's lines and blocks in the order written, each block before what is in it. The lines joined
 * by `&` have no header, so to each of them `prev` is the line above and `block` the block around them.
 */
function placesOf<L extends PlanLine>(scene: PlanScene<L>, n: number): Place<L>[] {
  const places: Place<L>[] = [];
  const add = (items: ScriptItem<L>[], block: Place<L> | undefined, before: Place<L> | undefined) => {
    let prev = before;
    for (const item of items) {
      const place: Place<L> = { item, name: `${sceneName(n)}, ${places.length + 1}`, prev, block };
      places.push(place);
      prev = place;
      if (isBlock(item) && item.joined) prev = add(item.items, block, place.prev);
      else if (isBlock(item)) add(item.items, place, undefined);
    }
    return prev;
  };
  add(scene.items, undefined, undefined);
  return places;
}

/** What `of` names for `place`: something above it in its scene, or the scene itself; none when nothing is called so. */
function named<L extends PlanLine>(of: string, place: Place<L>, places: Place<L>[]): Place<L> | "scene" | undefined {
  if (of === PREV) return place.prev;
  if (of === BLOCK) return place.block ?? "scene";
  return places.slice(0, places.indexOf(place)).find(({ item }) => item.label === of);
}

/**
 * The plan of a scenario: the video, a block in order, of its scenes, each a block in order too.
 * `lasting` says what each line is. `items` has each line's and block's own item of the plan.
 */
export function planOf<L extends PlanLine>(scenes: PlanScene<L>[], { fps, ...pauses }: Pauses, lasting: (line: L) => Lasting) {
  const frames = (seconds: number) => Math.round(seconds * fps);
  const [lead, pause, tail] = [frames(pauses.lead), frames(pauses.gap), frames(pauses.tail)];
  const items = new Map<ScriptItem<L>, Item>();
  const blocks = scenes.map((scene, n): Block => {
    const places = placesOf(scene, n);
    const placeOf = new Map(places.map((place) => [place.item, place]));
    const moment = ({ of, at, plus }: Anchor, place: Place<L>): Moment => {
      const found = named(of, place, places);
      if (!found) throw new Error(`line ${place.item.line} begins by "${of}", and nothing above is called so`);
      const text = found === "scene" || isBlock(found.item) ? "" : (found.item.text ?? "");
      const where = typeof at === "string" ? at : "share" in at ? at.share : (sharesOf(text, at.word)[0] ?? 0);
      return { of: found === "scene" ? sceneName(n) : found.name, at: where, plus: frames(plus) };
    };
    const itemOf = (item: ScriptItem<L>): Item => {
      const place = placeOf.get(item)!;
      const placed = { name: place.name, ...(item.anchor ? { at: moment(item.anchor, place) } : {}) };
      let made: Item;
      if (isBlock(item)) {
        const { order, under } = item;
        made = { kind: "block", ...placed, order, ...(order === "in order" ? { pause } : {}), ...(under ? { cut: true } : {}), items: item.items.map(itemOf) };
      } else {
        const { kind, length } = lasting(item);
        // A character has one voice, and for now its actions are one channel too: one at a time.
        made = { kind, ...placed, on: [`${item.who} ${kind === "voice" ? "voice" : "action"}`], length };
      }
      items.set(item, made);
      return made;
    };
    return { kind: "block", name: sceneName(n), order: "in order", items: scene.items.map(itemOf), lead, pause, tail };
  });
  const video: Block = { kind: "block", order: "in order", items: blocks };
  return { video, scenes: blocks, items };
}

/** A line or a block, as a message names it. */
const nameOf = (item: ScriptItem) => (!isBlock(item) ? `line ${item.line}` : item.joined ? `the lines joined at line ${item.line}` : `the block of line ${item.line}`);

/** What is wrong with the labels and the anchors of a scene: a label given twice, and an anchor that names nothing above it, or no word of it. */
function nameIssues(scenes: WrittenScene[], n: number): Issue[] {
  const issues: Issue[] = [];
  const places = placesOf(scenes[n]!, n);
  const labelled = (label: string) => places.filter(({ item }) => item.label === label).map(({ item }) => item);
  places.forEach((place, k) => {
    const { item } = place;
    const { line, label, anchor } = item;
    const first = label === undefined ? undefined : labelled(label)[0]!;
    if (first && first !== item) issues.push({ line, also: [first.line], message: `${label} is the label of line ${first.line} already`, hint: "a label is given once in a scene: call this one something else" });
    if (!anchor) return;
    const { of, at } = anchor;
    const found = named(of, place, places);
    if (!found) {
      if (of === PREV) return void issues.push({ line, message: "there is no prev: it is the first of its block", hint: `begin it by the block it is in (@ ${BLOCK}.start + 1s), or by a label above` });
      const [below] = labelled(of);
      const elsewhere = scenes.flatMap((scene, m) => (m === n ? [] : placesOf(scene, m))).find((other) => other.item.label === of)?.item;
      if (below === item) issues.push({ line, message: `"${of}" is its own label`, hint: "it begins by something above it: another label, or prev, the line just above" });
      else if (below) issues.push({ line, also: [below.line], message: `"${of}" is below, at line ${below.line}: a line begins by what is above it`, hint: `write line ${below.line} above this one, or begin this one by something else` });
      else if (elsewhere) issues.push({ line, also: [elsewhere.line], message: `"${of}" is in another scene, at line ${elsewhere.line}`, hint: "a line begins by something of its own scene" });
      else {
        const above = places.slice(0, k).flatMap((other) => other.item.label ?? []);
        const near = nearest(of, [...above, PREV, BLOCK]);
        const labels = above.length > 0 ? `labelled above: ${listed(above)}` : "no line above has a label";
        issues.push({ line, message: `nothing above is called "${of}"`, hint: `${labels}; ${PREV} is the line just above, and ${BLOCK} the block it is in${near ? `: did you mean ${near}?` : ""}` });
      }
    } else if (typeof at !== "string" && "word" in at) {
      const told = found === "scene" ? undefined : found.item;
      if (!told || isBlock(told)) return void issues.push({ line, ...(told ? { also: [told.line] } : {}), message: `${told ? nameOf(told) : "the scene"} has no words: a line that is said has`, hint: `label the line in it that says "${at.word}"` });
      if (told.text === undefined) return void issues.push({ line, also: [told.line], message: `line ${told.line} says nothing, so it has no words`, hint: "begin by its start, its end or a share of it" });
      const times = sharesOf(told.text, at.word).length;
      const near = nearest(wordList(at.word)[0] ?? "", wordList(told.text));
      if (times === 0) issues.push({ line, also: [told.line], message: `line ${told.line} does not say "${at.word}"`, hint: `write a word as the line says it${near ? `: did you mean ${near}?` : ""}` });
      if (times > 1) issues.push({ line, also: [told.line], message: `line ${told.line} says "${at.word}" ${times} times`, hint: `write the words after it too, until it is one place: ${of}.word(${at.word} ...)` });
    }
  });
  return issues;
}

/**
 * What is under the rest with nothing to be under, so that it is never heard: a block whose lines
 * are all under, which waits for nothing, and what is under last in a block in order, which would
 * begin when the block ends.
 */
function underIssues(scene: WrittenScene): Issue[] {
  const issues: Issue[] = [];
  const isUnder = (item: ScriptItem) => isBlock(item) && item.under === true;
  const look = (items: ScriptItem[], order: ScriptBlock["order"], block: string, line: number) => {
    const rest = items.findLastIndex((item) => !isUnder(item));
    if (items.length > 0 && rest < 0) issues.push({ line, message: `everything in ${block} is under the rest, and there is no rest`, hint: "write the lines they are under in it too, or leave out under:" });
    else if (order === "in order") {
      for (const item of items.slice(rest + 1).filter(({ anchor }) => !anchor)) {
        issues.push({ line: item.line, message: `nothing comes after this in ${block}, so there is nothing for it to be under`, hint: "write the lines it is under below it, at its own margin, or join it to the line above with &" });
      }
    }
    for (const item of items) if (isBlock(item)) look(item.items, item.order, nameOf(item), item.line);
  };
  look(scene.items, "in order", "the scene", scene.line);
  return issues;
}

/** Why the plan has no timing (times.ts), each reason as a mistake of the lines it is between. */
function refusalIssues(scenes: WrittenScene[]): Issue[] {
  // No length changes what is refused.
  const { video, scenes: blocks, items } = planOf(scenes, { fps: 1, lead: 0, gap: 0, tail: 0 }, ({ action }) =>
    action === SAY ? { kind: "voice", length: 1 } : { kind: "move", length: { own: 1, least: 1, most: 1 } },
  );
  const written = new Map([...items].map(([item, made]): [Item, ScriptItem] => [made, item]));
  const around = new Map<Item, Block>();
  const look = (block: Block) => {
    for (const item of block.items) {
      around.set(item, block);
      if (item.kind === "block") look(item);
    }
  };
  look(video);
  const told = (item: Item) => {
    const own = written.get(item);
    if (own) return { line: own.line, name: nameOf(own), anchored: own.anchor !== undefined };
    return { line: scenes[blocks.indexOf(item as Block)]!.line, name: "the scene", anchored: false };
  };
  const issueOf = (refusal: Refusal): Issue => {
    if (refusal.why === "held") {
      const [own, by] = [written.get(refusal.item) as ScriptLine, told(refusal.by)];
      return {
        line: own.line,
        also: [by.line],
        message: `${own.who} is busy with ${by.name}, which goes on under the rest to the end of the block both are in`,
        hint: "write it after that block, or in the same under:, below that line",
      };
    }
    if (refusal.why === "cut") {
      const own = written.get(refusal.item) as ScriptLine;
      let under = around.get(refusal.item)!;
      while (!under.cut) under = around.get(under)!;
      return { line: own.line, also: [told(under).line], message: `an action is never under the rest: cut, it would leave ${own.who} where only the voices know`, hint: "write it beside the under: block, not in it" };
    }
    if (refusal.why === "below") throw new Error(`line ${told(refusal.item).line} begins by "${refusal.name}", and nothing above is called so`);
    const chain = refusal.items.map(told);
    const waits = chain.map(({ name }, i) => `${name} waits for ${chain[(i + 1) % chain.length]!.name}`);
    // The one to mend is the anchored one, the last written of them.
    const { line } = chain.filter(({ anchored }) => anchored).toSorted((a, b) => a.line - b.line).at(-1) ?? chain[0]!;
    const also = [...new Set(chain.map((one) => one.line))].filter((one) => one !== line).sort((a, b) => a - b);
    return { line, also, message: `it goes round: ${listed(waits)}`, hint: "begin it by the start, a share or a word of something above, or write it after the block" };
  };
  return refusals(video).map(issueOf);
}

/** What has no timing in a script, whatever its voices turn out to last: every mistake, with the lines it is between. */
export function timeIssues(scenes: WrittenScene[]): Issue[] {
  const names = scenes.flatMap((_, n) => nameIssues(scenes, n));
  // With an anchor that names nothing there is no plan to try.
  return [...names, ...scenes.flatMap(underIssues), ...(names.length > 0 ? [] : refusalIssues(scenes))];
}
