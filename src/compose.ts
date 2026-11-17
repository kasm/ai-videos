// Generates a HyperFrames project (index.html + one file per scene) from script and timeline.
import { copyFile, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { FORMATS, type FormatName, type LoadedVideo, type MarkScript } from "./script.ts";
import type { TimedLine, Timeline } from "./timeline.ts";

const GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replaces {{name}} placeholders. Unknown names are an error so templates can't rot silently. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`Scene template uses unknown placeholder {{${name}}}`);
    return String(values[name]);
  });
}

/** Pauses at punctuation, in characters' worth of speaking time. */
const PAUSE: Record<string, number> = { ",": 5, ";": 6, ":": 6, ".": 9, "!": 9, "?": 9, "—": 6 };

/**
 * Where in a spoken line a phrase begins, as a fraction of the line's duration. There are no word
 * timestamps, so this goes by characters, with punctuation counted as the pause it causes.
 */
function phraseAt(text: string, phrase: string): number | null {
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index < 0) return null;
  const weight = (s: string) => [...s].reduce((sum, ch) => sum + 1 + (PAUSE[ch] ?? 0), 0);
  return weight(text.slice(0, index)) / weight(text);
}

/** A mark as the scene draws it: `at` is seconds from the scene's start. */
interface TimedMark {
  mark: MarkScript["mark"];
  on: string;
  area: [number, number, number, number];
  from: string;
  at: number;
}

const DRAW_EARLY = 0.12; // a mark starts this long before its word, so the stroke lands as it is said

function timeMarks(sceneId: string, pageFile: string, pageHtml: string, line: TimedLine, marks: MarkScript[]): TimedMark[] {
  return marks.map((m) => {
    if (!pageHtml.includes(`data-mark="${m.on}"`)) {
      throw new Error(`Scene "${sceneId}", line ${line.n}: mark on "${m.on}" has no element with data-mark="${m.on}" in ${pageFile}`);
    }
    let offset = 0.25;
    if (typeof m.at === "number") offset = m.at;
    else if (typeof m.at === "string") {
      const f = phraseAt(line.text, m.at);
      if (f === null) throw new Error(`Scene "${sceneId}", line ${line.n}: "${m.at}" is not in the line "${line.text}"`);
      offset = Math.max(0, f * line.duration - DRAW_EARLY);
    }
    return {
      mark: m.mark,
      on: m.on,
      area: m.area ?? [0, 0, 1, 1],
      from: m.from ?? "left",
      at: Math.round((line.localStart + offset) * 1000) / 1000,
    };
  });
}

export async function compose(
  root: string,
  video: LoadedVideo,
  timeline: Timeline,
  format: FormatName,
): Promise<string> {
  const { width, height } = FORMATS[format];
  const project = path.join(root, "build", video.slug, format);
  // Clear only what we generate: HyperFrames keeps a helper process alive in the project
  // folder for a few minutes after a check, so the folder itself can't be removed on Windows.
  for (const sub of ["compositions", "assets"]) {
    await rm(path.join(project, sub), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  await mkdir(path.join(project, "compositions"), { recursive: true });
  // The video's own pictures: a page refers to them as assets/<file>. assets/vo/ is the narration's.
  const pageAssets = path.join(video.dir, "assets");
  if (await stat(pageAssets).then((s) => s.isDirectory(), () => false)) {
    await cp(pageAssets, path.join(project, "assets"), { recursive: true });
  }
  await mkdir(path.join(project, "assets", "vo"), { recursive: true });

  const hosts: string[] = [];
  const audio: string[] = [];

  for (const [i, scene] of video.script.scenes.entries()) {
    const timed = timeline.scenes[i]!;
    const template = await readFile(path.join(root, "scenes", scene.scene, "scene.html"), "utf8");
    const pageHtml = await readFile(path.join(video.dir, scene.page), "utf8");
    const pageCss = scene.css ? await readFile(path.join(video.dir, scene.css), "utf8") : "";
    for (const line of scene.narration) {
      const cue = line.cue;
      if (cue && cue !== "top" && cue !== "bottom" && !pageHtml.includes(`data-cue="${cue}"`)) {
        throw new Error(`Scene "${scene.id}": cue "${cue}" has no element with data-cue="${cue}" in ${scene.page}`);
      }
    }
    const lines = timed.lines.map((l, j) => ({
      start: l.localStart,
      duration: l.duration,
      cue: l.cue ?? null,
      pause: l.pause,
      marks: timeMarks(scene.id, scene.page, pageHtml, l, scene.narration[j]!.draw ?? []),
    }));

    await writeFile(
      path.join(project, "compositions", `${scene.id}.html`),
      fill(template, {
        id: scene.id,
        width,
        height,
        format,
        duration: timed.duration,
        url: esc(scene.url),
        pageHtml,
        pageCss,
        linesJson: JSON.stringify(lines),
      }),
    );

    hosts.push(
      `      <div id="${scene.id}" class="clip" data-composition-id="${scene.id}" data-composition-src="compositions/${scene.id}.html" data-start="${timed.start}" data-duration="${timed.duration}" data-track-index="1" data-track-kind="graphics" data-width="${width}" data-height="${height}"></div>`,
    );

    for (const line of timed.lines) {
      const name = `${String(line.n).padStart(2, "0")}-${path.basename(line.audioFile)}`;
      await copyFile(line.audioFile, path.join(project, "assets", "vo", name));
      audio.push(
        `      <audio id="vo-${String(line.n).padStart(2, "0")}" class="clip" data-start="${line.start}" data-duration="${line.duration}" data-track-index="2" data-volume="1" src="assets/vo/${name}"></audio>`,
      );
    }
  }

  const index = `<!doctype html>
<!-- Generated from ${video.file}. Edit the script, the page or the scene template, not this file. -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(video.script.title)}</title>
    <script src="${GSAP}"></script>
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
  await writeFile(path.join(project, "timeline.json"), JSON.stringify(timeline, null, 2));
  return project;
}
