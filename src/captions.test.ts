// A line as captions (captions.ts): a line alone split as it always was, one that sounds at once with
// another in pieces of one row; and which lines have a caption, in which row.
import assert from "node:assert/strict";
import { test } from "node:test";
import { captionsOf, rowsOf } from "./captions.ts";

const texts = (text: string, row = false) => captionsOf(text, 0, 10, row).map((piece) => piece.text);

test("a line alone is a caption, or pieces at its clauses of up to 84 characters, each timed by its length", () => {
  assert.deepEqual(texts("Last night I saw a badger by the pond, and it waved its paw at me."), ["Last night I saw a badger by the pond, and it waved its paw at me."]);
  const long = "Last night I saw a badger by the pond, and it waved its paw at me, as if it knew me well.";
  assert.deepEqual(texts(long), ["Last night I saw a badger by the pond, and it waved its paw at me,", "as if it knew me well."]);
  const [first, second] = captionsOf(long, 100, 88);
  assert.deepEqual([first!.start, first!.end, second!.start, second!.end], [100, 166, 166, 188]);
});

test("in a row a piece is a row long: a clause longer than 56 characters is split at its spaces, about evenly", () => {
  assert.deepEqual(texts("Last night I saw a badger by the pond, and it waved its paw at me.", true), ["Last night I saw a badger by the pond,", "and it waved its paw at me."]);
  // One clause of 71 characters: two pieces of 33 and 37, not 54 and 16.
  assert.deepEqual(texts("one two three four five six seven eight nine ten eleven twelve thirteen", true), ["one two three four five six seven", "eight nine ten eleven twelve thirteen"]);
  // Twenty words that fit nine to a row: three rows, of seven, seven and six.
  const sevens = (n: number) => Array.from({ length: n }, () => "seven").join(" ");
  assert.deepEqual(texts(sevens(20), true), [sevens(7), sevens(7), sevens(6)]);
  for (const row of texts("ab ".repeat(60), true)) assert.ok(row.length <= 56, row);
  // A word longer than a row is a piece of its own, whole.
  assert.deepEqual(texts(`Look: ${"o".repeat(60)} and so on`, true), ["Look:", "o".repeat(60), "and so on"]);
  // A short line is one row, as written.
  assert.deepEqual(texts("A badger?", true), ["A badger?"]);
});

/** A line that sounds from frame `from` for `frames`, as loud as any voice, or `volume` dB. */
const line = (from: number, frames: number, volume = 0) => ({ from, frames, volume });
const rows = (lines: ReturnType<typeof line>[]) => {
  const got = rowsOf(lines);
  return lines.map((one) => (got.has(one) ? (got.get(one) ?? "alone") : "none"));
};

test("a line that sounds alone has its captions alone; one that touches another's end is alone too", () => {
  assert.deepEqual(rows([line(0, 10), line(10, 5), line(20, 5)]), ["alone", "alone", "alone"]);
});

test("two that sound at once are in rows: the one begun first above, and of two begun at once the one written first", () => {
  assert.deepEqual(rows([line(0, 30), line(10, 5)]), [1, 2]);
  assert.deepEqual(rows([line(10, 5), line(0, 30)]), [2, 1]);
  assert.deepEqual(rows([line(0, 8), line(0, 6)]), [1, 2]);
  // Each keeps its row while it sounds: the upper is free again for the third, which begins under the second.
  assert.deepEqual(rows([line(0, 10), line(5, 15), line(15, 15), line(40, 5)]), [1, 2, 1, "alone"]);
  // One at once with two who are not at once with each other: all three are there.
  assert.deepEqual(rows([line(0, 10), line(5, 20), line(20, 10)]), [1, 2, 1]);
});

test("of three at once the quietest has none, and of equally loud ones the one begun last, or written last", () => {
  assert.deepEqual(rows([line(0, 20), line(5, 20, -6), line(10, 20)]), [1, "none", 2]);
  assert.deepEqual(rows([line(0, 20), line(5, 20), line(10, 20)]), [1, 2, "none"]);
  assert.deepEqual(rows([line(0, 20), line(0, 20), line(0, 20)]), [1, 2, "none"]);
  // A crowd of two murmurs under a talk that begins later: the talk has its caption, and one murmur.
  assert.deepEqual(rows([line(0, 60, -12), line(0, 60, -12), line(10, 20)]), [1, "none", 2]);
});
