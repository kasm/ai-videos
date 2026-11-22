// What a video file's make keeps between runs (AGENTS.md, "The cache"): each stage's key, a hash of
// what it is made from, in .cache/<name>/stages.json. A stage whose key is the one recorded, its
// files all there, is taken from the cache: so a setting, or a profile, redoes only the stages it
// goes into, and the ones made from them.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** A key for what a stage is made from: any values, in order. */
export function keyOf(...parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** A hash of the files in `dir`: each one's path there (with /) and bytes, but those `skip` names. */
export async function folderKey(dir: string, skip: (rel: string) => boolean = () => false): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .filter((rel) => !skip(rel))
    .sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    const bytes = await readFile(path.join(dir, rel));
    hash.update(`${rel}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest("hex");
}

/** The tool's own files that a plugin's plan and picture go through. */
const DRAWING = ["src/host.ts", "src/frames.ts", "src/moments.ts", "src/plugin.ts", "package.json"];

/**
 * The code a plugin's plan and drawing depend on: every file in the plugin's folder (but
 * node_modules and dot folders), and the tool's that run it. So a change to the picture's code
 * draws again; keep the plugin in a folder of its own, as cartoons' src/.
 */
export async function codeKey(pluginFile: string): Promise<string> {
  const own = await folderKey(path.dirname(pluginFile), (rel) => rel.split("/").some((part) => part === "node_modules" || part.startsWith(".")));
  const tool = path.resolve(import.meta.dirname, "..");
  return keyOf(own, await Promise.all(DRAWING.map((file) => readFile(path.join(tool, file), "utf8"))));
}

/** A stage's record: the key it was made from, and what a later run needs of it. */
export type StageRecord = { key: string } & Record<string, unknown>;

export interface Stages {
  /** The record of `stage`, when it was made from `key` and each of `files` is there. */
  cached(stage: string, key: string, files?: string[]): StageRecord | undefined;
  /** Forgets a stage before it is made again, so one stopped half-way is not taken for made. */
  forget(stage: string): Promise<void>;
  /** Records a stage made from `key`, with what else a later run needs of it. */
  made(stage: string, key: string, extra?: Record<string, unknown>): Promise<void>;
}

/** The stages recorded in `dir`. None yet, or a file that does not read, is nothing in the cache. */
export async function stagesIn(dir: string): Promise<Stages> {
  const file = path.join(dir, "stages.json");
  let records: Record<string, StageRecord> = {};
  try {
    records = JSON.parse(await readFile(file, "utf8"));
  } catch {
    records = {};
  }
  const save = async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(file, `${JSON.stringify(records, null, 2)}\n`);
  };
  return {
    cached(stage, key, files = []) {
      const record = records[stage];
      return record?.key === key && files.every((f) => existsSync(f)) ? record : undefined;
    },
    async forget(stage) {
      delete records[stage];
      await save();
    },
    async made(stage, key, extra = {}) {
      records[stage] = { ...extra, key };
      await save();
    },
  };
}
