// Draws the demo's clips with ffmpeg, and beside each the JSON a clip scene reads: what made it,
// its events, its texts. Run it again after changing a time or a position:
//   node videos/clip-demo/make-clip.ts
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "clips");
const FPS = 30;
const SIDE = 200; // the square, px

// A square that holds, slides right, holds, rises, and holds: seconds.
const DURATION = 13;
const SLIDE = { from: 5, to: 6.5 };
const RISE = { from: 10, to: 11 };

const events = [
  { name: "start", at: 0, span: "hold" },
  { name: "slide", at: SLIDE.from, span: "move" },
  { name: "across", at: SLIDE.to, span: "hold" },
  { name: "rise", at: RISE.from, span: "move" },
  { name: "up", at: RISE.to, span: "hold" },
];
const texts = [
  { text: "A square waits on the left.", from: 0, to: SLIDE.from },
  { text: "It slides to the right.", from: SLIDE.from, to: SLIDE.to },
  { text: "Then it rises.", from: RISE.from, to: RISE.to },
];

// Where the square starts, where the slide ends, and where the rise ends: top-left corners, px.
// Each format keeps them clear of where its captions go.
const SIZES = {
  "16x9": { width: 1920, height: 1080, a: [360, 440], b: [1360, 440], c: [1360, 140] },
  "9x16": { width: 1080, height: 1920, a: [160, 560], b: [640, 560], c: [640, 260] },
} as const;

/** 0 to 1 over [from, to], eased in and out; an ffmpeg expression of t. */
const ease = ({ from, to }: { from: number; to: number }) => `(0.5-0.5*cos(PI*clip((t-${from})/${to - from},0,1)))`;

mkdirSync(OUT, { recursive: true });
for (const [size, { width, height, a, b, c }] of Object.entries(SIZES)) {
  const file = path.join(OUT, `demo-${size}.mp4`);
  const x = `${a[0]}+${b[0] - a[0]}*${ease(SLIDE)}`;
  const y = `${a[1]}+${c[1] - a[1]}*${ease(RISE)}`;
  // The three places as outlines, so a still frame shows where the square has been and will go.
  const outline = (p: readonly number[]) => `drawbox=x=${p[0]}:y=${p[1]}:w=${SIDE}:h=${SIDE}:color=0x5a6270:t=6`;
  const graph =
    `color=c=0x1d2126:s=${width}x${height}:r=${FPS}:d=${DURATION},format=rgb24,${outline(a)},${outline(b)},${outline(c)}[bg];` +
    `color=c=0x3ec5ff:s=${SIDE}x${SIDE}:r=${FPS}:d=${DURATION},format=rgb24[sq];` +
    `[bg][sq]overlay=x='${x}':y='${y}':eval=frame,` +
    "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v]";
  const ffmpeg = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-filter_complex", graph, "-map", "[v]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "24",
    "-movflags", "+faststart", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
    file,
  ], { encoding: "utf8" });
  if (ffmpeg.status !== 0) throw new Error(`ffmpeg failed for ${size}:\n${ffmpeg.stderr}`);
  const data = {
    format: "ai-videos-clip",
    version: 1,
    made: { by: "videos/clip-demo/make-clip.ts (ffmpeg)", from: "the times and positions in make-clip.ts" },
    duration: DURATION,
    events,
    texts,
  };
  writeFileSync(file.replace(/\.mp4$/, ".json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${path.relative(process.cwd(), file)} and its .json`);
}
