// The tool's own stress marks (AGENTS.md, "A word's stress"): before a line of a video in Ukrainian or
// Russian is said, its words with no mark of the writer's are given one by the language's source, read from
// this disk alone: in Ukrainian each word (stress-uk.ts), in Russian a homograph (stress-ru.ts). A word of
// one vowel needs none, and a word the writer marked is left as written. What the source was not sure of
// is said with the line, for `check` and `make` to list.
import type { Pinned } from "./pinned.ts";
import type { Language } from "./script.ts";
import { STRESS, lineWords, plainLine, vowelsOf, withStress } from "./stress.ts";
import { RU_HOMOGRAPHS, RuStress } from "./stress-ru.ts";
import { UK_DICTIONARY, UK_GUESSES, UkStress } from "./stress-uk.ts";

/** A word of a line that a source is asked about: where it begins in the line, and the word, with no marks. */
export interface Asked {
  at: number;
  word: string;
}

/**
 * What a source says of a word: which of its vowels is stressed, counted from 0, or none, when it is left
 * to the voice; and, of a word it was not sure of, why, in a few words that go in brackets after the word.
 */
export interface Stress {
  vowel?: number;
  unsure?: string;
}

/** A language's source of stresses: a line with no marks, and the words of it to say the stress of, in order. */
export interface Source {
  stresses(line: string, asked: Asked[]): Promise<Stress[]>;
}

/** A word the tool was not sure of: as the voice is given it, why, and whether it was left to the voice. */
export interface Unsure {
  word: string;
  why: string;
  left: boolean;
}

/** A line as the voice is to say it, the tool's marks in it, and the words of it the tool was not sure of. */
export interface Marked {
  text: string;
  unsure: Unsure[];
}

/** A line marked by a source. A line whose every word is marked, or has one vowel, asks the source nothing. */
export async function markWith(text: string, source: Source): Promise<Marked> {
  const words = lineWords(text);
  const { line, at } = plainLine(text, words);
  // A word of Cyrillic letters with two vowels or more; one whose vowels are not plain letters is left as it is.
  const open = words.flatMap((word, i) => (!word.marked && word.ends.length > 1 && /^[\p{Script=Cyrillic}'’ʼ]+$/u.test(word.bare) && vowelsOf(word.bare).length === word.ends.length ? [i] : []));
  if (open.length === 0) return { text, unsure: [] };
  const found = await source.stresses(line, open.map((i) => ({ at: at[i]!, word: words[i]!.bare })));
  const marks: number[] = [];
  const unsure: Unsure[] = [];
  for (const [k, i] of open.entries()) {
    const { bare, ends } = words[i]!;
    const { vowel, unsure: why } = found[k] ?? {};
    const sound = vowel !== undefined && vowel >= 0 && vowel < ends.length;
    if (sound) marks.push(ends[vowel]!);
    if (why !== undefined) unsure.push({ word: sound ? withStress(bare, [vowel]) : bare, why, left: !sound });
  }
  let marked = text;
  for (const end of marks.sort((a, b) => b - a)) marked = marked.slice(0, end) + STRESS + marked.slice(end);
  return { text: marked, unsure };
}

/** Marks a line of a video in a language: one in English is as written. */
export type Marker = (text: string, language: Language) => Promise<Marked>;

/** The sources' files, which setup fetches. */
export const STRESS_FILES: Pinned[] = [UK_DICTIONARY, UK_GUESSES, RU_HOMOGRAPHS];

/** The tool's marker, its sources' files in `modelDir`, each source loaded when a line first asks it. */
export function markerIn(modelDir: string): Marker {
  const sources: Partial<Record<Language, Source>> = {};
  return async (text, language) => {
    if (language === "en") return { text, unsure: [] };
    const source = (sources[language] ??= language === "uk" ? new UkStress(modelDir) : new RuStress(modelDir));
    return markWith(text, source);
  };
}

/** A marker that marks nothing: every line as written. */
export const unmarked: Marker = async (text) => ({ text, unsure: [] });

/**
 * The words the tool was not sure of, a row for each as the voice is given it, with the lines that say it:
 * `гнізда́ (or гні́зда): line 12`. None when it was sure of all.
 */
export function unsureRows(lines: { line: number; unsure: Unsure[] }[]): string[] {
  const rows = new Map<string, number[]>();
  for (const { line, unsure } of lines) {
    for (const { word, why, left } of unsure) {
      const row = `${word} (${why})${left ? ", left to the voice" : ""}`;
      const at = rows.get(row) ?? [];
      if (!at.includes(line)) at.push(line);
      rows.set(row, at);
    }
  }
  return Array.from(rows, ([row, at]) => `${row}: ${at.length === 1 ? "line" : "lines"} ${at.join(", ")}`);
}
