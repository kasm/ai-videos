// Generates a HyperFrames project (index.html + one file per scene) from the script and the timeline.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle, FONTS_CSS, GSAP_SRC } from "./bundle.ts";
import { captionsOf } from "./captions.ts";
import type { SceneClip } from "./clip.ts";
import { run } from "./render.ts";
import { FORMATS, type FormatName, type LoadedVideo, type SceneScript } from "./script.ts";
import type { TimedLine, TimedScene, Timeline } from "./timeline.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replaces {{name}} placeholders. Unknown names are an error so templates can't rot silently. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`Scene template uses unknown placeholder {{${name}}}`);
    return String(values[name]);
  });
}

const CAPTION_LINGER = 1.0; // seconds a caption may stay after its words
/** Seconds a caption takes to fade in, slowing at the end (GSAP's power1.out); it leaves on a cut, so the next one can replace it. */
export const CAPTION_FADE = 0.12;

/** One caption of a clip scene: its words, and when it shows, seconds from the scene's start. */
export interface Caption {
  id: string;
  text: string;
  start: number;
  duration: number;
}

/**
 * A clip scene's captions: its lines split and timed (captions.ts). A caption stays through
 * the pause after its words, until the next one or CAPTION_LINGER after its words end, so a short
 * line is up long enough to read. The video's clip scene and the web page (page.ts) show these.
 */
export function sceneCaptions(timed: TimedScene): Caption[] {
  const pieces = timed.lines.flatMap((line) => captionsOf(line.text, line.localStart, line.duration));
  return pieces.map((c, k) => {
    const end = Math.min(pieces[k + 1]?.start ?? Infinity, c.end + CAPTION_LINGER, timed.duration);
    return { id: `${timed.id}-cap-${k + 1}`, text: c.text, start: Math.round(c.start * 1000) / 1000, duration: Math.round((end - c.start) * 1000) / 1000 };
  });
}

/** The clip scene's style, filled for a `width` by `height` stage: its captions' look, which the web page takes as it is. */
export async function clipStyle(root: string, width: number, height: number): Promise<string> {
  const template = await readFile(path.join(root, "scenes", "clip", "scene.html"), "utf8");
  const style = template.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (style === undefined) throw new Error("scenes/clip/scene.html has no <style>");
  return fill(style, { width, height });
}

/**
 * A clip scene's placeholders: the clip, copied into the project; a still of its last frame when
 * the scene runs on past it; and the narration as captions.
 */
async function clipScene(project: string, scene: SceneScript, timed: TimedScene, clips: SceneClip, fps: number) {
  const clip = clips.clip;
  if (!clip) throw new Error(`Scene "${scene.id}": its clip was not read`);
  const { width, height } = clip.video;
  const dir = path.join(project, "assets", "clips");
  await mkdir(dir, { recursive: true });
  const name = `${scene.id}${path.extname(clip.file)}`;
  await copyFile(clip.file, path.join(dir, name));

  let hold = "";
  const rest = Math.round((timed.duration - clips.duration) * 1000) / 1000;
  if (rest > 0.5 / fps) {
    const still = `${scene.id}-last.png`;
    // Every frame of the last second written over one file leaves the last frame in it.
    const { code, stderr } = await run("ffmpeg", ["-v", "error", "-y", "-sseof", "-1", "-i", clip.file, "-update", "1", path.join(dir, still)]);
    if (code !== 0) throw new Error(`ffmpeg could not take the last frame of ${clip.file}:\n${stderr.slice(-600)}`);
    hold = `    <img id="${scene.id}-hold" class="clip cl-media" data-start="${clips.duration}" data-duration="${rest}" data-track-index="1" src="assets/clips/${still}" width="${width}" height="${height}" alt="" data-layout-allow-occlusion />`;
  }

  const captions = sceneCaptions(timed);
  return {
    clipSrc: `assets/clips/${name}`,
    clipDuration: clips.duration,
    hold,
    captions: captions.map((c) => `    <div id="${c.id}" class="clip cl-cap" data-start="${c.start}" data-duration="${c.duration}" data-track-index="2"><p>${esc(c.text)}</p></div>`).join("\n"),
    captionsJson: JSON.stringify(captions.map(({ id, start }) => ({ id, start }))),
    fade: CAPTION_FADE,
  };
}

/**
 * Writes the HyperFrames project for one format into `<buildDir>/<format>` and returns that folder.
 * The scene template comes from the tool, `root`.
 */
export async function compose(
  root: string,
  video: LoadedVideo,
  clips: Map<string, SceneClip>,
  timeline: Timeline,
  format: FormatName,
  buildDir: string,
): Promise<string> {
  const { width, height } = FORMATS[format];
  const project = path.join(buildDir, format);
  // Clear only what we generate: HyperFrames keeps a helper process alive in the project
  // folder for a few minutes after a check, so the folder itself can't be removed on Windows.
  for (const sub of ["compositions", "assets"]) {
    await rm(path.join(project, sub), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  await mkdir(path.join(project, "compositions"), { recursive: true });
  // assets/vo/ is the narration's, assets/clips/ the clips', and assets/vendor/ GSAP's and the font's (bundle.ts).
  await mkdir(path.join(project, "assets", "vo"), { recursive: true });
  await bundle(root, project);

  const hosts: string[] = [];
  const audio: string[] = [];
  const template = await readFile(path.join(root, "scenes", "clip", "scene.html"), "utf8");

  for (const [i, scene] of video.script.scenes.entries()) {
    const timed = timeline.scenes[i]!;
    const values = { id: scene.id, width, height, format, duration: timed.duration };
    const html = fill(template, { ...values, ...(await clipScene(project, scene, timed, clips.get(scene.id)!, timeline.fps)) });
    await writeFile(path.join(project, "compositions", `${scene.id}.html`), html);

    hosts.push(
      `      <div id="${scene.id}" class="clip" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="${timed.start}" data-duration="${timed.duration}" data-track-index="1" data-track-kind="graphics" data-width="${width}" data-height="${height}"></div>`,
    );

    for (const line of timed.lines) {
      const name = voiceOf(line);
      await copyFile(line.audioFile, path.join(project, name));
      audio.push(
        `      <audio id="vo-${String(line.n).padStart(2, "0")}" class="clip" data-start="${line.start}" data-duration="${line.duration}" data-track-index="2" data-volume="1" src="${name}"></audio>`,
      );
    }
  }

  // No absolute path in the build: it is the same however the tool and the video were reached
  // (d: or D:), so a make can tell it unchanged (stages.ts).
  const source = path.relative(project, video.file).split(path.sep).join("/");
  const index = `<!doctype html>
<!-- Generated from ${source}. Edit it or the scene template, not this file. -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(video.script.title)}</title>
    <link rel="stylesheet" href="${FONTS_CSS}" />
    <script src="${GSAP_SRC}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #0c1222; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${timeline.duration}" data-width="${width}" data-height="${height}">
${hosts.join("\n")}
${audio.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
  await writeFile(path.join(project, "index.html"), index);
  await writeFile(
    path.join(project, "hyperframes.json"),
    JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2),
  );
  await writeFile(
    path.join(project, "meta.json"),
    JSON.stringify({ id: `${video.slug}-${format}`, name: `${video.script.title} (${format})` }, null, 2),
  );
  // The timeline as the build has it: each line's voice is the build's copy.
  const own = { ...timeline, scenes: timeline.scenes.map((s) => ({ ...s, lines: s.lines.map((line) => ({ ...line, audioFile: voiceOf(line) })) })) };
  await writeFile(path.join(project, "timeline.json"), JSON.stringify(own, null, 2));
  return project;
}

/** A line's voice in the build: its number and its file's name in the voice cache. */
const voiceOf = (line: { n: number; audioFile: string }) => `assets/vo/${String(line.n).padStart(2, "0")}-${path.basename(line.audioFile)}`;
