// The clip itself: every frame of the request drawn (picture.ts), turned into pixels by resvg and
// encoded by ffmpeg. Nothing here depends on the run: the same scenario and request give the same
// pixels, and <clip>.frames keeps a hash per frame to show it, or to find where two runs part.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { frameSvg } from "./picture.ts";
import type { Request } from "./request.ts";
import { STAGE, type Scenario } from "./scenario.ts";
import { moments } from "./timeline.ts";

/** ffmpeg, reading raw frames from its stdin. Its options leave out what differs by run (dates, the encoder's name). */
function encoder(file: string, { width, height, fps }: { width: number; height: number; fps: number }) {
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-framerate", String(fps), "-i", "-",
      // Pictures are sRGB and players take HD video for BT.709: said here, the colours stay.
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
      "-c:v", "libx264", "-preset", "medium", "-crf", "17",
      "-movflags", "+faststart", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  // Resolves with ffmpeg's exit code. A write after ffmpeg has gone fails too: `ended` tells why.
  const ended = new Promise<number | null>((resolve, reject) => {
    ffmpeg.on("error", (e) => reject(new Error(`ffmpeg could not start (is it on the PATH?): ${e.message}`)));
    ffmpeg.on("close", resolve);
  });
  ffmpeg.stdin.on("error", () => {});
  return { stdin: ffmpeg.stdin, ended };
}

/**
 * Draws the scenario to `request` into `clip`, `width` by `height`. A frame whose picture is the
 * one before it (a hold) is not drawn again. Returns how many frames the clip has and how many
 * were drawn.
 */
export async function drawClip(scenario: Scenario, request: Request, { clip, width, height }: { clip: string; width: number; height: number }) {
  if (width * STAGE.height !== height * STAGE.width) {
    throw new Error(`the stage is ${STAGE.width} by ${STAGE.height}: it does not fill ${width} by ${height}`);
  }
  mkdirSync(path.dirname(clip), { recursive: true });
  const { stdin, ended } = encoder(clip, { width, height, fps: request.fps });
  const hashes: string[] = [];
  let drawn = 0;
  let svg = "";
  let pixels: Buffer | undefined;
  let hash = "";
  for (const moment of moments(request)) {
    const next = frameSvg(scenario, moment, { width, height });
    if (next !== svg || !pixels) {
      svg = next;
      // No fonts: a cartoon's picture holds no text (the tool draws the captions).
      const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
      if (image.width !== width || image.height !== height) throw new Error(`a frame came out ${image.width} by ${image.height}, not ${width} by ${height}`);
      pixels = image.pixels;
      hash = createHash("md5").update(pixels).digest("hex");
      drawn++;
    }
    hashes.push(hash);
    // A full pipe is waited for; ffmpeg gone ends the wait, with its reason below.
    if (!stdin.write(pixels)) await Promise.race([once(stdin, "drain"), ended]);
  }
  stdin.end();
  const code = await ended;
  if (code !== 0) throw new Error(`ffmpeg ended with ${code}`);
  writeFileSync(`${clip}.frames`, `${hashes.join("\n")}\n`);
  return { frames: hashes.length, drawn };
}
