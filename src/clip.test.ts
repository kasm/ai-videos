// A clip scene's checks, on copies of videos/clip-demo with its clips drawn here by the demo's maker
// (its clips are made, so not in git): each way a clip or its JSON can be wrong stops the build
// before any narration, with a reason that names what to fix.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { loadClips, madeFiles, type ClipJson } from "./clip.ts";
import { makerArgs, type MakerCall } from "./maker.ts";
import { run } from "./render.ts";
import { FORMATS as SIZES, loadVideo, type FormatName } from "./script.ts";

const VIDEOS = path.resolve(import.meta.dirname, "..", "videos");
const FORMATS: FormatName[] = ["landscape", "portrait"];
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-clip-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** Runs the demo's maker (videos/make-clip.ts) with a call, as `make` does. */
async function maker(call: MakerCall) {
  const { code, stderr } = await run(process.execPath, [path.join(VIDEOS, "make-clip.ts"), ...makerArgs(call)], { cwd: VIDEOS });
  assert.equal(code, 0, stderr);
}

/** A request at the clip's own pace: each event where it is, so drawn to it each gains its `natural`. */
function ownPace(data: ClipJson) {
  const spans = data.events.map((e, i) => {
    const length = (data.events[i + 1]?.at ?? data.duration) - e.at;
    return { event: e.name, span: e.span, natural: length, at: e.at, duration: length };
  });
  return { format: "ai-videos-request", version: 1, duration: data.duration, spans };
}

/** The demo's script with its clips drawn: both of the maker's steps, both formats at once. */
const MADE = path.join(scratch, "made");
before(async () => {
  await mkdir(MADE);
  await cp(path.join(VIDEOS, "clip-demo", "video.yaml"), path.join(MADE, "video.yaml"));
  await Promise.all(
    FORMATS.map(async (format) => {
      const files = madeFiles(MADE, "square", format);
      await maker({ step: "data", name: "square", format, data: files.data });
      await writeFile(files.request, JSON.stringify(ownPace(JSON.parse(await readFile(files.data, "utf8")))));
      await maker({ step: "draw", name: "square", format, ...SIZES[format], request: files.request, clip: files.clip, data: files.data });
    }),
  );
});

/** A copy of the drawn demo, named `name`, changed by `edit` before it is loaded. */
async function demo(name: string, edit?: (dir: string) => Promise<void>) {
  const dir = path.join(scratch, name);
  await cp(MADE, dir, { recursive: true });
  await edit?.(dir);
  return loadClips(await loadVideo(dir), FORMATS);
}

/** Changes one of the demo's JSON files. */
async function editJson(dir: string, format: FormatName, change: (data: any) => void) {
  const file = madeFiles(dir, "square", format).data;
  const data = JSON.parse(await readFile(file, "utf8"));
  change(data);
  await writeFile(file, JSON.stringify(data));
}

test("the demo's clips load, with their events", async () => {
  const clips = await demo("ok");
  const square = clips.get("square")!;
  // Drawn to its request: each span keeps its length at the clip's own pace.
  assert.deepEqual(square.events.map((e) => `${e.name}:${e.span}:${e.natural}`), ["start:hold:5", "slide:move:1.5", "across:hold:3.5", "rise:move:1", "up:hold:2"]);
  assert.equal(path.basename(square.byFormat.portrait!.file), "square-portrait.mp4");
  assert.equal(square.byFormat.landscape!.video!.width, 1920);
  assert.equal(square.byFormat.portrait!.video!.width, 1080);
});

test("a clip scene with clip: plays clips drawn elsewhere, by their paths", async () => {
  const clips = await demo("by-path", async (dir) => {
    const file = path.join(dir, "video.yaml");
    const paths = "clip:\n      landscape: clips/square-landscape.mp4\n      portrait: clips/square-portrait.mp4";
    await writeFile(file, (await readFile(file, "utf8")).replace(/make: square.*$/m, paths));
  });
  assert.equal(path.basename(clips.get("square")!.byFormat.landscape!.file), "square-landscape.mp4");
});

test("a made clip without its JSON says make writes it", async () => {
  await assert.rejects(
    demo("no-json", (dir) => rm(madeFiles(dir, "square", "portrait").data)),
    /clip clips\/square-portrait\.mp4 has no JSON beside it \(.*square-portrait\.json\)\. It is made: "npm run video -- make <video>" writes it/,
  );
});

test("a cue that is not an event", async () => {
  await assert.rejects(
    demo("bad-cue", async (dir) => {
      const file = path.join(dir, "video.yaml");
      await writeFile(file, (await readFile(file, "utf8")).replace("cue: rise", "cue: orbit"));
    }),
    /line 3: cue "orbit" is not an event of square-landscape\.json \(its events: start, slide, across, rise, up\)/,
  );
});

test("a cue before one an earlier line named: a clip plays forward", async () => {
  await assert.rejects(
    demo("backward", async (dir) => {
      const file = path.join(dir, "video.yaml");
      await writeFile(file, (await readFile(file, "utf8")).replace("cue: rise", "cue: start"));
    }),
    /line 3: cue "start" comes before "slide", cued earlier; a clip plays forward/,
  );
});

/** The demo's video.yaml with `limits` for its scene (after its clips, before its narration). */
const withLimits = (limits: string) => async (dir: string) => {
  const file = path.join(dir, "video.yaml");
  await writeFile(file, (await readFile(file, "utf8")).replace("    narration:", `    limits:\n${limits}\n    narration:`));
};

test("limits for single events load when each names an event of its kind", async () => {
  await demo("limits", withLimits("      slide: { fastest: 3 }\n      across: { least: 2 }"));
  const scene = (await loadVideo(path.join(scratch, "limits"))).script.scenes[0]!;
  assert.deepEqual(scene.scene === "clip" && scene.limits, { slide: { fastest: 3 }, across: { least: 2 } });
});

test("a limit that names no event", async () => {
  await assert.rejects(
    demo("limit-no-event", withLimits("      orbit: { fastest: 3 }")),
    /limits: "orbit" is not an event of square-landscape\.json \(its events: start, slide, across, rise, up\)/,
  );
});

test("a limit of another kind: a hold's least on a move", async () => {
  await assert.rejects(demo("limit-kind", withLimits("      slide: { least: 2 }")), /limits: "slide" is a move: it takes slowest and fastest, not least/);
});

test("the JSON alone, before its clip is drawn, is enough for a request", async () => {
  const dir = path.join(scratch, "json-only");
  await cp(MADE, dir, { recursive: true, filter: (src) => !src.endsWith(".mp4") });
  const video = await loadVideo(dir);
  await assert.rejects(loadClips(video, FORMATS), /clip clips\/square-landscape\.mp4 is not at .*\. It is made/);
  const clips = await loadClips(video, FORMATS, { readVideo: false });
  assert.equal(clips.get("square")!.events.length, 5);
  assert.equal(clips.get("square")!.byFormat.landscape!.video, undefined);
});

test("JSON the schema refuses: a missing field, an unknown span", async () => {
  await assert.rejects(
    demo("bad-shape", (dir) =>
      editJson(dir, "landscape", (d) => {
        delete d.made;
        d.events[1].span = "pause";
      }),
    ),
    (err: Error) => /not valid clip data/.test(err.message) && /at made/.test(err.message) && /at events\[1\]\.span/.test(err.message),
  );
});

test("JSON the schema refuses: events out of order, a text past the end", async () => {
  await assert.rejects(
    demo("bad-times", (dir) =>
      editJson(dir, "landscape", (d) => {
        d.events[3].at = 4;
        d.texts[0].to = 99;
      }),
    ),
    (err: Error) => /"rise" is not after "across"/.test(err.message) && /a text ends after the clip/.test(err.message),
  );
});

test("JSON from another run: its length is not the clip's", async () => {
  await assert.rejects(
    demo("stale", (dir) => editJson(dir, "landscape", (d) => (d.duration = 12))),
    /says the clip lasts 12 s, but .*square-landscape\.mp4 lasts [\d.]+ s/,
  );
});

test("the formats' clips disagree on an event", async () => {
  await assert.rejects(
    demo("disagree", (dir) => editJson(dir, "portrait", (d) => (d.events[1].at = 5.5))),
    /square-landscape\.json and square-portrait\.json put "slide" at [\d.]+ s and 5\.5 s/,
  );
});
