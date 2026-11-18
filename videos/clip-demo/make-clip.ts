// Draws the demo's clips with ffmpeg, and beside each the JSON a clip scene reads: what made it,
// its events, its texts. It plays the part of whatever draws a real clip:
//   node videos/clip-demo/make-clip.ts             at the clip's own pace
//   node videos/clip-demo/make-clip.ts --request   to the request beside each clip, which
//                                                  `npm run video -- request clip-demo` writes
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "clips");
const FPS = 30;
const SIDE = 200; // the square, px

// At its own pace: a square that holds, slides right, holds, rises, and holds. Seconds.
const EVENTS = [
  { name: "start", at: 0, span: "hold" },
  { name: "slide", at: 5, span: "move" },
  { name: "across", at: 6.5, span: "hold" },
  { name: "rise", at: 10, span: "move" },
  { name: "up", at: 11, span: "hold" },
] as const;
const DURATION = 13;
const TEXTS = [
  { text: "A square waits on the left.", from: "start", to: "slide" },
  { text: "It slides to the right.", from: "slide", to: "across" },
  { text: "Then it rises.", from: "rise", to: "up" },
];

// Where the square starts, where the slide ends, and where the rise ends: top-left corners, px.
// Each format keeps them clear of where its captions go.
const SIZES = {
  "16x9": { width: 1920, height: 1080, a: [360, 440], b: [1360, 440], c: [1360, 140] },
  "9x16": { width: 1080, height: 1920, a: [160, 560], b: [640, 560], c: [640, 260] },
} as const;

interface RequestSpan { event: string; natural: number; at: number; duration: number; move?: number }

/** When each event comes and how long each motion takes: at the clip's own pace, or as a request asks. */
function timing(request?: { duration: number; spans: RequestSpan[] }) {
  if (request && request.spans.map((s) => s.event).join() !== EVENTS.map((e) => e.name).join()) {
    throw new Error(`the request's spans (${request.spans.map((s) => s.event).join(", ")}) are not this clip's events`);
  }
  const at = (name: string) => (request ? request.spans.find((s) => s.event === name)!.at : EVENTS.find((e) => e.name === name)!.at);
  const span = (name: string) => request?.spans.find((s) => s.event === name);
  const ownEnd = (name: string) => {
    const i = EVENTS.findIndex((e) => e.name === name);
    return EVENTS[i + 1]?.at ?? DURATION;
  };
  return {
    duration: request?.duration ?? DURATION,
    at,
    /** A move's motion: from its event, for `move` seconds (then it holds, if the request says so). */
    motion: (name: string) => ({ from: at(name), to: at(name) + (span(name)?.move ?? ownEnd(name) - at(name)) }),
    natural: (name: string) => span(name)?.natural,
  };
}

/** 0 to 1 over [from, to], eased in and out; an ffmpeg expression of t. */
const ease = ({ from, to }: { from: number; to: number }) => `(0.5-0.5*cos(PI*clip((t-${from})/${to - from},0,1)))`;

const toRequest = process.argv.includes("--request");
mkdirSync(OUT, { recursive: true });
for (const [size, { width, height, a, b, c }] of Object.entries(SIZES)) {
  const file = path.join(OUT, `demo-${size}.mp4`);
  const requestFile = file.replace(/\.mp4$/, ".request.json");
  const time = timing(toRequest ? JSON.parse(readFileSync(requestFile, "utf8")) : undefined);
  const x = `${a[0]}+${b[0] - a[0]}*${ease(time.motion("slide"))}`;
  const y = `${a[1]}+${c[1] - a[1]}*${ease(time.motion("rise"))}`;
  // The three places as outlines, so a still frame shows where the square has been and will go.
  const outline = (p: readonly number[]) => `drawbox=x=${p[0]}:y=${p[1]}:w=${SIDE}:h=${SIDE}:color=0x5a6270:t=6`;
  const graph =
    `color=c=0x1d2126:s=${width}x${height}:r=${FPS}:d=${time.duration},format=rgb24,${outline(a)},${outline(b)},${outline(c)}[bg];` +
    `color=c=0x3ec5ff:s=${SIDE}x${SIDE}:r=${FPS}:d=${time.duration},format=rgb24[sq];` +
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
    made: {
      by: "videos/clip-demo/make-clip.ts (ffmpeg)",
      from: `the times and positions in make-clip.ts${toRequest ? `, drawn to ${path.basename(requestFile)}` : ""}`,
    },
    duration: time.duration,
    events: EVENTS.map((e) => ({ ...e, at: time.at(e.name), ...(time.natural(e.name) ? { natural: time.natural(e.name) } : {}) })),
    texts: TEXTS.map((t) => ({ text: t.text, from: time.at(t.from), to: time.at(t.to) })),
  };
  writeFileSync(file.replace(/\.mp4$/, ".json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${path.relative(process.cwd(), file)} and its .json${toRequest ? `, drawn to ${path.basename(requestFile)}` : ""}`);
}
