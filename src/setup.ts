// What the tool needs on this disk to run with the network off, and `setup`, the one command that
// fetches it: the voice models and HyperFrames' Chrome. GSAP and the fonts come with npm (bundle.ts).
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { hyperframes, hyperframesBin, run } from "./render.ts";
import { SUPERTONIC, SUPERTONIC_FILES, SUPERTONIC_REVISION, SupertonicProvider } from "./supertonic.ts";
import { KokoroProvider, MODEL, MODEL_FILES, type ModelProgress } from "./tts.ts";

/** The tool's caches: AI_VIDEOS_CACHE when it is set (a test, a bigger disk), else .cache/ in the tool. */
export function cacheRoot(root: string): string {
  const dir = process.env.AI_VIDEOS_CACHE;
  return dir ? path.resolve(dir) : path.join(root, ".cache");
}

/** Inside the cache: the narration, the voice models (each under its name), and what setup found. */
export function cachePaths(cache: string) {
  return { tts: path.join(cache, "tts"), models: path.join(cache, "models"), record: path.join(cache, "setup.json") };
}

/** setup.json: HyperFrames' Chrome, as the HyperFrames it was set up with found it. Written last. */
const SetupRecord = z.object({ hyperframes: z.string(), browser: z.string() });
type SetupRecord = z.infer<typeof SetupRecord>;

function readRecord(file: string): SetupRecord | undefined {
  try {
    return SetupRecord.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return undefined;
  }
}

function hyperframesVersion(root: string): string {
  return JSON.parse(readFileSync(path.join(root, "node_modules", "hyperframes", "package.json"), "utf8")).version;
}

/** What a command needs: the voice (both models), to speak a line; Chrome, for anything HyperFrames draws or checks. */
export type Need = "voice" | "browser";

/** One line for each piece `needs` asks for that is not on this disk, naming it and where it should be. */
export function missing(root: string, cache: string, needs: Need[]): string[] {
  const paths = cachePaths(cache);
  const lines: string[] = [];
  if (needs.includes("voice")) {
    const dir = path.join(paths.models, ...MODEL.split("/"));
    const absent = MODEL_FILES.filter((file) => !existsSync(path.join(dir, file)));
    if (absent.length) lines.push(`the voice model (${MODEL}): ${absent.join(", ")} not in ${dir}`);
    const supertonic = path.join(paths.models, ...SUPERTONIC.split("/"));
    const files = Object.keys(SUPERTONIC_FILES);
    const lacks = files.filter((file) => !existsSync(path.join(supertonic, file)));
    if (lacks.length) lines.push(`the voice model (${SUPERTONIC}): ${lacks.length === files.length ? `none of its ${files.length} files` : lacks.join(", ")} in ${supertonic}`);
  }
  if (needs.includes("browser")) {
    const record = readRecord(paths.record);
    const version = hyperframesVersion(root);
    if (!record) lines.push(`HyperFrames' Chrome: none found by setup (no ${paths.record})`);
    else if (record.hyperframes !== version) {
      lines.push(`HyperFrames' Chrome: setup found it for HyperFrames ${record.hyperframes}, and this is ${version}, which may pin another`);
    } else if (!existsSync(record.browser)) lines.push(`HyperFrames' Chrome: ${record.browser} is gone`);
  }
  return lines;
}

/**
 * Throws, naming each missing piece, unless the tool has what `needs` asks for; nothing is fetched.
 * Returns HyperFrames' environment: its Chrome by path, so that it never downloads one itself.
 */
export function ready(root: string, cache: string, needs: Need[]): Record<string, string> {
  const lines = missing(root, cache, needs);
  if (lines.length) {
    throw new Error(
      `Missing, and not fetched:\n${lines.map((l) => `  - ${l}`).join("\n")}\n` +
        `Run "npm run video -- setup" once, with the network on; no other command fetches anything.`,
    );
  }
  const record = readRecord(cachePaths(cache).record);
  return record ? { HYPERFRAMES_BROWSER_PATH: record.browser } : {};
}

/** Logs a file's download in steps of a fifth, and each file when it is done. */
function progressLog(log: (msg: string) => void) {
  const shown = new Map<string, number>();
  return (info: ModelProgress) => {
    if (!info.file) return;
    if (info.status === "progress" && info.progress !== undefined) {
      const step = Math.floor(info.progress / 20) * 20;
      if (step > (shown.get(info.file) ?? -1) && step < 100) {
        shown.set(info.file, step);
        log(`  ${info.file}: ${step}%`);
      }
    } else if (info.status === "done") log(`  ${info.file}`);
  };
}

/** A file's sha256, read in pieces. */
async function hashOf(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const piece of createReadStream(file)) hash.update(piece);
  return hash.digest("hex");
}

/**
 * Supertonic's files, at the revision pinned, into `dir`: each fetched into a `.part` beside it, and
 * named only once its size and sha256 are the ones pinned. One already there is kept when it is.
 */
async function fetchSupertonic(dir: string, progress: (info: ModelProgress) => void): Promise<void> {
  for (const [file, { size, sha256 }] of Object.entries(SUPERTONIC_FILES)) {
    const target = path.join(dir, file);
    if (existsSync(target) && (await hashOf(target)) === sha256) continue;
    await mkdir(path.dirname(target), { recursive: true });
    const url = `https://huggingface.co/${SUPERTONIC}/resolve/${SUPERTONIC_REVISION}/${file}`;
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    const part = `${target}.part`;
    const out = await open(part, "w");
    const hash = createHash("sha256");
    let got = 0;
    try {
      for await (const piece of response.body) {
        await out.write(piece);
        hash.update(piece);
        got += piece.length;
        // Only a model's own progress is worth a line: its voices and settings are small.
        if (size > 1e7) progress({ status: "progress", file, progress: (100 * got) / size });
      }
    } finally {
      await out.close();
    }
    const digest = hash.digest("hex");
    if (got !== size || digest !== sha256) {
      await rm(part, { force: true });
      throw new Error(`${url}: ${got} bytes with sha256 ${digest}, not the ${size} with ${sha256} pinned`);
    }
    await rename(part, target);
    progress({ status: "done", file });
  }
}

/**
 * `setup`: fetches the voice models into the cache and has HyperFrames make sure of its Chrome, then
 * records where that is. What is already there is kept, so running it again only checks.
 */
export async function setup(root: string, cache: string, log: (msg: string) => void): Promise<void> {
  const paths = cachePaths(cache);
  await mkdir(cache, { recursive: true });

  log(`Voice model: ${MODEL} (about 325 MB the first time) in ${paths.models}`);
  const voices = await new KokoroProvider(paths.models, { download: true, progress: progressLog(log) }).voices();
  log(`  ${voices.length} voices`);

  log(`\nVoice model: ${SUPERTONIC} (about 400 MB the first time) in ${paths.models}`);
  await fetchSupertonic(path.join(paths.models, ...SUPERTONIC.split("/")), progressLog(log));
  log(`  ${(await new SupertonicProvider(paths.models).voices()).length} voices`);

  log(`\nHyperFrames' Chrome`);
  if ((await hyperframes(root, root, ["browser", "ensure"])) !== 0) throw new Error("HyperFrames could not get its Chrome (above)");
  // `browser path` finds the one `ensure` made sure of: HyperFrames' own cache comes first.
  const found = await run(process.execPath, [hyperframesBin(root), "browser", "path"], { cwd: root });
  const browser = found.stdout.trim().split(/\r?\n/).pop() ?? "";
  if (found.code !== 0 || !existsSync(browser)) throw new Error(`HyperFrames named no Chrome:\n${found.stdout}${found.stderr}`);
  const record: SetupRecord = { hyperframes: hyperframesVersion(root), browser };
  await writeFile(paths.record, `${JSON.stringify(record, null, 2)}\n`);
  log(`  ${browser}`);

  const left = missing(root, cache, ["voice", "browser"]);
  if (left.length) throw new Error(`setup ran, but these are still missing:\n${left.map((l) => `  - ${l}`).join("\n")}`);
  log(`\nReady: every other command now runs with the network off.`);
}
