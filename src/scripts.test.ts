// Random scripts with values on every level, and sounds over their scenes and in them (AGENTS.md, "A
// script", "Values"): whole video files, read, checked and compiled as the tool does it. None throws; a mistake is told at a line of the file; and a
// script with none compiles to a whole scenario, which keeps the promises of "What happens at once". The
// promises, and the laws as they read, are tried on the script and the compiled scenario alone, without
// plan.ts and times.ts, which lay it.
//
// For more of them: RANDOM_SCRIPTS=40000 node --test src/scripts.test.ts
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { parseDocument } from "yaml";
import { z } from "zod";
import { compile, compiledText, type Compiled, type CompiledLine } from "./compile.ts";
import { secondsOf, shownAs, type Span, type Worked } from "./formula.ts";
import { different, random, type Random } from "./random.ts";
import { isBlock } from "./read.ts";
import { checkScenario, linesIn, type Anchor, type CheckedLine, type CheckedOver, type CheckedScene, type Default, type Issue, type SceneChecked, type ScriptBlock, type ScriptItem, type ScriptPlugin } from "./scenario.ts";
import { pictureOf, shownAt } from "./shown.ts";
import { writtenScript } from "./video-file.ts";
import { sharesOf } from "./words.ts";

const COUNT = Number(process.env.RANDOM_SCRIPTS ?? 4000);

const MARKS: Record<string, number> = { left: 0, middle: 500, right: 1000 };
const place: z.ZodType<Worked> = z.union([z.string(), z.lazy(() => z.strictObject({ construction: z.enum(["beside", "between"]), of: z.array(z.union([place, z.number()])).length(2) }))], { error: "it is a mark, or a place worked out" });
/** A place as an x, or why it is none. */
const xOf = (where: Worked): number | string => {
  if (typeof where === "number") return "a number is no place";
  if (typeof where === "string") return Object.hasOwn(MARKS, where) ? MARKS[where]! : `no place is called "${where}"`;
  const [one, two] = where.of;
  const x = xOf(one!);
  const other = where.construction === "beside" ? (typeof two === "number" ? two : "how far is a number") : xOf(two!);
  if (typeof x === "string" || typeof other === "string") return typeof x === "string" ? x : `${shownAs(where)}: ${other}`;
  return where.construction === "beside" ? x + other : (x + other) / 2;
};
/**
 * `walk` goes `to` a place, takes longer the `far`ther it is, and is fitted to words; `hop` hops so many
 * `times`, `spin` is on the walk's channel and another, and `watch` is open. A scene's `spots` are places. An action's
 * values say which others have surely begun before its end.
 */
const PLUGIN: ScriptPlugin = {
  actions: {
    walk: { description: "It walks.", example: "pip walk to=left", values: z.strictObject({ to: place, far: z.number().positive().max(5000).default(100) }), channels: ["place"], fits: true },
    hop: { description: "It hops.", example: "pip hop", values: z.strictObject({ times: z.number().int().positive().max(20).default(1) }), channels: ["hop"] },
    spin: { description: "It spins.", example: "pip spin", values: z.strictObject({}), channels: ["facing", "place"] },
    watch: { description: "It watches.", example: "pip watch", values: z.strictObject({ far: z.number().positive().max(5000).default(100) }), channels: ["head"], open: true },
  },
  names: { slow: 0.5, fast: 2 },
  constructions: { beside: { description: "Beside a place.", example: "beside(left, 2)" }, between: { description: "Between two.", example: "between(left, right)" } },
  tables: ["spots"],
  guide: "They walk and hop.",
  check(scenes) {
    const issues: Issue[] = [];
    const at = (line: number, where: Worked) => {
      const x = xOf(where);
      if (typeof x === "string") issues.push({ line, message: `${shownAs(where)} is no place: ${x}`, hint: "a place is left, middle or right, or worked out" });
      return typeof x === "string" ? 0 : x;
    };
    const worked = scenes.map(({ line, setting, actions }): SceneChecked => ({
      setting: { at: [0, 1], spots: Object.fromEntries(Object.entries((setting.spots ?? {}) as Record<string, Worked>).map(([who, where]) => [who, at(line, where)])) },
      actions: actions.map(({ line, action, values: taken, begun }) => {
        const values = taken as { times: number } | { to: Worked; far: number } | object;
        if (action === "watch") return { values: { ...(taken as { far: number }), begun } };
        if ("times" in values) return { values: { ...values, begun }, length: values.times * 0.4 };
        if ("to" in values) return { values: { ...values, to: at(line, values.to), begun }, length: 0.5 + values.far / 200 };
        return { values: { begun }, length: 0.7 };
      }),
    }));
    const once = issues.filter((one, k) => issues.findIndex(({ line, message }) => line === one.line && message === one.message) === k);
    return once.length > 0 ? { issues: once } : { scenes: worked };
  },
  draw: () => () => "<svg/>",
};
const SPEAKERS = ["pip", "mo", "tuk", "radio", "bird", "crowd"];
const TIMING = { lead: 0.6, gap: 0.4, tail: 1 };
/** The library's sounds, each with its file: those that a scene may play, those of each who is under the rest, and those of the cartoon's own script. */
const IN_SCENES = ["bell", "rain", "gong"];
const UNDER: Record<string, string> = { radio: "jingle", bird: "chirp", crowd: "clap" };
const OVER = ["tune", "hum", "horn"];
const SOUNDS = Object.fromEntries([...IN_SCENES, ...Object.values(UNDER), ...OVER].map((name) => [name, `sounds/${name}.wav`]));
/** The library's volumes, dB. */
const VOLUMES = { pip: -2, radio: -8.5, rain: -20, tune: -18.5 };
const MOVES = { slowest: 0.5, fastest: 2 };
/** What a line of a script keeps busy, of its character or its sound: a row that is said or played, or that names an action. */
const channelsOf = (who: string, action: string) => (action === "say" ? ["voice"] : action === "play" || action === "loop" ? ["sound"] : PLUGIN.actions[action]!.channels).map((channel) => `${who} ${channel}`);

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** Rows with a mistake in them, formulas that are a mistake in some places or in all, and names that are none of a value. */
const WRONG_ROWS = [
  ...["bell play takes=1s", "bell loop: Ding.", "pip play", "nobody loop", "bell say: Hi.", "bell play far=2", "bell play twice", "loop bell", "pip walk to=bell", "tune loop"],
  ...["pip watch takes=1s", "pip watch speed=slow", "pip watch arrive=prev.end", "pip watch far=0"],
  ...["pip", "pip walk left", "Pip say: Hi.", "pip say", "pip dance to=left", "nobody say: Hi.", "nobody walk to=left", "pip walk to=left: Whee!", "pip say loud=2: Hi.", "pip say volume=2: Hi.", "pip walk volume=-6dB", "pip Walk to=left"],
  ...["pip walk to=left to=right", "pip walk to=", "pip walk pause=1s", "pip walk nobody=1", "pip walk pip.to=left", "pip walk to=up", "pip hop times=0", "pip walk far=2px", "pip walk far=1 takes=1s speed=2"],
  ...["together", "in order: pip say: Hi.", "par:", "under:", "  pip say: Hi.", "\tpip say: Hi.", "& & pip say: Hi.", "[prev] pip say: Hi.", "[A] pip say: Hi.", "[c] & pip say: Hi.", "[a] pip say: One, two and one.", "pip say @ prev.end beat: Hi."],
];
const WRONG = [
  ...["nobody", "far-off", "home", "takes", "pause", "speed", "beat", "near", "lag", "slow", "- beat", "0", "0s", "1", "1s", "1 / 0", "(0.1 + 0.2 - 0.3)", "2px", "2 *", "(1"],
  ...["a.end", "prev.word(one)", "a.length", "prev.length", "block.length", "2s / a.length", "a.length / 2s", "(a.length / 2s) * (a.length / 1s)"],
  ...["beside(left, 2)", "beside(left, 1) * 2", "beside(left, beside(right, 1))", "besid(left, 2)", "beside()", "beside(left)", "beside(left, 2", "beside(left 2)", "beside(left, 2s)", "between(left, a.length)", "between(a.end, left)", "between(nobody, left)", "left, right"],
  ...["volume", "-6dB", "6dB", "hush", "3dB * 1s", "3dB + 1", "20dB", "-61dB", "a.length / 1s * 3dB", "6db"],
];
const WRONG_NAMES = ["bell.takes", "play.speed", "loop.arrive", "bel.volume", "bell.pause", "puase", "nobody.speed", "say.speed", "pip.pause", "lead", "Near", "pip.walk.far", "say.far", "narrator.beat", "walk.say", "watch.takes", "watch.speed", "walk.volume", "watch.volume", "sk.volume"];

/** What has a label: a line that is said, its words; an action given its length; a block, and whether a row is in it still. */
interface Above {
  label: string;
  words?: string[];
  given?: boolean;
  /** A sound that is played once, which is given its length by its file. */
  played?: boolean;
  open?: boolean;
}

/**
 * A random video file. Half of them are right but where chance has it otherwise: the formulas are of the
 * kinds their values take, and the anchors of what is above. One in four has one thing wrong in it, so
 * that nothing else hides it, and one in four is wild.
 */
function randomFile({ int, chance, pick }: Random): string {
  /** How many wrong things may be written yet. */
  let slips = chance(1 / 2) ? 0 : chance(1 / 2) ? 1 : Infinity;
  const wild = slips > 1;
  const wrong = (share: number) => slips > 0 && chance(share) && slips-- > 0;

  // The formula of a number and of a time, with the names it may read, of a time that reads lengths of lines above, and of a moment.
  const number = (names: string[], deep = 2): string => {
    if (wrong(0.08)) return pick(WRONG);
    if (deep === 0 || chance(0.6)) return pick(["1", "2", "0.5", "150%", "1.50", ...names]);
    return chance(0.25) ? `(${number(names, deep - 1)})` : `${number(names, deep - 1)} ${pick(wild ? ["+", "-", "*", "/"] : ["+", "*", "/"])} ${number(names, deep - 1)}`;
  };
  const time = (names: string[], deep = 2): string => {
    if (wrong(0.08)) return pick(WRONG);
    if (deep === 0 || chance(0.5)) return pick(["0.3s", "1s", "0.125s", ...names]);
    const inner = () => time(names, deep - 1);
    return pick([() => `(${inner()})`, () => `${inner()} + ${inner()}`, () => `(${inner()}) * ${pick(["2", "0.5", "near / 10"])}`, () => `${pick(["2", "much / near"])} * (${inner()})`, () => `(${inner()}) / ${pick(["2", "3", "1.5"])}`, ...(wild ? [() => `${inner()} - ${inner()}`] : [])])();
  };
  /** A place: a mark, a name for one, or one worked out from others. */
  const somewhere = (deep = 2): string => {
    if (wrong(0.03)) return pick(WRONG);
    if (deep === 0 || chance(0.7)) return pick(["left", "middle", "right", "home", "there"]);
    return chance(0.5) ? `beside(${somewhere(deep - 1)}, ${number(["near", "much"], 1)})` : `between(${somewhere(deep - 1)}, ${somewhere(deep - 1)})`;
  };
  /** A volume, with the name it may read. */
  const volume = (deep = 1): string => {
    if (wrong(0.08)) return pick(WRONG);
    if (deep === 0 || chance(0.6)) return pick(["-12dB", "-3.5dB", "0dB", "4dB", "hush"]);
    const inner = () => volume(deep - 1);
    return pick([() => `${inner()} * ${pick(["0.5", "50%", "two / 3"])}`, () => `${inner()} + ${inner()}`, () => `(${inner()} - 1dB) / 2`, () => `- ${inner()} / 3`, () => `${inner()} - ${inner()}`])();
  };
  /** How loud a line that is said is, where it says it itself. */
  const loud = () => (chance(0.8) ? "" : ` volume=${volume()}`);
  /** What has a label above in the scene. */
  let above: Above[] = [];
  const measured = (names: string[]): string => {
    const lengths = (list: Above[]) => list.map(({ label }) => `${label}.length`);
    const [known, sounds] = [lengths(above.filter(({ words, given }) => words || given)), lengths(above.filter(({ played }) => played))];
    const of = () => (known.length > 0 ? pick(sounds.length > 0 && chance(0.5) ? sounds : known) : "1s");
    return chance(0.5) ? time(names) : pick([() => of(), () => `${of()} / 2`, () => `(${of()} + ${time(names, 0)}) * 1.5`, () => `3s - ${of()}`, () => `${of()} - ${of()}`, () => `${of()} / 2s * beat`])();
  };
  const moment = (first: boolean): string => {
    const chosen = above.length > 0 && chance(0.7) ? pick(above) : undefined;
    const of = wrong(0.1) ? pick(["a", "z", "prev", "block", "nobody"]) : (chosen?.label ?? (first ? "block" : "prev"));
    let at = pick(["start", "start", "40%", "75%", "end"]);
    if (chosen?.words && chance(0.5)) at = `word(${pick(chosen.words)})`;
    else if (!wild && (of === "block" || chosen?.open || (chosen && !chosen.words && !chosen.given && chance(0.7)))) at = "start";
    if (wrong(0.1)) at = pick(["middle", "word(nobody)", "word(one)", "word()", "150%", "length"]);
    return `${of}.${at}${chance(0.5) ? "" : ` ${pick(["+", "-"])} ${time(["beat", "lag"], 1)}`}`;
  };

  /** Values set on a level, by name. */
  const settings = (count: number, level: "cartoon" | "scene" | "block", first = true): Map<string, string> => {
    const values = new Map<string, string>();
    const told = new Set<string>();
    for (let k = 0; k < count; k++) {
      const whose = pick(["", "", "pip.", "mo.", "walk.", "hop.", "spin.", ...(chance(0.2) ? ["watch."] : [])]);
      const name = pick(["beat", "lag", "near", "much", "far", "to", "times", "pause", "pause", "takes", "speed", "arrive", "volume", "volume", "hush", ...(level === "block" ? [] : ["lead", "tail"])]);
      // Only what is said has a volume.
      const loudest = /^(walk|hop|spin|watch)/.test(whose) && !wrong(0.1) ? pick(["say.", "narrator.", "play.", "loop.", "bell.", "rain.", "tune."]) : whose;
      const key = ["pause", "lead", "tail"].includes(name) && !wrong(0.1) ? name : `${name === "volume" ? loudest : whose}${name}`;
      if (wrong(0.08)) {
        values.set(pick(WRONG_NAMES), time(["beat"]));
        continue;
      }
      if (["takes", "speed", "arrive"].includes(name)) {
        // What is open takes none of them.
        if (whose === "watch." && !wrong(0.1)) continue;
        // One of the three for one on a level.
        if (told.has(whose) && !wild) continue;
        told.add(whose);
      }
      const moments = level === "block" ? moment(first) : pick(["prev.end", "prev.start + beat", "prev.50%", "block.start + 1s"]);
      values.set(
        key,
        name === "beat" ? pick(["0.2s", "0.4s", "0.35s", "1s"])
        : name === "lag" ? time(["beat"])
        : name === "hush" ? pick(["-6dB", "-9.5dB", "-15dB"])
        : name === "volume" ? volume()
        : name === "near" ? pick(["5", "10", "20", "7.5"])
        : name === "much" ? number(["near"])
        : name === "far" ? number(["near", "much"])
        : name === "to" ? somewhere()
        : name === "times" ? pick(["1", "2", "two", "two * 2"])
        : name === "speed" ? number(["slow", "fast", "near / 10"], 1)
        : name === "arrive" ? moments
        : level === "block" ? measured(["beat", "lag"])
        : name === "takes" && chance(0.2) ? "prev.length"
        : time(["beat", "lag"]),
      );
    }
    return values;
  };

  const rows: string[] = [];
  let labels = 0;
  let unders = 0;
  /** Who watches, in each of the blocks that are being written, the outer first: to the ends of those. */
  const watching: Set<string>[] = [];
  /** The row of one who watches from here on, in the block that is being written: none of those who do already. */
  const aWatch = (): string | undefined => {
    const who = pick(["pip", "mo", "tuk"]);
    if (watching.some((block) => block.has(who)) && !wrong(0.1)) return undefined;
    watching.at(-1)!.add(who);
    return `${who} watch${chance(0.7) ? "" : ` far=${number(["near", "much"])}`}`;
  };
  /** A sound that a row plays: `under` is who speaks when it is under the rest, whose own it is; none that is looped in a block around the row. */
  const aSound = (under: string | undefined): string | undefined => {
    const sound = wrong(0.05) ? pick([...OVER, "pip", "nobody"]) : under === undefined ? pick(IN_SCENES) : UNDER[under]!;
    return watching.some((block) => block.has(sound)) && !wrong(0.1) ? undefined : sound;
  };
  const labelled = (): Above | undefined => (chance(0.5) ? { label: wrong(0.1) ? pick(["a", "b", "z"]) : `${"abcdefgh"[labels % 8]}${labels++ < 8 ? "" : labels}` } : undefined);
  const saying = (): string[] => WORDS.slice(int(WORDS.length)).slice(0, 1 + int(chance(0.2) ? 20 : 5));
  const spoken = (words: string[]) => `${words.map((word, i) => `${word}${i < words.length - 1 && chance(0.2) ? pick([",", ".", ":", "!"]) : ""}`).join(" ")}.`;
  /** What an action takes besides its time. */
  const takenBy = (action: string) =>
    action === "spin" ? "" : action === "hop" ? pick(["", " times=2", " times=two + 1"]) : `${chance(0.5) ? "" : ` to=${somewhere()}`}${chance(0.6) ? "" : ` far=${number(["near", "much"])}`}`;
  const anAction = () => pick(["walk", "walk", "hop", "spin"]);
  /** Whether something is on one of these channels already; they are kept, unless it is so and a slip has it be. */
  const taken = (busy: Set<string>, channels: string[]) => {
    const twice = channels.some((channel) => busy.has(channel)) && !wrong(0.1);
    if (!twice) channels.forEach((channel) => busy.add(channel));
    return twice;
  };
  /** The rows of a block that ends its lines together: lines alone, one that is said and one that is done by each, with no time of their own. */
  const writeEnding = (margin: string, under?: string) => {
    const busy = new Set<string>();
    let waited = false;
    for (let k = 0, count = 1 + int(4); k < count; k++) {
      // Beside something that the block waits for, and in nothing that is under the rest.
      if ((waited && under === undefined && chance(0.15)) || wrong(0.02)) {
        const row = aWatch();
        if (row) rows.push(`${margin}${row}`);
        continue;
      }
      waited = true;
      const label = labelled();
      const own = `${k > 0 && wrong(0.05) ? "& " : ""}${label ? `[${label.label}] ` : ""}`;
      const anchor = wrong(0.05) ? ` @ ${moment(k === 0)}` : "";
      if (wrong(0.05)) {
        rows.push(`${margin}${pick(["in order", "together", "ending together", "under"])}:`, `${margin}  ${pick(["pip", "mo"])} say: One.`);
        continue;
      }
      const says = under !== undefined || chance(0.55);
      const who = under !== undefined && chance(0.7) ? under : says ? pick([...(under === undefined ? ["pip", "mo", "tuk"] : ["radio", "bird", "crowd"]), "narrator"]) : pick(["pip", "mo", "tuk"]);
      const action = says ? "say" : anAction();
      if (taken(busy, channelsOf(who, action))) {
        waited = k > 0;
        continue;
      }
      if (chance(0.15)) {
        const sound = aSound(under);
        // It is in place of what would have been written: no channel of that is busy.
        if (!sound || taken(busy, channelsOf(sound, "play"))) {
          waited = k > 0;
          continue;
        }
        rows.push(`${margin}${own}${sound} play${loud()}${anchor}`);
        if (label) above.push(Object.assign(label, { given: true, played: true }));
        continue;
      }
      if (says) {
        const words = saying();
        rows.push(`${margin}${own}${who} say${loud()}${anchor}: ${spoken(words)}`);
        if (label) above.push(Object.assign(label, { words }));
        continue;
      }
      const given = chance(0.2) ? "" : wrong(0.1) ? ` arrive=${moment(k === 0)}` : pick([` takes=${measured(["beat", "lag", "pause"])}`, ` speed=${number(["slow", "fast"], 1)}`]);
      rows.push(`${margin}${own}${who} ${action}${takenBy(action)}${given}${anchor}`);
      if (label) above.push(Object.assign(label, { given: given !== "" ? !given.startsWith(" arrive") : action !== "walk" }));
    }
  };
  /** The rows of a block, in order or all at once; `under` is who speaks in it when it is under the rest, where nobody acts. */
  const write = (margin: string, deep: number, atOnce: boolean, under?: string) => {
    const count = (under === undefined ? 1 : 2) + int(4);
    let afterUnder = false;
    /** What is busy with the rows that begin at once: all of a block together, or those that are joined. */
    let busy = new Set<string>();
    /** Whether something is in the block that it waits for; and rows of those who watch that nothing has come after. */
    let waited = false;
    let unwatched: string[] = [];
    for (let k = 0; k < count; k++) {
      if (chance(0.05)) rows.push(pick(["", `${margin}# a note`]));
      if (wrong(0.03)) {
        rows.push(`${margin}${pick(["pip", "pip walk left", "Pip say: Hi.", "pip say", "pip dance to=left", "nobody say: Hi.", "nobody walk to=left", "pip walk to=left: Whee!", "pip say loud=2: Hi.", "pip say volume=2: Hi.", "pip walk volume=-6dB", "together", "in order: pip say: Hi.", "[prev] pip say: Hi.", "[A] pip say: Hi.", "pip walk to=left to=right", "pip walk to=", "pip walk pause=1s", "pip walk nobody=1", "pip walk pip.to=left", "pip walk to=up", "pip hop times=0", "pip walk far=2px", "pip walk far=1 takes=1s speed=2", "  pip say: Hi.", "& & pip say: Hi.", "par:", "under:", "pip say @ prev.end beat: Hi.", "\tpip say: Hi.", "[c] & pip say: Hi.", "pip Walk to=left", "[a] pip say: One, two and one."])}`);
        continue;
      }
      const last = k === count - 1;
      const joined: string = k > 0 && (!afterUnder || wild) && chance(0.25) ? "& " : "";
      if (!joined && !atOnce) busy = new Set();
      const label = labelled();
      const own = label ? `[${label.label}] ` : "";
      const anchor = chance(0.2) && (k > 0 || chance(0.2)) ? ` @ ${moment(k === 0)}` : "";
      // One who watches: joined to what its block waits for, beside that, or above it; nobody under the rest does.
      const beside: boolean = waited && (atOnce || joined !== "");
      if ((under === undefined && chance(0.12) && (beside || (!last && !joined))) || wrong(0.02)) {
        const row = aWatch();
        if (!row) continue;
        rows.push(`${margin}${joined}${own}${row}${beside ? anchor : ""}`);
        if (label) above.push(Object.assign(label, { open: true }));
        if (!beside) unwatched.push(rows.at(-1)!);
        // What is joined to it would be in a block with it.
        afterUnder = !beside;
        continue;
      }
      // A loop is written as one who watches is, under the rest too.
      if (chance(under === undefined ? 0.06 : 0.35) && (beside || (!last && !joined))) {
        const sound = aSound(under);
        if (!sound || taken(busy, channelsOf(sound, "loop"))) continue;
        watching.at(-1)!.add(sound);
        rows.push(`${margin}${joined}${own}${sound} loop${loud()}${beside ? anchor : ""}`);
        if (label) above.push(Object.assign(label, { open: true }));
        if (!beside) unwatched.push(rows.at(-1)!);
        afterUnder = !beside;
        continue;
      }
      if (chance(under === undefined ? 0.14 : 0.35)) {
        const sound = aSound(under);
        if (!sound || (taken(busy, channelsOf(sound, "play")) && anchor === "")) continue;
        afterUnder = false;
        waited = true;
        unwatched = [];
        rows.push(`${margin}${joined}${own}${sound} play${loud()}${anchor}`);
        if (label) above.push(Object.assign(label, { given: true, played: true }));
        continue;
      }
      afterUnder = false;
      waited = true;
      unwatched = [];
      if (deep > 0 && chance(0.35)) {
        const kind = pick(["in order", "together", "ending together", ...(last && !wild ? [] : ["under"])]);
        const set = settings(int(3), "block", k === 0);
        rows.push(`${margin}${joined}${own}${kind}${[...set].map(([name, text]) => ` ${name}=${text}`).join("")}${anchor}:`);
        if (label) above.push(Object.assign(label, { open: true }));
        const inner = `${margin}${" ".repeat(1 + int(4))}`;
        watching.push(new Set());
        if (kind === "ending together") writeEnding(inner, under);
        else write(inner, deep - 1, kind === "together", kind === "under" ? ["radio", "bird", "crowd"][unders++ % 3] : under);
        watching.pop();
        if (label) label.open = false;
        afterUnder = kind === "under";
        continue;
      }
      if (chance(0.55) || (under !== undefined && !wrong(0.1))) {
        const who = chance(0.02) ? pick(SPEAKERS) : (under ?? pick(["pip", "mo", "tuk", "narrator"]));
        if (taken(busy, channelsOf(who, "say")) && anchor === "") continue;
        const words = saying();
        rows.push(`${margin}${joined}${own}${who} say${loud()}${anchor}: ${spoken(words)}`);
        if (label) above.push(Object.assign(label, { words }));
        continue;
      }
      const [who, action] = [pick(["pip", "mo", "tuk"]), anAction()];
      if (taken(busy, channelsOf(who, action)) && anchor === "") continue;
      const given = chance(0.6) ? "" : pick([` takes=${measured(["beat", "lag", "pause"])}`, ` speed=${number(["slow", "fast"], 1)}`, ` arrive=${moment(k === 0)}`]);
      rows.push(`${margin}${joined}${own}${who} ${action}${takenBy(action)}${given}${anchor}`);
      if (label) above.push(Object.assign(label, { given: given !== "" ? !given.startsWith(" arrive") : action !== "walk" }));
    }
    // One that nothing has come after would never be seen, unless a slip has it be.
    while (unwatched.length > 0 && rows.at(-1) === unwatched.at(-1) && !wrong(0.1)) {
      rows.pop();
      unwatched.pop();
      above = above.filter((one) => !one.open || rows.some((row) => row.includes(`[${one.label}]`)));
    }
  };

  /** The rows of the cartoon's own script: each sound once, or twice in order. */
  const writeOwn = (): string[] => {
    const own: string[] = [];
    const left = [...OVER];
    let labels = 0;
    for (let k = 0, count = 1 + int(3); k < count && left.length > 0; k++) {
      const sound = left.splice(int(left.length), 1)[0]!;
      const label = chance(0.4) ? `[${"abc"[labels++]}] ` : "";
      const anchor = chance(0.4) ? ` @ ${k > 0 && chance(0.5) ? pick(["prev.start + beat", "prev.50%", "prev.end", "prev.end + lag"]) : pick(["block.start + 1s", "block.50%", "block.end - 2s", "block.end - beat * 3"])}` : "";
      if (wrong(0.1)) own.push(pick(["pip say: Hi.", "pip walk to=left", "nobody play", "tune play takes=2s", "bell play", "under:", "[a] tune", "narrator say: One."]));
      if (chance(0.25)) {
        own.push(`${label}${pick(["in order", "in order", "under", "together"])}${chance(0.5) ? "" : ` ${chance(0.5) ? `volume=${volume()}` : `pause=${time(["beat"], 1)}`}`}${anchor}:`);
        const two = own.at(-1)!.includes("together") ? (left.splice(0, 1)[0] ?? "bell") : sound;
        own.push(`  ${sound} play${loud()}`, ...(chance(0.3) && left.length > 0 ? [`  ${left.splice(0, 1)[0]!} loop`] : []), `  ${two} play${loud()}`);
        continue;
      }
      own.push(`${label}${sound} ${pick(["loop", "play"])}${loud()}${anchor}`);
    }
    return own;
  };
  const scenes = Array.from({ length: 1 + int(3) }, (_, n) => {
    rows.length = 0;
    above = [];
    labels = 0;
    watching.splice(0, Infinity, new Set());
    write("      ", 3, false);
    const set = chance(0.5) ? [] : [...settings(1 + int(3), "scene")];
    // Between braces a comma ends a value: one with a comma is in quotes there, if it is not a mistake.
    const braced = (name: string, text: string) => `${name}: ${text.includes(",") && !wrong(0.2) ? `"${text}"` : text}`;
    const table = (key: string, rows: [string, string][]) => (rows.length === 0 ? [] : chance(0.5) ? [`    ${key}: { ${rows.map(([name, text]) => braced(name, text)).join(", ")} }`] : [`    ${key}:`, ...rows.map(([name, text]) => `      ${name}: ${text}`)]);
    const values = [...table("values", set), ...table("spots", chance(0.6) ? [] : SPEAKERS.slice(0, 1 + int(3)).map((who): [string, string] => [who, somewhere()]))];
    if (n > 0 && wrong(0.05)) return pick([["  - place: pond"], ["  - place: pond", "    values: 3", "    script: |", ...rows], ["  - 3"], ["  - place: pond", '    script: "pip say: Hi."']]);
    return ["  - place: pond", ...values, "    script: |", ...rows];
  });
  // Each is read by another below it, or by the lines.
  const cartoon = new Map([
    ["beat", pick(["0.4s", "0.25s", "1s"])],
    ["lag", time(["beat"])],
    ["near", pick(["10", "5", "12.50"])],
    ["much", chance(0.5) ? "near * 2" : number(["near"])],
    ["two", "2"],
    ["hush", pick(["-10dB", "-4.5dB"])],
    ["narrator.volume", "hush"],
    ["home", pick(["left", "right"])],
    ["there", pick(["home", "between(home, right)", "beside(home, near * 2)"])],
    ["to", "there"],
    ["times", "two"],
    ["lead", "(lag + beat) * much / near / 2"],
    ...settings(chance(0.5) ? 0 : 1 + int(3), "cartoon"),
  ]);
  if (wrong(0.1)) cartoon.delete(pick([...cartoon.keys()]));
  if (wrong(0.05)) cartoon.set("beat", pick(["lag", "beat", "two", "a.end", "a.length", "{ short: 1s }", "", "[1s]"]));
  return ["use: cartoon", ...(wrong(0.02) ? ["valuse: { beat: 1s }"] : []), "values:", ...[...cartoon].map(([name, text]) => `  ${name}: ${text}`), ...(chance(0.4) ? ["script: |", ...writeOwn().map((row) => `  ${row}`)] : []), "scenes:", ...scenes.flat(), ""].join("\n");
}

type Item = ScriptItem<CheckedLine>;
type Block = ScriptBlock<CheckedLine>;

/** A script with no mistake, checked, and how long its voices and its sounds, by their files, turn out to be, frames. */
interface Taken {
  text: string;
  scenes: CheckedScene[];
  over?: CheckedOver;
  defaults: Default[];
  fps: number;
  voices: number[];
  sounds: Record<string, number>;
}

const from = random(5);
/** Files that are YAML: any other is refused before its script is read (video-file.ts). */
const FILES = different(
  COUNT,
  () => {
    for (;;) {
      const text = randomFile(from);
      if (parseDocument(text).errors.length === 0) return text;
    }
  },
  (text) => text,
);
const saidIn = (scenes: CheckedScene[]) => scenes.flatMap((scene) => linesIn(scene.items)).filter((line) => "text" in line);
/** The scripts of a scenario: its scenes', and the cartoon's own. */
const partsIn = ({ scenes, over }: Pick<Taken, "scenes" | "over">): (CheckedScene | CheckedOver)[] => [...scenes, ...(over ? [over] : [])];
const playedIn = (taken: Pick<Taken, "scenes" | "over">) => partsIn(taken).flatMap(({ items }) => linesIn(items)).filter((line) => "sound" in line);
/** Some length for each sound, frames. */
const someSounds = (): Record<string, number> => Object.fromEntries(Object.values(SOUNDS).map((file) => [file, 1 + from.int(from.chance(0.6) ? 300 : 40)]));
/** As it comes to its plugin's process and back: as JSON. */
const sent = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

const TAKEN: Taken[] = [];
const REFUSED: { text: string; issues: Issue[] }[] = [];
for (const text of FILES) {
  try {
    const checked = sent(await checkScenario(PLUGIN, sent(writtenScript(text)!), undefined, SPEAKERS, TIMING, VOLUMES, SOUNDS));
    if ("issues" in checked) REFUSED.push({ text, issues: checked.issues });
    else TAKEN.push({ text, ...checked, fps: from.pick([24, 25, 30]), voices: saidIn(checked.scenes).map(() => 1 + from.int(from.chance(0.3) ? 200 : 60)), sounds: someSounds() });
  } catch (e) {
    throw new Error(`${text}\n\nthrows`, { cause: e });
  }
}

const compiledOf = ({ scenes, over, fps, voices, sounds }: Taken, lengths = voices): Compiled =>
  compile(scenes, lengths.map((frames, k) => ({ file: `${k}.wav`, duration: frames / fps, mouth: Array.from({ length: frames }, () => 0.5) })), { fps, loudness: -14, moves: MOVES }, "x.yaml", Object.fromEntries(Object.entries(sounds).map(([file, frames]) => [file, frames / fps])), over);

/**
 * A scene's captions, as a plain re-telling of the rules has them: two at most up at once, each in a row of
 * its own, and one alone by itself; a line's in one row, or alone, a caption after another from its first
 * frame to its last at least, each row's of a row's length, its words in order; in a row when another
 * captioned line sounds with it, the upper when nothing in that sounds as it begins; and none only for a line
 * that two before it sound with on one frame: louder ones, or as loud and begun earlier, or written earlier.
 */
function captionsKept(lines: CompiledLine[]): Set<string> {
  const seen = new Set<string>();
  const said = lines.filter((line) => "text" in line);
  const captioned = said.filter((line) => line.captions.length > 0);
  const sounds = (line: (typeof said)[number], frame: number) => line.from <= frame && frame < line.from + line.frames;
  const all = said.flatMap((line) => line.captions);
  for (const { from } of all) {
    const up = all.filter((c) => c.from <= from && from < c.from + c.frames);
    assert.ok(up.length === 1 || (up.length === 2 && up[0]!.row !== undefined && up[1]!.row !== undefined && up[0]!.row !== up[1]!.row), `up on frame ${from}: ${JSON.stringify(up)}`);
  }
  for (const line of said) {
    const { captions } = line;
    const others = captioned.filter((one) => one !== line);
    if (captions.length === 0) {
      const before = (one: (typeof said)[number]) => one.volume > line.volume || (one.volume === line.volume && (one.from < line.from || (one.from === line.from && said.indexOf(one) < said.indexOf(line))));
      const frames = [line.from, ...others.map(({ from }) => from)].filter((frame) => sounds(line, frame));
      assert.ok(frames.some((frame) => others.filter((one) => sounds(one, frame) && before(one)).length >= 2), `line ${line.line} has no caption`);
      seen.add("none");
      continue;
    }
    seen.add(captions[0]!.row === undefined ? "alone" : `row ${captions[0]!.row}`);
    if (captions[0]!.row !== undefined && captions.length > 1) seen.add("rows of one line");
    if (captions[0]!.row !== undefined && said.some((one) => one !== line && one.from === line.from && one.captions.length > 0)) seen.add("begun at once");
    const { row } = captions[0]!;
    assert.ok(captions.every((one) => one.row === row), `line ${line.line} changes its row`);
    const atOnce = others.filter((one) => one.from < line.from + line.frames && line.from < one.from + one.frames);
    assert.equal(row !== undefined, atOnce.length > 0, `line ${line.line} is in row ${row}, ${atOnce.length} at once with it`);
    if (row !== undefined) assert.equal(row === 1, !atOnce.some((one) => one.captions[0]!.row === 1 && sounds(one, line.from)), `line ${line.line} is in row ${row}`);
    assert.equal(captions[0]!.from, line.from, `line ${line.line}'s caption is late`);
    for (const [k, one] of captions.entries()) if (k > 0) assert.equal(one.from, captions[k - 1]!.from + captions[k - 1]!.frames, `line ${line.line}'s captions are apart`);
    assert.ok(captions.at(-1)!.from + captions.at(-1)!.frames >= line.from + line.frames, `line ${line.line}'s captions end before it`);
    if (row !== undefined) for (const { text } of captions) assert.ok(text.length <= 56, `line ${line.line} has a row of ${text.length} characters`);
    // A piece shorter than half a frame is none.
    const words = line.text.replace(/\s+/g, " ");
    captions.reduce((at, { text }) => {
      const found = words.indexOf(text, at);
      assert.ok(found >= at, `line ${line.line}'s captions are not its words`);
      return found + text.length;
    }, 0);
  }
  return seen;
}

/** Tries every script with no mistake, says how many different ones they are, and shows the one that fails. */
function tried(t: TestContext, check: (taken: Taken) => void): void {
  t.diagnostic(`${TAKEN.length} different scripts with no mistake, of ${FILES.length} different scripts`);
  for (const taken of TAKEN) {
    try {
      check(taken);
    } catch (e) {
      throw new Error(`${taken.text}\n\nits voices, at ${taken.fps} frames a second: ${taken.voices}; its sounds: ${JSON.stringify(taken.sounds)}\n\n${e instanceof Error ? e.message : e}`, { cause: e });
    }
  }
}

/**
 * A scenario as it is checked and as it is compiled, side by side, scene by scene, and the cartoon's own script
 * as a scene over all of them, whose every row begins with it and is left: what is around each thing, and when
 * it happens by the laws.
 */
function laid(taken: Pick<Taken, "scenes" | "over" | "fps" | "sounds">, compiled: Compiled, voices: number[]) {
  const { scenes, fps, sounds } = taken;
  const at = new Map([...(compiled.lines ?? []), ...compiled.scenes.flatMap((scene) => scene.lines)].map((line) => [line.line, line]));
  /** How long each line lasts when nothing cuts it, frames, by its line: of what is said, or given its length. */
  const known = new Map<number, number>();
  const framesOf = (span: Span) => Math.round(secondsOf(span, (line) => known.get(line)! / fps) * fps);
  let next = 0;
  for (const line of partsIn(taken).flatMap((scene) => linesIn(scene.items))) {
    if ("text" in line) known.set(line.line, voices[next++]!);
    else if ("sound" in line) void (line.action === "play" && known.set(line.line, sounds[line.sound]!));
    else if (line.takes !== undefined) known.set(line.line, Math.max(1, framesOf(line.takes)));
  }
  const pauseOf = (span: Span | undefined) => Math.max(0, framesOf(span!));

  const PAUSES = { setting: {}, lead: 0, pause: 0, tail: 0 };
  return partsIn(taken).map((part, n) => {
    const over = n === scenes.length;
    const scene: CheckedScene = { ...PAUSES, ...part };
    const { from, frames } = over ? { from: 0, frames: compiled.frames } : compiled.scenes[n]!;
    const order: Item[] = [];
    const parent = new Map<Item, Block | CheckedScene>();
    const add = (item: Item, around: Block | CheckedScene) => {
      order.push(item);
      parent.set(item, around);
      if (isBlock(item)) for (const inner of item.items) add(inner, item);
    };
    for (const item of scene.items) add(item, scene);
    const isScene = (one: Item | CheckedScene): one is CheckedScene => one === scene;
    const inOrder = (block: Block | CheckedScene) => (isScene(block) ? !over : block.order === "in order");
    const ending = (block: Block | CheckedScene) => !isScene(block) && block.order === "ending together";
    const open = (item: Item) => !isBlock(item) && (("length" in item && item.length === "open") || item.action === "loop");
    const left = (item: Item) => (isBlock(item) && item.under === true) || open(item) || (over && parent.get(item) === scene);
    /** `x` and the blocks it is in, the inner first, up to the scene's own. */
    const withBlocks = (x: Item): Item[] => {
      const list = [x];
      for (let block = parent.get(x)!; !isScene(block); block = parent.get(block)!) list.push(block);
      return list;
    };
    const aboveIn = (x: Item) => {
      const { items } = parent.get(x)!;
      return items.slice(0, items.indexOf(x));
    };
    /** The lines a thing waits for, itself when it is one, however deep. */
    const waited = (item: Item): CheckedLine[] => (left(item) ? [] : isBlock(item) ? item.items.flatMap(waited) : [item]);
    /** The line as compiled; none when its block ended before it began. */
    const there = (line: CheckedLine): CompiledLine | undefined => at.get(line.line);
    /** A block that ends its lines together fits none of them: an action given no length takes its own. One that is open lasts as its block does. */
    const lasts = (line: CheckedLine): number => {
      if (open(line)) return Math.max(0, uncutOf(parent.get(line)!) - startOf(line));
      return known.get(line.line) ?? ("length" in line && ending(parent.get(line)!) ? Math.max(1, Math.round((line.length as number) * fps)) : there(line)!.frames);
    };
    /** The blocks at whose ends `x` is cut, the inner first; as `y` sees it, not for what `y` is in too. */
    const cutBy = (x: Item, y?: Item) => withBlocks(x).filter((z) => left(z) && !(y && withBlocks(y).includes(z))).map((z) => parent.get(z)!);

    /** What an anchor of `x` names. */
    const named = (of: string, x: Item): Item | CheckedScene => {
      if (of !== "prev" && of !== "block") return order.find(({ label }) => label === of)!;
      const block = parent.get(x)!;
      const joined = !isScene(block) && block.joined;
      if (of === "block") return joined ? named(of, block as Block) : block;
      const prev = aboveIn(x).at(-1);
      if (!prev) return named(of, block as Block);
      return isBlock(prev) && prev.joined ? prev.items.at(-1)! : prev;
    };

    // When things happen, by the laws, from when the lines do as compiled: NaN for what is worked out from a line that is not there.
    const startOf = (x: Item | CheckedScene): number => (isScene(x) ? from : isBlock(x) ? Math.max(...beginsBy(x)) : (there(x)?.from ?? NaN));
    const uncutOf = (x: Item | CheckedScene): number => {
      if (isScene(x)) return from + frames;
      // Each line of one that ends them together is taken to begin as soon as it can: the last to end is the end of all.
      if (isBlock(x) && ending(x)) return Math.max(startOf(x), ...linesIn([x]).filter((line) => !left(line)).map((line) => Math.max(startOf(x), ...freeOf(line)) + lasts(line)));
      if (isBlock(x)) return Math.max(startOf(x), ...x.items.filter((item) => !left(item)).map(uncutOf));
      return there(x) ? startOf(x) + lasts(x) : NaN;
    };
    /** When a line's channel is free: where each line above it on that has ended, or what cuts it. */
    const freeOf = (line: CheckedLine): number[] => {
      const lines = order.filter((item): item is CheckedLine => !isBlock(item));
      const own = channelsOf(line.who, line.action);
      return lines.slice(0, lines.indexOf(line)).filter(({ who, action }) => channelsOf(who, action).some((channel) => own.includes(channel))).map((other) => uncutOf(cutBy(other, line).at(-1) ?? other));
    };
    const momentOf = ({ of, at: where, plus }: Anchor, x: Item): number => {
      const w = named(of, x);
      const start = startOf(w);
      const after = framesOf(plus);
      if (where === "start") return start + Math.max(0, after);
      if (where === "end") return Math.max(start, Math.min(uncutOf(w), ...(isScene(w) ? [] : cutBy(w, x).map(uncutOf))) + after);
      const text = isScene(w) || isBlock(w) || !("text" in w) ? "" : w.text;
      const share = "share" in where ? where.share : sharesOf(text, where.word)[0]!;
      return Math.max(start, start + Math.round(share * (uncutOf(w) - start)) + after);
    };
    /** What a thing begins by, but for its channels: the latest of these. */
    const beginsBy = (x: Item): number[] => {
      const block = parent.get(x)!;
      const start = startOf(block);
      if (x.anchor) return [start, momentOf(x.anchor, x)];
      if (ending(block)) return left(x) ? [start] : [start, uncutOf(block) - lasts(x as CheckedLine)];
      if (!inOrder(block)) return [start];
      const waits = aboveIn(x).filter((item) => !left(item));
      if (waits.length === 0) return [start + (isScene(block) ? pauseOf(scene.lead) : 0)];
      return [start, ...waits.map((item) => uncutOf(item) + pauseOf(block.pause))];
    };
    return { scene, over, from, frames, order, parent, isScene, inOrder, ending, open, left, withBlocks, aboveIn, waited, there, lasts, cutBy, named, startOf, uncutOf, freeOf, momentOf, beginsBy, pauseOf };
  });
}
type Laid = ReturnType<typeof laid>[number];
const linesOf = ({ order }: Laid) => order.filter((item): item is CheckedLine => !isBlock(item));

/** The seconds and the moments a thing's time is worked out from. */
const spansOf = (item: Item): Span[] => [item.anchor?.plus, isBlock(item) ? item.pause : undefined, !isBlock(item) && "values" in item ? item.takes : undefined, !isBlock(item) && "values" in item ? item.arrive?.plus : undefined].filter((span) => span !== undefined);
const anchorsOf = (item: Item): Anchor[] => [item.anchor, !isBlock(item) && "values" in item ? item.arrive : undefined].filter((anchor) => anchor !== undefined);

test("random scripts: none throws, and a mistake is told once, at lines of its file, with a hint", (t) => {
  t.diagnostic(`${REFUSED.length} different scripts with a mistake, of ${FILES.length} different scripts`);
  for (const { text, issues } of REFUSED) {
    const rows = text.split("\n").length;
    assert.ok(issues.length > 0, text);
    for (const { line, also = [], message, hint } of issues) {
      const told = `${JSON.stringify({ line, also, message, hint })}\n${text}`;
      assert.ok(Number.isInteger(line) && line > 0 && line < rows, told);
      assert.ok(also.every((other, k) => Number.isInteger(other) && other > 0 && other < rows && other !== line && (k === 0 || other > also[k - 1]!)), told);
      assert.ok(message.length > 5 && hint.length > 5 && !/undefined|NaN|\[object|Infinity/.test(message + hint), told);
    }
    const once = new Set(issues.map(({ line, message }) => `${line} ${message}`));
    assert.equal(once.size, issues.length, `the same mistake twice: ${JSON.stringify(issues)}\n${text}`);
  }
});

test("random scripts: there are many with no mistake, and everything a script can have is in them", (t) => {
  const count = { placedInLine: 0, placedInSpots: 0, scenes: 0, lines: 0, onTwoChannels: 0, twoThingsAtOnce: 0, neverFitted: 0, surelyBegun: 0, open: 0, openInOrder: 0, openBeside: 0, openAnchored: 0, openEnding: 0, openNamed: 0, joined: 0, under: 0, anchored: 0, byWord: 0, byPrev: 0, byBlock: 0, takes: 0, arrives: 0, hurried: 0, slowed: 0, fastest: 0, slowest: 0, lengthsRead: 0, pauseOfLengths: 0, cutShort: 0, notThere: 0, waitedForItsChannel: 0, endingTogether: 0, begunLater: 0, endingLater: 0, played: 0, playedAnchored: 0, playedEnding: 0, playedCut: 0, playedNotThere: 0, lengthOfOne: 0, looped: 0, loopedUnder: 0, loopedBeside: 0, loopedCut: 0, soundsOfTwo: 0, over: 0, overLoops: 0, overCut: 0, overAnchored: 0, overInOrder: 0, overFromTheEnd: 0, soundVolume: 0, overVolume: 0, setOnScene: 0, setOnBlock: 0, setOnLine: 0, forOne: 0, forAnAction: 0, defaults: 0, quieter: 0, louder: 0, ofTheLibrary: 0, sayVolume: 0, oneVolume: 0, blockVolume: 0 };
  tried(t, (taken) => {
    const compiled = compiledOf(taken);
    count.placedInLine += /walk.* to=(beside|between)\(/.test(taken.text) ? 1 : 0;
    count.placedInSpots += / {4}spots:/.test(taken.text) ? 1 : 0;
    count.setOnScene += / {4}values:/.test(taken.text) ? 1 : 0;
    count.setOnBlock += /(in order|together|under) [a-z.]+=/.test(taken.text) ? 1 : 0;
    count.setOnLine += /(walk|hop) [a-z]+=/.test(taken.text) ? 1 : 0;
    count.forOne += /(pip|mo)\.[a-z]+(=|:)/.test(taken.text) ? 1 : 0;
    count.forAnAction += /(walk|hop|spin)\.[a-z]+(=|:)/.test(taken.text) ? 1 : 0;
    count.defaults += taken.defaults.length > 0 ? 1 : 0;
    count.sayVolume += /say\.volume(=|:)/.test(taken.text) ? 1 : 0;
    count.oneVolume += /(pip|mo)\.volume(=|:)/.test(taken.text) ? 1 : 0;
    count.blockVolume += /(in order|together|under)[^:]* volume=/.test(taken.text) ? 1 : 0;
    count.soundVolume += /(bell|rain|tune|play|loop)\.volume(=|:)/.test(taken.text) ? 1 : 0;
    count.overVolume += /script: \|\n( {2}.*\n)*? {2}.* (play|loop) volume=/.test(taken.text) ? 1 : 0;
    for (const line of saidIn(taken.scenes)) {
      if (line.volume < 0) count.quieter++;
      if (line.volume > 0) count.louder++;
      if (line.volume === (VOLUMES as Record<string, number>)[line.who]) count.ofTheLibrary++;
    }
    for (const one of laid(taken, compiled, taken.voices)) {
      if (one.over) {
        count.over++;
        for (const line of linesOf(one)) {
          const there = one.there(line);
          if (line.action === "loop") count.overLoops++;
          else if (there && there.frames < one.lasts(line)) count.overCut++;
          if (line.anchor?.of === "block" && line.anchor.at === "end") count.overFromTheEnd++;
          else if (line.anchor) count.overAnchored++;
          if (one.parent.get(line) !== one.scene) count.overInOrder++;
        }
        continue;
      }
      const sounding = linesOf(one).filter((line) => "sound" in line);
      count.soundsOfTwo += sounding.some((line) => sounding.some((other) => other !== line && one.there(other) && one.there(line) && one.there(other)!.from < one.there(line)!.from + one.there(line)!.frames && one.there(line)!.from < one.there(other)!.from + one.there(other)!.frames)) ? 1 : 0;
      count.scenes++;
      for (const item of one.order) {
        if (isBlock(item) && item.joined) count.joined++;
        if (isBlock(item) && item.under) count.under++;
        if (isBlock(item) && one.ending(item)) {
          const placed = linesIn([item]).flatMap((line) => one.there(line) ?? []);
          if (placed.length > 1) count.endingTogether++;
          count.begunLater += placed.filter((line) => line.from > one.startOf(item)).length;
          if (placed.length > 0 && placed.every((line) => line.from > one.startOf(item))) count.endingLater++;
        }
        if (isBlock(item) && typeof item.pause === "object") count.pauseOfLengths++;
        for (const { of, at } of anchorsOf(item)) {
          if (of === "prev") count.byPrev++;
          if (of === "block") count.byBlock++;
          if (typeof at === "object" && "word" in at) count.byWord++;
        }
        if (item.anchor) count.anchored++;
        if (!isBlock(item) && "sound" in item) {
          const there = one.there(item);
          const block = one.parent.get(item)!;
          const under = one.withBlocks(item).some((z) => z !== item && one.left(z));
          if (item.action === "loop") {
            count.looped++;
            if (under) count.loopedUnder++;
            if (!one.inOrder(block)) count.loopedBeside++;
            if (there && under && there.frames < one.lasts(item)) count.loopedCut++;
            continue;
          }
          count.played++;
          if (item.anchor) count.playedAnchored++;
          if (one.ending(block)) count.playedEnding++;
          if (!there) count.playedNotThere++;
          else if (there.frames < one.lasts(item)) count.playedCut++;
          if (one.order.some((other) => spansOf(other).some((span) => typeof span === "object" && span.lengths.some(({ line }) => line === item.line)))) count.lengthOfOne++;
          continue;
        }
        if (one.open(item)) {
          const block = one.parent.get(item)!;
          count.open++;
          if (one.inOrder(block)) count.openInOrder++;
          else if (one.ending(block)) count.openEnding++;
          else count.openBeside++;
          if (item.anchor) count.openAnchored++;
          if (item.label && one.order.some((other) => anchorsOf(other).some(({ of }) => of === item.label))) count.openNamed++;
          if (!one.there(item as CheckedLine)) continue;
        }
        if (spansOf(item).some((span) => typeof span === "object")) count.lengthsRead++;
        if (isBlock(item)) continue;
        count.lines++;
        const there = one.there(item);
        if (!there) count.notThere++;
        else if (there.frames < one.lasts(item)) count.cutShort++;
        if (there && !item.anchor && !one.inOrder(one.parent.get(item)!) && !one.ending(one.parent.get(item)!) && there.from > one.startOf(one.parent.get(item)!)) count.waitedForItsChannel++;
        if (!("values" in item)) continue;
        if (item.channels.length > 1) count.onTwoChannels++;
        const beside = there ? linesOf(one).flatMap((other) => (other !== item && other.who === item.who ? (one.there(other) ?? []) : [])) : [];
        if (there && beside.some((other) => other.from < there.from + there.frames && there.from < other.from + other.frames)) count.twoThingsAtOnce++;
        if (item.action !== "walk" && item.takes === item.length) count.neverFitted++;
        if ((item.values as { begun: number[] }).begun.length > 0) count.surelyBegun++;
        if (item.takes !== undefined) count.takes++;
        if (item.arrive) count.arrives++;
        if (item.takes !== undefined || !there || item.length === "open") continue;
        const own = Math.max(1, Math.round(item.length * taken.fps));
        if (there.frames < own) count.hurried++;
        if (there.frames > own) count.slowed++;
        if (there.frames < own && there.frames === Math.ceil(own / 2)) count.fastest++;
        if (there.frames === own * 2) count.slowest++;
      }
    }
  });
  t.diagnostic(JSON.stringify(count));
  assert.ok(TAKEN.length >= FILES.length / 5, `${TAKEN.length} of ${FILES.length}`);
  for (const [what, n] of Object.entries(count)) assert.ok(n >= FILES.length / 100, `${what}: ${n} in ${JSON.stringify(count)}`);
});

test("random scripts: each compiles to a whole scenario, of plain values, with something to show on every frame", (t) => {
  const captioned: Record<string, number> = { alone: 0, "row 1": 0, "row 2": 0, none: 0, "rows of one line": 0, "begun at once": 0 };
  tried(t, (taken) => {
    const seen = new Set<string>();
    const compiled = compiledOf(taken);
    assert.deepEqual(compiledOf(taken), compiled, "compiled again, it is another");
    assert.deepEqual(JSON.parse(compiledText(compiled)), compiled, "it is not plain");
    for (const { setting, lines } of compiled.scenes) {
      for (const x of Object.values((setting as { spots: Record<string, unknown> }).spots)) assert.ok(Number.isFinite(x), `a spot is ${x}`);
      for (const line of lines) if (line.action === "walk" && "values" in line) assert.ok(Number.isFinite((line.values as { to: unknown }).to), `line ${line.line} goes to no x`);
    }
    assert.equal(compiled.lines !== undefined, taken.over !== undefined);
    const own = linesIn(taken.over?.items ?? []).map(({ line }) => line);
    assert.deepEqual((compiled.lines ?? []).map(({ line }) => line), own.filter((line) => compiled.lines!.some((one) => one.line === line)), "the cartoon's own lines are not in the order written");
    for (const line of compiled.lines ?? []) {
      assert.ok(Number.isSafeInteger(line.from) && Number.isSafeInteger(line.frames) && line.frames > 0 && line.from >= 0 && line.from + line.frames <= compiled.frames, `line ${line.line} is from ${line.from} for ${line.frames}`);
    }
    for (const line of [...(compiled.lines ?? []), ...compiled.scenes.flatMap((scene) => scene.lines)]) {
      if (line.action !== "play" && line.action !== "loop") assert.ok(!("sound" in line));
      else assert.deepEqual(Object.keys(line), ["line", "who", "action", "from", "frames", "sound", "volume"]);
    }
    let end = 0;
    for (const [n, scene] of compiled.scenes.entries()) {
      assert.equal(scene.from, end, `scene ${n + 1} does not follow the one before`);
      assert.ok(Number.isSafeInteger(scene.frames) && scene.frames > 0, `scene ${n + 1} lasts ${scene.frames}`);
      end += scene.frames;
      const lines = linesIn(taken.scenes[n]!.items).map(({ line }) => line);
      assert.deepEqual(scene.lines.map(({ line }) => line), lines.filter((line) => scene.lines.some((one) => one.line === line)), "the lines are not in the order written");
      for (const line of scene.lines) {
        assert.ok(Number.isSafeInteger(line.from) && Number.isSafeInteger(line.frames) && line.frames > 0, `line ${line.line} is from ${line.from} for ${line.frames}`);
        assert.ok(line.from >= scene.from && line.from + line.frames <= end, `line ${line.line} is out of its scene`);
        if (!("text" in line)) continue;
        assert.equal(line.mouth.length, line.frames, `line ${line.line} has ${line.mouth.length} frames of its mouth`);
        for (const { from, frames, text } of line.captions) {
          assert.ok(Number.isSafeInteger(from) && frames > 0 && from >= line.from && from + frames <= end && text !== "", `a caption of line ${line.line} is from ${from} for ${frames}`);
        }
      }
      for (const one of captionsKept(scene.lines)) seen.add(one);
    }
    for (const one of seen) captioned[one]!++;
    assert.equal(compiled.frames, end, "its scenes do not add up");
    const picture = pictureOf(compiled);
    const frames = picture.scenes.flatMap(({ from, frames, actions, mouths }) => [from, from + frames - 1, ...actions.flatMap((one) => [one.from, one.from + one.frames]), ...mouths.map((one) => one.from)]);
    for (const frame of new Set(frames.filter((one) => one < compiled.frames))) {
      for (const { progress, into } of shownAt(picture, frame).actions) assert.ok(progress >= 0 && progress <= 1 && into >= 0, `frame ${frame} shows an action ${progress} through`);
    }
  });
  // Scripts with each kind of caption.
  t.diagnostic(JSON.stringify(captioned));
  for (const [what, n] of Object.entries(captioned)) assert.ok(n >= FILES.length / 100, `${what}: ${n} in ${JSON.stringify(captioned)}`);
});

test("random scripts: what is said or played is as loud as the nearest level has it, worked out by what its names are there", (t) => {
  let set = 0;
  tried(t, (taken) => {
    const script = writtenScript(taken.text)!;
    const whole = compiledOf(taken);
    const compiled = new Map([...(whole.lines ?? []), ...whole.scenes.flatMap((scene) => scene.lines)].map((line) => [line.line, line]));
    const checked = new Map([...saidIn(taken.scenes), ...playedIn(taken)].map((line) => [line.line, line]));
    const library = Object.fromEntries(Object.entries(VOLUMES).map(([who, dB]) => [`${who}.volume`, `${dB}dB`]));
    const texts = (values: Record<string, { text: string }> = {}) => Object.fromEntries(Object.entries(values).map(([name, { text }]) => [name, text]));
    /** A value's number: each name in it is what the nearest level has for it, the character's or the sound's first, then what is said's or played's. */
    const worth = (name: string, who: string, action: string, levels: Record<string, string>[]): number => {
      for (const level of levels) {
        const key = [`${who}.${name}`, `${action}.${name}`, name].find((one) => Object.hasOwn(level, one));
        if (key === undefined) continue;
        const numbers = level[key]!.replace(/dB/g, "").replace(/([\d.]+)%/g, "($1 / 100)").replace(/[a-z][a-z0-9-]*/g, (one) => `(${worth(one, who, action, levels)})`);
        return Function(`return ${numbers.replace(/-\s*-/g, "+").replace(/-\s*\(-/g, "+ (")}`)() as number;
      }
      throw new Error(`no level sets ${name}`);
    };
    const look = (items: ScriptItem[], levels: Record<string, string>[]) => {
      for (const item of items) {
        if (isBlock(item)) {
          look(item.items, [item.values ?? {}, ...levels]);
          continue;
        }
        if (!["say", "play", "loop"].includes(item.action)) continue;
        const expected = worth("volume", item.who, item.action, [item.values, ...levels]);
        const { volume } = checked.get(item.line)!;
        assert.ok(Math.abs(volume - expected) < 1e-5, `line ${item.line} is at ${volume} dB, not ${expected}`);
        const there = compiled.get(item.line);
        if (there) assert.equal("volume" in there && there.volume, volume, `line ${item.line} as compiled`);
        if (volume !== 0) set++;
      }
    };
    look(script.over?.items ?? [], [texts(script.values), { ...library, volume: "0dB" }]);
    for (const scene of script.scenes) look(scene.items, [texts(scene.values), texts(script.values), { ...library, volume: "0dB" }]);
  });
  assert.ok(set > FILES.length, `${set}`);
});

test("random scripts: without what is open, all the rest is where it was, but what waits for its channel", (t) => {
  let without = 0;
  tried(t, (taken) => {
    const scenes = laid(taken, compiledOf(taken), taken.voices);
    for (const [n, { scene, over, order, open }] of scenes.entries()) {
      for (const z of order.filter(open) as CheckedLine[]) {
        const below = order.slice(order.indexOf(z) + 1);
        const free = !below.some((item) => !isBlock(item) && channelsOf(item.who, item.action).some((channel) => channelsOf(z.who, z.action).includes(channel)));
        // `prev` may be it, and what is joined to it, or it to that, is another block without it.
        const named = order.some((item) => anchorsOf(item).some(({ of }) => of === z.label || of === "prev")) || order.some((item) => isBlock(item) && item.joined && item.items.includes(z));
        if (!free || named) continue;
        const drop = (items: Item[]): Item[] => items.filter((item) => item !== z).map((item) => (isBlock(item) ? { ...item, items: drop(item.items) } : item));
        const rest = { ...taken, scenes: taken.scenes.map((one, k) => (k === n ? { ...scene, items: drop(scene.items) } : one)), ...(over ? { over: { ...taken.over!, items: drop(scene.items) } } : {}) };
        const lines = ({ lines = [], scenes }: Compiled) => [{ from: 0, frames: 0, lines }, ...scenes].map(({ from, frames, lines }) => [from, frames, lines.filter(({ line }) => line !== z.line).map(({ line, from, frames }) => [line, from, frames])]);
        assert.deepEqual(lines(compiledOf(rest)), lines(compiledOf(taken)), `line ${z.line}, which is open, moves something`);
        without++;
      }
    }
  });
  assert.ok(without >= FILES.length / 20, `${without}`);
});

/** The scripts of a scenario with its voices and sounds as they are, with others, and with each a frame long: whatever the lengths, it has one timing. */
function* timings(taken: Taken): Generator<Laid> {
  const others = taken.voices.map((_, k) => 1 + ((k * 89 + 31) % 240));
  const long = Object.fromEntries(Object.keys(taken.sounds).map((file, k) => [file, 1 + ((k * 61 + 17) % 190)]));
  const short = Object.fromEntries(Object.keys(taken.sounds).map((file) => [file, 1]));
  for (const [voices, sounds] of [[taken.voices, taken.sounds], [others, long], [taken.voices.map(() => 1), short]] as const) yield* laid({ ...taken, sounds }, compiledOf({ ...taken, sounds }, voices), voices);
}

test("random scripts: nothing begins before what it comes after, whatever the voices' lengths", (t) => {
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      const { scene, from, inOrder, isScene, left, withBlocks, parent, aboveIn, waited, there, lasts, named, pauseOf } = one;
      for (const line of linesOf(one)) {
        const placed = there(line);
        if (!placed) continue;
        for (const x of withBlocks(line)) {
          const block = parent.get(x)!;
          if (x.anchor) {
            const w = named(x.anchor.of, x);
            const begun = isScene(w) ? from : isBlock(w) ? undefined : there(w)?.from;
            assert.ok(begun === undefined || placed.from >= begun, `line ${line.line} begins before what line ${x.line} is anchored to`);
            continue;
          }
          if (!inOrder(block)) continue;
          const above = aboveIn(x).filter((item) => !left(item));
          if (above.length === 0 && isScene(block)) assert.ok(placed.from >= from + pauseOf(scene.lead), `line ${line.line} begins before the scene's lead`);
          for (const before of above.flatMap(waited)) {
            const done = there(before);
            assert.ok(done && placed.from >= done.from + lasts(before) + pauseOf(block.pause), `line ${line.line} begins before the pause after line ${before.line}`);
          }
        }
      }
    }
  });
});

test("random scripts: a block ends after all it waits for, and the scene a tail after that", (t) => {
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      const { scene, over, from, frames, left, withBlocks, parent, waited, there, lasts, pauseOf, uncutOf } = one;
      // What a scene waits for is there, whole; the cartoon waits for none of its own.
      const ends = scene.items.flatMap(waited).map((line) => {
        const placed = there(line);
        assert.ok(placed && placed.frames === lasts(line), `line ${line.line} is cut, and nothing cuts it`);
        return placed.from + placed.frames;
      });
      if (over) assert.deepEqual(ends, []);
      else assert.equal(from + frames, Math.max(...ends) + pauseOf(scene.tail), `the scene of line ${scene.line}`);
      // What is cut is cut where its block has ended, and so after all that block waits for.
      for (const line of linesOf(one)) {
        const placed = there(line);
        if (!placed || placed.frames === lasts(line)) continue;
        const blocks = withBlocks(line).filter(left).map((z) => parent.get(z)!);
        assert.ok(blocks.some((block) => block.items.flatMap(waited).every((other) => placed.from + placed.frames >= uncutOf(other))), `line ${line.line} is cut before its block ends`);
      }
    }
  });
});

test("random scripts: the lines of a block that ends them together do, but where they are cut", (t) => {
  let blocks = 0;
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      for (const block of one.order) {
        if (!isBlock(block) || !one.ending(block)) continue;
        const ends = linesIn([block]).filter((line) => !one.left(line)).flatMap((line) => {
          const placed = one.there(line);
          assert.ok(placed || one.cutBy(line).length > 0, `line ${line.line} is not there, and nothing cuts it`);
          return placed ? [placed.from + one.lasts(line)] : [];
        });
        assert.equal(new Set(ends).size, ends.length > 0 ? 1 : 0, `the block of line ${block.line} ends its lines on ${ends}`);
        blocks += ends.length > 1 ? 1 : 0;
      }
    }
  });
  assert.ok(blocks >= FILES.length / 20, `${blocks}`);
});

test("random scripts: what is cut ends with its block", (t) => {
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      const { from, frames, isScene, left, order, parent, waited, there, uncutOf } = one;
      for (const z of order.filter(left)) {
        const block = parent.get(z)!;
        const end = isScene(block) ? from + frames : Math.max(...block.items.flatMap(waited).map(uncutOf));
        for (const line of linesIn([z])) {
          const placed = there(line);
          // NaN: the block is itself in what is cut, and one of its lines is not there.
          if (placed && !Number.isNaN(end)) assert.ok(placed.from + placed.frames <= end, `line ${line.line} goes on after the block it is cut with`);
        }
      }
      for (const line of linesOf(one)) if (!there(line)) assert.ok(one.withBlocks(line).some(left), `line ${line.line} is not there, and nothing cuts it`);
    }
  });
});

test("random scripts: the length of what is cut moves nothing but what names it", (t) => {
  let changed = 0;
  tried(t, (taken) => {
    const said = saidIn(taken.scenes);
    const before = compiledOf(taken);
    for (const { order, left } of laid(taken, before, taken.voices)) {
      for (const z of order.filter((item) => left(item) && isBlock(item))) {
        const inside = new Set<Item>();
        const add = (item: Item) => void (inside.add(item), isBlock(item) && item.items.forEach(add));
        add(z);
        const lines = new Set([...inside].map(({ line }) => line));
        const outside = order.filter((item) => !inside.has(item));
        const labels = [...inside].flatMap(({ label }) => label ?? []);
        // `prev` may be it, or a line of it that it is joined to.
        const names = outside.some((item) => anchorsOf(item).some(({ of }) => labels.includes(of) || of === "prev") || spansOf(item).some((span) => typeof span === "object" && span.lengths.some(({ line }) => lines.has(line))));
        if (names) continue;
        for (const other of [1, 300]) {
          const now = compiledOf(taken, said.map((line, k) => (inside.has(line) ? other : taken.voices[k]!)));
          const rest = ({ scenes }: Compiled) => scenes.map(({ from, frames, lines: all }) => [from, frames, all.filter(({ line }) => !lines.has(line)).map(({ line, from, frames }) => [line, from, frames])]);
          assert.deepEqual(rest(now), rest(before), `what is under, at line ${z.line}, moves something at ${other} frames`);
          changed++;
        }
      }
    }
  });
  assert.ok(changed >= FILES.length / 50, `${changed}`);
});

test("random scripts: a channel never does two things, and keeps the order written", (t) => {
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      const free = new Map<string, number>();
      for (const line of linesOf(one)) {
        const placed = one.there(line);
        if (!placed) continue;
        for (const channel of channelsOf(line.who, line.action)) {
          assert.ok(placed.from >= (free.get(channel) ?? 0), `line ${line.line} begins while ${channel} is busy`);
          free.set(channel, placed.from + placed.frames);
        }
      }
    }
  });
});

test("random scripts: of two that begin a block together, or are joined, none is on a channel of the other", (t) => {
  tried(t, (taken) => {
    for (const { order, parent, isScene } of timings(taken)) {
      for (const line of order) {
        const block = parent.get(line)!;
        if (isBlock(line) || line.anchor || isScene(block) || block.order !== "together") continue;
        const own = channelsOf(line.who, line.action);
        const above = block.items.slice(0, block.items.indexOf(line)).filter((other): other is CheckedLine => !isBlock(other));
        for (const other of above) assert.ok(!channelsOf(other.who, other.action).some((channel) => own.includes(channel)), `line ${line.line} is on a channel of line ${other.line}`);
      }
    }
  });
});

test("random scripts: what an action's check is told has surely begun before its end has, whatever the voices' lengths", (t) => {
  let told = 0;
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      for (const line of linesOf(one)) {
        if (!("values" in line)) continue;
        const placed = one.there(line);
        for (const begun of (line.values as { begun: number[] }).begun) {
          const other = linesOf(one).find((one) => one.line === begun)!;
          assert.ok(other !== line && "values" in other);
          // One that is open may end as it begins, and is not there then: by its end is what it is told of.
          if (!placed || !one.there(other)) assert.ok(one.open(placed ? other : line), `line ${line.line} or ${begun} is not there`);
          else assert.ok(one.there(other)!.from < placed.from + placed.frames + (one.open(line) ? 1 : 0), `line ${begun} has not begun when line ${line.line} ends`);
          told++;
        }
      }
    }
  });
  assert.ok(told > FILES.length, `${told}`);
});

test("random scripts: every line is where the laws have it, and no later", (t) => {
  let exact = 0;
  tried(t, (taken) => {
    for (const one of timings(taken)) {
      const { parent, isScene, waited, there, lasts, cutBy, uncutOf, freeOf, momentOf, beginsBy } = one;
      linesOf(one).forEach((line) => {
        const placed = there(line);
        if (!placed) return;
        const { from, frames } = placed;
        const starts = [...beginsBy(line), ...freeOf(line)];
        const known = starts.filter((start) => !Number.isNaN(start));
        assert.ok(from >= Math.max(...known), `line ${line.line} begins on ${from}, before ${Math.max(...known)}`);
        if (known.length === starts.length) {
          assert.equal(from, Math.max(...known), `line ${line.line} begins`);
          exact++;
        }
        if (one.open(line)) {
          if ("values" in line) assert.deepEqual(cutBy(line), [parent.get(line)], `line ${line.line} is an action, and under the rest`);
          // What is looped may be cut too, where the block is that its own is under the rest of.
          const stops = cutBy(line).map(uncutOf);
          return void (stops.some(Number.isNaN) || assert.equal(from + frames, Math.min(...stops), `line ${line.line} goes on to the end of its block`));
        }
        if (!("values" in line)) {
          const stops = cutBy(line).map(uncutOf);
          if (!stops.some(Number.isNaN)) assert.equal(frames, Math.min(lasts(line), ...stops.map((stop) => stop - from)), `line ${line.line} lasts`);
          return;
        }
        assert.equal(cutBy(line).length, 0, `line ${line.line} is an action, and under the rest`);
        if (line.takes !== undefined) return void assert.equal(frames, lasts(line), `line ${line.line} lasts`);
        const own = Math.max(1, Math.round((line.length as number) * taken.fps));
        const block = parent.get(line)!;
        const fits = isScene(block) || block.order !== "together" || line.anchor ? [] : block.items.flatMap(waited).filter((other) => "text" in other);
        const until = line.arrive ? momentOf(line.arrive, line) : fits.length > 0 ? Math.max(...fits.map(uncutOf)) : undefined;
        const limited = (n: number) => Math.min(Math.max(n, Math.ceil(own / MOVES.fastest)), Math.floor(own / MOVES.slowest));
        if (!Number.isNaN(until)) assert.equal(frames, until === undefined ? own : limited(until - from), `line ${line.line} lasts`);
      });
    }
  });
  assert.ok(exact > TAKEN.length * 5, `${exact}`);
});
