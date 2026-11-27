// A word's stress, as a line of a video in Ukrainian or Russian may mark it (AGENTS.md, "A word's
// stress"): a combining acute (U+0301) right after the stressed vowel, за́мок. Supertonic reads the mark
// as the word's stress, as was measured (docs/plans/word-stress.md), so the voice gets a line's text
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
