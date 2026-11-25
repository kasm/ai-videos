// A script's text read (AGENTS.md, "A script"): its lines, and the blocks they are in, by how far
// each row is indented. It reads what is written and nothing more: what a line's action takes is the
// check's (scenario.ts), and what its anchor names is plan.ts's.
//
// Like scenario.ts, it imports nothing that runs but what needs none of the tool's packages.
import type { Anchor, Issue, Placed, ScriptBlock, ScriptItem, ScriptLine, Written } from "./scenario.ts";

const NAME = /^[a-z][a-z0-9-]*$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/** The blocks of a script, by the words of their headers. */
const BLOCKS: Record<string, Pick<ScriptBlock, "order" | "under">> = {
  "in order": { order: "in order" },
  together: { order: "together" },
  under: { order: "in order", under: true },
};
const HEADERS = "the blocks are in order:, together: and under:, each on a row of its own, its lines under it and indented";

/** The tool's own action: a character says the line's text, in its voice. */
export const SAY = "say";

/** The names an anchor has for what needs no label: the line or the block just above, and the block it is in. */
export const PREV = "prev";
export const BLOCK = "block";

const LINE_FORM = "a line is who, the action, its values, and after a colon its words: pip say: Hello!";
const MOMENTS = "a moment is a.start, a.end, a.50% or a.word(mole), and seconds after it or before it: @ a.end - 0.5s";
const MOMENT = /^([a-z][a-z0-9-]*)\s*\.\s*(?:(start|end)|(\d+(?:\.\d+)?)%|word\(([^()]*)\))(?:\s*([+-])\s*(\d+(?:\.\d+)?)(s?))?$/;

/** What is wrong with a row, and how to mend it. */
class Wrong extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.hint = hint;
  }
}

/** An anchor, from what is written after its `@`. */
function readAnchor(written: string): Anchor {
  const found = MOMENT.exec(written);
  if (!found) throw new Wrong(`"${written}" is not a moment of something above`, `${MOMENTS}; it is the last thing before the colon`);
  const [, of, edge, percent, word, sign, seconds, unit] = found;
  if (seconds !== undefined && unit === "") throw new Wrong(`"${sign} ${seconds}" has no unit`, `write it in seconds: ${sign} ${seconds}s`);
  if (percent !== undefined && Number(percent) > 100) throw new Wrong(`${percent}% is more than the whole of "${of}"`, "a share is from 0% to 100%");
  if (word !== undefined && word.trim() === "") throw new Wrong("word() names no word", "write the word as the line says it: a.word(mole)");
  const at = edge !== undefined ? (edge as "start" | "end") : percent !== undefined ? { share: Number(percent) / 100 } : { word: word!.trim().replace(/\s+/g, " ") };
  return { of: of!, at, plus: seconds === undefined ? 0 : Number(`${sign}${seconds}`) };
}

/** A line's values, `name=value` each. */
function readValues(who: string, parts: string[]): Record<string, Written> {
  const values: Record<string, Written> = {};
  for (const part of parts) {
    const equals = part.indexOf("=");
    const [name, value] = [part.slice(0, equals), part.slice(equals + 1)];
    if (equals < 0 || !NAME.test(name)) {
      throw new Wrong(`"${part}" is not a value`, `write a value as name=value, before the colon, and what is said after it: ${who} say: Hello!`);
    }
    if (Object.hasOwn(values, name)) throw new Wrong(`${name} is given twice`, `a line gives a value once: keep one ${name}=`);
    if (NUMBER.test(value)) values[name] = Number(value);
    else if (NAME.test(value)) values[name] = value;
    else throw new Wrong(`${name}=${value}: "${value}" is neither a number nor a name`, "a value is a number (2, 1.5) or a name in lowercase letters, digits and dashes (middle)");
  }
  return values;
}

/** A row of a script that holds something: its line in the file, how far it is indented, and the rest. */
interface Row {
  line: number;
  indent: number;
  written: string;
}

/**
 * One row read: a line, or a block's header with no lines yet, and whether `&` joins it to the one
 * above. `opens` says that rows indented under it follow, as under a header.
 */
function readRow({ line, written }: Row, opens: boolean): { item: ScriptItem; joined: boolean } {
  let rest = written;
  const joined = rest.startsWith("&");
  if (joined) rest = rest.slice(1).trim();
  let label: string | undefined;
  if (rest.startsWith("[")) {
    const close = rest.indexOf("]");
    label = close < 0 ? "" : rest.slice(1, close).trim();
    if (!NAME.test(label)) throw new Wrong(`"${close < 0 ? rest : rest.slice(0, close + 1)}" is not a label`, "a label is a name in square brackets, before the line: [a] pip say: Hello!");
    if (label === PREV || label === BLOCK) throw new Wrong(`"${label}" is no label`, `${PREV} is always the line above, and ${BLOCK} the block a line is in: call it something else`);
    rest = rest.slice(close + 1).trim();
    if (rest.startsWith("&")) throw new Wrong("& comes after a label", `write it first: & [${label}] ${rest.slice(1).trim()}`);
  }
  const colon = rest.indexOf(":");
  const text = colon < 0 ? "" : rest.slice(colon + 1).trim();
  const head = (colon < 0 ? rest : rest.slice(0, colon)).trim();
  const at = head.indexOf("@");
  const words = (at < 0 ? head : head.slice(0, at)).trim().split(/\s+/).filter((word) => word !== "");
  const placed = { line, ...(label === undefined ? {} : { label }), ...(at < 0 ? {} : { anchor: readAnchor(head.slice(at + 1).trim()) }) };

  const name = words.join(" ");
  const block = Object.hasOwn(BLOCKS, name) ? BLOCKS[name] : undefined;
  if (block) {
    if (colon < 0) throw new Wrong(`the header ${name} has no colon`, `a block's header ends with a colon: ${name}:`);
    if (text !== "") throw new Wrong(`${name}: is a block's header, with nothing after its colon`, "write its lines on the rows under it, indented");
    return { item: { ...placed, ...block, items: [] }, joined };
  }
  const [who, action, ...values] = words;
  if (colon >= 0 && text === "" && (words.length === 1 || (opens && action !== SAY))) throw new Wrong(`"${name}:" is neither a line nor a block's header`, HEADERS);
  if (!who || !NAME.test(who)) throw new Wrong(`"${who ?? ""}" is not a name: a line begins with who does it`, LINE_FORM);
  if (!action) throw new Wrong(`${who} does nothing: the action comes after the name`, LINE_FORM);
  if (!NAME.test(action)) throw new Wrong(`"${action}" is not an action's name`, LINE_FORM);
  return { item: { ...placed, who, action, values: readValues(who, values), ...(text === "" ? {} : { text }) } satisfies ScriptLine, joined };
}

/** Whether an item of a script is a block: its header and what is in it, or the lines `&` joins. */
export const isBlock = <L extends Placed>(item: ScriptItem<L>): item is ScriptBlock<L> => "items" in item;

/**
 * Joins `item` to the last of `items`: the two are a block together, or the third is in the block the
 * two are. The block begins where the first of them does, so it takes the first one's anchor.
 */
function join(items: ScriptItem[], item: ScriptItem): void {
  const last = items.at(-1)!;
  if (isBlock(last) && last.joined) return void last.items.push(item);
  const { anchor, ...first } = last;
  items[items.length - 1] = { line: last.line, order: "together", joined: true, ...(anchor ? { anchor } : {}), items: [first, item] };
}

/**
 * A script's lines and blocks, read from its text; `first` is the line of the file its first row is
 * on. A row is a line, `who action name=value ... @ moment: text`, where what is before the first
 * colon is read and what is after it is the text, as written; or a block's header, whose lines are
 * the rows indented under it. `&` before a row joins it to the one above, and `[name]` labels it. An
 * empty row, or one that begins with `#`, is passed over.
 */
export function readScript(script: string, first = 1): { items: ScriptItem[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const issue = (line: number, message: string, hint: string) => void issues.push({ line, message, hint });
  const rows = script.split(/\r?\n/).flatMap((raw, k): Row[] => {
    const written = raw.trim();
    if (written === "" || written.startsWith("#")) return [];
    const spaces = raw.slice(0, raw.length - raw.trimStart().length);
    if (spaces.includes("\t")) issue(first + k, "the row is indented with a tab", "indent with spaces alone");
    return [{ line: first + k, indent: spaces.length, written }];
  });

  const root: ScriptItem[] = [];
  /** The block being read and those it is in, the inner last: how far its rows are indented, and what it holds. */
  const levels = [{ indent: 0, items: root }];
  /** The block whose header was the row before. */
  let opened: ScriptBlock | undefined;
  for (const [i, row] of rows.entries()) {
    const top = () => levels.at(-1)!;
    if (opened && row.indent > top().indent) levels.push({ indent: row.indent, items: opened.items });
    else if (opened) issue(opened.line, "this block has no line", "write its lines on the rows under its header, indented");
    opened = undefined;
    while (row.indent < top().indent) levels.pop();
    if (row.indent > top().indent) {
      issue(row.line, "the row is indented, and no block begins above it", "a block's rows are indented under its header, all by the same spaces; any other row begins where the one above does");
      // Read with the rows above, so that it and those beside it are said to be wrong once.
      levels.push({ indent: row.indent, items: top().items });
    }
    const { items } = top();
    const opens = (rows[i + 1]?.indent ?? 0) > row.indent;
    try {
      const { item, joined } = readRow(row, opens);
      if (joined && items.length === 0) throw new Wrong("& joins a row to the one above it in its block, and none is above it", "leave the & out, or write it under what it is joined to");
      if (joined) join(items, item);
      else items.push(item);
      if (isBlock(item)) opened = item;
    } catch (e) {
      if (!(e instanceof Wrong)) throw e;
      issue(row.line, e.message, e.hint);
      // What is under a header that does not read is read all the same.
      if (opens) opened = { line: row.line, order: "in order", items: [] };
    }
  }
  if (opened) issue(opened.line, "this block has no line", "write its lines on the rows under its header, indented");
  return { items: root, issues };
}
