// A plugin run as make runs it: found by its project's package.json, in a host process of its own,
// writing a video file's plan and drawing its clip to a request. The plugin here is a small one
// written for the test, its schema by hand, so the interface needs no schema library. ffmpeg draws
// the clip.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadPlugin, runJob } from "./host.ts";
import { drawerOf, pluginOf, startPlugin } from "./make.ts";
import { loadVideo } from "./script.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-host-"));
// A host that failed may still be ending in its folder: Windows keeps the folder until it has.
after(() => rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
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
  stage: { width: 160, height: 90 },
  commands: { colour: { description: "The square's colour.", example: "#d04040", schema: text("a colour") } },
  guide: "A square waits, then slides: write its colour, and how long it waits and slides.",
  check(raw, file, library) {
    if (typeof raw?.colour !== "string") throw new Error(file + ": give the square a colour");
    if (raw.colour.startsWith("#")) return raw;
    // A colour by name is the library's.
    const named = library?.raw?.colours?.[raw.colour];
    if (!named) throw new Error((library?.file ?? file) + ": no colour is named " + raw.colour);
    return { ...raw, colour: named };
  },
  // Six hex digits with no # can only be a colour.
  repair(raw) {
    if (!/^[0-9a-f]{6}$/.test(raw?.colour)) return { source: raw, did: [] };
    return { source: { ...raw, colour: "#" + raw.colour }, did: ["the colour " + raw.colour + " is #" + raw.colour] };
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

/** The video file's source: the file without its `use:`, as the tool sends it. */
const SOURCE = { colour: "#d04040", wait: 1, slide: 1 };

/** A project folder `name` with the plugin (changed by `edit`), and a video file videos/sq.yaml. */
async function project(name: string, edit = (text: string) => text, pkg: unknown = { "ai-videos": { plugin: "src/plugin.mjs" } }) {
  const root = path.join(scratch, name);
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "videos"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify(pkg));
  await writeFile(path.join(root, "src", "plugin.mjs"), edit(PLUGIN));
  await writeFile(path.join(root, "videos", "sq.yaml"), "use: square\ncolour: '#d04040'\nwait: 1\nslide: 1\n");
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
  const clips = path.join(root, ".cache", "sq", "clips");
  return { clip: path.join(clips, "sq-landscape.mp4"), data: path.join(clips, "sq-landscape.json"), request: path.join(clips, "sq-landscape.request.json") };
};
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));

test("the plugin's host writes the plan as the clip's data, then draws the clip to the request", async () => {
  const root = await project("drawn");
  const video = path.join(root, "videos", "sq.yaml");
  const plugin = await pluginOf(video);
  assert.deepEqual(plugin, { file: path.join(root, "src", "plugin.mjs"), dir: root, package: path.join(root, "package.json"), settings: { plugin: "src/plugin.mjs" } });
  const files = filesOf(root);
  const said: string[] = [];
  const host = await startPlugin(plugin!, (m) => said.push(m));
  try {
    assert.match(said[0]!, /^Plugin: square, .*plugin\.mjs \(its commands: colour\)$/);
    assert.equal(host.scene, "square");
    assert.deepEqual(host.stage, { width: 160, height: 90 });
    // Its part of the prompt comes with it: the guide, and each command's description and example.
    assert.match(host.guide, /^A square waits, then slides/);
    assert.deepEqual(host.commands, { colour: { description: "The square's colour.", example: "#d04040" } });
    const data = { step: "data", name: "sq", format: "landscape", data: files.data } as const;
    await host.run({ call: data, file: video, source: SOURCE }, (m) => said.push(m));
    assert.deepEqual(await json(files.data), {
      format: "ai-videos-clip",
      version: 1,
      made: { by: "the square plugin, src/plugin.mjs", from: "videos/sq.yaml" },
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

    await writeFile(files.request, JSON.stringify(REQUEST));
    const draw = { step: "draw", name: "sq", format: "landscape", width: 160, height: 90, ...files } as const;
    await host.run({ call: draw, file: video, source: SOURCE }, (m) => said.push(m));
    assert.match(said.at(-1)!, /sq-landscape\.mp4: 10 frames \(5 drawn\) in [\d.]+ s; and its JSON/);
    // The wait and the slide's first frame are one picture; each frame of the motion differs; its end holds.
    const frames = (await readFile(`${files.clip}.frames`, "utf8")).trim().split("\n");
    assert.equal(new Set(frames.slice(0, 4)).size, 1);
    assert.equal(new Set(frames.slice(3, 8)).size, 5);
    assert.equal(new Set(frames.slice(7)).size, 1);
    // Beside them, each frame's SVG, hashed: one line a frame, the same where the picture is.
    const svgs = (await readFile(`${files.clip}.svgs`, "utf8")).trim().split("\n");
    assert.deepEqual(svgs.map((s) => svgs.indexOf(s)), frames.map((f) => frames.indexOf(f)));
    // The data again, as the request times it: each event at its span, the texts moved with their beats.
    const drawn = await json(files.data);
    assert.equal(drawn.made.from, "videos/sq.yaml, drawn to sq-landscape.request.json");
    assert.equal(drawn.duration, 1);
    assert.deepEqual(drawn.events, [
      { name: "start", at: 0, span: "hold", natural: 1 },
      { name: "slide", at: 0.3, span: "move", natural: 1 },
    ]);
    assert.deepEqual(drawn.texts.map((t: { from: number; to: number }) => [t.from, t.to]), [[0, 0.3], [0.3, 1]]);

    // A job that fails says why, and the host takes the next one.
    const missing = { ...draw, request: path.join(root, "none.json") };
    await assert.rejects(host.run({ call: missing, file: video, source: SOURCE }, quiet), /^Error: no request at .*none\.json/);
    await host.run({ call: data, file: video, source: SOURCE }, quiet);

    // The library comes with the job: the check finds the source's names in it, and a mistake there names its file.
    const library = { file: path.join(root, "library.yaml"), raw: { colours: { red: "#d04040" } } };
    await host.run({ call: data, file: video, source: { ...SOURCE, colour: "red" }, library }, quiet);
    await assert.rejects(host.run({ call: data, file: video, source: { ...SOURCE, colour: "blue" }, library }, quiet), /library\.yaml: no colour is named blue/);

    // The plugin mends the source before its check, and the plan's call says what it mended.
    assert.deepEqual(await host.run({ call: data, file: video, source: SOURCE }, quiet), { repaired: [] });
    assert.deepEqual(await host.run({ call: data, file: video, source: { ...SOURCE, colour: "d04040" } }, quiet), { repaired: ["the colour d04040 is #d04040"] });
    await host.run({ call: draw, file: video, source: { ...SOURCE, colour: "d04040" } }, quiet);
    assert.deepEqual(await readFile(`${files.clip}.frames`, "utf8"), frames.join("\n") + "\n", "drawn as the colour written whole");

    // Import's check mends, checks and plans a source, and writes nothing.
    const before = await readFile(files.data, "utf8");
    const checked = await host.check(path.join(root, "videos", "new.yaml"), { ...SOURCE, colour: "d04040" }, undefined);
    assert.deepEqual(checked.repaired, ["the colour d04040 is #d04040"]);
    assert.deepEqual(checked.plan.events.map((e) => e.name), ["start", "slide"]);
    assert.equal(await readFile(files.data, "utf8"), before);
    await assert.rejects(host.check(video, { ...SOURCE, colour: "blue" }, library), /library\.yaml: no colour is named blue/);
  } finally {
    host.close();
  }
});

test("a plugin that does not load, or is not one, does not start, and says why", async () => {
  const root = await project("broken", (text) => text.replace("frame: (s, m", "drawing: (s, m"));
  const plugin = (await pluginOf(path.join(root, "videos", "sq.yaml")))!;
  await assert.rejects(startPlugin(plugin, quiet), /^Error: the plugin did not start: .*plugin\.mjs is not a plugin[\s\S]*frame/);
});

test("each command's example passes its schema, and the schema writes itself as JSON Schema", async () => {
  const wrong = await project("wrong-example", (text) => text.replace('example: "#d04040"', "example: 3"));
  await assert.rejects(loadPlugin(path.join(wrong, "src", "plugin.mjs")), /the command "colour" fails its own example:\n {2}colour: a colour is a string/);
  const noJson = await project("no-json", (text) => text.replace("input: () => ({", "input: () => { throw new Error('not here'); }, unused: () => ({"));
  await assert.rejects(loadPlugin(path.join(noJson, "src", "plugin.mjs")), /"colour" has a schema that does not write itself as JSON Schema: not here/);
});

test("a format the stage does not fill, a source its check refuses and a request of other beats are refused", async () => {
  const root = await project("refused");
  const file = path.join(root, "src", "plugin.mjs");
  const plugin = await loadPlugin(file);
  const video = path.join(root, "videos", "sq.yaml");
  const files = filesOf(root);
  const data = { step: "data", name: "sq", format: "landscape", data: files.data } as const;
  await assert.rejects(runJob(plugin, file, { call: { ...data, format: "portrait" }, file: video, source: SOURCE }), /the square stage is 160 by 90: it does not fill portrait \(1080 by 1920\)/);
  await assert.rejects(runJob(plugin, file, { call: data, file: video, source: { wait: 1, slide: 1 } }), /sq\.yaml: give the square a colour/);
  const other = { ...REQUEST, spans: [{ ...REQUEST.spans[0], event: "waits" }, REQUEST.spans[1]] };
  await mkdir(path.dirname(files.request), { recursive: true });
  await writeFile(files.request, JSON.stringify(other));
  const draw = { step: "draw", name: "sq", format: "landscape", width: 160, height: 90, ...files } as const;
  await assert.rejects(runJob(plugin, file, { call: draw, file: video, source: SOURCE }), /the request's spans \(waits \(hold\), slide \(move\)\) are not the source's beats \(start \(hold\), slide \(move\)\): make the video again/);
});

test("the plugin is the nearest package.json's: none there, none named, or a missing file", async () => {
  // The tool's own videos: its package.json names no plugin, so the demo's maker draws.
  assert.equal(await pluginOf(path.resolve(import.meta.dirname, "..", "videos", "clip-demo")), undefined);
  const unnamed = await project("unnamed", undefined, { "ai-videos": {} });
  await assert.rejects(pluginOf(path.join(unnamed, "videos", "sq.yaml")), /"ai-videos": \{ "plugin" \} is the plugin's file/);
  const gone = await project("gone", undefined, { "ai-videos": { plugin: "src/none.mjs" } });
  await assert.rejects(pluginOf(path.join(gone, "videos", "sq.yaml")), /names the plugin src\/none\.mjs, and there is no/);
});

test("a video folder with a made clip, in a project with a plugin, is refused: its videos are files", async () => {
  const root = await project("folder");
  const dir = path.join(root, "videos", "sq");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "video.yaml"), "title: sq\nscenes:\n  - id: sq\n    scene: clip\n    make: sq\n    narration:\n      - text: It waits.\n");
  await assert.rejects(drawerOf(await loadVideo(dir)), /package\.json names a plugin: its videos are files, each made with make <its folder>\/<name>\.yaml/);
});
