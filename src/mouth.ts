// A line's mouth track: how open a mouth is in each frame of the clip while the line is spoken
// (AGENTS.md, "Fitting a clip to the voice"). It follows the voice's loudness, not its phonemes:
// a mouth opens wide on a loud vowel and shuts in a pause, which is enough for a simple cartoon.
//
// A frame's loudness is the RMS of the voice's samples that sound within it. Hearing is
// logarithmic, so the frames are compared in decibels with the line's loudest: that one is 1,
// and a frame RANGE dB under it, or quieter, is 0. A line's own level does not matter (the build
// sets the whole soundtrack's), so a quiet line opens the mouth as far as a loud one.

/** A voice as samples, -1 to 1, mono. */
export interface Voice {
  samples: Float32Array;
  sampleRate: number;
}

export interface MouthTrack {
  /** The clip's frame the line begins in. */
  frame: number;
  /** How open the mouth is in frame `frame + k`: 0 closed, 1 the line's loudest frame. */
  open: number[];
}

/** How far under the line's loudest frame a frame is closed, dB. A pause in Kokoro's voice is 40 dB under or more; the quietest consonants about 25. */
const RANGE = 30;
const EPS = 1e-6;

/**
 * The track of a voice that begins `at` seconds into a clip of `fps` frames a second: a number
 * for each frame the voice sounds in, from the one it begins in. The voice seldom begins on a
 * frame's edge: the part of a frame before it (or after its end) counts as silence.
 */
export function mouthTrack({ samples, sampleRate }: Voice, at: number, fps: number): MouthTrack {
  const frame = Math.floor(at * fps + EPS);
  const end = at + samples.length / sampleRate;
  const count = Math.max(0, Math.ceil(end * fps - EPS) - frame);
  const perFrame = sampleRate / fps;
  // Each frame's sample range, from the voice's first sample: frame f spans f/fps to (f+1)/fps.
  const sampleAt = (f: number) => Math.min(samples.length, Math.max(0, Math.round((f / fps - at) * sampleRate)));
  const rms: number[] = [];
  for (let k = 0; k < count; k++) {
    let energy = 0;
    for (let i = sampleAt(frame + k), to = sampleAt(frame + k + 1); i < to; i++) energy += samples[i]! * samples[i]!;
    rms.push(Math.sqrt(energy / perFrame));
  }
  const loudest = Math.max(0, ...rms);
  const open = rms.map((x) => {
    if (x <= 0 || loudest <= 0) return 0;
    const under = -20 * Math.log10(x / loudest); // dB under the loudest frame
    return Math.round(Math.max(0, 1 - under / RANGE) * 100) / 100;
  });
  return { frame, open };
}
