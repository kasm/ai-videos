// What the host does in step two for every plugin (host.ts): the frames encoded into the clip, and
// the clip's data written back. Which moment each frame shows is moments.ts; the picture of a
// moment is the plugin's.
//
// plugin.ts gives the types here to projects in other repositories, which have none of the tool's
// packages, so they are written out, not taken from fit.ts and clip.ts (frames.test.ts holds them
// equal), and this file imports nothing but Node's own modules and moments.ts.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export { moments, type Moment, type Request } from "./moments.ts";

/** The eight bytes every PNG begins with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG's size, from its header (IHDR, the first chunk): undefined for what is not a PNG. */
function pngSize(png: Uint8Array): { width: number; height: number } | undefined {
  if (png.length < 24 || PNG_SIGNATURE.some((b, i) => png[i] !== b)) return undefined;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * ffmpeg writing `clip` from frames `width` by `height` at `fps`; `crf` is the quality, lower is
 * closer to the pixels. A frame is raw pixels, or with `input: "png"` a PNG (a screenshot). Give
 * each frame to `frame`, then wait for `end`, which also writes `<clip>.frames`: a hash of each
 * frame as it was given (its pixels, or its PNG's bytes), a line a frame, to compare two runs by.
 */
export function encoder(clip: string, { width, height, fps, crf, input = "rgba" }: { width: number; height: number; fps: number; crf: number; input?: "rgba" | "png" }) {
  mkdirSync(path.dirname(clip), { recursive: true });
  const from = input === "png" ? ["-f", "image2pipe", "-c:v", "png"] : ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`];
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      ...from, "-framerate", String(fps), "-i", "-",
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
    /**
     * Adds a frame: rows from the top, four bytes a pixel (red, green, blue, alpha), opaque; or a
     * PNG of that size. The same buffer again is a hold.
     */
    async frame(pixels: Uint8Array): Promise<void> {
      if (pixels !== last) {
        if (input === "png") {
          const size = pngSize(pixels);
          if (!size) throw new Error(`a frame of ${pixels.length} bytes is not a PNG`);
          if (size.width !== width || size.height !== height) throw new Error(`a frame came out ${size.width} by ${size.height}, not ${width} by ${height}`);
        } else if (pixels.length !== width * height * 4) throw new Error(`a frame of ${pixels.length} bytes is not ${width} by ${height} pixels of four bytes`);
        last = pixels;
        hash = createHash("md5").update(pixels).digest("hex");
      }
      hashes.push(hash);
      // A full pipe is waited for; ffmpeg gone ends the wait, with its reason at the end.
      if (!stdin.write(pixels)) await Promise.race([once(stdin, "drain"), ended]);
    },
    /** Stops ffmpeg, for a clip that will not be finished (a frame failed): no `.frames` is written. */
    abort(): void {
      stdin.destroy();
      ffmpeg.kill();
      ended.catch(() => {});
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
    // Each key in the schema's order, whatever the plugin's objects hold besides.
    events: clip.events.map(({ name, at, span, natural }) => ({ name, at, span, ...(natural === undefined ? {} : { natural }) })),
    texts: clip.texts.map(({ text, speaker, from, to }) => ({ text, ...(speaker === undefined ? {} : { speaker }), from, to })),
  };
}

/** Writes the clip's data to `file`, its folder made first: either step's, the times as the host gives them. */
export function writeClipData(file: string, clip: Parameters<typeof clipData>[0]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(clipData(clip), null, 2)}\n`);
}
