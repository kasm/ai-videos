// A line split into captions. Lines are known text, so no speech recognition is involved.
const MAX_CHARS = 84; // a longer line is split

/** Seconds a caption may stay after its words, when no other comes: a short line is up long enough to read. */
export const LINGER = 1.0;

/** Splits a long line at clause boundaries into chunks that fit one caption. */
function chunk(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const clauses = text.match(/[^.!?,;:]+[.!?,;:]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const clause of clauses) {
    if (current && (current + clause).trim().length > MAX_CHARS) {
      chunks.push(current.trim());
      current = "";
    }
    current += clause;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** A line as captions: pieces that fit one each, timed in proportion to their length from `start` (seconds, or frames). */
export function captionsOf(text: string, start: number, duration: number): { text: string; start: number; end: number }[] {
  const chunks = chunk(text);
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  let t = start;
  return chunks.map((c) => {
    const span = duration * (c.length / total);
    const piece = { text: c, start: t, end: t + span };
    t += span;
    return piece;
  });
}
