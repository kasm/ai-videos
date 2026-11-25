// A script's text read (AGENTS.md, "A script"): its lines, and the blocks they are in, by how far
// each row is indented. It reads what is written and nothing more: what its values come to is
// values.ts's, what a line's action takes is the check's (scenario.ts), and what its anchor names is
// labels.ts's.
//
// Like scenario.ts, it imports nothing that runs but what needs none of the tool's packages.
import { Wrong, readAnchor, readFormula } from "./formula.ts";
import type { Issue, Placed, ScriptBlock, ScriptItem, ScriptLine } from "./scenario.ts";

const NAME = /^[a-z][a-z0-9-]*$/;
/** A value's name as a level sets it: for everything in it, or for a character or an action (`walk.speed`). */
export const SET =/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/;

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

/** The words of a row before its colon and its anchor, and the values after them: each from its `name=` to the next one's. */
function split(head: string): { words: string[]; values: [name: string, written: string][] } {
  const starts = [...head.matchAll(/(?:^|\s)([^\s=]+)=/g)];
  return {
    words: head.slice(0, starts[0]?.index ?? head.length).split(/\s+/).filter((word) => word !== ""),
    values: starts.map((found, i) => [found[1]!, head.slice(found.index + found[0].length, starts[i + 1]?.index).trim()]),
  };
}

/** Values as a row writes them, `name=value` each, a value being a formula; `what` says whose they are, for a hint. */
function readValues(written: [name: string, written: string][], what: "line" | "block"): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, text] of written) {
    if (what === "line" && SET.test(name) && !NAME.test(name)) {
      const own = name.split(".")[1];
      throw new Wrong(`${name} is not a line's value`, `a line's values are its own: write ${own}=${text}, and ${name} on a block, a scene or the cartoon`);
    }
    if (!SET.test(name)) throw new Wrong(`"${name}=${text}" is not a value`, "a value's name is in lowercase letters, digits and dashes: name=value");
    if (Object.hasOwn(values, name)) throw new Wrong(`${name} is given twice`, `a ${what} gives a value once: keep one ${name}=`);
    if (text === "") throw new Wrong(`${name}= has no value`, `write it after the sign, or leave ${name}= out`);
    try {
      readFormula(text);
    } catch (e) {
      throw e instanceof Wrong ? new Wrong(`${name}=${text}: ${e.message}`, e.hint) : e;
    }
    values[name] = text;
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
  const { words, values } = split(at < 0 ? head : head.slice(0, at));
  const placed = { line, ...(label === undefined ? {} : { label }), ...(at < 0 ? {} : { anchor: readAnchor(head.slice(at + 1).trim()) }) };

  const name = words.join(" ");
  const block = Object.hasOwn(BLOCKS, name) ? BLOCKS[name] : undefined;
  if (block) {
    if (colon < 0) throw new Wrong(`the header ${name} has no colon`, `a block's header ends with a colon: ${name}:`);
    if (text !== "") throw new Wrong(`${name}: is a block's header, with nothing after its colon`, "write its lines on the rows under it, indented");
    return { item: { ...placed, ...block, ...(values.length > 0 ? { values: readValues(values, "block") } : {}), items: [] }, joined };
  }
  const [who, action, stray] = words;
  if (colon >= 0 && text === "" && (words.length === 1 || (opens && action !== SAY))) throw new Wrong(`"${name}:" is neither a line nor a block's header`, HEADERS);
  if (!who || !NAME.test(who)) throw new Wrong(`"${who ?? ""}" is not a name: a line begins with who does it`, LINE_FORM);
  if (!action) throw new Wrong(`${who} does nothing: the action comes after the name`, LINE_FORM);
  if (!NAME.test(action)) throw new Wrong(`"${action}" is not an action's name`, LINE_FORM);
  if (stray !== undefined) throw new Wrong(`"${stray}" is not a value`, `write a value as name=value, before the colon, and what is said after it: ${who} ${SAY}: Hello!`);
  return { item: { ...placed, who, action, values: readValues(values, "line"), ...(text === "" ? {} : { text }) } satisfies ScriptLine, joined };
}

/** Whether an item of a script is a block: its header and what is in it, or the lines `&` joins. */
export const isBlock = <L extends Placed<unknown>>(item: ScriptItem<L>): item is ScriptBlock<L> => "items" in item;

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
 * colon is read and what is after it is the text, as written; or a block's header, with the values
 * set on it, whose lines are the rows indented under it. `&` before a row joins it to the one above, and `[name]` labels it. An
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
