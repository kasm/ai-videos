// A script's lines and blocks as a plan of what happens at once (times.ts; AGENTS.md, "What happens
// at once"): what each anchor names found, each line on its channels. compile.ts lays the plan with
// the lengths measured; here its shape alone is checked, which no length changes, so that everything
// that has no timing is refused before the voices, with the lines it is between.
import type { Span } from "./formula.ts";
import { momentIssue, nameOf, named, placesOf, sceneName, type Place } from "./labels.ts";
import { listed } from "./names.ts";
import { SAY, isBlock } from "./read.ts";
import type { Anchor, Issue, Placed, ScriptBlock, ScriptItem } from "./scenario.ts";
import { refusals, type Block, type Fitted, type Item, type Moment, type Refusal } from "./times.ts";
import type { WorkedLine, WorkedScene } from "./values.ts";
import { sharesOf } from "./words.ts";

/** A line of a script as the plan reads it, worked out or checked. */
type PlanLine = Placed<Anchor> & { who: string; text?: string | undefined };

interface PlanScene<L extends PlanLine> {
  lead: Span;
  pause: Span;
  tail: Span;
  items: ScriptItem<L>[];
}

/** What a line is to the plan, and how long it lasts, frames: a move given no length is fitted where something fits it, or to the moment it arrives at. */
export type Lasting = { kind: "voice"; length: number } | { kind: "move"; length: number } | { kind: "move"; length: Omit<Fitted, "arrive">; arrive?: Anchor | undefined };

/**
 * The plan of a scenario: the video, a block in order, of its scenes, each a block in order too.
 * `lasting` says what each line is, and `frames` what the scenario's seconds are on the video's
 * frames. `items` has each line's and block's own item of the plan.
 */
export function planOf<L extends PlanLine>(scenes: PlanScene<L>[], frames: (seconds: Span) => number, lasting: (line: L) => Lasting) {
  /** A pause that comes to less than 0, once the lengths it reads are known, is none. */
  const pauseOf = (seconds: Span) => Math.max(0, frames(seconds));
  const items = new Map<ScriptItem<L>, Item>();
  const blocks = scenes.map((scene, n): Block => {
    const places = placesOf(scene, n);
    const placeOf = new Map(places.map((place) => [place.item, place]));
    const moment = ({ of, at, plus }: Anchor, place: Place<L>): Moment => {
      const found = named(of, place, places);
      if (!found) throw new Error(`line ${place.item.line} names "${of}", and nothing above is called so`);
      const text = found === "scene" || isBlock(found.item) ? "" : (found.item.text ?? "");
      const where = typeof at === "string" ? at : "share" in at ? at.share : (sharesOf(text, at.word)[0] ?? 0);
      return { of: found === "scene" ? sceneName(n) : found.name, at: where, plus: frames(plus) };
    };
    const itemOf = (item: ScriptItem<L>): Item => {
      const place = placeOf.get(item)!;
      const placed = { name: place.name, ...(item.anchor ? { at: moment(item.anchor as Anchor, place) } : {}) };
      let made: Item;
      if (isBlock(item)) {
        const { order, under, pause = 0 } = item;
        made = { kind: "block", ...placed, order, ...(order === "in order" ? { pause: pauseOf(pause) } : {}), ...(under ? { cut: true } : {}), items: item.items.map(itemOf) };
      } else {
        const lasts = lasting(item);
        const { kind } = lasts;
        const length = "arrive" in lasts && lasts.arrive ? { ...lasts.length, arrive: moment(lasts.arrive, place) } : lasts.length;
        // A character has one voice, and for now its actions are one channel too: one at a time.
        made = { kind, ...placed, on: [`${item.who} ${kind === "voice" ? "voice" : "action"}`], length };
      }
      items.set(item, made);
      return made;
    };
    const [lead, pause, tail] = [scene.lead, scene.pause, scene.tail].map(pauseOf) as [number, number, number];
    return { kind: "block", name: sceneName(n), order: "in order", items: scene.items.map(itemOf), lead, pause, tail };
  });
  const video: Block = { kind: "block", order: "in order", items: blocks };
  return { video, scenes: blocks, items };
}

/** What is wrong with the labels and the anchors of a scene: a label given twice, and an anchor that names nothing above it, or no word of it. */
function nameIssues(all: Place<WorkedLine>[][], n: number): Issue[] {
  const issues: Issue[] = [];
  const places = all[n]!;
  for (const place of places) {
    const { line, label, anchor } = place.item;
    const first = label === undefined ? undefined : places.find(({ item }) => item.label === label)!.item;
    if (first && first !== place.item) issues.push({ line, also: [first.line], message: `${label} is the label of line ${first.line} already`, hint: "a label is given once in a scene: call this one something else" });
    const issue = anchor && momentIssue(anchor, place, all, n, "begins");
    if (issue) issues.push(issue);
  }
  return issues;
}

/**
 * What is under the rest with nothing to be under, so that it is never heard: a block whose lines
 * are all under, which waits for nothing, and what is under last in a block in order, which would
 * begin when the block ends.
 */
function underIssues(scene: WorkedScene): Issue[] {
  const issues: Issue[] = [];
  const isUnder = (item: ScriptItem<WorkedLine>) => isBlock(item) && item.under === true;
  const look = (items: ScriptItem<WorkedLine>[], order: ScriptBlock["order"], block: string, line: number) => {
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
function refusalIssues(scenes: WorkedScene[]): Issue[] {
  // No length changes what is refused, but whether a move has one does: what is fitted waits for what fits it.
  const { video, scenes: blocks, items } = planOf(scenes, () => 0, ({ action, lasts }): Lasting => {
    if (action === SAY) return { kind: "voice", length: 1 };
    if (lasts && !("arrive" in lasts)) return { kind: "move", length: 1 };
    return { kind: "move", length: { own: 1, least: 1, most: 1 }, arrive: lasts?.arrive };
  });
  const written = new Map([...items].map(([item, made]): [Item, ScriptItem<WorkedLine>] => [made, item]));
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
    const arrives = own !== undefined && !isBlock(own) && own.lasts !== undefined && "arrive" in own.lasts;
    if (own) return { line: own.line, name: nameOf(own), waits: isBlock(own) && own.joined ? "wait" : "waits", anchored: own.anchor !== undefined || arrives };
    return { line: scenes[blocks.indexOf(item as Block)]!.line, name: "the scene", waits: "waits", anchored: false };
  };
  const issueOf = (refusal: Refusal): Issue => {
    if (refusal.why === "held") {
      const [own, by] = [written.get(refusal.item) as WorkedLine, told(refusal.by)];
      return {
        line: own.line,
        also: [by.line],
        message: `${own.who} is busy with ${by.name}, which goes on under the rest to the end of the block both are in`,
        hint: "write it after that block, or in the same under:, below that line",
      };
    }
    if (refusal.why === "cut") {
      const own = written.get(refusal.item) as WorkedLine;
      let under = around.get(refusal.item)!;
      while (!under.cut) under = around.get(under)!;
      return { line: own.line, also: [told(under).line], message: `an action is never under the rest: cut, it would leave ${own.who} where only the voices know`, hint: "write it beside the under: block, not in it" };
    }
    if (refusal.why === "twice") {
      const [own, by, block] = [written.get(refusal.item) as WorkedLine, told(refusal.by), told(around.get(refusal.item)!)];
      return {
        line: own.line,
        also: [block.line, by.line],
        message: `${own.who} is busy with ${by.name}, which ends when this does: ${block.name} ends its lines together`,
        hint: "write one of the two before that block or after it, or give it to another",
      };
    }
    if (refusal.why === "own") {
      const [own, block] = [written.get(refusal.item)!, told(refusal.block)];
      const issue = (message: string, hint: string) => ({ line: own.line, also: [block.line], message: `${block.name} ends its lines together, ${message}`, hint });
      if (!isBlock(own)) return issue("so a line in it has no start of its own", "leave its anchor out, or begin the whole block by it: ending together @ a.50%:");
      if (own.joined) return issue("and holds no block: lines joined by & are one", "leave the & out: all rows of that block end at once as they are");
      return issue("and holds no block", "write its lines as lines of that block, or all of it beside that block, in a together: around both");
    }
    if (refusal.why === "below") throw new Error(`line ${told(refusal.item).line} begins by "${refusal.name}", and nothing above is called so`);
    const chain = refusal.items.map(told);
    const round = refusal.items.map((item, i, all) => {
      const next = all[(i + 1) % all.length]!;
      const ends = around.get(item) === next && next.order === "ending together";
      return `${told(item).name} ${ends ? "ends with" : `${told(item).waits} for`} ${told(next).name}`;
    });
    // The one to mend is the one with a moment of its own, the last written of them.
    const { line } = chain.filter(({ anchored }) => anchored).toSorted((a, b) => a.line - b.line).at(-1) ?? chain[0]!;
    const also = [...new Set(chain.map((one) => one.line))].filter((one) => one !== line).sort((a, b) => a - b);
    const fitted = refusal.items.some((item) => item.kind === "move" && typeof item.length === "object") ? ", or give the action its length (takes=2s)" : "";
    return { line, also, message: `it goes round: ${listed(round)}`, hint: `begin it by the start, a share or a word of something above, or write it after the block${fitted}` };
  };
  return refusals(video).map(issueOf);
}

/** What has no timing in a script, whatever its voices turn out to last: every mistake, with the lines it is between. */
export function timeIssues(scenes: WorkedScene[]): Issue[] {
  const all = scenes.map(placesOf<WorkedLine>);
  const names = scenes.flatMap((_, n) => nameIssues(all, n));
  // With an anchor that names nothing there is no plan to try.
  return [...names, ...scenes.flatMap(underIssues), ...(names.length > 0 ? [] : refusalIssues(scenes))];
}
