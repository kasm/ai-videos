// The maker of this tool's own videos (videos/project.yaml): it draws clip-demo's square, as a
// project's maker draws its clips (AGENTS.md, "The maker"), with the code every maker shares
// (src/frames.ts). `make` runs it here, in videos/, twice per format:
//   node make-clip.ts square --format=landscape --data=<json>
//       the clip's data at its own pace (its events and texts), nothing drawn
//   node make-clip.ts square --format=landscape --width=1920 --height=1080 --request=<json> --clip=<mp4> --data=<json>
//       the clip drawn to the request, and its data again, each event with its natural length
import { readFileSync } from "node:fs";
import path from "node:path";
import { encoder, moments, writeClipData, type Moment, type Request } from "../src/frames.ts";
import { readMakerCall, type MakerCall } from "../src/maker.ts";

const SIDE = 200; // the square, px
const LINE = 6; // an outline's width, px
const CRF = 24; // flat colours: they stay clean at a small file

const BACKGROUND = 0x1d2126;
const OUTLINE = 0x5a6270;
const SQUARE = 0x3ec5ff;

// At its own pace: a square that holds, slides right, holds, rises, and holds. Seconds.
const EVENTS = [
  { name: "start", at: 0, span: "hold" },
  { name: "slide", at: 5, span: "move" },
  { name: "across", at: 6.5, span: "hold" },
  { name: "rise", at: 10, span: "move" },
  { name: "up", at: 11, span: "hold" },
] as const;
type EventName = (typeof EVENTS)[number]["name"];
const DURATION = 13;
const TEXTS = [
  { text: "A square waits on the left.", from: "start", to: "slide" },
  { text: "It slides to the right.", from: "slide", to: "across" },
  { text: "Then it rises.", from: "rise", to: "up" },
] as const;

// Where the square starts, where the slide ends, and where the rise ends: top-left corners, px. The
// size comes in the call; each layout keeps the places clear of where its captions go.
const PLACES = {
  landscape: { a: [360, 440], b: [1360, 440], c: [1360, 140] },
  portrait: { a: [160, 560], b: [640, 560], c: [640, 260] },
} as const;

/** The request's spans the data needs, beside what the frames are drawn from. */
type DrawRequest = Omit<Request, "spans"> & { duration: number; spans: (Request["spans"][number] & { natural: number })[] };
type Timing = ReturnType<typeof timing>;

/** When each event comes: at the clip's own pace, or as a request asks. */
function timing(request?: DrawRequest) {
  if (request && request.spans.map((s) => s.event).join() !== EVENTS.map((e) => e.name).join()) {
    throw new Error(`the request's spans (${request.spans.map((s) => s.event).join(", ")}) are not this clip's events`);
  }
  const span = (name: EventName) => request?.spans.find((s) => s.event === name);
  return {
    duration: request?.duration ?? DURATION,
    at: (name: EventName) => span(name)?.at ?? EVENTS.find((e) => e.name === name)!.at,
    natural: (name: EventName) => span(name)?.natural,
  };
}

/** Fills a rectangle of `pixels` (rows of `width`, four bytes a pixel) with an opaque colour, 0xRRGGBB. */
function fill(pixels: Buffer, width: number, [x, y]: readonly [number, number], [w, h]: readonly [number, number], colour: number) {
  const row = Buffer.alloc(w * 4, Buffer.from([colour >> 16, (colour >> 8) & 255, colour & 255, 255]));
  for (let j = 0; j < h; j++) row.copy(pixels, ((y + j) * width + x) * 4);
}

/** 0 to 1, slow at both ends. */
const ease = (progress: number) => 0.5 - 0.5 * Math.cos(Math.PI * progress);

/** How far a move has gone in a frame: not begun before its span, done after it. */
function through(moment: Moment, name: EventName): number {
  const i = EVENTS.findIndex((e) => e.name === name);
  return moment.span < i ? 0 : moment.span > i ? 1 : moment.progress;
}

/** Step two's picture: the square on its way, at the call's size, into the call's clip. */
async function draw(call: Extract<MakerCall, { step: "draw" }>, request: DrawRequest) {
  const { width, height } = call;
  const { a, b, c } = PLACES[call.format];
  // What every frame shares: the three places as outlines, so a still frame shows where the square
  // has been and will go.
  const stage = Buffer.alloc(width * height * 4);
  fill(stage, width, [0, 0], [width, height], BACKGROUND);
  for (const [x, y] of [a, b, c]) {
    fill(stage, width, [x, y], [SIDE, LINE], OUTLINE);
    fill(stage, width, [x, y + SIDE - LINE], [SIDE, LINE], OUTLINE);
    fill(stage, width, [x, y], [LINE, SIDE], OUTLINE);
    fill(stage, width, [x + SIDE - LINE, y], [LINE, SIDE], OUTLINE);
  }
  const clip = encoder(call.clip, { width, height, fps: request.fps, crf: CRF });
  let at = "";
  let pixels = stage;
  for (const moment of moments(request)) {
    // On whole pixels: the square's edges stay sharp.
    const x = Math.round(a[0] + (b[0] - a[0]) * ease(through(moment, "slide")));
    const y = Math.round(a[1] + (c[1] - a[1]) * ease(through(moment, "rise")));
    // A square that has not moved is the frame before, given again.
    if (at !== `${x},${y}`) {
      at = `${x},${y}`;
      pixels = Buffer.from(stage);
      fill(pixels, width, [x, y], [SIDE, SIDE], SQUARE);
    }
    await clip.frame(pixels);
  }
  await clip.end();
}

async function main() {
  const call = readMakerCall(process.argv.slice(2));
  if (call.name !== "square") throw new Error(`this maker draws "square", not "${call.name}"`);
  // The tool wrote the request from this maker's data, and `moments` refuses one it cannot follow.
  const request = call.step === "draw" ? (JSON.parse(readFileSync(call.request, "utf8")) as DrawRequest) : undefined;
  const time = timing(request);
  if (call.step === "draw" && request) await draw(call, request);
  writeClipData(call.data, {
    by: "videos/make-clip.ts (ffmpeg)",
    from: "the times and positions in make-clip.ts",
    request: call.step === "draw" ? call.request : undefined,
    duration: time.duration,
    events: EVENTS.map((e) => ({ ...e, at: time.at(e.name), natural: time.natural(e.name) })),
    texts: TEXTS.map((t) => ({ text: t.text, from: time.at(t.from), to: time.at(t.to) })),
  });
  const wrote = call.step === "draw" ? `${path.relative(process.cwd(), call.clip)}, drawn to ${path.basename(call.request)}, and its JSON` : path.relative(process.cwd(), call.data);
  console.log(`  ${wrote}`);
}

// A maker exits non-zero with the reason on stderr, and make stops there.
main().catch((e) => {
  console.error(`make-clip.ts: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
