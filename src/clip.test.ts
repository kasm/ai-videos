// A clip scene's checks, on copies of videos/clip-demo: each way a clip or its JSON can be wrong
// stops the build before any narration, with a reason that names what to fix.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadClips } from "./clip.ts";
import { loadVideo, type FormatName } from "./script.ts";

const DEMO = path.resolve(import.meta.dirname, "..", "videos", "clip-demo");
const FORMATS: FormatName[] = ["landscape", "portrait"];
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-clip-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A copy of the demo, named `name`, changed by `edit` before it is loaded. */
async function demo(name: string, edit?: (dir: string) => Promise<void>) {
  const dir = path.join(scratch, name);
  await cp(DEMO, dir, { recursive: true, filter: (src) => !src.endsWith(".ts") });
  await edit?.(dir);
  return loadClips(await loadVideo(dir), FORMATS);
}

/** Changes one of the demo's JSON files. */
async function editJson(dir: string, size: "16x9" | "9x16", change: (data: any) => void) {
  const file = path.join(dir, "clips", `demo-${size}.json`);
  const data = JSON.parse(await readFile(file, "utf8"));
  change(data);
  await writeFile(file, JSON.stringify(data));
}

test("the demo's clips load, with their events", async () => {
  const clips = await demo("ok");
  const square = clips.get("square")!;
  assert.equal(square.duration, 13);
  assert.deepEqual(square.events.map((e) => `${e.name}:${e.span}`), ["start:hold", "slide:move", "across:hold", "rise:move", "up:hold"]);
  assert.equal(path.basename(square.byFormat.portrait!.file), "demo-9x16.mp4");
  assert.equal(square.byFormat.landscape!.width, 1920);
});

test("a clip without its JSON", async () => {
  await assert.rejects(
    demo("no-json", (dir) => rm(path.join(dir, "clips", "demo-9x16.json"))),
    /clip clips\/demo-9x16\.mp4 has no JSON beside it \(.*demo-9x16\.json\)/,
  );
});

test("a cue that is not an event", async () => {
  await assert.rejects(
    demo("bad-cue", async (dir) => {
      const file = path.join(dir, "video.yaml");
      await writeFile(file, (await readFile(file, "utf8")).replace("cue: rise", "cue: orbit"));
    }),
    /line 3: cue "orbit" is not an event of demo-16x9\.json \(its events: start, slide, across, rise, up\)/,
  );
});

test("JSON the schema refuses: a missing field, an unknown span", async () => {
  await assert.rejects(
    demo("bad-shape", (dir) =>
      editJson(dir, "16x9", (d) => {
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
      editJson(dir, "16x9", (d) => {
        d.events[3].at = 4;
        d.texts[0].to = 99;
      }),
    ),
    (err: Error) => /"rise" is not after "across"/.test(err.message) && /a text ends after the clip/.test(err.message),
  );
});

test("JSON from another run: its length is not the clip's", async () => {
  await assert.rejects(
    demo("stale", (dir) => editJson(dir, "16x9", (d) => (d.duration = 12))),
    /says the clip lasts 12 s, but .*demo-16x9\.mp4 lasts 13 s/,
  );
});

test("the formats' clips disagree on an event", async () => {
  await assert.rejects(
    demo("disagree", (dir) => editJson(dir, "9x16", (d) => (d.events[1].at = 5.5))),
    /demo-16x9\.json and demo-9x16\.json put "slide" at 5 s and 5\.5 s/,
  );
});
