// What a build carries so that it renders offline (bundle.ts). A clip drawn here by the host's
// encoder, composed with a stand-in voice as make composes a video, names no http URL and holds
// every file it links: GSAP, and the captions' font.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { FONTS_CSS, GSAP_SRC } from "./bundle.ts";
import { loadClip, madeFiles } from "./clip.ts";
import { compose } from "./compose.ts";
import { encoder, writeClipData } from "./frames.ts";
import { unmarked } from "./marks.ts";
import { settings, type VideoScript } from "./script.ts";
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

/** A text file of a composed project, by its path inside it. */
async function texts(project: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const file of await readdir(project, { recursive: true })) {
    if (/\.(html|css|json|js)$/.test(file)) files.set(file.split(path.sep).join("/"), await readFile(path.join(project, file), "utf8"));
  }
  return files;
}

test("a video's build names no http URL, and holds every file it links", async () => {
  // A second of a grey square, drawn as a plugin's clip is, its data as the host writes it.
  const files = madeFiles(path.join(scratch, "cache"), "sq", "landscape");
  const out = encoder(files.clip, { width: 64, height: 36, fps: 30, crf: 24 });
  const grey = new Uint8Array(64 * 36 * 4).fill(128);
  for (let i = 0; i < 30; i++) await out.frame(grey);
  await out.end();
  writeClipData(files.data, { by: "a test", from: "videos/sq.yaml", duration: 1, events: [{ name: "start", at: 0, span: "hold" }], texts: [] });
  const clip = await loadClip(files.clip);

  const defaults = Object.fromEntries(Object.entries(settings).map(([key, schema]) => [key, schema.parse(undefined)]));
  const script = { ...defaults, title: "sq", scenes: [{ id: "sq", limits: {}, narration: [{ text: "A square waits, and waits.", cue: "start" }] }] } as VideoScript;
  const clips = new Map([["sq", { clip, duration: clip.data.duration, events: clip.data.events }]]);
  const spoken = await narrate(script, () => tone, path.join(scratch, "tts"), () => {}, unmarked);
  const timeline = buildTimeline(script, clips, spoken, () => {});
  const project = await compose(ROOT, { slug: "sq", file: path.join(scratch, "videos", "sq.yaml"), script }, clips, timeline, "landscape", path.join(scratch, "build"));

  const built = await texts(project);
  assert.ok(built.has("index.html") && built.has(GSAP_SRC) && built.has(FONTS_CSS) && built.has("compositions/sq.html"), [...built.keys()].join(", "));
  for (const [file, text] of built) {
    // GSAP's own code names XML namespaces and its licence by URL; it loads nothing.
    if (file === GSAP_SRC) continue;
    assert.doesNotMatch(text, /https?:\/\//, file);
  }
  const index = built.get("index.html")!;
  assert.ok(index.includes(`<link rel="stylesheet" href="${FONTS_CSS}" />`) && index.includes(`<script src="${GSAP_SRC}"></script>`));
  // The voice ran past the clip: a still of its last frame holds.
  assert.ok(existsSync(path.join(project, "assets", "clips", "sq.mp4")) && existsSync(path.join(project, "assets", "clips", "sq-last.png")));
  // Every face of the captions' font is a woff2 beside the sheet, and there.
  const sheet = built.get(FONTS_CSS)!;
  const urls = [...sheet.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!);
  assert.equal(urls.length, 7, "Inter 700 in 7 subsets");
  for (const url of urls) assert.ok(/^[\w.-]+\.woff2$/.test(url) && existsSync(path.join(project, path.dirname(FONTS_CSS), url)), url);
  assert.deepEqual([...new Set([...sheet.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]))], ["Inter"]);
});
