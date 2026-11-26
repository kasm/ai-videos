// How loud a voice or a sound is, as a video's loudness is measured (ITU-R BS.1770-4, what LUFS are): its
// samples filtered as an ear hears them, and the mean power of its blocks of 400 ms, those that are silence,
// or far under the rest, left out. A script's voices and sounds are brought to one loudness by it (sound.ts).
import type { Voice } from "./mouth.ts";

/** A sound as samples, -1 to 1, in two channels. */
export interface Stereo {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

const BLOCK = 0.4;
/** A block this quiet, LUFS, is silence, and one this far under the mean of the rest, LU, is a pause. */
const SILENCE = -70;
const PAUSE = -10;

/** A filter of the second order: what comes out for what goes in. */
function filtered(samples: Float32Array, [b0, b1, b2]: number[], [a1, a2]: number[]): Float32Array {
  const out = new Float32Array(samples.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const y = b0! * x + b1! * x1 + b2! * x2 - a1! * y1 - a2! * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    out[i] = y;
  }
  return out;
}

/** Samples as an ear hears them (the standard's K weighting, for any sample rate): the treble raised by 4 dB, the bass cut. */
function weighted(samples: Float32Array, sampleRate: number): Float32Array {
  const at = (hz: number, q: number) => {
    const k = Math.tan((Math.PI * hz) / sampleRate);
    const a0 = 1 + k / q + k * k;
    return { k, q, a0, a: [(2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0] };
  };
  const high = 10 ** (3.999843853973347 / 20);
  const band = high ** 0.4996667741545416;
  const { k, q, a0, a } = at(1681.974450955533, 0.7071752369554196);
  const raised = filtered(samples, [(high + (band * k) / q + k * k) / a0, (2 * (k * k - high)) / a0, (high - (band * k) / q + k * k) / a0], a);
  return filtered(raised, [1, -2, 1], at(38.13547087602444, 0.5003270373238773).a);
}

/** The power of each block of a channel, as it is heard, four of them begun in each 400 ms. One shorter than a block is one. */
function powersOf(samples: Float32Array, sampleRate: number): number[] {
  const heard = weighted(samples, sampleRate);
  const block = Math.max(1, Math.min(heard.length, Math.round(BLOCK * sampleRate)));
  const step = Math.max(1, Math.round((BLOCK / 4) * sampleRate));
  const powers: number[] = [];
  for (let at = 0; at + block <= heard.length; at += step) {
    let sum = 0;
    for (let i = at; i < at + block; i++) sum += heard[i]! * heard[i]!;
    powers.push(sum / block);
  }
  return powers;
}

/** The loudness of blocks of these powers, all channels' added up, LUFS: the silent ones and the pauses left out. */
function gated(powers: number[]): number {
  const loudness = (power: number) => -0.691 + 10 * Math.log10(power);
  const mean = (list: number[]) => list.reduce((sum, power) => sum + power, 0) / list.length;
  const sounding = powers.filter((power) => loudness(power) > SILENCE);
  if (sounding.length === 0) return -Infinity;
  const floor = loudness(mean(sounding)) + PAUSE;
  return loudness(mean(sounding.filter((power) => loudness(power) > floor)));
}

/** How loud a voice is, LUFS, played whole in each of so many channels; -Infinity for one that is silence. */
export const loudnessOf = ({ samples, sampleRate }: Voice, channels = 1): number => gated(powersOf(samples, sampleRate).map((power) => channels * power));

/** How loud a sound is, LUFS, its two channels as they are; -Infinity for one that is silence. */
export function loudnessIn({ left, right, sampleRate }: Stereo): number {
  const others = powersOf(right, sampleRate);
  return gated(powersOf(left, sampleRate).map((power, k) => power + others[k]!));
}
