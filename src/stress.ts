// A word's stress, as a line of a video in Ukrainian or Russian may mark it (AGENTS.md, "A word's
// stress"): a combining acute (U+0301) right after the stressed vowel, за́мок. Supertonic reads the mark
// as the word's stress, as was measured (docs/plans/done/word-stress.md), so the voice gets a line's text
// as written. What is shown, and what a word is found by, is the text without its marks.
//
// It needs none of the tool's packages.

/** The mark: a combining acute accent. */
export const STRESS = "\u0301";

/** A vowel of Ukrainian or Russian: a letter, or ї and ё written as a letter and its two dots. */
const VOWEL = "[аеёиоуыэюяіїє]|[еі]\u0308";

/** A stress: the mark right after a vowel, of either case. With no lookbehind, which an older browser lacks: a web page's code holds this. */
const MARKED = new RegExp(`(${VOWEL})${STRESS}`, "giu");

/** The mark after a Cyrillic letter, whatever other marks that one has: with the stresses gone, one that is no stress. */
const STRAY = new RegExp(`\\p{Script=Cyrillic}\\p{M}*${STRESS}`, "u");

/** A text without its stresses: as the captions show it, and as its words are found. */
export const unstressed = (text: string): string => text.replace(MARKED, "$1");

/**
 * The first word of a text, as written, with a mark that is no stress: one after a Cyrillic letter that
 * is no vowel, or a second one after a vowel. None when each mark is a stress. A mark on another
 * alphabet's letter is that letter's own (a Latin é).
 */
export const mismarked = (text: string): string | undefined => text.match(/[\p{L}\p{M}]+/gu)?.find((word) => STRAY.test(unstressed(word)));

/** A vowel, as one character. */
const A_VOWEL = /^[аеёиоуыэюяіїє]$/iu;

/** Where each vowel of a word with no marks is, as offsets into it: a word's vowels are counted from 0. */
export const vowelsOf = (bare: string): number[] => Array.from(bare, (_, i) => i).filter((i) => A_VOWEL.test(bare[i]!));

/** A word with no marks, stressed on the vowels numbered. */
export const withStress = (bare: string, stressed: number[]): string => {
  const at = new Set(stressed.map((k) => vowelsOf(bare)[k]));
  return Array.from(bare, (letter, i) => (at.has(i) ? letter + STRESS : letter)).join("");
};

/** A word of a line, as the tool reads it to give it a stress (marks.ts). */
export interface LineWord {
  /** Where it begins in the text, and where it ends. */
  from: number;
  to: number;
  /** As a dictionary has it: with no stress, and each letter one character (й, ї and ё written with their marks too). */
  bare: string;
  /** Where in the text each of its vowels ends: a stress goes there. */
  ends: number[];
  /** It has a mark of the writer's. */
  marked: boolean;
}

/** A line's words: runs of letters, with their marks, and an apostrophe between two. */
export function lineWords(text: string): LineWord[] {
  return Array.from(text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’ʼ]\p{L}[\p{L}\p{M}]*)*/gu), (word) => {
    // A letter with its marks is a vowel when it is one as one character: и and its breve are й, which is none.
    const ends = Array.from(word[0].matchAll(/\p{L}\p{M}*/gu))
      .filter((letter) => A_VOWEL.test(unstressed(letter[0]).normalize("NFC")))
      .map((letter) => word.index + letter.index + letter[0].length);
    return { from: word.index, to: word.index + word[0].length, bare: unstressed(word[0]).normalize("NFC"), ends, marked: word[0].includes(STRESS) };
  });
}

/** A line with each word as a dictionary has it, and where each begins in that: what a source of stresses reads. */
export function plainLine(text: string, words: LineWord[]): { line: string; at: number[] } {
  const at: number[] = [];
  let line = "";
  let from = 0;
  for (const word of words) {
    line += text.slice(from, word.from);
    at.push(line.length);
    line += word.bare;
    from = word.to;
  }
  return { line: line + text.slice(from), at };
}
