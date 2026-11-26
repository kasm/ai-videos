// Random numbers for the random tests, all of which draw from here: the same for the same seed, so
// that what fails fails again. A generator of a test's own comes round: one tried 2,409 scripts over
// and over, and said it had tried 40,000.
//
// The tests' alone: nothing of the tool draws from it.

export interface Random {
  /** A whole number from 0, below `to`. */
  int(to: number): number;
  /** Whether what happens this share of the time, 0 to 1, happens. */
  chance(share: number): boolean;
  /** One of these. */
  pick<T>(from: readonly T[]): T;
}

/**
 * Random numbers from a seed (mulberry32). Its state is a counter that an odd number is added to, so it
 * goes through all 2^32 of them before it comes round, far more than a test draws.
 */
export function random(seed: number): Random {
  let state = seed | 0;
  const int = (to: number) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * to);
  };
  return { int, chance: (share) => int(2 ** 32) < share * 2 ** 32, pick: (from) => from[int(from.length)]! };
}

/**
 * `count` things of which no two are written the same (`textOf`): one drawn again is left out, so a test
 * that tries these says how many it tried (`t.diagnostic`). When most of those drawn were there before,
 * what draws them comes round, or has no more of them: that is thrown.
 */
export function different<T>(count: number, draw: () => T, textOf: (thing: T) => string): T[] {
  const things = new Map<string, T>();
  for (let drawn = 1; things.size < count; drawn++) {
    const thing = draw();
    const text = textOf(thing);
    if (!things.has(text)) things.set(text, thing);
    if (drawn > 100 && things.size < drawn / 2) throw new Error(`of ${drawn} drawn, only ${things.size} are different`);
  }
  return [...things.values()];
}
