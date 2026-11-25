// What happens at once (times.ts): when each line of a plan begins and ends, what is refused, and,
// on seeded random plans, every property that times.md proves.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refusals, times, type Block, type Fitted, type Interval, type Item, type Line, type Moment } from "./times.ts";

type More<T> = Partial<Omit<T, "kind" | "items">>;

const voice = (name: string, who: string, length: number, more: More<Line> = {}): Line => ({ kind: "voice", name, on: [`${who} voice`], length, ...more });
const sound = (name: string, length: Line["length"], more: More<Line> = {}): Line => ({ kind: "sound", name, on: [name], length, ...more });
/** A move that takes `own` frames, and as a fitted one from half of them to twice as many. */
const move = (name: string, who: string, own: number, more: More<Line> = {}): Line => ({ kind: "move", name, on: [`${who} place`], length: fitted(own), ...more });
const fitted = (own: number): Fitted => ({ own, least: Math.ceil(own / 2), most: own * 2 });
const look = (name: string, who: string, more: More<Line> = {}): Line => ({ kind: "move", name, on: [`${who} eyes`], length: "open", ...more });
const inOrder = (name: string, items: Item[], more: More<Block> = {}): Block => ({ kind: "block", name, order: "in order", pause: 12, items, ...more });
const together = (name: string, items: Item[], more: More<Block> = {}): Block => ({ kind: "block", name, order: "together", items, ...more });
/** A scene at 30 frames a second with the tool's pauses: 0.6 s before its first line, 0.4 s between lines, 1 s after its last. */
const scene = (...items: Item[]): Block => inOrder("scene", items, { lead: 18, tail: 30 });
const at = (of: string, where: Moment["at"], plus = 0): Moment => ({ of, at: where, plus });

/** When each thing of a plan happens, by name: the frame it begins on, and the one it has stopped by. */
const when = (plan: Block) => Object.fromEntries([...times(plan)].map(([item, { start, end }]) => [item.name!, [start, end]]));
/** The same of the things named. */
const only = (plan: Block, ...names: string[]) => names.map((name) => when(plan)[name]);
/** Why a plan is refused, by its things' names. */
const why = (plan: Block) =>
  refusals(plan).map((one) => {
    if (one.why === "loop") return `loop: ${one.items.map(({ name }) => name).join(", ")}`;
    if (one.why === "held") return `held: ${one.item.name} by ${one.by.name} (${one.channel})`;
    return one.why === "below" ? `below: ${one.item.name} names ${one.name}` : `cut: ${one.item.name}`;
  });

// What the plan's step names.

test("two lines begun together: what follows waits for both", () => {
  const plan = scene(together("both", [voice("pip", "pip", 45), voice("mo", "mo", 60)]), voice("tuk", "tuk", 30));
  assert.deepEqual(when(plan), { scene: [0, 150], both: [18, 78], pip: [18, 63], mo: [18, 78], tuk: [90, 120] });
});

test("one line begun half-way into another: the next waits for all above it, not for the line before alone", () => {
  const plan = scene(voice("a", "pip", 60), voice("hm", "mo", 15, { at: at("a", 0.5) }), voice("tuk", "tuk", 30));
  assert.deepEqual(when(plan), { scene: [0, 150], a: [18, 78], hm: [48, 63], tuk: [90, 120] });
});

const talk = () => inOrder("talk", [voice("one", "pip", 45), voice("two", "tuk", 45), voice("three", "pip", 45)]);
const murmur = (more: More<Block> = {}) => inOrder("murmur", [voice("murmur-1", "mo", 90), voice("murmur-2", "mo", 120)], more);

test("one line going on under three others, and another of its voice after it", () => {
  const plan = scene(together("both", [murmur(), talk()]));
  assert.deepEqual(when(plan), {
    scene: [0, 270],
    both: [18, 240],
    murmur: [18, 240],
    "murmur-1": [18, 108],
    "murmur-2": [120, 240],
    talk: [18, 177],
    one: [18, 63],
    two: [75, 120],
    three: [132, 177],
  });
});

test("the same two cut where the third ends: the block is as long as the three, and they begin as before", () => {
  const plan = scene(together("both", [murmur({ cut: true }), talk()]), voice("after", "mo", 30));
  assert.deepEqual(when(plan), {
    scene: [0, 249],
    both: [18, 177],
    murmur: [18, 177],
    "murmur-1": [18, 108],
    "murmur-2": [120, 177],
    talk: [18, 177],
    one: [18, 63],
    two: [75, 120],
    three: [132, 177],
    after: [189, 219],
  });
  // A first murmur longer than the three leaves no time for the second: it is not there.
  const long = inOrder("murmur", [voice("murmur-1", "mo", 200), voice("murmur-2", "mo", 120)], { cut: true });
  assert.deepEqual(only(scene(together("both", [long, talk()])), "both", "murmur-1", "murmur-2"), [[18, 177], [18, 177], [230, 230]]);
});

test("a block waits for its long voice: the talk over a radio ends before the radio does", () => {
  const plan = scene(together("both", [voice("radio", "radio", 240), inOrder("talk", [voice("one", "pip", 45), voice("two", "tuk", 45)])]), voice("after", "pip", 30));
  assert.deepEqual(when(plan), { scene: [0, 330], both: [18, 258], radio: [18, 258], talk: [18, 120], one: [18, 63], two: [75, 120], after: [270, 300] });
});

test("a scene ends after its last voice that is not cut: a cut one goes on through the tail, to the scene's end", () => {
  const plan = scene(voice("radio", "radio", 400, { cut: true }), voice("one", "pip", 45), voice("two", "tuk", 45));
  assert.deepEqual(when(plan), { scene: [0, 150], radio: [18, 150], one: [18, 63], two: [75, 120] });
  // One that ends before is only itself.
  assert.deepEqual(only(scene(voice("radio", "radio", 20, { cut: true }), voice("one", "pip", 45)), "scene", "radio"), [[0, 93], [18, 38]]);
});

test("a walk joined to a line ends with its words: hello's frames, the lines joined as hello has them", () => {
  const plan = scene(together("both", [move("walk", "pip", 113), voice("first", "narrator", 67)]), voice("second", "narrator", 37));
  // hello's request: the lines at 0.6 s and 3.233 s, 164 frames.
  assert.deepEqual(when(plan), { scene: [0, 164], both: [18, 85], walk: [18, 85], first: [18, 85], second: [97, 134] });
});

// The rest of the laws.

test("a fitted move keeps its limits: the words wait for it, or it stands after it", () => {
  const joined = (words: number) => only(scene(together("both", [move("walk", "pip", 113), voice("first", "narrator", words)])), "both", "walk");
  assert.deepEqual(joined(20), [[18, 75], [18, 75]], "at its fastest, 57 frames");
  assert.deepEqual(joined(300), [[18, 318], [18, 244]], "at its slowest, 226");
});

test("a move is fitted to the last voice its block waits for, however deep, and to nothing else", () => {
  const deep = scene(together("both", [move("walk", "pip", 100), inOrder("talk", [voice("one", "mo", 40), voice("two", "tuk", 60)])]));
  assert.deepEqual(only(deep, "walk", "two"), [[18, 130], [70, 130]]);
  const others = [sound("bell", 20), move("other", "mo", 30), voice("radio", "radio", 70, { cut: true })];
  assert.deepEqual(only(scene(together("both", [move("walk", "pip", 100), ...others])), "walk", "other"), [[18, 118], [18, 48]], "no voice it waits for: its own length");
  const cut = scene(together("both", [move("walk", "pip", 100), voice("one", "mo", 80), inOrder("murmur", [voice("radio", "radio", 300)], { cut: true })]));
  assert.deepEqual(only(cut, "walk"), [[18, 98]], "a voice in a cut block is not one");
});

test("a move takes its own length in order, and with a start of its own", () => {
  const order = scene(move("walk", "pip", 100), voice("one", "pip", 40), voice("two", "mo", 30, { at: at("walk", "start", 10) }));
  assert.deepEqual(only(order, "walk", "one", "two"), [[18, 118], [130, 170], [28, 58]]);
  const own = scene(together("both", [voice("one", "mo", 40), move("walk", "pip", 100, { at: at("one", "end") })]));
  assert.deepEqual(only(own, "walk", "both"), [[58, 158], [18, 158]]);
});

test("a move told when to arrive is fitted to that moment, within its limits", () => {
  const arriving = (of: string, where: Moment["at"], plus = 0) =>
    only(scene(voice("one", "mo", 60), move("walk", "pip", 100, { at: at("one", "start"), length: { ...fitted(100), arrive: at(of, where, plus) } })), "walk")[0];
  assert.deepEqual(arriving("one", "end", 12), [18, 90]);
  assert.deepEqual(arriving("one", 0.5), [18, 68], "at its fastest, 50 frames");
  // Two who arrive at once: each begins when it begins.
  const both = scene(together("both", [move("walk", "pip", 100, { length: 90 }), move("run", "mo", 70, { at: at("block", "start", 25), length: { ...fitted(70), arrive: at("walk", "end") } })]));
  assert.deepEqual(only(both, "walk", "run"), [[18, 108], [43, 108]]);
});

test("an anchor is a moment of something above, and never before that begins", () => {
  const anchored = (where: Moment) => only(scene(voice("a", "pip", 60), voice("b", "mo", 10, { at: where })), "b")[0];
  assert.deepEqual(anchored(at("a", "start", 9)), [27, 37]);
  assert.deepEqual(anchored(at("a", "end", -15)), [63, 73]);
  assert.deepEqual(anchored(at("a", "end", 30)), [108, 118]);
  assert.deepEqual(anchored(at("a", 0.25, 2)), [35, 45]);
  assert.deepEqual(anchored(at("a", "end", -90)), [18, 28], "no earlier than a");
  assert.deepEqual(anchored(at("a", "start", -9)), [18, 28], "no earlier than a");
  assert.deepEqual(anchored(at("a", 0.04)), [20, 30], "2.4 of its 60 frames: to the nearest");
  assert.deepEqual(anchored(at("block", "start")), [0, 10], "the block's own start: a scene's lead is its rule's, not an anchor's");
  // A block is anchored, and an anchor, as a line is.
  const blocks = scene(together("both", [voice("a", "pip", 60), voice("b", "mo", 80)]), inOrder("then", [voice("c", "tuk", 20)], { at: at("both", "end", -10) }));
  assert.deepEqual(only(blocks, "then", "c"), [[88, 108], [88, 108]]);
  // Nothing begins before its block, whatever it names.
  const early = scene(voice("a", "pip", 60), inOrder("then", [voice("b", "mo", 20, { at: at("a", "start") })]));
  assert.deepEqual(only(early, "then", "b"), [[90, 110], [90, 110]]);
});

test("a channel does one thing at a time, in the order written, in whichever blocks", () => {
  const plan = scene(together("both", [inOrder("left", [voice("one", "pip", 40), voice("two", "mo", 40)]), inOrder("right", [voice("three", "mo", 30), voice("four", "pip", 10)])]));
  assert.deepEqual(only(plan, "two", "three", "four"), [[70, 110], [110, 140], [152, 162]]);
  // One that never began frees nothing: what is written below it waits for all above on the channel.
  const gone = scene(together("both", [voice("news", "radio", 60), together("short", [voice("jingle", "radio", 20, { cut: true }), voice("one", "pip", 10)]), voice("more", "radio", 30)]));
  assert.deepEqual(only(gone, "news", "short", "jingle", "more"), [[18, 78], [18, 28], [78, 78], [78, 108]]);
  // Two channels taken by one line: it waits for both.
  const two = scene(together("both", [voice("sings", "pip", 50), { kind: "move", name: "nods", on: ["pip head"], length: 20 }, { kind: "move", name: "bows", on: ["pip head", "pip voice"], length: 10 }]));
  assert.deepEqual(only(two, "bows"), [[68, 78]]);
});

test("what is open lasts until its block ends, and nothing waits for it", () => {
  const plan = scene(voice("one", "pip", 40), look("looks", "mo"), voice("two", "pip", 30), voice("three", "tuk", 20));
  assert.deepEqual(only(plan, "looks", "two", "scene"), [[70, 162], [70, 100], [0, 162]]);
  const block = scene(together("both", [look("looks", "mo"), voice("one", "pip", 40)]), look("again", "mo"), voice("two", "pip", 30));
  assert.deepEqual(only(block, "looks", "again"), [[18, 58], [70, 130]]);
});

test("in order, a cut or open line is passed over: what follows begins where it does", () => {
  const plan = scene(voice("one", "pip", 40), sound("music", "open"), voice("radio", "radio", 25, { cut: true }), voice("two", "mo", 30));
  assert.deepEqual(only(plan, "music", "radio", "two"), [[70, 130], [70, 95], [70, 100]]);
});

test("a share of a cut line is of its whole length; its end is where it stops", () => {
  // Pip begins half-way into the radio, which is cut where Pip ends.
  const half = scene(together("both", [voice("radio", "radio", 200, { cut: true }), voice("off", "pip", 30, { at: at("radio", 0.5) })]), voice("then", "mo", 10, { at: at("radio", "end") }));
  assert.deepEqual(only(half, "radio", "off", "both", "then"), [[18, 148], [118, 148], [18, 148], [148, 158]]);
  // Inside the cut block, everything is timed as if nothing cut it.
  const inside = inOrder("murmur", [voice("murmur-1", "mo", 90), voice("echo", "tuk", 10, { at: at("murmur-1", "end", -5) })], { cut: true });
  assert.deepEqual(only(scene(together("both", [inside, voice("one", "pip", 200)])), "echo"), [[103, 113]]);
});

test("a cut block in a cut block stops where the first of their blocks ends", () => {
  const inner = together("inner", [voice("hum", "mo", 300, { cut: true }), voice("word", "tuk", 60)]);
  const nested = (words: number) => only(scene(together("both", [inOrder("murmur", [inner, voice("last", "tuk", 30)], { cut: true }), voice("one", "pip", words)])), "hum", "word", "last");
  assert.deepEqual(nested(200), [[18, 78], [18, 78], [90, 120]]);
  assert.deepEqual(nested(40), [[18, 58], [18, 58], [90, 90]]);
});

test("what is refused, with who is in it, for any lengths", () => {
  const below = scene(voice("one", "pip", 40, { at: at("two", "start") }), voice("two", "mo", 30, { at: at("nobody", "end") }), voice("three", "mo", 30, { at: at("three", "end") }));
  assert.deepEqual(why(below), ["below: one names two", "below: two names nobody", "below: three names three"]);
  assert.deepEqual(why(scene(voice("one", "pip", 40), move("walk", "pip", 40, { length: { ...fitted(40), arrive: at("two", "end") } }), voice("two", "mo", 30))), ["below: walk names two"]);

  // A voice that follows a cut one in its block: the block would wait for it, and it for the block.
  const held = (more: More<Line>) => scene(together("both", [voice("radio", "radio", 100, { cut: true }), inOrder("talk", [voice("one", "pip", 30), voice("more", "radio", 30, more)])]));
  assert.deepEqual(why(held({})), ["held: more by radio (radio voice)"]);
  assert.deepEqual(why(held({ cut: true })), ["held: more by radio (radio voice)"]);
  assert.deepEqual(why(scene(look("looks", "mo"), voice("one", "pip", 30), look("away", "mo"))), ["held: away by looks (mo eyes)"]);
  // In a cut block of their own, one follows the other.
  assert.deepEqual(why(scene(together("both", [murmur({ cut: true }), talk()]))), []);

  assert.deepEqual(why(scene(move("walk", "pip", 40, { cut: true }), voice("one", "mo", 30))), ["cut: walk"]);
  assert.deepEqual(why(scene(inOrder("murmur", [voice("murmur-1", "mo", 30), move("walk", "mo", 30), look("looks", "mo")], { cut: true }), voice("one", "pip", 30))), ["cut: walk"]);

  // Loops, whole. Two in one plan are both found.
  const waits = (name: string) => together(`${name}-block`, [move(name, `${name}-who`, 40), voice(`${name}-words`, "narrator", 50), voice(`${name}-hi`, name, 20, { at: at(name, "end") })]);
  assert.deepEqual(why(scene(waits("walk"))), ["loop: walk, walk-hi"]);
  assert.deepEqual(why(scene(waits("walk"), waits("run"))).toSorted(), ["loop: run, run-hi", "loop: walk, walk-hi"]);
  assert.deepEqual(why(scene(inOrder("talk", [voice("one", "pip", 30), voice("two", "mo", 30, { at: at("talk", "end") })]))), ["loop: talk, two"]);
  assert.deepEqual(why(scene(together("both", [voice("radio", "radio", 90, { cut: true }), voice("one", "pip", 30, { at: at("radio", "end", -10) })]))), ["loop: both, one"]);
  assert.deepEqual(why(scene(together("both", [look("looks", "mo"), voice("one", "pip", 30, { at: at("looks", 0.5) })]))), ["loop: both, one, looks"]);

  assert.throws(() => times(scene(waits("walk"))), /the plan has no timing: loop/);
});

// Random plans.

/** Numbers from 0 to 1, the same for the same seed (mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random plan of a scene: blocks three deep, four voices, and everything a line or an anchor can be. */
function randomPlan(seed: number): Block {
  const next = random(seed);
  const int = (from: number, to: number) => from + Math.floor(next() * (to - from + 1));
  const pick = <T>(from: T[]): T => from[int(0, from.length - 1)]!;
  const names: string[] = [];
  const moment = (): Moment => ({ of: next() < 0.1 ? "block" : pick(names), at: pick<Moment["at"]>(["start", 0.25, 0.5, "end", "end"]), plus: pick([0, 0, -20, -5, 5, 12]) });
  const placed = (): Pick<Line, "name" | "at"> => {
    const anchor = names.length > 0 && next() < 0.2 ? moment() : undefined;
    const name = `x${names.length}`;
    names.push(name);
    return { name, ...(anchor ? { at: anchor } : {}) };
  };
  const lineOf = (inCut: boolean): Line => {
    const who = pick(["pip", "mo", "tuk", "radio"]);
    const arrive = names.length > 0 && next() < 0.25 ? moment() : undefined;
    const own = placed();
    const kind = next();
    const cut = next() < 0.15 ? { cut: true } : {};
    if (kind < 0.55) return { kind: "voice", ...own, on: [`${who} voice`], length: int(1, 40), ...cut };
    if (kind < 0.65) return { kind: "sound", ...own, on: [pick(["bell", "music"])], length: next() < 0.3 ? "open" : int(1, 40), ...cut };
    const on = next() < 0.1 ? [`${who} place`, `${who} arm`] : [`${who} ${pick(["place", "arm"])}`];
    if (inCut || kind < 0.72) return { kind: "move", ...own, on, length: "open" };
    const length = kind < 0.8 ? int(1, 40) : { ...fitted(int(4, 40)), ...(arrive ? { arrive } : {}) };
    return { kind: "move", ...own, on, length };
  };
  const blockOf = (deep: number, inCut: boolean): Block => {
    const own = placed();
    const cut = next() < 0.12 ? { cut: true } : {};
    const items = Array.from({ length: int(1, 3) }, () => itemOf(deep, inCut || "cut" in cut));
    return { kind: "block", ...own, ...cut, order: next() < 0.5 ? "in order" : "together", pause: 12, items };
  };
  const itemOf = (deep: number, inCut: boolean): Item => (deep > 0 && next() < 0.4 ? blockOf(deep - 1, inCut) : lineOf(inCut));
  names.push("scene");
  return { kind: "block", name: "scene", order: "in order", lead: 18, pause: 12, tail: 30, items: Array.from({ length: int(1, 4) }, () => itemOf(3, false)) };
}

/** A plan as written: each thing, the block it is in, and the blocks around it. */
function written(plan: Block) {
  const order: Item[] = [];
  const parent = new Map<Item, Block>();
  const add = (item: Item) => {
    order.push(item);
    if (item.kind === "block") for (const inner of item.items) parent.set(inner, item) && add(inner);
  };
  add(plan);
  const isIn = (item: Item, block: Item) => {
    for (let one: Item | undefined = item; one; one = parent.get(one)) if (one === block) return true;
    return false;
  };
  return { order, parent, isIn, lines: order.filter((item) => item.kind !== "block") };
}

const left = (item: Item) => item.cut === true || (item.kind !== "block" && item.length === "open");
const there = ({ start, end }: Interval) => end > start;
/** The moments a thing names: its anchor, and where it arrives. */
const named = (item: Item): Moment[] => [item.at, item.kind !== "block" && typeof item.length === "object" ? item.length.arrive : undefined].filter((one) => one !== undefined);
/** The plan as text, for a failure to show. */
const shown = (seed: number, plan: Block) => `seed ${seed}: ${JSON.stringify(plan)}`;

const SEEDS = Array.from({ length: 15000 }, (_, k) => k + 1);
const PLANS = SEEDS.map((seed) => ({ seed, plan: randomPlan(seed) })).filter(({ plan }) => refusals(plan).length === 0);

test("random plans: there are many, and everything the laws speak of is in them", () => {
  const count = { plans: PLANS.length, lines: 0, anchored: 0, cutShort: 0, notThere: 0, hurried: 0, slowed: 0, arriving: 0, waitedForItsChannel: 0 };
  for (const { plan } of PLANS) {
    const { lines, parent } = written(plan);
    const worked = times(plan);
    for (const line of lines) {
      const { start, end, uncut } = worked.get(line)!;
      count.lines++;
      if (line.at) count.anchored++;
      if (end === start) count.notThere++;
      else if (end < uncut) count.cutShort++;
      if (typeof line.length === "object") {
        if (line.length.arrive) count.arriving++;
        if (uncut - start < line.length.own) count.hurried++;
        if (uncut - start > line.length.own) count.slowed++;
      }
      // Together with its block, so only its channel can have made it wait.
      if (!line.at && parent.get(line)!.order === "together" && start > worked.get(parent.get(line)!)!.start) count.waitedForItsChannel++;
    }
  }
  for (const [what, n] of Object.entries(count)) assert.ok(n >= 100, `${what}: ${n} in ${JSON.stringify(count)}`);
});

test("random plans: nothing begins before what it comes after", () => {
  for (const { seed, plan } of PLANS) {
    const { order, parent } = written(plan);
    const worked = times(plan);
    for (const x of order) {
      const block = parent.get(x);
      if (!block) continue;
      const { start } = worked.get(x)!;
      assert.ok(start >= worked.get(block)!.start, `${x.name} before its block; ${shown(seed, plan)}`);
      for (const { of } of x.at ? [x.at] : []) {
        const named = of === "block" ? block : order.find(({ name }) => name === of)!;
        assert.ok(start >= worked.get(named)!.start, `${x.name} before ${of}, which it names; ${shown(seed, plan)}`);
      }
      if (x.at || block.order === "together") continue;
      for (const y of block.items.slice(0, block.items.indexOf(x))) if (!left(y)) assert.ok(start >= worked.get(y)!.uncut + 12, `${x.name} before the pause after ${y.name}; ${shown(seed, plan)}`);
    }
  }
});

test("random plans: a block ends after all it waits for", () => {
  for (const { seed, plan } of PLANS) {
    const { order, parent } = written(plan);
    const worked = times(plan);
    for (const x of order) {
      const block = parent.get(x);
      if (!block || left(x)) continue;
      assert.ok(worked.get(block)!.uncut >= worked.get(x)!.uncut, `${block.name} before ${x.name}; ${shown(seed, plan)}`);
      if (there(worked.get(x)!)) assert.ok(worked.get(block)!.end >= worked.get(x)!.end, `${block.name} stops before ${x.name}; ${shown(seed, plan)}`);
    }
  }
});

test("random plans: what is cut ends with its block", () => {
  for (const { seed, plan } of PLANS) {
    const { order, parent, isIn } = written(plan);
    const worked = times(plan);
    for (const z of order) {
      const block = parent.get(z);
      if (!block || !left(z)) continue;
      for (const x of order) if (isIn(x, z) && there(worked.get(x)!)) assert.ok(worked.get(x)!.end <= worked.get(block)!.uncut, `${x.name} past ${block.name}; ${shown(seed, plan)}`);
    }
  }
});

test("random plans: what is cut moves nothing else, however long it is", () => {
  let changed = 0;
  for (const { seed, plan } of PLANS) {
    const { order, parent, isIn, lines } = written(plan);
    const before = times(plan);
    for (const z of order) {
      if (!parent.has(z) || !z.cut) continue;
      const inside = order.filter((item) => isIn(item, z));
      if (order.some((item) => !inside.includes(item) && named(item).some(({ of }) => inside.some(({ name }) => name === of)))) continue;
      const measured = lines.filter((line) => inside.includes(line) && typeof line.length === "number");
      const lengths = measured.map(({ length }) => length);
      for (const other of [1, 500]) {
        for (const line of measured) line.length = other;
        const now = times(plan);
        for (const item of order) if (!inside.includes(item)) assert.deepEqual(now.get(item), before.get(item), `${z.name} at ${other} moves ${item.name}; ${shown(seed, plan)}`);
        changed++;
      }
      measured.forEach((line, k) => (line.length = lengths[k]!));
    }
  }
  assert.ok(changed > 500, `${changed}`);
});

test("random plans: without what is cut, its block and all it waits for are the same, when the block is in nothing cut itself", () => {
  let removed = 0;
  for (const { seed, plan } of PLANS) {
    const { order, parent, isIn } = written(plan);
    const before = times(plan);
    for (const z of order) {
      const block = parent.get(z);
      if (!block || !left(z) || order.some((item) => left(item) && isIn(block, item))) continue;
      const inside = order.filter((item) => isIn(item, z));
      if (order.some((item) => !inside.includes(item) && named(item).some(({ of }) => inside.some(({ name }) => name === of)))) continue;
      const at = block.items.indexOf(z);
      block.items.splice(at, 1);
      const now = times(plan);
      const waited = (item: Item): Item[] => (left(item) ? [] : [item, ...(item.kind === "block" ? item.items.flatMap(waited) : [])]);
      for (const item of block.items.flatMap(waited)) assert.deepEqual(now.get(item)!.uncut, before.get(item)!.uncut, `${z.name} moves ${item.name}; ${shown(seed, plan)}`);
      assert.equal(now.get(block)!.uncut, before.get(block)!.uncut, `${z.name} moves ${block.name}; ${shown(seed, plan)}`);
      block.items.splice(at, 0, z);
      removed++;
    }
  }
  assert.ok(removed > 500, `${removed}`);
});

test("random plans: a channel never does two things, and keeps the written order", () => {
  for (const { seed, plan } of PLANS) {
    const { lines } = written(plan);
    const worked = times(plan);
    lines.forEach((y, k) => {
      for (const x of lines.slice(0, k)) {
        if (!x.on.some((one) => y.on.includes(one)) || !there(worked.get(x)!) || !there(worked.get(y)!)) continue;
        assert.ok(worked.get(y)!.start >= worked.get(x)!.end, `${x.name} and ${y.name}; ${shown(seed, plan)}`);
      }
    });
  }
});

test("random plans: what is refused is refused for any lengths, and what is not has one timing for them", () => {
  for (const seed of SEEDS.slice(0, 2000)) {
    const plan = randomPlan(seed);
    const before = why(plan);
    const next = random(seed * 104729);
    for (const line of written(plan).lines) {
      if (typeof line.length === "number") line.length = 1 + Math.floor(next() * 400);
      else if (typeof line.length === "object") line.length = { ...line.length, ...fitted(1 + Math.floor(next() * 400)) };
    }
    assert.deepEqual(why(plan), before, shown(seed, plan));
    if (before.length === 0) for (const [item, { start, end, uncut }] of times(plan)) assert.ok([start, end, uncut].every((n) => Number.isInteger(n) && n >= 0), `${item.name}; ${shown(seed, plan)}`);
  }
});

// A plain solver, written apart from the cells: the laws as they read, over and over until nothing changes.

function plainTimes(plan: Block): Map<Item, Interval> {
  const { order, parent, isIn } = written(plan);
  const worked = new Map(order.map((item): [Item, { start: number; uncut: number }] => [item, { start: 0, uncut: 0 }]));
  const of = (item: Item) => worked.get(item)!;
  /** Where `x` stops, as `y` sees it: at its own end or the first end of a block that cuts it and not `y`. */
  const stops = (x: Item, y?: Item) => {
    let end = of(x).uncut;
    for (let z = x; parent.has(z); z = parent.get(z)!) if (left(z) && !(y && isIn(y, z))) end = Math.min(end, of(parent.get(z)!).uncut);
    return end;
  };
  /** When `x` lets go of its channel, as `y` sees it: where it ends, or where the last block that cuts it and not `y` does. */
  const free = (x: Item, y: Item) => {
    let end = of(x).uncut;
    for (let z = x; parent.has(z); z = parent.get(z)!) if (left(z) && !isIn(y, z)) end = of(parent.get(z)!).uncut;
    return end;
  };
  const momentOf = ({ of: name, at: where, plus }: Moment, y: Item) => {
    const x = name === "block" ? parent.get(y)! : order.find((item) => item.name === name)!;
    const { start, uncut } = of(x);
    const spot = where === "start" ? start : where === "end" ? stops(x, y) : start + Math.round(where * (uncut - start));
    return spot + plus < start ? start : spot + plus;
  };
  for (let pass = 0, changed = true; changed; pass++) {
    assert.ok(pass < 1000, "the plain solver does not settle");
    changed = false;
    const set = (item: Item, key: "start" | "uncut", value: number) => {
      if (of(item)[key] === value) return;
      of(item)[key] = value;
      changed = true;
    };
    order.forEach((x, k) => {
      const block = parent.get(x);
      if (block) {
        let start = of(block).start;
        if (x.at) start = Math.max(start, momentOf(x.at, x));
        else if (block.order === "in order") {
          const above = block.items.slice(0, block.items.indexOf(x)).filter((item) => !left(item));
          if (above.length === 0) start += block.lead ?? 0;
          for (const item of above) start = Math.max(start, of(item).uncut + block.pause!);
        }
        for (const y of order.slice(0, k)) {
          if (x.kind !== "block" && y.kind !== "block" && x.on.some((one) => y.on.includes(one))) start = Math.max(start, free(y, x));
        }
        set(x, "start", start);
      }
      const { start } = of(x);
      if (x.kind === "block") {
        let end = start;
        for (const item of x.items) if (!left(item)) end = Math.max(end, of(item).uncut);
        set(x, "uncut", end + (x.tail ?? 0));
      } else if (x.length === "open") set(x, "uncut", Math.max(start, of(block!).uncut));
      else if (typeof x.length === "number") set(x, "uncut", start + x.length);
      else {
        let until: number | undefined;
        if (x.length.arrive) until = momentOf(x.length.arrive, x);
        else if (block!.order === "together" && !x.at) {
          for (const y of order) {
            let waited = y.kind === "voice" && isIn(y, block!);
            for (let z = y; waited && z !== block; z = parent.get(z)!) if (left(z)) waited = false;
            if (waited) until = Math.max(until ?? 0, of(y).uncut);
          }
        }
        const { own, least, most } = x.length;
        const takes = until === undefined ? own : until - start < least ? least : until - start > most ? most : until - start;
        set(x, "uncut", start + takes);
      }
    });
  }
  return new Map(order.map((item) => [item, { start: of(item).start, end: Math.max(of(item).start, stops(item)), uncut: of(item).uncut }]));
}

test("random plans: the times are the ones of a plain solver that repeats the laws until nothing changes", () => {
  for (const { seed, plan } of PLANS) assert.deepEqual(times(plan), plainTimes(plan), shown(seed, plan));
});
