// A line split into captions. Lines are known text, so no speech recognition is involved.
import { unstressed } from "./stress.ts";

const MAX_CHARS = 84; // a longer line is split
const ROW_CHARS = 56; // and one in a small row, of two at once: so many fit the width of a landscape stage

/** Seconds a caption may stay after its words, when no other comes: a short line is up long enough to read. */
export const LINGER = 1.0;

/** Splits a line longer than `max` characters at clause boundaries, into chunks no longer but for a longer clause. */
function chunk(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const clauses = text.match(/[^.!?,;:]+[.!?,;:]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const clause of clauses) {
    if (current && (current + clause).trim().length > max) {
      chunks.push(current.trim());
      current = "";
    }
    current += clause;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Splits a clause longer than `max` characters at its spaces, into as few pieces as fit, about as long as each other. */
function evenly(clause: string, max: number): string[] {
  const filled = (width: number) => {
    const pieces: string[] = [];
    for (const word of clause.split(/\s+/)) {
      const longer = `${pieces.at(-1)} ${word}`;
      if (pieces.length > 0 && longer.length <= width) pieces[pieces.length - 1] = longer;
      else pieces.push(word);
    }
    return pieces;
  };
  const few = filled(max).length;
  let width = Math.ceil(clause.length / few);
  while (width < max && filled(width).length > few) width++;
  return filled(width);
}

/**
 * A line as captions: pieces that fit one each, timed in proportion to their length from `start` (seconds,
 * or frames). In a small `row` a piece is one row long; any other may take two. A word's stress, which
 * the line may mark for its voice (stress.ts), is in none of them.
 */
export function captionsOf(text: string, start: number, duration: number, row = false): { text: string; start: number; end: number }[] {
  const shown = unstressed(text);
  const chunks = row ? chunk(shown, ROW_CHARS).flatMap((c) => evenly(c, ROW_CHARS)) : chunk(shown, MAX_CHARS);
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  let t = start;
  return chunks.map((c) => {
    const span = duration * (c.length / total);
    const piece = { text: c, start: t, end: t + span };
    t += span;
    return piece;
  });
}

/** What is said: the frame it begins on, how many it sounds in, and how loud, dB. */
interface Spoken {
  from: number;
  frames: number;
  volume: number;
}

/**
 * Which of a scene's said lines, in the order written, have captions, and where. One that sounds alone has
 * them as any line (undefined). One that sounds at once with another has them in a small row all through:
 * the upper, 1, when that is free as it begins, else the lower, 2. Two at most are captioned at once: of
 * three the quietest is not there, and of equally loud ones the one begun last, or written last.
 */
export function rowsOf<Line extends Spoken>(lines: Line[]): Map<Line, 1 | 2 | undefined> {
  const atOnce = (a: Line, b: Line) => a.from < b.from + b.frames && b.from < a.from + a.frames;
  const shown: Line[] = [];
  for (const line of lines.toSorted((a, b) => b.volume - a.volume || a.from - b.from)) {
    // Two that sound at once with it, and with each other, share a frame with it, all three.
    const others = shown.filter((one) => atOnce(one, line));
    if (!others.some((one, k) => others.slice(k + 1).some((other) => atOnce(one, other)))) shown.push(line);
  }
  const rows = new Map<Line, 1 | 2 | undefined>();
  for (const line of lines.filter((one) => shown.includes(one)).toSorted((a, b) => a.from - b.from)) {
    const others = shown.filter((one) => one !== line && atOnce(one, line));
    // The rows so far are those of what has begun before it.
    rows.set(line, others.length === 0 ? undefined : others.some((one) => rows.get(one) === 1) ? 2 : 1);
  }
  return rows;
}
