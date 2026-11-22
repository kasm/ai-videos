// A drawn clip and the JSON beside it, as the check stage reads them back (clip.ts, loadClip): each
// way they can be wrong stops the make with a reason that names what is wrong. The clip is drawn
// here, a few frames by the host's encoder, its JSON written as the host writes it.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { loadClip, madeFiles } from "./clip.ts";
import { encoder, writeClipData } from "./frames.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-clip-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A square's clip: it waits, slides, waits again; 2 s at 30 fps, drawn to a request, so each event keeps its `natural`. */
const DATA = {
  by: "a test",
  from: "videos/sq.yaml",
  duration: 2,
  events: [
    { name: "start", at: 0, span: "hold" as const, natural: 0.5 },
    { name: "slide", at: 0.5, span: "move" as const, natural: 1 },
    { name: "end", at: 1.5, span: "hold" as const, natural: 0.5 },
  ],
  texts: [{ text: "A square waits.", from: 0, to: 0.5 }],
};

const MADE = path.join(scratch, "made");
before(async () => {
  const files = madeFiles(MADE, "sq", "landscape");
  const out = encoder(files.clip, { width: 32, height: 18, fps: 30, crf: 24 });
  const grey = new Uint8Array(32 * 18 * 4).fill(128);
  for (let i = 0; i < 60; i++) await out.frame(grey);
  await out.end();
  writeClipData(files.data, DATA);
});

/** A copy of the drawn clip, named `name`, its JSON changed by `change` before it is read. */
async function clip(name: string, change?: (data: any) => void) {
  const dir = path.join(scratch, name);
  await cp(MADE, dir, { recursive: true });
  const files = madeFiles(dir, "sq", "landscape");
  if (change) {
    const data = JSON.parse(await readFile(files.data, "utf8"));
    change(data);
    await writeFile(files.data, JSON.stringify(data));
  }
  return loadClip(files.clip);
}

test("a drawn clip loads, with its events and its picture's size", async () => {
  const loaded = await clip("ok");
  assert.equal(path.basename(loaded.file), "sq-landscape.mp4");
  assert.deepEqual(loaded.data.events.map((e) => `${e.name}:${e.span}:${e.natural}`), ["start:hold:0.5", "slide:move:1", "end:hold:0.5"]);
  assert.deepEqual([loaded.video.width, loaded.video.height, loaded.video.fps], [32, 18, 30]);
});

test("a clip or its JSON missing is named", async () => {
  await assert.rejects(loadClip(path.join(scratch, "none", "clips", "sq-landscape.mp4")), /^Error: No clip at .*sq-landscape\.mp4/);
  const dir = path.join(scratch, "no-json");
  await cp(MADE, dir, { recursive: true });
  await rm(madeFiles(dir, "sq", "landscape").data);
  await assert.rejects(loadClip(madeFiles(dir, "sq", "landscape").clip), /^Error: No clip data at .*sq-landscape\.json/);
});

test("JSON the schema refuses: a missing field, an unknown span", async () => {
  await assert.rejects(
    clip("bad-shape", (d) => {
      delete d.made;
      d.events[1].span = "pause";
    }),
    (err: Error) => /not valid clip data/.test(err.message) && /at made/.test(err.message) && /at events\[1\]\.span/.test(err.message),
  );
});

test("JSON the schema refuses: events out of order, a text past the end", async () => {
  await assert.rejects(
    clip("bad-times", (d) => {
      d.events[2].at = 0.4;
      d.texts[0].to = 99;
    }),
    (err: Error) => /"end" is not after "slide"/.test(err.message) && /a text ends after the clip/.test(err.message),
  );
});

test("a text may name its speaker, and a speaker that is not a name is refused", async () => {
  assert.equal((await clip("speaker", (d) => (d.texts[0].speaker = "pip"))).data.texts[0]!.speaker, "pip");
  await assert.rejects(
    clip("bad-speaker", (d) => (d.texts[0].speaker = "Pip the First")),
    (err: Error) => /not valid clip data/.test(err.message) && /at texts\[0\]\.speaker/.test(err.message),
  );
});

test("JSON from another run: its length is not the clip's", async () => {
  await assert.rejects(clip("stale", (d) => (d.duration = 12)), /says the clip lasts 12 s, but .*sq-landscape\.mp4 lasts [\d.]+ s/);
});
