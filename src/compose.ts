// Generates a HyperFrames project (index.html + one file per scene) from the script and the
// timeline, or from a compiled scenario.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle, FONTS_CSS, GSAP_SRC } from "./bundle.ts";
import { captionsOf, LINGER } from "./captions.ts";
import type { Probe, SceneClip } from "./clip.ts";
import { saidLines, type Compiled } from "./compile.ts";
import { run } from "./render.ts";
import { FORMATS, type FormatName, type LoadedVideo } from "./script.ts";
import type { TimedScene, Timeline } from "./timeline.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replaces {{name}} placeholders. Unknown names are an error so templates can't rot silently. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`Scene template uses unknown placeholder {{${name}}}`);
    return String(values[name]);
  });
}

/** Seconds a caption takes to fade in, slowing at the end (GSAP's power1.out); it leaves on a cut, so the next one can replace it. */
export const CAPTION_FADE = 0.12;

/** One caption of a clip scene: its words, when it shows, seconds from the scene's start, and its row, of two at once (compile.ts). */
export interface Caption {
  id: string;
  text: string;
  start: number;
  duration: number;
  row?: 1 | 2;
}

/**
 * A clip scene's captions: its lines split and timed (captions.ts). A caption stays through
 * the pause after its words, until the next one or LINGER after its words end. The video's clip
 * scene and the web page (page.ts) show these.
 */
export function sceneCaptions(timed: TimedScene): Caption[] {
  const pieces = timed.lines.flatMap((line) => captionsOf(line.text, line.localStart, line.duration));
  return pieces.map((c, k) => {
    const end = Math.min(pieces[k + 1]?.start ?? Infinity, c.end + LINGER, timed.duration);
    return { id: `${timed.id}-cap-${k + 1}`, text: c.text, start: Math.round(c.start * 1000) / 1000, duration: Math.round((end - c.start) * 1000) / 1000 };
  });
}

/**
 * A frame's time, seconds, for a build and a page: the last whole millisecond before it. HyperFrames
 * counts a length's frames upwards, and shows an element in each frame from its start up to its end,
 * so a time a hair early lands on the frame, and one rounded up to the next millisecond lands on the
 * frame after.
 */
export const frameTime = (frame: number, fps: number) => Math.max(0, Math.ceil((frame * 1000) / fps - 1) / 1000);

/** A compiled scenario's captions, each from its frame on, for its frames. The video and the web page show these. */
export function compiledCaptions(name: string, { scenes, fps }: Compiled): Caption[] {
  return saidLines(scenes)
    .flatMap((line) => line.captions)
    .map(({ text, from, frames, row }, k) => {
      const start = frameTime(from, fps);
      const duration = Math.round((frameTime(from + frames, fps) - start) * 1000) / 1000;
      return { id: `${name}-cap-${k + 1}`, text, start, duration, ...(row === undefined ? {} : { row }) };
    });
}

/** A caption's classes, in the clip scene's style. */
export const captionClass = ({ row }: Caption) => (row === undefined ? "cl-cap" : `cl-cap cl-row cl-row-${row}`);

/** The clip scene's style, filled for a `width` by `height` stage: its captions' look, which the web page takes as it is. */
export async function clipStyle(root: string, width: number, height: number): Promise<string> {
  const template = await readFile(path.join(root, "scenes", "clip", "scene.html"), "utf8");
  const style = template.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (style === undefined) throw new Error("scenes/clip/scene.html has no <style>");
  return fill(style, { width, height });
}

/** A scene of a build: its clip, and its captions over it. Times are seconds. */
interface BuildScene {
  id: string;
  start: number;
  duration: number;
  clip: { file: string; width: number; height: number; duration: number };
  /** Each from the scene's start. */
  captions: Caption[];
}

/** What a build shows, and what it is made from. */
interface Build {
  /** The video's name: the project's, and its title. */
  name: string;
  title: string;
  /** The video file, which the build names as its source. */
  file: string;
  fps: number;
  /** Seconds. */
  duration: number;
  scenes: BuildScene[];
  /** The voices beside the picture: each one's file, the one it is in the build, and when it sounds. */
  voices: { n: number; file: string; name: string; start: number; duration: number }[];
}

/**
 * A clip scene's placeholders: the clip, copied into the project; a still of its last frame when
 * the scene runs on past it; and its captions.
 */
async function clipScene(project: string, scene: BuildScene, fps: number) {
  const { clip, captions } = scene;
  const { width, height } = clip;
  const dir = path.join(project, "assets", "clips");
  await mkdir(dir, { recursive: true });
  const name = `${scene.id}${path.extname(clip.file)}`;
  await copyFile(clip.file, path.join(dir, name));

  let hold = "";
  const rest = Math.round((scene.duration - clip.duration) * 1000) / 1000;
  if (rest > 0.5 / fps) {
    const still = `${scene.id}-last.png`;
    // Every frame of the last second written over one file leaves the last frame in it.
    const { code, stderr } = await run("ffmpeg", ["-v", "error", "-y", "-sseof", "-1", "-i", clip.file, "-update", "1", path.join(dir, still)]);
    if (code !== 0) throw new Error(`ffmpeg could not take the last frame of ${clip.file}:\n${stderr.slice(-600)}`);
    hold = `    <img id="${scene.id}-hold" class="clip cl-media" data-start="${clip.duration}" data-duration="${rest}" data-track-index="1" src="assets/clips/${still}" width="${width}" height="${height}" alt="" data-layout-allow-occlusion />`;
  }

  return {
    clipSrc: `assets/clips/${name}`,
    clipDuration: clip.duration,
    hold,
    // One caption is up at a time on a track: the lower row has one of its own.
    captions: captions.map((c) => `    <div id="${c.id}" class="clip ${captionClass(c)}" data-start="${c.start}" data-duration="${c.duration}" data-track-index="${c.row === 2 ? 3 : 2}"><p>${esc(c.text)}</p></div>`).join("\n"),
    captionsJson: JSON.stringify(captions.map(({ id, start }) => ({ id, start }))),
    fade: CAPTION_FADE,
  };
}

/**
 * Writes the HyperFrames project for one format into `<buildDir>/<format>` and returns that folder:
 * the script's scenes, each its clip with its lines' captions, and the lines' voices.
 */
export async function compose(
  root: string,
  video: LoadedVideo,
  clips: Map<string, SceneClip>,
  timeline: Timeline,
  format: FormatName,
  buildDir: string,
): Promise<string> {
  const scenes = video.script.scenes.map(({ id }, i): BuildScene => {
    const timed = timeline.scenes[i]!;
    const { clip, duration } = clips.get(id)!;
    if (!clip) throw new Error(`Scene "${id}": its clip was not read`);
    const { width, height } = clip.video;
    return { id, start: timed.start, duration: timed.duration, clip: { file: clip.file, width, height, duration }, captions: sceneCaptions(timed) };
  });
  const voices = timeline.scenes.flatMap((scene) => scene.lines).map((line) => ({ n: line.n, file: line.audioFile, name: voiceOf(line), start: line.start, duration: line.duration }));
  const { slug: name, file, script } = video;
  const project = await writeBuild(root, { name, title: script.title, file, fps: timeline.fps, duration: timeline.duration, scenes, voices }, format, buildDir);
  // The timeline as the build has it: each line's voice is the build's copy.
  const own = { ...timeline, scenes: timeline.scenes.map((s) => ({ ...s, lines: s.lines.map((line) => ({ ...line, audioFile: voiceOf(line) })) })) };
  await writeFile(path.join(project, "timeline.json"), JSON.stringify(own, null, 2));
  return project;
}

/**
 * The same of a compiled scenario (compile.ts) and the clip drawn from it: one scene, the clip on
 * the video's own frames, with the compiled captions. Its sound is no part of the build: the video
 * takes the tool's own track (sound.ts).
 */
export async function composeCompiled(
  root: string,
  video: { name: string; file: string },
  compiled: Compiled,
  clip: { file: string; video: Probe },
  format: FormatName,
  buildDir: string,
): Promise<string> {
  const { name } = video;
  const { width, height } = clip.video;
  const duration = frameTime(compiled.frames, compiled.fps);
  const scene = { id: name, start: 0, duration, clip: { file: clip.file, width, height, duration }, captions: compiledCaptions(name, compiled) };
  return writeBuild(root, { name, title: name, file: video.file, fps: compiled.fps, duration, scenes: [scene], voices: [] }, format, buildDir);
}

/** Writes a build's HyperFrames project for one format into `<buildDir>/<format>`. The scene template comes from the tool, `root`. */
async function writeBuild(root: string, build: Build, format: FormatName, buildDir: string): Promise<string> {
  const { width, height } = FORMATS[format];
  const project = path.join(buildDir, format);
  // Clear only what we generate: HyperFrames keeps a helper process alive in the project
  // folder for a few minutes after a check, so the folder itself can't be removed on Windows.
  for (const sub of ["compositions", "assets", "timeline.json"]) {
    await rm(path.join(project, sub), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  await mkdir(path.join(project, "compositions"), { recursive: true });
  // assets/vo/ is the narration's, assets/clips/ the clips', and assets/vendor/ GSAP's and the font's (bundle.ts).
  if (build.voices.length > 0) await mkdir(path.join(project, "assets", "vo"), { recursive: true });
  await bundle(root, project);

  const hosts: string[] = [];
  const audio: string[] = [];
  const template = await readFile(path.join(root, "scenes", "clip", "scene.html"), "utf8");

  for (const scene of build.scenes) {
    const values = { id: scene.id, width, height, format, duration: scene.duration };
    const html = fill(template, { ...values, ...(await clipScene(project, scene, build.fps)) });
    await writeFile(path.join(project, "compositions", `${scene.id}.html`), html);

    hosts.push(
      `      <div id="${scene.id}" class="clip" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1" data-track-kind="graphics" data-width="${width}" data-height="${height}"></div>`,
    );
  }
  for (const { n, file, name, start, duration } of build.voices) {
    await copyFile(file, path.join(project, name));
    audio.push(
      `      <audio id="vo-${String(n).padStart(2, "0")}" class="clip" data-start="${start}" data-duration="${duration}" data-track-index="2" data-volume="1" src="${name}"></audio>`,
    );
  }

  // No absolute path in the build: it is the same however the tool and the video were reached
  // (d: or D:), so a make can tell it unchanged (stages.ts).
  const source = path.relative(project, build.file).split(path.sep).join("/");
  const index = `<!doctype html>
<!-- Generated from ${source}. Edit it or the scene template, not this file. -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(build.title)}</title>
    <link rel="stylesheet" href="${FONTS_CSS}" />
    <script src="${GSAP_SRC}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #0c1222; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${build.duration}" data-width="${width}" data-height="${height}">
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
    JSON.stringify({ id: `${build.name}-${format}`, name: `${build.title} (${format})` }, null, 2),
  );
  return project;
}

/** A line's voice in the build: its number and its file's name in the voice cache. */
const voiceOf = (line: { n: number; audioFile: string }) => `assets/vo/${String(line.n).padStart(2, "0")}-${path.basename(line.audioFile)}`;
