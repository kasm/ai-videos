// For the tests: videos/clip-demo's script with its clips drawn by the demo's maker, as `make`
// draws them, at the clip's own pace. Its clips are made, so not in git: each test draws its own.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { madeFiles, type ClipJson } from "./clip.ts";
import { makerArgs, type MakerCall } from "./maker.ts";
import { run } from "./render.ts";
import { FORMATS as SIZES, type FormatName } from "./script.ts";

export const VIDEOS = path.resolve(import.meta.dirname, "..", "videos");

/** The demo's frame rate (its video.yaml): its own events fall on whole frames of it. */
const FPS = 30;

/** Runs the demo's maker (videos/make-clip.ts) with a call, as `make` does. */
async function maker(call: MakerCall) {
  const { code, stderr } = await run(process.execPath, [path.join(VIDEOS, "make-clip.ts"), ...makerArgs(call)], { cwd: VIDEOS });
  if (code !== 0) throw new Error(`The demo's maker failed (exit ${code}):\n${stderr}`);
}

/** A request at the clip's own pace: each event where it is, so drawn to it each gains its `natural`. */
function ownPace(data: ClipJson) {
  const spans = data.events.map((e, i) => {
    const length = (data.events[i + 1]?.at ?? data.duration) - e.at;
    return { event: e.name, span: e.span, natural: length, at: e.at, duration: length };
  });
  return { format: "ai-videos-request", version: 1, fps: FPS, duration: data.duration, frames: Math.round(data.duration * FPS), spans };
}

/** The demo's script in `dir`, its clips drawn there: both of the maker's steps, the formats at once. */
export async function drawnDemo(dir: string, formats: FormatName[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  await cp(path.join(VIDEOS, "clip-demo", "video.yaml"), path.join(dir, "video.yaml"));
  await Promise.all(
    formats.map(async (format) => {
      const files = madeFiles(dir, "square", format);
      await maker({ step: "data", name: "square", format, data: files.data });
      await writeFile(files.request, JSON.stringify(ownPace(JSON.parse(await readFile(files.data, "utf8")))));
      await maker({ step: "draw", name: "square", format, ...SIZES[format], request: files.request, clip: files.clip, data: files.data });
    }),
  );
}
