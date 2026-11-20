// The clip itself: every frame of the request drawn (picture.ts), turned into pixels by resvg and
// encoded by the tool's encoder (ffmpeg). Nothing here depends on the run: the same scenario and
// request give the same pixels, and the encoder's <clip>.frames keeps a hash per frame to show it,
// or to find where two runs part.
import { Resvg } from "@resvg/resvg-js";
import { encoder } from "ai-videos/frames";
import { frameSvg } from "./picture.ts";
import type { Request } from "./request.ts";
import { STAGE, type Scenario } from "./scenario.ts";
import { moments } from "./timeline.ts";

/** The clip's quality (x264's crf; lower is closer to the pixels): a drawing's edges stay clean. */
const CRF = 17;

/**
 * Draws the scenario to `request` into `clip`, `width` by `height`. A frame whose picture is the
 * one before it (a hold) is not drawn again. Returns how many frames the clip has and how many
 * were drawn.
 */
export async function drawClip(scenario: Scenario, request: Request, { clip, width, height }: { clip: string; width: number; height: number }) {
  if (width * STAGE.height !== height * STAGE.width) {
    throw new Error(`the stage is ${STAGE.width} by ${STAGE.height}: it does not fill ${width} by ${height}`);
  }
  const out = encoder(clip, { width, height, fps: request.fps, crf: CRF });
  let drawn = 0;
  let svg = "";
  let pixels: Buffer | undefined;
  for (const moment of moments(request)) {
    const next = frameSvg(scenario, moment, { width, height });
    if (next !== svg || !pixels) {
      svg = next;
      // No fonts: a cartoon's picture holds no text (the tool draws the captions).
      const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
      if (image.width !== width || image.height !== height) throw new Error(`a frame came out ${image.width} by ${image.height}, not ${width} by ${height}`);
      pixels = image.pixels;
      drawn++;
    }
    // The same buffer again is a hold: the encoder hashes it once.
    await out.frame(pixels);
  }
  return { frames: await out.end(), drawn };
}
