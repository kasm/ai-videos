// What a build carries so that it renders offline (bundle.ts). Composed with a stand-in voice, the
// demos' builds (a page scene, a clip scene) name no http URL and hold every file they link; a page
// that would make the render go online is refused, naming what it asks for.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { checkPages, FONTS_CSS, GSAP_SRC, pageFetches } from "./bundle.ts";
import { loadClips } from "./clip.ts";
import { compose } from "./compose.ts";
import { drawnDemo, VIDEOS } from "./demo.ts";
import { loadVideo, type FormatName } from "./script.ts";
import { buildTimeline, narrate } from "./timeline.ts";
import type { TtsProvider } from "./tts.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-bundle-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A voice that needs no model: a steady tone, as long as the line is. */
const tone: TtsProvider = {
  id: "test-tone",
  async synth({ text }) {
    const sampleRate = 24000;
    return { sampleRate, samples: new Float32Array(Math.round(sampleRate * 0.05 * text.length)).fill(0.1) };
  },
  async voices() {
    return ["af_heart"];
  },
};

/** The video in `dir`, composed in each of its formats into scratch: the projects' folders. */
async function composed(dir: string, name: string): Promise<string[]> {
  const video = await loadVideo(dir);
  await checkPages(video);
  const formats = video.script.formats as FormatName[];
  const clips = await loadClips(video, formats);
  const spoken = await narrate(video.script, tone, path.join(scratch, "tts"), () => {});
  const timeline = buildTimeline(video.script, clips, spoken, () => {});
  const projects: string[] = [];
  for (const format of formats) projects.push(await compose(ROOT, video, clips, timeline, format, path.join(scratch, `build-${name}`)));
  return projects;
}

/** A composed project's files that are text, by path inside it. */
async function texts(project: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const file of await readdir(project, { recursive: true })) {
    if (/\.(html|css|json|js)$/.test(file)) files.set(file.split(path.sep).join("/"), await readFile(path.join(project, file), "utf8"));
  }
  return files;
}

test("the demos' builds name no http URL, and hold every file they link", async () => {
  const made = path.join(scratch, "clip-demo");
  await drawnDemo(made, ["landscape", "portrait"]);
  const projects = [...(await composed(path.join(VIDEOS, "scroll-demo"), "scroll-demo")), ...(await composed(made, "clip-demo"))];
  assert.equal(projects.length, 4);
  for (const project of projects) {
    const files = await texts(project);
    assert.ok(files.has("index.html") && files.has(GSAP_SRC) && files.has(FONTS_CSS), [...files.keys()].join(", "));
    for (const [file, text] of files) {
      // GSAP's own code names XML namespaces and its licence by URL; it loads nothing.
      if (file === GSAP_SRC) continue;
      assert.doesNotMatch(text, /https?:\/\//, `${path.basename(path.dirname(project))}/${path.basename(project)}/${file}`);
    }
    const index = files.get("index.html")!;
    assert.ok(index.includes(`<link rel="stylesheet" href="${FONTS_CSS}" />`) && index.includes(`<script src="${GSAP_SRC}"></script>`));
    // Every face of the tool's fonts is a woff2 beside the sheet, and there.
    const sheet = files.get(FONTS_CSS)!;
    const urls = [...sheet.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!);
    assert.equal(urls.length, 3 * 7 + 2 * 6, "Inter: 3 weights in 7 subsets; JetBrains Mono: 2 in 6");
    for (const url of urls) assert.ok(/^[\w.-]+\.woff2$/.test(url) && existsSync(path.join(project, path.dirname(FONTS_CSS), url)), url);
    assert.deepEqual([...new Set([...sheet.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]))], ["Inter", "JetBrains Mono"]);
  }
});

const page = (html: string, css = "") => [
  { name: "page.html", text: html, html: true },
  { name: "page.css", text: css, html: false },
];

test("a page in the tool's fonts, its own pictures and links, asks for nothing", () => {
  const css = `.page h1 { font: 900 2em/1.1 Inter, sans-serif; } .page code { font-family: "JetBrains Mono", monospace; } .page { background: url(assets/paper.png); }`;
  const html = `<div class="page"><img src="assets/a.png" srcset="assets/a.png 1x, assets/a@2x.png 2x" width="10" height="10"><a href="https://raycraft.app">a link</a></div>`;
  assert.deepEqual(pageFetches(page(html, css)), []);
});

test("a font the tool doesn't have, unless the page declares it", () => {
  const css = `.page h1 { font-family: 'Fira Sans', sans-serif; } .page p { font: italic 1em Lora, serif; }`;
  assert.deepEqual(pageFetches(page(`<div class="page" style="font-family: &quot;Comic Neue&quot;">x</div>`, css)), [
    `page.html uses the font "Comic Neue", which is not one of the tool's (Inter, JetBrains Mono) and has no @font-face in the page: add one, its src a file in the video's assets/`,
    `page.css uses the font "Fira Sans", which is not one of the tool's (Inter, JetBrains Mono) and has no @font-face in the page: add one, its src a file in the video's assets/`,
    `page.css uses the font "Lora", which is not one of the tool's (Inter, JetBrains Mono) and has no @font-face in the page: add one, its src a file in the video's assets/`,
  ]);
  const declared = `@font-face { font-family: 'Fira Sans'; src: url(assets/fira.woff2) format('woff2'); }\n@font-face { font-family: Lora; src: url(assets/lora.woff2); }\n${css}`;
  assert.deepEqual(pageFetches(page(`<div class="page">x</div>`, declared)), []);
});

test("anything loaded from the network: a picture, a stylesheet, a font's file, an import", () => {
  const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><img src="https://example.com/a.png"><video poster='//cdn.example.com/p.jpg'></video>`;
  const css = `@import "https://example.com/more.css";\n@font-face { font-family: Lora; src: url("https://example.com/lora.woff2"); }`;
  assert.deepEqual(
    pageFetches(page(html, css)).map((l) => l.replace(/ from the network: .*/, "")),
    ["page.html loads https://fonts.googleapis.com/css2?family=Inter", "page.html loads https://example.com/a.png", "page.html loads //cdn.example.com/p.jpg", "page.css loads https://example.com/lora.woff2", "page.css loads https://example.com/more.css"],
  );
});
