// What every maker repeats in step two (AGENTS.md, "The maker's shared code"): which moment each
// frame of the request shows, the frames encoded into the clip, and the clip's data written back.
// A maker's own part is the picture of a moment.
//
// A project in another repository imports this file alone (package.json, "exports"), so it imports
// nothing but Node's own modules and moments.ts, which imports nothing: the types here are written
// out, not taken from fit.ts and clip.ts (frames.test.ts holds them equal).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export { moments, type Moment, type Request } from "./moments.ts";

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
