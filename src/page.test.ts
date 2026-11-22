// A video file's web page (page.ts): its drawing, run as the page runs it, gives the SVG each of
// the video's frames was drawn from; it shows the video's captions, plays the sound it is given,
// and names no URL. The plugin here is a small one written for the test; the host draws its clip
// with ffmpeg, as make does.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import vm from "node:vm";
import { sceneCaptions } from "./compose.ts";
import { loadPlugin, runJob, svgHash } from "./host.ts";
import { pageVideo, writePage } from "./page.ts";
import type { Timeline } from "./timeline.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-page-"));
after(() => rm(scratch, { recursive: true, force: true }));

/**
 * A square that waits, then slides, and grows as it speaks: its colour is named in the library, and
 * the plugin mends the space around a name.
 */
const PLUGIN = `
const any = { "~standard": { version: 1, vendor: "test", validate: (v) => ({ value: v }), jsonSchema: { input: () => ({}), output: () => ({}) } } };
export default {
  scene: "square",
  stage: { width: 160, height: 90 },
  commands: { colour: { description: "The square's colour.", example: "red", schema: any } },
  guide: "A square waits, then slides.",
  check(raw, file, library) {
    const colour = library?.raw?.colours?.[raw.colour];
    if (!colour) throw new Error(file + ": no colour is named " + raw.colour);
    return { colour };
  },
  repair: (raw) => ({ source: { ...raw, colour: raw.colour.trim() }, did: [] }),
  plan: () => ({
    duration: 2,
    events: [{ name: "start", at: 0, span: "hold" }, { name: "slide", at: 1, span: "move" }],
    texts: [{ text: "It slides.", speaker: "sq", from: 1, to: 2 }],
  }),
  frame: (s, m, { width, height }) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="' + width + '" height="' + height + '">' +
    '<rect width="160" height="90" fill="#ffffff"/>' +
    '<rect x="' + (m.span === 1 ? 20 + 100 * m.progress : 20) + '" y="30" width="30" height="' + (30 + 10 * (m.mouths.sq ?? 0)) + '" fill="' + s.colour + '"/></svg>',
};
`;

/** Ten frames a second: the wait in 3 frames, the slide in 7 with its motion in 4, and the square's line from frame 3. */
const REQUEST = {
  format: "ai-videos-request",
  version: 1,
  fps: 10,
  duration: 1,
  frames: 10,
  spans: [
    { event: "start", span: "hold", natural: 1, at: 0, duration: 0.3 },
    { event: "slide", span: "move", natural: 1, at: 0.3, duration: 0.7, move: 0.4 },
  ],
  lines: [{ text: "It slides.", speaker: "sq", cue: "slide", at: 0.3, waits: 0, duration: 0.4, mouth: { frame: 3, open: [0.5, 1, 0.25, 0] } }],
};

/** The video's timeline: its one line where the request has it. */
const TIMELINE: Timeline = {
  fps: 10,
  duration: 1,
  scenes: [{ id: "sq", start: 0, duration: 1, lines: [{ n: 1, text: "It slides.", cue: "slide", pause: 0, audioFile: "x.wav", duration: 0.4, start: 0.3, localStart: 0.3 }] }],
};

/** A script of the page, by its id: its text as written. */
const scriptOf = (html: string, id: string) => {
  const found = html.match(new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  assert.ok(found, `the page has a script ${id}`);
  return found[1]!;
};

test("the page draws the SVG of each of the video's frames, shows its captions, and names no URL", async () => {
  const root = path.join(scratch, "sq");
  await mkdir(path.join(root, "src"), { recursive: true });
  const pluginFile = path.join(root, "src", "plugin.mjs");
  await writeFile(pluginFile, PLUGIN);
  const file = path.join(root, "videos", "sq.yaml");
  const source = { colour: " red " };
  const library = { file: path.join(root, "library.yaml"), raw: { colours: { red: "#d04040" } } };

  // The video, drawn by the host to the request: beside the clip, a hash of each frame's SVG.
  const clips = path.join(root, ".cache", "sq", "clips");
  const files = { clip: path.join(clips, "sq-landscape.mp4"), data: path.join(clips, "sq-landscape.json"), request: path.join(clips, "sq-landscape.request.json") };
  await mkdir(clips, { recursive: true });
  await writeFile(files.request, JSON.stringify(REQUEST));
  const draw = { step: "draw", name: "sq", format: "landscape", width: 160, height: 90, ...files } as const;
  await runJob(await loadPlugin(pluginFile), pluginFile, { call: draw, file, source, library });
  const svgs = (await readFile(`${files.clip}.svgs`, "utf8")).trim().split("\n");
  assert.equal(svgs.length, 10);
  // The wait is one picture; each frame of the motion differs, the square speaking as it begins; its end holds.
  assert.equal(new Set(svgs.slice(0, 3)).size, 1);
  assert.equal(new Set(svgs.slice(2, 8)).size, 6);
  assert.equal(new Set(svgs.slice(7)).size, 1);

  // The page, from the same source, library and request.
  const sound = path.join(root, "sound.m4a");
  await writeFile(sound, Buffer.from("not really a sound"));
  const video = pageVideo({ dir: root, file, source, library, request: REQUEST, size: { width: 160, height: 90 }, format: "landscape", timeline: TIMELINE });
  const out = path.join(root, "sq.html");
  const bytes = await writePage(ROOT, { title: "sq", source: "videos/sq.yaml", picture: { plugin: pluginFile }, video, sound, out });
  const html = await readFile(out, "utf8");
  assert.equal(bytes, Buffer.byteLength(html));

  // Its drawing, run with nothing but JavaScript (no Node, no page), gives each frame's SVG as the video's.
  const given = JSON.parse(scriptOf(html, "video"));
  assert.deepEqual(given, JSON.parse(JSON.stringify(video)));
  assert.deepEqual(given.library, { file: "library.yaml", raw: library.raw }, "paths from the project, not the disk");
  const context = vm.createContext({});
  vm.runInContext(scriptOf(html, "drawing"), context);
  const drawing = context.drawing(given) as { svgAt(frame: number): string };
  assert.deepEqual(Array.from({ length: given.frames }, (_, k) => svgHash(drawing.svgAt(k))), svgs);

  // The captions are the clip scene's, each in its own box, in the clip scene's style.
  assert.deepEqual(given.captions, sceneCaptions(TIMELINE.scenes[0]!));
  assert.match(html, /<div id="sq-cap-1" class="cl-cap" style="display: none"><p>It slides\.<\/p><\/div>/);
  assert.match(html, /\.cl-cap p \{/);
  assert.match(html, /<div id="root" data-format="landscape">/);
  assert.equal(given.fade, 0.12);

  // Everything is in the file: the sound as given, the caption font, and nothing fetched.
  assert.ok(html.includes(`<audio id="sound" preload="auto" src="data:audio/mp4;base64,${Buffer.from("not really a sound").toString("base64")}">`));
  assert.match(html, /@font-face \{[^}]*font-weight: 700;[^}]*url\(data:font\/woff2;base64,/);
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  for (const [, url] of markup.matchAll(/\b(?:src|href)="([^"]*)"/g)) assert.match(url!, /^data:/);
  for (const [, url] of markup.matchAll(/url\(([^)]*)\)/g)) assert.match(url!, /^data:/);
  assert.doesNotMatch(html, /<link\b/);
});

test("a plugin that does not bundle for a page says so", async () => {
  const root = path.join(scratch, "unbundled");
  await mkdir(root, { recursive: true });
  const pluginFile = path.join(root, "plugin.mjs");
  await writeFile(pluginFile, `import "./missing.mjs";\nexport default {};\n`);
  const video = pageVideo({ dir: root, file: path.join(root, "x.yaml"), source: {}, library: undefined, request: REQUEST, size: { width: 160, height: 90 }, format: "landscape", timeline: TIMELINE });
  const sound = path.join(root, "sound.m4a");
  await writeFile(sound, "");
  await assert.rejects(writePage(ROOT, { title: "x", source: "x.yaml", picture: { plugin: pluginFile }, video, sound, out: path.join(root, "x.html") }), /plugin\.mjs does not bundle for a web page: [\s\S]*missing\.mjs/);
});

test("a recorded picture's page plays the clip, inside the file, with no drawing", async () => {
  const root = path.join(scratch, "recorded");
  await mkdir(root, { recursive: true });
  // The page takes the clip as it is: its bytes, not what they show.
  const clip = path.join(root, "sq-landscape.mp4");
  await writeFile(clip, Buffer.from("not really a clip"));
  const sound = path.join(root, "sound.m4a");
  await writeFile(sound, Buffer.from("not really a sound"));
  const video = pageVideo({ dir: root, file: path.join(root, "videos", "sq.yaml"), source: {}, library: undefined, request: REQUEST, size: { width: 160, height: 90 }, format: "landscape", timeline: TIMELINE });
  const out = path.join(root, "sq.html");
  await writePage(ROOT, { title: "sq", source: "videos/sq.yaml", picture: { clip }, video, sound, out });
  const html = await readFile(out, "utf8");
  assert.ok(html.includes(`<video id="clip" muted playsinline preload="auto" width="160" height="90" src="data:video/mp4;base64,${Buffer.from("not really a clip").toString("base64")}"></video>`));
  assert.doesNotMatch(html, /<script id="drawing"/);
  // The player plays it with the sound, and sets it on the frame shown when the sound is paused.
  const player = scriptOf(html, "player");
  assert.match(player, /var picture = clip \? null : drawing\(video\);/);
  assert.match(player, /clip\.play\(\)/);
  assert.match(player, /else if \(sound\.paused\) clip\.currentTime = /);
  assert.match(html, /<div id="sq-cap-1" class="cl-cap" style="display: none"><p>It slides\.<\/p><\/div>/);
});
