// What every maker repeats in step two (AGENTS.md, "The maker's shared code"): which moment each
// frame of the request shows, the frames encoded into the clip, and the clip's data written back.
// A maker's own part is the picture of a moment.
//
// A project in another repository imports this file alone (package.json, "exports"), so it imports
// nothing but Node's own modules: the types here are written out, not taken from fit.ts and clip.ts
// (frames.test.ts holds them equal).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** What `moments` reads of a request (ai-videos-request, fit.ts); its other keys are for reading. */
export interface Request {
  fps: number;
  /** The clip's length in whole frames. */
  frames: number;
  spans: {
    event: string;
    span: "hold" | "move";
    /** When the span begins and how long it lasts in the clip, seconds. */
    at: number;
    duration: number;
    /** A move plays its motion over this long, then holds its last picture for the rest. */
    move?: number;
  }[];
  /** The spoken lines. A request with none, or a line with no track or no speaker, moves no mouth. */
  lines?: {
    speaker?: string;
    /** `open[k]` is for the clip's frame `frame + k`, 0 closed to 1 wide. */
    mouth?: { frame: number; open: number[] };
  }[];
}

/** What one frame shows. */
export interface Moment {
  /** Which of the request's spans the frame is in, from 0. */
  span: number;
  /** How far through the span's motion: a move goes evenly from 0 to 1 and stays there; a hold is at 0. */
  progress: number;
  /** Seconds since the clip began, and since the span did. */
  time: number;
  into: number;
  /** How open each speaker's mouth is, above 0 to 1. A speaker it does not name has it closed. */
  mouths: Record<string, number>;
}

/**
 * Whose mouth is open in each frame of the clip, and how wide: each line's track laid on the frames
 * it names, for its speaker alone. A line with no speaker is a narrator's, whom nobody draws, so it
 * opens no mouth.
 */
function mouths(request: Request): Record<string, number>[] {
  const open = Array.from({ length: request.frames }, (): Record<string, number> => ({}));
  for (const { speaker, mouth } of request.lines ?? []) {
    if (speaker === undefined) continue;
    mouth?.open.forEach((value, k) => {
      const at = open[mouth.frame + k];
      // One speaker's line may end in the frame their next begins in: the wider mouth shows.
      if (at && value > 0) at[speaker] = Math.max(at[speaker] ?? 0, value);
    });
  }
  return open;
}

/**
 * The moment each frame of the requested clip shows. The tool puts every span on a whole frame; a
 * move's motion takes its `move` seconds from there and then stays at its end, and the next span
 * begins where it ended. Each speaker's mouth follows their lines' voice, whatever the span.
 */
export function moments(request: Request): Moment[] {
  if (!Number.isInteger(request.frames) || request.frames <= 0 || !(request.fps > 0)) {
    throw new Error(`the request gives no whole number of frames at a frame rate (frames ${request.frames}, fps ${request.fps})`);
  }
  const open = mouths(request);
  const starts = request.spans.map((span) => Math.round(span.at * request.fps));
  const frames: Moment[] = [];
  request.spans.forEach((span, i) => {
    const start = starts[i]!;
    const end = starts[i + 1] ?? request.frames;
    if (start !== frames.length || end <= start) throw new Error(`the request's span "${span.event}" does not follow the one before it on a whole frame`);
    for (let frame = start; frame < end; frame++) {
      const progress = span.span === "move" ? Math.min(1, (frame - start) / request.fps / (span.move ?? span.duration)) : 0;
      frames.push({ span: i, progress, time: frame / request.fps, into: (frame - start) / request.fps, mouths: open[frame]! });
    }
  });
  return frames;
}

/**
 * ffmpeg writing `clip` from raw frames, `width` by `height` at `fps`; `crf` is the quality, lower
 * is closer to the pixels. Give each frame to `frame`, then wait for `end`, which also writes
 * `<clip>.frames`: a hash of each frame's pixels, a line a frame, to compare two runs by.
 */
export function encoder(clip: string, { width, height, fps, crf }: { width: number; height: number; fps: number; crf: number }) {
  mkdirSync(path.dirname(clip), { recursive: true });
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-framerate", String(fps), "-i", "-",
      // Pictures are sRGB and players take HD video for BT.709: said here, the colours stay.
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
      "-c:v", "libx264", "-preset", "medium", "-crf", String(crf),
      // Left out: what differs by run (dates, the encoder's name).
      "-movflags", "+faststart", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
      clip,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  // Resolves with ffmpeg's exit code. A write after ffmpeg has gone fails too: `ended` tells why.
  const ended = new Promise<number | null>((resolve, reject) => {
    ffmpeg.on("error", (e) => reject(new Error(`ffmpeg could not start (is it on the PATH?): ${e.message}`)));
    ffmpeg.on("close", resolve);
  });
  const stdin = ffmpeg.stdin;
  stdin.on("error", () => {});
  const hashes: string[] = [];
  let last: Uint8Array | undefined;
  let hash = "";
  return {
    /** Adds a frame: rows from the top, four bytes a pixel (red, green, blue, alpha), opaque. The same buffer again is a hold. */
    async frame(pixels: Uint8Array): Promise<void> {
      if (pixels !== last) {
        if (pixels.length !== width * height * 4) throw new Error(`a frame of ${pixels.length} bytes is not ${width} by ${height} pixels of four bytes`);
        last = pixels;
        hash = createHash("md5").update(pixels).digest("hex");
      }
      hashes.push(hash);
      // A full pipe is waited for; ffmpeg gone ends the wait, with its reason at the end.
      if (!stdin.write(pixels)) await Promise.race([once(stdin, "drain"), ended]);
    },
    /** Waits for ffmpeg to finish the clip, and writes the frames' hashes beside it. Returns how many frames it has. */
    async end(): Promise<number> {
      stdin.end();
      const code = await ended;
      if (code !== 0) throw new Error(`ffmpeg ended with ${code}`);
      writeFileSync(`${clip}.frames`, `${hashes.join("\n")}\n`);
      return hashes.length;
    },
  };
}

/** A named moment of a clip, and the kind of the span from it to the next. Drawn to a request, it keeps the span's `natural`. */
export interface ClipEvent {
  name: string;
  at: number;
  span: "hold" | "move";
  natural?: number;
}

/** One of the clip's own texts and when it applies; `speaker` when one of its characters says it. */
export interface ClipText {
  text: string;
  speaker?: string;
  from: number;
  to: number;
}

/** The JSON beside a clip (ai-videos-clip, clip.ts). */
export interface ClipData {
  format: "ai-videos-clip";
  version: 1;
  made: { by: string; from: string };
  duration: number;
  events: ClipEvent[];
  texts: ClipText[];
}

/** The clip's data as it is written: `by` drew it `from` that, to `request` (a file) when it was drawn to one. */
export function clipData(clip: { by: string; from: string; request?: string; duration: number; events: ClipEvent[]; texts: ClipText[] }): ClipData {
  return {
    format: "ai-videos-clip",
    version: 1,
    made: { by: clip.by, from: `${clip.from}${clip.request === undefined ? "" : `, drawn to ${path.basename(clip.request)}`}` },
    duration: clip.duration,
    // Each key in the schema's order, whatever the maker's objects hold besides.
    events: clip.events.map(({ name, at, span, natural }) => ({ name, at, span, ...(natural === undefined ? {} : { natural }) })),
    texts: clip.texts.map(({ text, speaker, from, to }) => ({ text, ...(speaker === undefined ? {} : { speaker }), from, to })),
  };
}

/** Writes the clip's data to `file`, its folder made first: either step's, the times as the maker gives them. */
export function writeClipData(file: string, clip: Parameters<typeof clipData>[0]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(clipData(clip), null, 2)}\n`);
}
