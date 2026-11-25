// The random numbers the random tests draw (random.ts): the same for a seed, and none comes round.
import assert from "node:assert/strict";
import { test } from "node:test";
import { different, random } from "./random.ts";

const whole = 2 ** 32;

test("the numbers are the same for a seed, and others for another", () => {
  const drawn = (seed: number) => {
    const { int } = random(seed);
    return Array.from({ length: 20 }, () => int(1000));
  };
  assert.deepEqual(drawn(7), drawn(7));
  assert.notDeepEqual(drawn(7), drawn(8));
  // Said once, so that a change to the generator is seen: it is other scripts and plans that are tried.
  assert.deepEqual(drawn(7).slice(0, 5), [11, 61, 976, 699, 521]);
});

test("the numbers do not come round: in a million, no two of them follow each other twice", () => {
  const { int } = random(7);
  const seen = new Set<number>();
  for (let k = 0; k < 1e6; k++) seen.add(int(whole) * 2 ** 20 + int(2 ** 20));
  assert.equal(seen.size, 1e6);
});

test("each of so many comes as often as the others, and a chance as often as it says", () => {
  const { int, chance, pick } = random(7);
  const counts = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 60000; k++) counts[int(6)]!++;
  for (const n of counts) assert.ok(Math.abs(n - 10000) < 400, `${counts}`);
  let happened = 0;
  for (let k = 0; k < 10000; k++) if (chance(0.15)) happened++;
  assert.ok(Math.abs(happened - 1500) < 150, `${happened}`);
  assert.deepEqual([chance(0), chance(1)], [false, true]);
  assert.deepEqual(new Set(Array.from({ length: 100 }, () => pick(["a", "b", "c"]))), new Set(["a", "b", "c"]));
});

test("different things: one drawn again is left out, and what comes round is found", () => {
  const { int } = random(7);
  const tens = different(10, () => int(12), String);
  assert.deepEqual([tens.length, new Set(tens).size], [10, 10]);
  assert.deepEqual(different(2, () => ({ n: int(2) }), ({ n }) => `${n}`).map(({ n }) => n).toSorted(), [0, 1]);
  // A generator of a test's own, as read.test.ts had: it has 79,493 states.
  let seed = 7;
  const own = (to: number) => ((seed = (Math.imul(seed, 48271) >>> 0) % 2147483647), seed % to);
  assert.throws(() => different(200000, () => [own(1000), own(1000), own(1000)], String), /of \d+ drawn, only \d+ are different/);
  assert.equal(different(200000, () => [int(1000), int(1000), int(1000)], String).length, 200000);
});
