// A video file's web page (AGENTS.md, "make", --as web): one HTML file with everything in it, that
// plays as the video does. Each frame of a drawing plugin's picture is the SVG the video's frame was
// drawn from, drawn by the plugin's own code and the tool's moments (a script's, by what each frame
// of the compiled scenario shows), bundled for a browser; a recording plugin's picture is the clip
// it recorded, played with the sound. The sound is the video's one track; the captions are the clip
// scene's, in its style. A play button and a seek bar, nothing more, and no URL: it plays offline.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { CAPTION_FADE, captionClass, clipStyle, compiledCaptions, sceneCaptions, type Caption } from "./compose.ts";
import { FONT, fontSheet } from "./bundle.ts";
import type { Compiled } from "./compile.ts";
import type { Library } from "./plugin.ts";
import type { FormatName } from "./script.ts";
import { pictureOf, type CompiledPicture } from "./shown.ts";
import type { Timeline } from "./timeline.ts";

/** The tool's code that the page's drawing bundles, the same as the host's: the moments of a request, or what a compiled scenario's frames show. */
const MOMENTS = path.join(import.meta.dirname, "moments.ts");
const SHOWN = path.join(import.meta.dirname, "shown.ts");

/** What the page's player shows, and the library its drawing finds the names in. */
interface Player {
  /** The library's file is a path from the project: it names nothing but a mistake. */
  library?: Library;
  size: { width: number; height: number };
  format: FormatName;
  fps: number;
  /** The video's length in frames. */
  frames: number;
  captions: Caption[];
  /** Seconds a caption takes to fade in. */
  fade: number;
}

/** A video fitted to the voice: its drawing is given what the host's draw call is. */
export interface FittedPage extends Player {
  /** The video file, a path from the project: it names nothing but a mistake. */
  file: string;
  source: unknown;
  /** The request the video was drawn to, as written. */
  request: unknown;
}

/** A video written as a script: its drawing is given the compiled scenario's picture, as the host's play call is. */
export interface CompiledPage extends Player {
  compiled: CompiledPicture;
}

/** What the page's drawing is given, and what its player shows. */
export type PageVideo = FittedPage | CompiledPage;

const posix = (file: string) => file.split(path.sep).join("/");

/**
 * The page's drawing: the plugin's module and the tool's code, bundled for a browser into a script
 * that defines `drawing(video)`. Its `svgAt(frame)` is the SVG of that frame, drawn as the host
 * draws it (host.ts, runJob): the source mended and checked, and the frame's moment drawn; or, of a
 * `compiled` scenario, what the frame shows drawn by the plugin's script.
 */
export async function drawingScript(pluginFile: string, compiled: boolean): Promise<string> {
  const plugin = `import plugin from ${JSON.stringify(posix(pluginFile))};\n`;
  const fitted = `import { moments } from ${JSON.stringify(posix(MOMENTS))};
globalThis.drawing = (video) => {
  const repaired = plugin.repair?.(video.source, video.library) ?? { source: video.source };
  const source = plugin.check(repaired.source, video.file, video.library);
  const list = moments(video.request);
  return { svgAt: (frame) => plugin.frame(source, list[Math.min(Math.max(frame, 0), list.length - 1)], video.size) };
};
`;
  const played = `import { shownAt } from ${JSON.stringify(posix(SHOWN))};
globalThis.drawing = (video) => {
  const draw = plugin.script.draw(video.library);
  return { svgAt: (frame) => draw(shownAt(video.compiled, Math.min(Math.max(frame, 0), video.compiled.frames - 1)), video.size) };
};
`;
  const entry = plugin + (compiled ? played : fitted);
  const result = await build({
    stdin: { contents: entry, resolveDir: path.dirname(pluginFile), sourcefile: "drawing.js", loader: "js" },
    bundle: true,
    format: "iife",
    platform: "browser",
    minify: true,
    charset: "utf8",
    legalComments: "none",
    write: false,
    logLevel: "silent",
  }).catch((e: Error) => {
    throw new Error(`the plugin ${pluginFile} does not bundle for a web page: ${e.message}`);
  });
  const code = result.outputFiles[0]!.text;
  if (/<\/script/i.test(code)) throw new Error(`the plugin ${pluginFile}, bundled, holds "</script": it can't go in a page`);
  return code;
}

/** The library with its file as a path from the project, `dir`; nothing for none. */
const libraryFrom = (dir: string, library: Library | undefined) => (library ? { library: { file: posix(path.relative(dir, library.file)), raw: library.raw } } : {});

/** What the page shows of a video written as a script: its compiled scenario, and the library. */
export function compiledPage(opts: { dir: string; name: string; compiled: Compiled; library: Library | undefined; size: { width: number; height: number }; format: FormatName }): CompiledPage {
  const { compiled } = opts;
  return {
    compiled: pictureOf(compiled),
    ...libraryFrom(opts.dir, opts.library),
    size: opts.size,
    format: opts.format,
    fps: compiled.fps,
    frames: compiled.frames,
    captions: compiledCaptions(opts.name, compiled),
    fade: CAPTION_FADE,
  };
}

/** What the page shows of a video file: its drawing's input, the frames and the captions of `timeline`. */
export function pageVideo(opts: {
  dir: string;
  file: string;
  source: unknown;
  library: Library | undefined;
  request: unknown;
  size: { width: number; height: number };
  format: FormatName;
  timeline: Timeline;
}): FittedPage {
  const { dir, timeline } = opts;
  return {
    file: posix(path.relative(dir, opts.file)),
    source: opts.source,
    ...libraryFrom(dir, opts.library),
    request: opts.request,
    size: opts.size,
    format: opts.format,
    fps: timeline.fps,
    frames: Math.round(timeline.duration * timeline.fps),
    // Each scene's captions, on the video's clock.
    captions: timeline.scenes.flatMap((scene) => sceneCaptions(scene).map((c) => ({ ...c, start: Math.round((scene.start + c.start) * 1000) / 1000 }))),
    fade: CAPTION_FADE,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON that can sit in a <script>: no `<` to end it early. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const dataUrl = async (file: string, type: string) => `data:${type};base64,${(await readFile(file)).toString("base64")}`;

/**
 * The player: the sound's clock picks the frame, drawn when it changes, with the captions of its
 * time. A recorded clip plays beside the sound instead, set back on its time when it drifts more
 * than two frames from it, and on the frame itself while the sound is paused.
 */
const PLAYER = `(function () {
  var video = JSON.parse(document.getElementById("video").textContent);
  var clip = document.getElementById("clip");
  var picture = clip ? null : drawing(video);
  var FPS = video.fps, LAST = video.frames - 1, FADE = video.fade, W = video.size.width, H = video.size.height;
  var frame = document.getElementById("frame"), stage = document.getElementById("stage"), image = document.getElementById("picture");
  var controls = document.getElementById("controls"), play = document.getElementById("play"), seek = document.getElementById("seek");
  var sound = document.getElementById("sound");
  var captions = video.captions.map(function (c) {
    var box = document.getElementById(c.id);
    return { box: box, text: box.firstChild, start: c.start, end: c.start + c.duration };
  });
  var shown = -1;

  // The stage at its own size, scaled to the window as a whole.
  function fit() {
    var scale = Math.min(innerWidth / W, (innerHeight - controls.offsetHeight - 16) / H);
    frame.style.width = W * scale + "px";
    frame.style.height = H * scale + "px";
    controls.style.width = W * scale + "px";
    stage.style.transform = "scale(" + scale + ")";
  }

  // A frame as the video shows it: its picture, and each caption in its time, fading in as it begins.
  function show(n) {
    n = Math.max(0, Math.min(LAST, n));
    if (n === shown) return;
    shown = n;
    var t = n / FPS;
    if (picture) image.innerHTML = picture.svgAt(n);
    // Halfway into the frame, so the clip shows that frame and not the one before it.
    else if (sound.paused) clip.currentTime = Math.min(clip.duration || Infinity, t + 0.5 / FPS);
    captions.forEach(function (c) {
      var on = t >= c.start && t < c.end;
      c.box.style.display = on ? "" : "none";
      if (on) {
        var p = Math.min(1, (t - c.start) / FADE);
        c.text.style.opacity = String(1 - (1 - p) * (1 - p));
      }
    });
    seek.value = String(n);
  }

  function tick() {
    if (clip && !sound.paused && Math.abs(clip.currentTime - sound.currentTime) > 2 / FPS) clip.currentTime = sound.currentTime;
    show(Math.floor(sound.currentTime * FPS + 1e-3));
    if (!sound.paused) requestAnimationFrame(tick);
  }

  play.addEventListener("click", function () {
    if (!sound.paused) return sound.pause();
    if (shown >= LAST) sound.currentTime = 0;
    sound.play();
  });
  sound.addEventListener("play", function () {
    play.textContent = "Pause";
    if (clip) {
      clip.currentTime = sound.currentTime;
      clip.play();
    }
    requestAnimationFrame(tick);
  });
  sound.addEventListener("pause", function () {
    play.textContent = "Play";
    if (clip) clip.pause();
  });
  sound.addEventListener("ended", function () {
    show(LAST);
  });
  seek.addEventListener("input", function () {
    var n = Number(seek.value);
    sound.currentTime = n / FPS;
    show(n);
  });
  addEventListener("resize", fit);
  fit();
  show(0);
})();`;

/**
 * What a page shows: a drawing plugin's picture (its file, bundled with the tool's code), or the
 * clip a recording plugin drew (an .mp4, played muted beside the sound).
 */
export type PagePicture = { plugin: string } | { clip: string };

/**
 * Writes the page of `video` to `out`: its picture (the plugin's drawing, or its clip), the caption
 * font (Inter 700, each subset), the sound (`sound`, an .m4a) and the player. Returns its size, bytes.
 */
export async function writePage(root: string, opts: { title: string; source: string; picture: PagePicture; video: PageVideo; sound: string; out: string }): Promise<number> {
  const { video, picture } = opts;
  const { width, height } = video.size;
  const fonts = await fontSheet(root, FONT.pkg, FONT.weight, (file) => dataUrl(file, "font/woff2"));
  const captions = video.captions
    .map((c) => `      <div id="${c.id}" class="${captionClass(c)}" style="display: none"><p>${esc(c.text)}</p></div>`)
    .join("\n");
  const shown =
    "clip" in picture
      ? `<div id="picture" class="cl-media"><video id="clip" muted playsinline preload="auto" width="${width}" height="${height}" src="${await dataUrl(picture.clip, "video/mp4")}"></video></div>`
      : `<div id="picture" class="cl-media"></div>`;
  const drawn = "clip" in picture ? "" : `\n  <script id="drawing">${await drawingScript(picture.plugin, "compiled" in video)}</script>`;
  const html = `<!doctype html>
<!-- Made from ${esc(opts.source)} by the video tool (make --as web). One file: it plays offline. -->
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<style>
${fonts}
</style>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; background: #000000; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; overflow: hidden; }
  #frame { position: relative; overflow: hidden; }
  #stage { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; transform-origin: 0 0; }
  #picture svg, #picture video { display: block; }
  #controls { display: flex; align-items: center; gap: 12px; font: 16px system-ui, sans-serif; }
  #play { min-width: 5.5em; padding: 0.4em 1em; border: 0; border-radius: 0.4em; background: #f2f2f2; color: #111111; font: inherit; cursor: pointer; }
  #seek { flex: 1; accent-color: #f2f2f2; }
</style>
<style>
${await clipStyle(root, width, height)}
</style>
</head>
<body>
  <div id="frame"><div id="stage"><div id="root" data-format="${video.format}">
      <div class="cl-bg"></div>
      ${shown}
${captions}
  </div></div></div>
  <div id="controls">
    <button id="play" type="button">Play</button>
    <input id="seek" type="range" min="0" max="${video.frames - 1}" step="1" value="0" aria-label="Seek" />
  </div>
  <audio id="sound" preload="auto" src="${await dataUrl(opts.sound, "audio/mp4")}"></audio>
  <script id="video" type="application/json">${scriptJson(video)}</script>${drawn}
  <script id="player">${PLAYER}</script>
</body>
</html>
`;
  // The page may be the first thing a project's make writes into out/.
  await mkdir(path.dirname(opts.out), { recursive: true });
  await writeFile(opts.out, html);
  return Buffer.byteLength(html);
}
