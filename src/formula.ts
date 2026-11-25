// A formula, as a script writes a value (AGENTS.md, "Values"): numbers with their units, names, a
// line's length, a moment of a line, and arithmetic. Here it is read, and its numbers worked out;
// what its names stand for is values.ts's.
//
// It imports nothing that runs: plugin.ts gives what reads a script to the plugins' tests.
import type { WrittenAnchor } from "./scenario.ts";

/** What does not read, or has no answer, and how to mend it. */
export class Wrong extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.hint = hint;
  }
}

/** A number's unit: seconds, or none. A share, `50%`, is the number 0.5. */
export type Unit = "" | "s";

/** A formula as it is read. */
export type Formula =
  | { is: "number"; number: number; unit: Unit }
  | { is: "name"; name: string }
  /** How long the line of this label lasts, or `prev`. */
  | { is: "length"; of: string }
  /** A moment of something above, by itself: what a move arrives at. */
  | { is: "moment"; moment: WrittenAnchor }
  | { is: "minus"; of: Formula }
  | { is: "+" | "-" | "*" | "/"; left: Formula; right: Formula };

const FORMS = "a value is a number (2, 0.5s, 50%), a name (middle), or a formula of these: near * 2 + 20, a minus with a space on each side";
const MOMENTS = "a moment is a.start, a.end, a.50% or a.word(mole), and seconds after it or before it: @ a.end - 0.5s; it is the last thing before the colon";

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)([A-Za-z%]*)|([a-z][a-z0-9-]*)|([-+*/().]))/y;
const MOMENT = /^([a-z][a-z0-9-]*)\s*\.\s*(?:(start|end)(?![a-z0-9])|(\d+(?:\.\d+)?)%|word\(([^()]*)\))\s*(.*)$/;

type Token = { text: string } & ({ number: number; unit: Unit } | { name: string } | { mark: string });

function tokensOf(text: string): Token[] {
  const tokens: Token[] = [];
  const whole = text.trim();
  for (let at = 0; at < whole.length; at = TOKEN.lastIndex) {
    TOKEN.lastIndex = at;
    const found = TOKEN.exec(whole);
    if (!found) throw new Wrong(`"${whole.slice(at).trim()}" is not read`, FORMS);
    const [, number, unit, name, mark] = found;
    const token = found[0].trim();
    if (name !== undefined) tokens.push({ text: token, name });
    else if (mark !== undefined) tokens.push({ text: token, mark });
    else if (unit === "" || unit === "s") tokens.push({ text: token, number: Number(number), unit });
    else if (unit === "%") tokens.push({ text: token, number: Number(number) / 100, unit: "" });
    else throw new Wrong(`"${token}" has no unit that is known`, "a time is in seconds (0.5s) and a share in hundredths (50%); any other number has no unit");
  }
  return tokens;
}

/** A formula, from its text. */
export function readFormula(text: string): Formula {
  if (MOMENT.test(text.trim())) return { is: "moment", moment: readAnchor(text.trim()) };
  const tokens = tokensOf(text);
  let k = 0;
  const mark = <M extends string>(...marks: M[]): M | undefined => {
    const token = tokens[k];
    if (!token || !("mark" in token) || !(marks as string[]).includes(token.mark)) return undefined;
    k++;
    return token.mark as M;
  };
  const factor = (): Formula => {
    const sign = mark("+", "-");
    if (sign) return sign === "-" ? { is: "minus", of: factor() } : factor();
    if (mark("(")) {
      const inner = sum();
      if (!mark(")")) throw new Wrong('a "(" has no ")" after it', FORMS);
      return inner;
    }
    const token = tokens[k++];
    if (!token) throw new Wrong(tokens.length > 0 ? `something is missing after "${tokens.at(-1)!.text}"` : "nothing is written", FORMS);
    if ("number" in token) return { is: "number", number: token.number, unit: token.unit };
    if ("mark" in token) throw new Wrong(`"${token.text}" has nothing before it`, FORMS);
    if (!mark(".")) return { is: "name", name: token.name };
    const part = tokens[k++];
    if (!part || !("name" in part) || part.name !== "length") {
      throw new Wrong(`"${token.name}.${part?.text ?? ""}" is nothing that a formula reads`, "how long a line lasts is a.length; a moment of it, a.end, stands by itself: arrive=a.end - 0.5s");
    }
    return { is: "length", of: token.name };
  };
  const product = (): Formula => {
    let left = factor();
    for (let op = mark("*", "/"); op; op = mark("*", "/")) left = { is: op, left, right: factor() };
    return left;
  };
  const sum = (): Formula => {
    let left = product();
    for (let op = mark("+", "-"); op; op = mark("+", "-")) left = { is: op, left, right: product() };
    return left;
  };
  const whole = sum();
  const after = tokens[k];
  if (after) throw new Wrong(`"${after.text}" comes after what is a value already`, FORMS);
  return whole;
}

/** A moment of something above, from what is written after an `@`, or as what a move arrives at. */
export function readAnchor(written: string): WrittenAnchor {
  const not = (why = "") => new Wrong(`"${written}" is not a moment of something above${why}`, MOMENTS);
  const [, of, edge, percent, word, plus = ""] = MOMENT.exec(written) ?? [];
  if (of === undefined || !/^([-+].*)?$/.test(plus)) throw not();
  if (percent !== undefined && Number(percent) > 100) throw new Wrong(`${percent}% is more than the whole of "${of}"`, "a share is from 0% to 100%");
  if (word !== undefined && word.trim() === "") throw new Wrong("word() names no word", "write the word as the line says it: a.word(mole)");
  if (plus !== "") {
    try {
      readFormula(plus);
    } catch (e) {
      throw e instanceof Wrong ? not(`: ${e.message}`) : e;
    }
  }
  const at = edge !== undefined ? (edge as "start" | "end") : percent !== undefined ? { share: Number(percent) / 100 } : { word: word!.trim().replace(/\s+/g, " ") };
  return { of, at, ...(plus === "" ? {} : { plus }) };
}

/** The names a formula reads: what is above it is none of them. */
export function namesIn(formula: Formula): string[] {
  if (formula.is === "name") return [formula.name];
  if (formula.is === "minus") return namesIn(formula.of);
  if ("left" in formula) return [...namesIn(formula.left), ...namesIn(formula.right)];
  return formula.is === "moment" && formula.moment.plus !== undefined ? namesIn(readFormula(formula.moment.plus)) : [];
}

/** A number worked out, with its unit, and how many times it has each line's length, by the line: those are measured later. */
export interface Amount {
  unit: Unit;
  number: number;
  lengths: Map<number, number>;
}

const each = (amount: Amount, by: number): Amount => ({ ...amount, number: amount.number * by, lengths: new Map([...amount.lengths].map(([line, times]) => [line, times * by])) });

/** An amount the other way round. */
export const minus = (amount: Amount): Amount => each(amount, -1);

/** Two amounts added, taken away, multiplied or divided: what has no answer is refused. */
export function calculate(op: "+" | "-" | "*" | "/", left: Amount, right: Amount): Amount {
  if (op === "+" || op === "-") {
    if (left.unit !== right.unit) throw new Wrong("a time and a number without a unit do not add up", "write both in seconds, or neither: 2s + 0.5s");
    const added = op === "+" ? right : minus(right);
    const lengths = new Map(left.lengths);
    for (const [line, times] of added.lengths) lengths.set(line, (lengths.get(line) ?? 0) + times);
    return { unit: left.unit, number: left.number + added.number, lengths };
  }
  const byNumber = "multiply or divide a time by a number without a unit: 0.5s * 2";
  if (op === "*") {
    if (left.unit === "s" && right.unit === "s") throw new Wrong("a time is not multiplied by a time", byNumber);
    if (left.lengths.size > 0 && right.lengths.size > 0) throw new Wrong("a length is not multiplied by a length", byNumber);
    const [long, by] = right.lengths.size > 0 ? [right, left] : [left, right];
    return { ...each(long, by.number), unit: left.unit === "s" || right.unit === "s" ? "s" : "" };
  }
  if (right.lengths.size > 0) throw new Wrong("nothing is divided by a line's length", "divide the length by a number: a.length / 2");
  if (right.number === 0) throw new Wrong("nothing is divided by 0", "divide by another number");
  if (left.unit === "" && right.unit === "s") throw new Wrong("a number is not divided by a time", byNumber);
  return { ...each(left, 1 / right.number), unit: left.unit === right.unit ? "" : "s" };
}

/** Seconds worked out: a number, or one with lines' lengths in it, each so many times, which are measured later. */
export type Span = number | { seconds: number; lengths: { line: number; times: number }[] };

/** Whole millionths, so that 0.1s + 0.2s is 0.3s. */
const exact = (number: number) => Math.round(number * 1e6) / 1e6;

/** An amount of seconds. */
export function spanOf({ number, lengths }: Amount): Span {
  const read = [...lengths].map(([line, times]) => ({ line, times: exact(times) })).filter(({ times }) => times !== 0);
  return read.length > 0 ? { seconds: exact(number), lengths: read } : exact(number);
}

/** What a span comes to, seconds, once the lines' lengths are known. */
export const secondsOf = (span: Span, lengthOf: (line: number) => number): number =>
  typeof span === "number" ? span : span.lengths.reduce((sum, { line, times }) => sum + times * lengthOf(line), span.seconds);
