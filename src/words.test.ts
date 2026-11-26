// Where in a voice a word is said (words.ts), estimated from its place in the text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sharesOf } from "./words.ts";

/** A share in thousandths. */
const at = (text: string, said: string) => sharesOf(text, said).map((share) => Math.round(share * 1000));

test("a word is as far into its voice as it is into its text: from the first at 0", () => {
  // 20 letters and spaces before the end: each word begins as many in.
  assert.deepEqual(at("abcd efgh ijkl mnopq", "abcd"), [0]);
  assert.deepEqual(at("abcd efgh ijkl mnopq", "efgh"), [250]);
  assert.deepEqual(at("abcd efgh ijkl mnopq", "mnopq"), [750]);
  // The mark that ends the line has no pause in it, and what is around the text is nothing.
  assert.deepEqual(at("  abcd efgh ijkl mnopq!...  ", "efgh"), [250]);
});

test("a comma weighs 4 letters and a sentence's end 6, and several marks in a row are one pause", () => {
  // 4 letters, the mark, a space; then 4 letters.
  assert.deepEqual(at("abcd, efgh", "efgh"), [Math.round((9 / 13) * 1000)]);
  for (const mark of [".", "?", "!", "?!", "..."]) assert.deepEqual(at(`abcd${mark} efgh`, "efgh"), [Math.round((11 / 15) * 1000)], mark);
});

test("a word is the line's whatever its case and the marks around it, and several in a row are one place", () => {
  const line = "I saw the mole, the big one: don't you see it? Pip's mole!";
  assert.equal(sharesOf(line, "Saw").length, 1);
  assert.equal(sharesOf(line, "mole").length, 2);
  assert.equal(sharesOf(line, "the").length, 2);
  assert.equal(sharesOf(line, "the mole").length, 1);
  assert.equal(sharesOf(line, "mole the big").length, 1);
  assert.equal(sharesOf(line, "don’t").length, 1);
  assert.equal(sharesOf(line, "pip's").length, 1);
  assert.deepEqual(sharesOf(line, "the mole"), sharesOf(line, "the").slice(0, 1));
  for (const none of ["mol", "saw mole", "don", "", "?"]) assert.deepEqual(sharesOf(line, none), [], none);
  // Every place is in the voice, and in the line's order.
  const words = line.match(/[\w']+/g)!;
  const places = [...new Set(words)].flatMap((word) => sharesOf(line, word)).toSorted((a, b) => a - b);
  assert.equal(places.length, words.length);
  assert.ok(places[0] === 0 && places.at(-1)! < 1 && new Set(places).size === places.length);
});
