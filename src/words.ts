// Where in a line's voice a word of it is said: an estimate, as Kokoro gives no times. A voice goes
// through its letters evenly and stops at its marks, so a word begins as far into the voice as it is
// into the text, each mark weighing as many letters as its pause is long. Compared with the pauses of
// 23 marks in today's voices, it is off by 0.08 s, and at most 0.21 (letters alone: 0.14 and 0.28).
// It depends on the text alone, so a script is checked before anything is spoken. A word's stress,
// which a line may mark for its voice (stress.ts), is no part of a word, and weighs nothing.
import { unstressed } from "./stress.ts";

/** A word: letters and digits, with the apostrophes and dashes inside it. */
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** How many letters a mark weighs: a comma's pause, or a sentence's. */
const MARKS: Record<string, number> = { ",": 4, ";": 4, ":": 4, ".": 6, "!": 6, "?": 6, "…": 6, "—": 6 };

const plain = (word: string) => word.toLowerCase().replaceAll("’", "'");
const wordsOf = (text: string) => [...text.matchAll(WORD)].map((found) => ({ word: plain(found[0]), at: found.index }));
/** What a text weighs, in letters. Several marks in a row (`?!`, `...`) are one pause. */
const weigh = (text: string) => [...text].reduce((sum, letter, i, all) => sum + (MARKS[letter] === undefined ? 1 : MARKS[all[i - 1] ?? ""] === undefined ? MARKS[letter] : 0), 0);

/** The words of a text, as `sharesOf` reads them. */
export const wordList = (text: string): string[] => wordsOf(unstressed(text)).map(({ word }) => word);

/**
 * Where `text` says `said`, a word or several in a row, whatever the letters' case and the marks
 * between them: each place as a share, 0 to 1, of the voice's length. None when it does not say it.
 */
export function sharesOf(written: string, said: string): number[] {
  const text = unstressed(written);
  const words = wordsOf(text);
  const sought = wordList(said);
  // The voice ends with its last word: the mark after that has no pause.
  const whole = weigh(text.trim().replace(/[^\p{L}\p{N}]+$/u, ""));
  const before = text.length - text.trimStart().length;
  const starts = words.filter((_, i) => sought.length > 0 && sought.every((word, k) => words[i + k]?.word === word));
  return starts.map(({ at }) => weigh(text.slice(before, at)) / whole);
}
