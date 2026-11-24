// The cache of a video file's stages: keys of what each is made from, a stage taken from the cache
// only while its key holds and its files are there, and the plugin's code in the keys.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { PLAYING, codeKey, folderKey, inputsKey, keyOf, stagesIn } from "./stages.ts";

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

test("the files a plugin names: a file's bytes, a folder's files but node_modules and dot folders, one not there", async () => {
  const project = await folder("inputs/project", { "package.json": "{}" });
  await folder("inputs", { "tutorials/a.json": "1", "app/x.js": "x", "app/node_modules/y/index.js": "y" });
  const inputs = ["../tutorials/a.json", "../app", "../none.json"];
  const before = await inputsKey(project, inputs);
  assert.equal(await inputsKey(project, inputs), before);
  await folder("inputs", { "app/node_modules/y/index.js": "changed", "app/.cache/z": "z" });
  assert.equal(await inputsKey(project, inputs), before);
  await folder("inputs", { "app/x.js": "changed" });
  const changed = await inputsKey(project, inputs);
  assert.notEqual(changed, before);
  await folder("inputs", { "tutorials/a.json": "2" });
  assert.notEqual(await inputsKey(project, inputs), changed);
  // One that comes to be there is a change too, and so is the list.
  const listed = await inputsKey(project, inputs);
  await folder("inputs", { "none.json": "{}" });
  assert.notEqual(await inputsKey(project, inputs), listed);
  assert.notEqual(await inputsKey(project, inputs.slice(0, 2)), await inputsKey(project, inputs));
});

test("a stage's last record is there whatever its key: what its key is made from", async () => {
  const dir = path.join(scratch, "last");
  const stages = await stagesIn(dir);
  assert.equal(stages.last("plan"), undefined);
  await stages.made("plan", "k1", { inputs: ["a.json"] });
  assert.deepEqual((await stagesIn(dir)).last("plan"), { inputs: ["a.json"], key: "k1" });
});

test("the plugin's code: a file in its folder changes the key, node_modules and dot folders do not", async () => {
  const src = await folder("project/src", { "plugin.ts": "export default {}", "picture.ts": "a" });
  const plugin = path.join(src, "plugin.ts");
  const before = await codeKey(plugin);
  await folder("project/src", { "node_modules/x/index.js": "1", ".cache/y": "2" });
  assert.equal(await codeKey(plugin), before);
  const played = await codeKey(plugin, PLAYING);
  assert.notEqual(played, before, "a script's picture goes through other files of the tool's");
  await folder("project/src", { "picture.ts": "b" });
  assert.notEqual(await codeKey(plugin), before);
  assert.notEqual(await codeKey(plugin, PLAYING), played);
});
