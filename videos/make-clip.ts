// The maker of this tool's own videos (videos/project.yaml): it draws clip-demo's square with
// ffmpeg, as a project's maker draws its clips (AGENTS.md, "The maker"). `make` runs it here, in
// videos/, twice per format:
//   node make-clip.ts square --format=landscape --data=<json>
//       the clip's data at its own pace (its events and texts), nothing drawn
//   node make-clip.ts square --format=landscape --width=1920 --height=1080 --request=<json> --clip=<mp4> --data=<json>
//       the clip drawn to the request, and its data again, each event with its natural length
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readMakerCall, type MakerCall } from "../src/maker.ts";

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

// Where the square starts, where the slide ends, and where the rise ends: top-left corners, px. The
// size comes in the call; each layout keeps the places clear of where its captions go.
const PLACES = {
  landscape: { a: [360, 440], b: [1360, 440], c: [1360, 140] },
  portrait: { a: [160, 560], b: [640, 560], c: [640, 260] },
} as const;

interface RequestSpan { event: string; natural: number; at: number; duration: number; move?: number }
type Timing = ReturnType<typeof timing>;

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

/** Step two's picture: the square on its way, at the call's size, into the call's clip. */
function draw(call: Extract<MakerCall, { step: "draw" }>, time: Timing) {
  const { width, height } = call;
  const { a, b, c } = PLACES[call.format];
  const x = `${a[0]}+${b[0] - a[0]}*${ease(time.motion("slide"))}`;
  const y = `${a[1]}+${c[1] - a[1]}*${ease(time.motion("rise"))}`;
  // The three places as outlines, so a still frame shows where the square has been and will go.
  const outline = (p: readonly number[]) => `drawbox=x=${p[0]}:y=${p[1]}:w=${SIDE}:h=${SIDE}:color=0x5a6270:t=6`;
  const graph =
    `color=c=0x1d2126:s=${width}x${height}:r=${FPS}:d=${time.duration},format=rgb24,${outline(a)},${outline(b)},${outline(c)}[bg];` +
    `color=c=0x3ec5ff:s=${SIDE}x${SIDE}:r=${FPS}:d=${time.duration},format=rgb24[sq];` +
    `[bg][sq]overlay=x='${x}':y='${y}':eval=frame,` +
    "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v]";
  mkdirSync(path.dirname(call.clip), { recursive: true });
  const ffmpeg = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-filter_complex", graph, "-map", "[v]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "24",
    "-movflags", "+faststart", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
    call.clip,
  ], { encoding: "utf8" });
  if (ffmpeg.error) throw new Error(`ffmpeg could not start (is it on the PATH?): ${ffmpeg.error.message}`);
  if (ffmpeg.status !== 0) throw new Error(`ffmpeg failed for ${call.format}:\n${ffmpeg.stderr}`);
}

function main() {
  const call = readMakerCall(process.argv.slice(2));
  if (call.name !== "square") throw new Error(`this maker draws "square", not "${call.name}"`);
  const request = call.step === "draw" ? call.request : undefined;
  const time = timing(request ? JSON.parse(readFileSync(request, "utf8")) : undefined);
  if (call.step === "draw") draw(call, time);
  const data = {
    format: "ai-videos-clip",
    version: 1,
    made: {
      by: "videos/make-clip.ts (ffmpeg)",
      from: `the times and positions in make-clip.ts${request ? `, drawn to ${path.basename(request)}` : ""}`,
    },
    duration: time.duration,
    events: EVENTS.map((e) => ({ ...e, at: time.at(e.name), ...(time.natural(e.name) ? { natural: time.natural(e.name) } : {}) })),
    texts: TEXTS.map((t) => ({ text: t.text, from: time.at(t.from), to: time.at(t.to) })),
  };
  mkdirSync(path.dirname(call.data), { recursive: true });
  writeFileSync(call.data, `${JSON.stringify(data, null, 2)}\n`);
  const wrote = call.step === "draw" ? `${path.relative(process.cwd(), call.clip)}, drawn to ${path.basename(call.request)}, and its JSON` : path.relative(process.cwd(), call.data);
  console.log(`  ${wrote}`);
}

// A maker exits non-zero with the reason on stderr, and make stops there.
try {
  main();
} catch (e) {
  console.error(`make-clip.ts: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
