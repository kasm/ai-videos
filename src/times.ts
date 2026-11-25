// When each line of a scenario begins and ends (AGENTS.md, "What happens at once"): a plan of lines
// and blocks, written as data with every length known, laid on the video's frames. Every start and
// every end is a cell with one formula, which reads other cells. Which ones it reads depends on the
// plan's shape and never on a length, so a loop is found before anything is measured, and a plan
// with none has one timing, whatever the lengths turn out to be. times.md proves what these laws
// promise, and times.test.ts tries it on random plans.
//
// It imports nothing: compile.ts lays a scenario's lines with it, which plugin.ts gives to the
// plugins' tests.

/** A moment of something written above: where a line is anchored, or a move arrives. */
export interface Moment {
  /** The line's or the block's name, or `block`: the block that the anchored one is in. */
  of: string;
  /** Its start, its end (a cut one's is where it stops), or a share of its length, 0 to 1 (a cut one's is the whole length, uncut). */
  at: "start" | "end" | number;
  /** Frames after that, or below 0 before it: back to the start of what is named, and no further. */
  plus: number;
}

/** The length of a move that is given none: as long as what it is fitted to takes, within limits. Frames, `least` <= `own` <= `most`. */
export interface Fitted {
  /** At its own speed. */
  own: number;
  /** At its fastest. */
  least: number;
  /** At its slowest. */
  most: number;
  /** The moment it ends at, in place of the last of its block's voices. */
  arrive?: Moment;
}

interface Placeable {
  /** What an anchor calls it. */
  name?: string;
  /** Its own start, in place of its block's rule. */
  at?: Moment;
  /** It stops where its block ends, if it has not ended before, and nothing waits for it. */
  cut?: boolean;
}

/** One thing that lasts: a voice, a sound, or a move (any of the plugin's actions). */
export interface Line extends Placeable {
  kind: "voice" | "sound" | "move";
  /** The channels it keeps busy (`pip voice`): each does one thing at a time. */
  on: string[];
  /** Frames, 1 at least: measured or given, or fitted; or `open`, until its block ends. */
  length: number | Fitted | "open";
}

/** Lines and blocks, each after those above it (in order) or all begun at once (together); or lines alone, all ended at once (ending together). */
export interface Block extends Placeable {
  kind: "block";
  order: "in order" | "together" | "ending together";
  items: Item[];
  /** In order: frames from the end of all above to the next. None when left out, as the two below. */
  pause?: number;
  /** In order: frames from its start to its first. */
  lead?: number;
  /** Frames from the end of the last it waits for to its own end. */
  tail?: number;
}

export type Item = Line | Block;

/** When something happens, in frames: from `start`, stopped by `end`. A line that stops where it starts is not there: its block ended before it began. */
export interface Interval {
  start: number;
  end: number;
  /** Where it would end if nothing cut it. */
  uncut: number;
}

/** Why a plan has no timing. Each holds for any lengths, so it is known before the voices. */
export type Refusal =
  /** `item` names something that nothing above it is called. */
  | { why: "below"; item: Item; name: string }
  /** `item` follows `by` on a channel that `by`, cut or open, holds until the block both are in ends. */
  | { why: "held"; item: Line; by: Line; channel: string }
  /** A move that would be cut: it would leave its character where only the voices know. */
  | { why: "cut"; item: Line }
  /** `item` and `by`, above it, do two things on one channel in a block whose lines end at once, or begin at once and `item` has no start of its own. */
  | { why: "twice"; item: Line; by: Line; channel: string }
  /** `item` has its times in itself and not by its `block`, whose lines end at once: a block, a line that is anchored, or a move that is told when to arrive. */
  | { why: "own"; item: Item; block: Block }
  /** Each of `items` waits for the next one, and the last for the first. */
  | { why: "loop"; items: Item[] };

/** A formula, or a part of one: the cells it reads, and what it gives once they are known. */
interface Term {
  reads: Cell[];
  work: () => number;
  /** Cells it is no earlier than, whatever the lengths. */
  over: Cell[];
  /** It is the latest of those, and nothing more: no pause after them, no share of them, and no length. */
  only?: boolean;
}

/** A start or an end: its formula, and its value once worked out. */
interface Cell extends Term {
  item: Item;
  value: number;
}

/** A cell's value. */
const when = (read: Cell): Term => ({ reads: [read], work: () => read.value, over: [read], only: true });
/** `frames` after it: 0 or more, and how many is nothing to what it is surely over. */
const later = ({ reads, work, over }: Term, frames: number): Term => ({ reads, work: () => work() + frames, over });
/** `frames` before it. */
const before = ({ reads, work }: Term, frames: number): Term => ({ reads, work: () => work() - frames, over: [] });
const readsOf = (terms: Term[]) => terms.flatMap(({ reads }) => reads);
const latest = (terms: Term[]): Term => ({
  reads: readsOf(terms),
  work: () => Math.max(...terms.map(({ work }) => work())),
  over: terms.flatMap(({ over }) => over),
  only: terms.every(({ only }) => only),
});
const earliest = (terms: Term[]): Term => ({
  reads: readsOf(terms),
  work: () => Math.min(...terms.map(({ work }) => work())),
  over: terms[0]!.over.filter((cell) => terms.every(({ over }) => over.includes(cell))),
});

const isBlock = (item: Item): item is Block => item.kind === "block";

/** What a block does not wait for: the cut and the open. */
const isLeft = (item: Item) => item.cut === true || (!isBlock(item) && item.length === "open");

/** Whether a block's lines end at once, each begun by its end. */
const endsTogether = (block: Block | undefined) => block?.order === "ending together";

/** What has its times in itself, so that it may not be in a block whose lines end at once: a block, and a line with a moment of its own. */
const hasOwn = (item: Item) => isBlock(item) || item.at !== undefined || (typeof item.length === "object" && item.length.arrive !== undefined);

/** How long a line lasts in a block whose lines end at once: what it is given, or a move's own length. None for what that block does not wait for. */
function lengthIn(item: Item): number | undefined {
  if (isBlock(item) || isLeft(item) || item.length === "open") return undefined;
  return typeof item.length === "number" ? item.length : item.length.own;
}

/** The voices a block waits for, however deep in it. */
const voicesOf = (block: Block): Line[] => block.items.filter((item) => !isLeft(item)).flatMap((item) => (isBlock(item) ? voicesOf(item) : item.kind === "voice" ? [item] : []));

/** The plan's cells, each with its formula, and what is refused of its shape: everything but a loop. */
function graphOf(plan: Block) {
  /** Everything in the plan, as written, and the blocks each is in, the inner first. */
  const order: Item[] = [];
  const around = new Map<Item, Block[]>();
  const add = (item: Item, blocks: Block[]) => {
    order.push(item);
    around.set(item, blocks);
    if (isBlock(item)) for (const inner of item.items) add(inner, [item, ...blocks]);
  };
  add(plan, []);
  const withBlocks = (item: Item): Item[] => [item, ...around.get(item)!];

  const refused: Refusal[] = [];
  const cells = () => new Map(order.map((item): [Item, Cell] => [item, { item, reads: [], work: () => 0, value: 0, over: [] }]));
  const [starts, ends] = [cells(), cells()];
  const start = (item: Item) => starts.get(item)!;
  const end = (item: Item) => ends.get(item)!;

  /**
   * The blocks at whose ends `x` is cut, the inner first: for each cut or open thing that `x` is or
   * is in, the block that one is in. As `y` sees it, none for a thing that `y` is in too: inside it
   * everything is timed as if nothing cut it.
   */
  const cutBy = (x: Item, y?: Item): Block[] => {
    const own = withBlocks(x);
    const shared = y ? withBlocks(y) : [];
    return own.slice(0, -1).flatMap((z, k) => (isLeft(z) && !shared.includes(z) ? [own[k + 1] as Block] : []));
  };

  /** A moment of something above, as `y` sees it; none, and a refusal, when nothing above is called so. */
  const moment = ({ of, at, plus }: Moment, y: Item): Term | undefined => {
    const x = of === "block" ? around.get(y)![0] : order.slice(0, order.indexOf(y)).findLast(({ name }) => name === of);
    if (!x) return void refused.push({ why: "below", item: y, name: of });
    const from = start(x);
    if (at === "start") return later(when(from), Math.max(0, plus));
    const to = at === "end" ? earliest([x, ...cutBy(x, y)].map((item) => when(end(item)))) : when(end(x));
    const share = at === "end" ? 1 : at;
    return {
      reads: [from, ...to.reads],
      work: () => Math.max(from.value, from.value + Math.round(share * (to.work() - from.value)) + plus),
      over: [from],
    };
  };

  /** When a line's channels are free: the ends of those above it on them, and of the blocks that cut those. */
  const freeOf = (x: Line): Term[] => {
    const terms: Term[] = [];
    let held: Refusal | undefined;
    let twice: Refusal | undefined;
    for (const y of order.slice(0, order.indexOf(x))) {
      const channel = isBlock(y) ? undefined : y.on.find((one) => x.on.includes(one));
      if (isBlock(y) || channel === undefined) continue;
      // What is cut holds its channel until its block ends, however long it lasts itself.
      const until = cutBy(y, x).at(-1);
      const block = around.get(x)![0];
      const inOne = around.get(y)![0] === block;
      if (inOne && endsTogether(block)) twice = { why: "twice", item: x, by: y, channel };
      else if (until && withBlocks(x).includes(until)) held = { why: "held", item: x, by: y, channel };
      // Both would begin with the block: the second would wait for the first, against its word.
      else if (inOne && block?.order === "together" && !x.at) twice = { why: "twice", item: x, by: y, channel };
      else terms.push(when(end(until ?? y)));
    }
    if (held) refused.push(held);
    if (twice) refused.push(twice);
    return terms;
  };
  const free = new Map(order.map((x): [Item, Term[]] => [x, isBlock(x) ? [] : freeOf(x)]));

  /** A start: the latest of its block's start, its own anchor or its block's rule, and its channels. */
  const startOf = (x: Item, block: Block): Term => {
    const terms = [when(start(block)), ...free.get(x)!];
    const above = block.items.slice(0, block.items.indexOf(x)).filter((item) => !isLeft(item));
    const anchor = x.at && moment(x.at, x);
    const length = lengthIn(x);
    if (anchor) terms.push(anchor);
    else if (endsTogether(block) && length !== undefined) terms.push(before(when(end(block)), (block.tail ?? 0) + length));
    else if (block.order === "in order" && above.length > 0) terms.push(...above.map((item) => later(when(end(item)), block.pause ?? 0)));
    else if (block.order === "in order" && block.lead !== undefined) terms.push(later(when(start(block)), block.lead));
    return latest(terms);
  };

  /**
   * A block's end: after the last it waits for, and its tail. One whose lines end at once ends when the
   * last of them would, if each began as soon as the block has and its channels are free. It reads none
   * of their cells, as they begin by it.
   */
  const endOfBlock = (x: Block): Term => {
    const ends = x.items.flatMap((item): Term[] => {
      if (isLeft(item)) return [];
      if (!endsTogether(x)) return [when(end(item))];
      const length = lengthIn(item);
      return length === undefined ? [] : [later(latest([when(start(x)), ...free.get(item)!]), length)];
    });
    return later(latest([when(start(x)), ...ends]), x.tail ?? 0);
  };

  /** A line's end: its length after its start, or where what it is fitted to ends, within its limits, or its block's end. */
  const endOfLine = (x: Line, block: Block): Term => {
    if (x.length === "open") return latest([when(start(x)), when(end(block))]);
    if (x.kind === "move" && cutBy(x).length > 0) refused.push({ why: "cut", item: x });
    const lasting = (frames: number) => later(when(start(x)), frames);
    if (typeof x.length === "number") return lasting(x.length);
    const { own, least, most, arrive } = x.length;
    const voices = block.order === "together" && !x.at ? voicesOf(block) : [];
    const target = arrive ? moment(arrive, x) : voices.length > 0 ? latest(voices.map((voice) => when(end(voice)))) : undefined;
    return target ? earliest([latest([target, lasting(least)]), lasting(most)]) : lasting(own);
  };

  for (const x of order) {
    const block = around.get(x)![0];
    if (block && endsTogether(block) && hasOwn(x)) refused.push({ why: "own", item: x, block });
    if (block) Object.assign(start(x), startOf(x, block));
    if (isBlock(x)) Object.assign(end(x), endOfBlock(x));
    else if (block) Object.assign(end(x), endOfLine(x, block));
  }
  // The lines that end at once do: each after any other has begun, and their block no earlier than they.
  for (const block of order) {
    if (!isBlock(block) || !endsTogether(block)) continue;
    const ended = block.items.filter((item) => !isLeft(item));
    for (const item of ended) end(item).over.push(...ended.map(start));
    end(block).over.push(...ended.map(end));
  }
  return { order, start, end, cutBy, refused };
}

/** Works the cells out, each once all it reads are. The loops that leave some with no value: each a list of cells that read the next one, the last the first. */
function solve(cells: Cell[]): Cell[][] {
  const left = new Map(cells.map((cell) => [cell, cell.reads.length]));
  const readers = new Map(cells.map((cell): [Cell, Cell[]] => [cell, []]));
  for (const cell of cells) for (const read of cell.reads) readers.get(read)!.push(cell);
  const ready = cells.filter((cell) => cell.reads.length === 0);
  const loops: Cell[][] = [];
  while (left.size > 0) {
    for (let cell = ready.pop(); cell; cell = ready.pop()) {
      left.delete(cell);
      cell.value = cell.work();
      for (const reader of readers.get(cell)!) {
        const reads = left.get(reader) ?? 0;
        if (reads > 0) left.set(reader, reads - 1);
        if (reads === 1) ready.push(reader);
      }
    }
    const [first] = left.keys();
    if (!first) break;
    // Every cell left reads one that is left, so following them comes round.
    const path: Cell[] = [];
    let at = first;
    for (; !path.includes(at); at = at.reads.find((read) => left.has(read))!) path.push(at);
    const loop = path.slice(path.indexOf(at));
    loops.push(loop);
    // The rest is worked out as if the loop were known, so that another one is found too.
    for (const cell of loop) left.set(cell, 0);
    ready.push(...loop);
  }
  return loops;
}

/** The plan worked out: when everything in it happens, and every reason it is refused. */
function workOut(plan: Block): { intervals: Map<Item, Interval>; refused: Refusal[] } {
  const { order, start, end, cutBy, refused } = graphOf(plan);
  for (const loop of solve(order.flatMap((item) => [start(item), end(item)]))) {
    // Each thing once, and what is written first at the head.
    const items = loop.map(({ item }) => item).filter((item, i, all) => item !== all.at(i - 1));
    const head = items.indexOf(order.find((item) => items.includes(item))!);
    refused.push({ why: "loop", items: [...items.slice(head), ...items.slice(0, head)] });
  }
  const intervals = new Map(
    order.map((item): [Item, Interval] => {
      const [from, uncut] = [start(item).value, end(item).value];
      return [item, { start: from, end: Math.max(from, Math.min(uncut, ...cutBy(item).map((block) => end(block).value))), uncut }];
    }),
  );
  return { intervals, refused };
}

/** Why the plan has no timing, every reason; none when it has one. No length changes the answer. */
export const refusals = (plan: Block): Refusal[] => workOut(plan).refused;

/**
 * Whether one thing of a plan has surely begun before a line ends (by the time it does, if it is open),
 * whatever the lengths, the pauses and the seconds after a moment turn out to be, for a plan that is
 * accepted. Where it is not sure, they decide it, or it is not seen: times.md says what is.
 */
export function surelyBegun(plan: Block): (item: Item, before: Line) => boolean {
  const { start, end } = graphOf(plan);
  const below = new Map<Cell, Set<Cell>>();
  /** The cells that a cell is surely no earlier than, itself among them. */
  const belowOf = (cell: Cell): Set<Cell> => {
    const found = below.get(cell) ?? new Set([cell]);
    if (below.has(cell)) return found;
    for (const one of found) one.over.forEach((other) => found.add(other));
    below.set(cell, found);
    return found;
  };
  const noLater = (cell: Cell, than: Set<Cell>): boolean => than.has(cell) || (cell.only === true && cell.over.every((one) => noLater(one, than)));
  return (item, before) => noLater(start(item), new Set(end(before).over.flatMap((cell) => [...belowOf(cell)])));
}

/** When everything in the plan happens. A plan that is refused (`refusals`) is a mistake of the caller's. */
export function times(plan: Block): Map<Item, Interval> {
  const { intervals, refused } = workOut(plan);
  if (refused.length > 0) throw new Error(`the plan has no timing: ${refused.map(({ why }) => why).join(", ")}`);
  return intervals;
}
