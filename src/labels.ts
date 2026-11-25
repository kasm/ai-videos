// What a script's labels name: a line or a block above, `prev` or `block`, as an anchor, a move's
// arrival and a line's length call it; and why one names nothing, with a hint.
import { listed, nearest } from "./names.ts";
import { BLOCK, PREV, isBlock } from "./read.ts";
import type { Anchor, Issue, Placed, ScriptItem } from "./scenario.ts";
import { sharesOf, wordList } from "./words.ts";

/** What a line has for its labels to be found, as it is read or worked out. */
export type Labelled = Placed<unknown> & { text?: string | undefined };

/** A line or a block where it is written: what it is called in the plan (plan.ts), and what `prev` and `block` are to it. */
export interface Place<L extends Labelled> {
  item: ScriptItem<L>;
  name: string;
  /** None for the first of a block. */
  prev: Place<L> | undefined;
  /** None for what is the scene's own. */
  block: Place<L> | undefined;
}

/** A scene's name in the plan. */
export const sceneName = (n: number) => `scene ${n + 1}`;

/**
 * The lines and blocks of the `n`th scene in the order written, each block before what is in it. The
 * lines joined by `&` have no header, so to each of them `prev` is the line above and `block` the
 * block around them.
 */
export function placesOf<L extends Labelled>(scene: { items: ScriptItem<L>[] }, n: number): Place<L>[] {
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
export function named<L extends Labelled>(of: string, place: Place<L>, places: Place<L>[]): Place<L> | "scene" | undefined {
  if (of === PREV) return place.prev;
  if (of === BLOCK) return place.block ?? "scene";
  return places.slice(0, places.indexOf(place)).find(({ item }) => item.label === of);
}

/** A line or a block, as a message names it. */
export const nameOf = <L extends Labelled>(item: ScriptItem<L>) => (!isBlock(item) ? `line ${item.line}` : item.joined ? `the lines joined at line ${item.line}` : `the block of line ${item.line}`);

/** What a label is named for: where a line begins, or arrives, or whose length is read. */
export type Use = "begins" | "arrives" | "reads";
const LAW: Record<Use, string> = { begins: "a line begins by what is above it", arrives: "a move arrives by what is above it", reads: "a length is read of a line above" };
const ITS_OWN: Record<Use, string> = { begins: "a line begins by something of its own scene", arrives: "a move arrives by something of its own scene", reads: "a length is read of a line of its own scene" };

/** The issue of `of` naming nothing for `place`, in the `n`th of the scenes, whose places are `all`. */
export function unnamed<L extends Labelled>(of: string, place: Place<L>, all: Place<L>[][], n: number, use: Use): Issue {
  const places = all[n]!;
  const { item } = place;
  const { line } = item;
  if (of === PREV) return { line, message: "there is no prev: it is the first of its block", hint: use === "reads" ? "label the line above whose length it is" : use === "arrives" ? "label what it arrives with, above it" : `begin it by the block it is in (@ ${BLOCK}.start + 1s), or by a label above` };
  const below = places.find((other) => other.item.label === of)?.item;
  const elsewhere = all.flatMap((scene, m) => (m === n ? [] : scene)).find((other) => other.item.label === of)?.item;
  // Joined lines have their first one's anchor, and that line's label is its own.
  if (below?.line === line) return { line, message: `"${of}" is its own label`, hint: `it ${use === "reads" ? "reads the length of" : use === "arrives" ? "arrives by" : "begins by"} something above it: another label, or prev, the line just above` };
  if (below) return { line, also: [below.line], message: `"${of}" is below, at line ${below.line}: ${LAW[use]}`, hint: `write line ${below.line} above this one, or ${use === "begins" ? "begin" : use === "arrives" ? "end" : "measure"} this one by something else` };
  if (elsewhere) return { line, also: [elsewhere.line], message: `"${of}" is in another scene, at line ${elsewhere.line}`, hint: ITS_OWN[use] };
  const above = places.slice(0, places.indexOf(place)).flatMap((other) => other.item.label ?? []);
  const near = nearest(of, [...above, PREV, BLOCK]);
  const labels = above.length > 0 ? `labelled above: ${listed(above)}` : "no line above has a label";
  return { line, message: `nothing above is called "${of}"`, hint: `${labels}; ${PREV} is the line just above, and ${BLOCK} the block it is in${near ? `: did you mean ${near}?` : ""}` };
}

/** The issue of a moment that is none for `place`: of what is not above it, or of a word that is not one place of its line. */
export function momentIssue<L extends Labelled>({ of, at }: Pick<Anchor, "of" | "at">, place: Place<L>, all: Place<L>[][], n: number, use: Use): Issue | undefined {
  const { line } = place.item;
  const found = named(of, place, all[n]!);
  if (!found) return unnamed(of, place, all, n, use);
  if (typeof at === "string" || !("word" in at)) return undefined;
  const told = found === "scene" ? undefined : found.item;
  if (!told || isBlock(told)) return { line, ...(told ? { also: [told.line] } : {}), message: `${told ? nameOf(told) : "the scene"} has no words: a line that is said has`, hint: `label the line in it that says "${at.word}"` };
  if (told.text === undefined) return { line, also: [told.line], message: `line ${told.line} says nothing, so it has no words`, hint: "begin by its start, its end or a share of it" };
  const times = sharesOf(told.text, at.word).length;
  const near = nearest(wordList(at.word)[0] ?? "", wordList(told.text));
  if (times === 0) return { line, also: [told.line], message: `line ${told.line} does not say "${at.word}"`, hint: `write a word as the line says it${near ? `: did you mean ${near}?` : ""}` };
  if (times > 1) return { line, also: [told.line], message: `line ${told.line} says "${at.word}" ${times} times`, hint: `write the words after it too, until it is one place: ${of}.word(${at.word} ...)` };
  return undefined;
}
