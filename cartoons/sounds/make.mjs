// Makes the sounds beside this file with ffmpeg, from nothing: tones that die away, and noise. They are
// the repo's own, under its licence. Run it from anywhere: node cartoons/sounds/make.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";

/** A note's pitch, Hz, from how many half-tones it is over the middle C. */
const hz = (halfTones) => 261.6256 * 2 ** (halfTones / 12);
/** A plucked note from `at` seconds on: a tone and an octave over it, quickly up, and dying away. */
const pluck = (at, halfTones, level, fall = 6) => {
  const t = `(t-${at})`;
  const tone = `(sin(2*PI*${hz(halfTones).toFixed(3)}*${t})+0.35*sin(2*PI*${(2 * hz(halfTones)).toFixed(3)}*${t}))`;
  return `gte(t,${at})*${level}*min(1,${t}*150)*exp(-${fall}*${t})*${tone}`;
};
const ffmpeg = (name, source, filters) => {
  const file = path.join(import.meta.dirname, name);
  const { status, stderr } = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", source, "-af", filters, "-bitexact", "-map_metadata", "-1", "-c:a", "flac", "-sample_fmt", "s16", file]);
  if (status !== 0) throw new Error(`${name}: ${stderr}`);
  console.log(name);
};

// The tune: eight seconds that begin where they end, a chord each two seconds, a note each half a second to
// one side and to the other.
const CHORDS = [
  [0, 4, 7, 12],
  [-3, 0, 4, 9],
  [5, 9, 12, 17],
  [-5, 2, 7, 11],
];
const sides = [0, 1].map((side) =>
  CHORDS.flatMap((chord, c) => {
    const bar = 2 * c;
    const notes = chord.map((note, k) => pluck(bar + 0.5 * k, note, k % 2 === side ? 0.22 : 0.09));
    return [pluck(bar, chord[0] - 12, 0.14, 2.2), ...notes];
  }).join("+"),
);
ffmpeg("tune.flac", `aevalsrc=exprs='${sides[0]}|${sides[1]}':s=48000:d=8`, "afade=t=out:st=7.94:d=0.06");

// The jingle: four notes up, as on a radio before the news.
ffmpeg("jingle.flac", `aevalsrc=exprs='${[7, 4, 7, 12].map((note, k) => pluck(0.18 * k, note + 12, 0.3, k === 3 ? 3.5 : 7)).join("+")}':s=48000:d=1.4`, "afade=t=out:st=1.2:d=0.2");

// The rustle: noise in three gusts, the low taken out of it, as of somebody in the reeds.
const gust = [0, 0.28, 0.5].map((at, k) => `gte(t,${at})*exp(-${9 - 2 * k}*(t-${at}))*min(1,(t-${at})*40)`).join("+");
ffmpeg("rustle.flac", "anoisesrc=d=1:c=pink:r=48000:a=0.5:seed=7", `volume='${gust}':eval=frame,highpass=f=1800,afade=t=out:st=0.85:d=0.15`);
