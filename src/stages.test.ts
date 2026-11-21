// The cache of a video file's stages: keys of what each is made from, a stage taken from the cache
// only while its key holds and its files are there, and the plugin's code in the keys.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { codeKey, folderKey, keyOf, stagesIn } from "./stages.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-stages-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A folder `name` with these files, by their paths in it. */
async function folder(name: string, files: Record<string, string>) {
  const dir = path.join(scratch, name);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  return dir;
}

test("a key is the same for the same values, in the same order", () => {
  assert.equal(keyOf("fit", { gap: 0.4 }, [1, 2]), keyOf("fit", { gap: 0.4 }, [1, 2]));
  assert.notEqual(keyOf("fit", [1, 2]), keyOf("fit", [2, 1]));
  assert.notEqual(keyOf("fit", 1), keyOf("render", 1));
});

test("a folder's key: its files' paths and bytes, but those skipped", async () => {
  const a = await folder("a", { "index.html": "<p>", "assets/x.wav": "1", "renders/raw.mp4": "old" });
  const b = await folder("b", { "assets/x.wav": "1", "index.html": "<p>", "renders/raw.mp4": "new" });
  const renders = (rel: string) => rel.startsWith("renders/");
  assert.equal(await folderKey(a, renders), await folderKey(b, renders));
  assert.notEqual(await folderKey(a), await folderKey(b));
  const moved = await folder("moved", { "index.html": "<p>", "assets/y.wav": "1" });
  assert.notEqual(await folderKey(moved, renders), await folderKey(a, renders));
});

test("a stage is from the cache while its key holds and its files are there; one made again is forgotten first", async () => {
  const dir = path.join(scratch, "stages");
  const made = path.join(dir, "plan.json");
  const stages = await stagesIn(dir);
  assert.equal(stages.cached("plan", "k1"), undefined);
  await mkdir(dir, { recursive: true });
  await writeFile(made, "{}");
  await stages.made("plan", "k1", { format: "landscape" });
  // Read again, as the next make reads it.
  const next = await stagesIn(dir);
  assert.deepEqual(next.cached("plan", "k1", [made]), { format: "landscape", key: "k1" });
  assert.equal(next.cached("plan", "k2", [made]), undefined);
  assert.equal(next.cached("plan", "k1", [path.join(dir, "gone.json")]), undefined);
  await next.forget("plan");
  assert.equal((await stagesIn(dir)).cached("plan", "k1", [made]), undefined);
  // A record that does not read is nothing in the cache.
  await writeFile(path.join(dir, "stages.json"), "{ not json");
  assert.equal((await stagesIn(dir)).cached("plan", "k1"), undefined);
});

test("the plugin's code: a file in its folder changes the key, node_modules and dot folders do not", async () => {
  const src = await folder("project/src", { "plugin.ts": "export default {}", "picture.ts": "a" });
  const plugin = path.join(src, "plugin.ts");
  const before = await codeKey(plugin);
  await folder("project/src", { "node_modules/x/index.js": "1", ".cache/y": "2" });
  assert.equal(await codeKey(plugin), before);
  await folder("project/src", { "picture.ts": "b" });
  assert.notEqual(await codeKey(plugin), before);
});
