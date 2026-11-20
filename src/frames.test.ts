import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readClipData, type ClipJson } from "./clip.ts";
import type { requestDocument } from "./fit.ts";
import { clipData, encoder, moments, writeClipData, type ClipData, type Request } from "./frames.ts";
import { run } from "./render.ts";

// frames.ts writes its types out, so that a project imports it alone. They are the tool's own:
// what `fit` writes is a request `moments` reads, and the data written is the data `clip` reads.
// Checked by `npm run typecheck`; nothing here runs.
export const asked = (document: ReturnType<typeof requestDocument>): Request => document;
export const written = (data: ClipData): ClipJson => data;
export const read = (data: ClipJson): ClipData => data;

/** Ten frames a second: a hold of 3 frames, a move of 5 whose motion takes 4, a hold of 2. */
const request = (): Request => ({
  fps: 10,
  frames: 10,
  spans: [
    { event: "start", span: "hold", at: 0, duration: 0.3 },
    { event: "slide", span: "move", at: 0.3, duration: 0.5, move: 0.4 },
    { event: "across", span: "hold", at: 0.8, duration: 0.2 },
  ],
});

test("each frame shows its span, how far its move has gone, and the time", () => {
  const frames = moments(request());
  assert.equal(frames.length, 10);
  assert.deepEqual(frames.map((m) => m.span), [0, 0, 0, 1, 1, 1, 1, 1, 2, 2]);
  // A hold is at 0; a move goes evenly over its `move` seconds, then stays at its end.
  assert.deepEqual(frames.map((m) => Number(m.progress.toFixed(3))), [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 0, 0]);
  assert.deepEqual(frames.map((m) => Number(m.time.toFixed(3))), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  assert.deepEqual(frames.map((m) => Number(m.into.toFixed(3))), [0, 0.1, 0.2, 0, 0.1, 0.2, 0.3, 0.4, 0, 0.1]);
  assert.ok(frames.every((m) => Object.keys(m.mouths).length === 0), "no lines: no mouth opens");
});

test("a move the request gives no `move` takes its whole span", () => {
  const whole = request();
  delete whole.spans[1]!.move;
  assert.deepEqual(moments(whole).slice(3, 8).map((m) => Number(m.progress.toFixed(3))), [0, 0.2, 0.4, 0.6, 0.8]);
});

test("a line's track opens its speaker's mouth in the frames it names, and nobody else's", () => {
  const spoken: Request = {
    ...request(),
    lines: [
      { speaker: "pip", mouth: { frame: 1, open: [0.5, 0, 1] } },
      { mouth: { frame: 0, open: [1, 1, 1] } }, // a narrator's: nobody on screen says it
      { speaker: "mo" }, // said, but not measured
      { speaker: "pip", mouth: { frame: 3, open: [0.4, 0.2] } }, // begins in the frame the first ends in
      { speaker: "mo", mouth: { frame: 8, open: [0.7, 0.7, 0.7, 0.7] } }, // sounds on past the clip's end
    ],
  };
  assert.deepEqual(moments(spoken).map((m) => m.mouths), [
    {}, { pip: 0.5 }, {}, { pip: 1 }, { pip: 0.2 }, {}, {}, {}, { mo: 0.7 }, { mo: 0.7 },
  ]);
  // The mouths change nothing else.
  const rest = (frames: ReturnType<typeof moments>) => frames.map(({ mouths, ...at }) => at);
  assert.deepEqual(rest(moments(spoken)), rest(moments(request())));
});

test("a request that is not in whole frames is refused", () => {
  const late = request();
  late.spans[1]!.at = 0.8; // the same frame as the span after it: no frame is left for it
  assert.throws(() => moments(late), /"slide" does not follow the one before it on a whole frame/);
  const first = request();
  first.spans[0]!.at = 0.1;
  assert.throws(() => moments(first), /"start" does not follow/);
  assert.throws(() => moments({ ...request(), frames: 9.5 }), /no whole number of frames/);
  assert.throws(() => moments({ spans: request().spans } as Request), /no whole number of frames/);
});

test("the encoder writes the clip, and a hash of each frame beside it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aiv-frames-"));
  try {
    const [width, height] = [32, 16];
    const frame = (red: number) => Buffer.alloc(width * height * 4, Buffer.from([red, 64, 128, 255]));
    const [dark, light] = [frame(0), frame(255)];
    const clip = path.join(dir, "deep", "clip.mp4"); // the folder is made
    const out = encoder(clip, { width, height, fps: 10, crf: 24 });
    await assert.rejects(out.frame(Buffer.alloc(8)), /a frame of 8 bytes is not 32 by 16/);
    for (const pixels of [dark, dark, light, frame(0)]) await out.frame(pixels);
    assert.equal(await out.end(), 4);
    const md5 = (pixels: Buffer) => createHash("md5").update(pixels).digest("hex");
    // The same pixels have the same hash, given as the same buffer (a hold) or as another.
    assert.equal(await readFile(`${clip}.frames`, "utf8"), `${[dark, dark, light, dark].map(md5).join("\n")}\n`);
    const probe = await run("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames,pix_fmt,r_frame_rate", "-of", "csv=p=0", clip]);
    assert.equal(probe.stdout.trim(), "32,16,yuv420p,10/1,4");
    // Nothing in the file differs by run.
    const again = path.join(dir, "again.mp4");
    const second = encoder(again, { width, height, fps: 10, crf: 24 });
    for (const pixels of [dark, dark, light, dark]) await second.frame(pixels);
    await second.end();
    assert.deepEqual(await readFile(again), await readFile(clip));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the clip's data is written as the tool reads it, keys in the schema's order", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aiv-frames-"));
  try {
    const clip = {
      by: "a maker",
      from: "a source",
      duration: 2,
      // Keys in another order, an extra one, and a `natural` not there yet (step one).
      events: [
        { span: "hold" as const, at: 0, name: "start", natural: undefined },
        { natural: 1.5, name: "slide", span: "move" as const, at: 1, extra: true },
      ],
      texts: [
        { to: 1, from: 0, text: "It waits." },
        { from: 1, to: 2, speaker: "pip", text: "Here I go!" },
      ],
    };
    const own = path.join(dir, "clips", "a-landscape.json");
    writeClipData(own, clip);
    assert.equal(
      await readFile(own, "utf8"),
      `${JSON.stringify(
        {
          format: "ai-videos-clip",
          version: 1,
          made: { by: "a maker", from: "a source" },
          duration: 2,
          events: [
            { name: "start", at: 0, span: "hold" },
            { name: "slide", at: 1, span: "move", natural: 1.5 },
          ],
          texts: [
            { text: "It waits.", from: 0, to: 1 },
            { text: "Here I go!", speaker: "pip", from: 1, to: 2 },
          ],
        },
        null,
        2,
      )}\n`,
    );
    assert.deepEqual(await readClipData(own), clipData(clip));
    // Drawn to a request, it says so, by the request's name.
    assert.equal(clipData({ ...clip, request: path.join(dir, "clips", "a-landscape.request.json") }).made.from, "a source, drawn to a-landscape.request.json");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
