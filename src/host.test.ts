// A plugin run as make runs it: found by its project's package.json, in a host process of its own,
// writing a clip's data and drawing the clip to a request. The plugin here is a small one written
// for the test, its schema by hand, so the interface needs no schema library. ffmpeg draws the clip.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadPlugin, runJob } from "./host.ts";
import { drawerOf, pluginDrawer, pluginOf } from "./make.ts";
import { loadVideo } from "./script.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-host-"));
after(() => rm(scratch, { recursive: true, force: true }));
const quiet = () => {};

/** A square that waits, then slides: its source names its colour and the two beats' lengths. */
const PLUGIN = `
const text = (what) => ({
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (v) => (typeof v === "string" ? { value: v } : { issues: [{ message: what + " is a string", path: ["colour"] }] }),
    jsonSchema: { input: () => ({ type: "string" }), output: () => ({ type: "string" }) },
  },
});
export default {
  scene: "square",
  source: "square.yaml",
  stage: { width: 160, height: 90 },
  commands: { colour: { description: "The square's colour.", example: "#d04040", schema: text("a colour") } },
  check(raw, file) {
    if (typeof raw?.colour !== "string") throw new Error(file + ": give the square a colour");
    return raw;
  },
  plan: (s) => ({
    duration: s.wait + s.slide,
    events: [{ name: "start", at: 0, span: "hold" }, { name: "slide", at: s.wait, span: "move" }],
    texts: [{ text: "It waits.", from: 0, to: s.wait }, { text: "It slides.", speaker: "sq", from: s.wait, to: s.wait + s.slide }],
  }),
  frame: (s, m, { width, height }) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="' + width + '" height="' + height + '">' +
    '<rect width="160" height="90" fill="#ffffff"/>' +
    '<rect x="' + (m.span === 1 ? 20 + 100 * m.progress : 20) + '" y="30" width="30" height="30" fill="' + s.colour + '"/></svg>',
};
`;

/** A project folder `name` with the plugin (changed by `edit`), a video folder sq and its source. */
async function project(name: string, edit = (text: string) => text, pkg: unknown = { "ai-videos": { plugin: "src/plugin.mjs" } }) {
  const root = path.join(scratch, name);
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "videos", "sq"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify(pkg));
  await writeFile(path.join(root, "src", "plugin.mjs"), edit(PLUGIN));
  await writeFile(path.join(root, "videos", "sq", "square.yaml"), "colour: '#d04040'\nwait: 1\nslide: 1\n");
  return root;
}

/** Ten frames a second: the wait in 3 frames, the slide in 7 with its motion in 4. */
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
  lines: [],
};

const filesOf = (root: string) => {
  const clips = path.join(root, "videos", "sq", "clips");
  return { clip: path.join(clips, "sq-landscape.mp4"), data: path.join(clips, "sq-landscape.json"), request: path.join(clips, "sq-landscape.request.json") };
};
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));

test("the plugin's host writes the plan as the clip's data, then draws the clip to the request", async () => {
  const root = await project("drawn");
  const plugin = await pluginOf(path.join(root, "videos", "sq"));
  assert.deepEqual(plugin, { file: path.join(root, "src", "plugin.mjs"), dir: root, package: path.join(root, "package.json") });
  const files = filesOf(root);
  const drawer = pluginDrawer(plugin!, undefined, path.join(root, "videos"));
  const said: string[] = [];
  try {
    assert.equal(await drawer.run({ step: "data", name: "sq", format: "landscape", data: files.data }, (m) => said.push(m)), undefined);
    assert.deepEqual(await json(files.data), {
      format: "ai-videos-clip",
      version: 1,
      made: { by: "the square plugin, src/plugin.mjs", from: "videos/sq/square.yaml" },
      duration: 2,
      events: [
        { name: "start", at: 0, span: "hold" },
        { name: "slide", at: 1, span: "move" },
      ],
      texts: [
        { text: "It waits.", from: 0, to: 1 },
        { text: "It slides.", speaker: "sq", from: 1, to: 2 },
      ],
    });
    assert.match(said[0]!, /^Plugin: square, .*plugin\.mjs \(its commands: colour\)$/);

    await writeFile(files.request, JSON.stringify(REQUEST));
    const draw = { step: "draw", name: "sq", format: "landscape", width: 160, height: 90, ...files } as const;
    assert.equal(await drawer.run(draw, (m) => said.push(m)), undefined);
    assert.match(said.at(-1)!, /sq-landscape\.mp4: 10 frames \(5 drawn\) in [\d.]+ s; and its JSON/);
    // The wait and the slide's first frame are one picture; each frame of the motion differs; its end holds.
    const frames = (await readFile(`${files.clip}.frames`, "utf8")).trim().split("\n");
    assert.equal(new Set(frames.slice(0, 4)).size, 1);
    assert.equal(new Set(frames.slice(3, 8)).size, 5);
    assert.equal(new Set(frames.slice(7)).size, 1);
    // The data again, as the request times it: each event at its span, the texts moved with their beats.
    const data = await json(files.data);
    assert.equal(data.made.from, "videos/sq/square.yaml, drawn to sq-landscape.request.json");
    assert.equal(data.duration, 1);
    assert.deepEqual(data.events, [
      { name: "start", at: 0, span: "hold", natural: 1 },
      { name: "slide", at: 0.3, span: "move", natural: 1 },
    ]);
    assert.deepEqual(data.texts.map((t: { from: number; to: number }) => [t.from, t.to]), [[0, 0.3], [0.3, 1]]);

    // A job that fails says why, and the host takes the next one.
    const missing = await drawer.run({ ...draw, request: path.join(root, "none.json") }, quiet);
    assert.match(missing!, /^: no request at .*none\.json/);
    assert.equal(await drawer.run({ step: "data", name: "sq", format: "landscape", data: files.data }, quiet), undefined);
  } finally {
    drawer.close();
  }
});

test("a plugin that does not load, or is not one, stops the first call with the reason", async () => {
  const root = await project("broken", (text) => text.replace("frame: (s, m", "drawing: (s, m"));
  const drawer = pluginDrawer((await pluginOf(path.join(root, "videos", "sq")))!, undefined, path.join(root, "videos"));
  try {
    const failed = await drawer.run({ step: "data", name: "sq", format: "landscape", data: filesOf(root).data }, quiet);
    assert.match(failed!, /^: .*plugin\.mjs is not a plugin[\s\S]*frame/);
  } finally {
    drawer.close();
  }
});

test("each command's example passes its schema, and the schema writes itself as JSON Schema", async () => {
  const wrong = await project("wrong-example", (text) => text.replace('example: "#d04040"', "example: 3"));
  await assert.rejects(loadPlugin(path.join(wrong, "src", "plugin.mjs")), /the command "colour" fails its own example:\n {2}colour: a colour is a string/);
  const noJson = await project("no-json", (text) => text.replace("input: () => ({", "input: () => { throw new Error('not here'); }, unused: () => ({"));
  await assert.rejects(loadPlugin(path.join(noJson, "src", "plugin.mjs")), /"colour" has a schema that does not write itself as JSON Schema: not here/);
});

test("a format the stage does not fill, a missing source and a request of other beats are refused", async () => {
  const root = await project("refused");
  const file = path.join(root, "src", "plugin.mjs");
  const plugin = await loadPlugin(file);
  const sources = path.join(root, "videos");
  const files = filesOf(root);
  await assert.rejects(runJob(plugin, file, { call: { step: "data", name: "sq", format: "portrait", data: files.data }, sources }), /the square stage is 160 by 90: it does not fill portrait \(1080 by 1920\)/);
  await assert.rejects(runJob(plugin, file, { call: { step: "data", name: "none", format: "landscape", data: files.data }, sources }), /no square\.yaml at .*none/);
  const other = { ...REQUEST, spans: [{ ...REQUEST.spans[0], event: "waits" }, REQUEST.spans[1]] };
  await mkdir(path.dirname(files.request), { recursive: true });
  await writeFile(files.request, JSON.stringify(other));
  const draw = { step: "draw", name: "sq", format: "landscape", width: 160, height: 90, ...files } as const;
  await assert.rejects(runJob(plugin, file, { call: draw, sources }), /the request's spans \(waits \(hold\), slide \(move\)\) are not the source's beats \(start \(hold\), slide \(move\)\): make the video again/);
});

test("the plugin is the nearest package.json's: none there, none named, a missing file, or a maker as well", async () => {
  // The tool's own videos: its package.json names no plugin, so the demo's maker draws.
  assert.equal(await pluginOf(path.resolve(import.meta.dirname, "..", "videos", "clip-demo")), undefined);
  const unnamed = await project("unnamed", undefined, { "ai-videos": {} });
  await assert.rejects(pluginOf(path.join(unnamed, "videos", "sq")), /"ai-videos": \{ "plugin" \} is the plugin's file/);
  const gone = await project("gone", undefined, { "ai-videos": { plugin: "src/none.mjs" } });
  await assert.rejects(pluginOf(path.join(gone, "videos", "sq")), /names the plugin src\/none\.mjs, and there is no/);

  // A made clip in a project with a plugin is the plugin's; with a maker in its project file too, it is refused.
  const both = await project("both");
  const dir = path.join(both, "videos", "sq");
  await writeFile(path.join(dir, "video.yaml"), "title: sq\nscenes:\n  - id: sq\n    scene: clip\n    make: sq\n    narration:\n      - text: It waits.\n");
  assert.equal((await drawerOf(await loadVideo(dir)))?.kind, "plugin");
  await writeFile(path.join(both, "videos", "project.yaml"), "maker: node make.mjs\n");
  await assert.rejects(drawerOf(await loadVideo(dir)), /package\.json names a plugin and .*project\.yaml a maker: one of them draws/);
});
