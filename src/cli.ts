// Entry point: npm run video -- <command> [video] [options]
import { existsSync } from "node:fs";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkPages } from "./bundle.ts";
import { loadClips, type SceneClips } from "./clip.ts";
import { compose } from "./compose.ts";
import { drawnTo, fitClip, requestDocument, requestFileOf, requestText, type Fit, type FitLine } from "./fit.ts";
import { commandLine, madeScenes, makerCalls, makerOf, runShell } from "./make.ts";
import type { MakerCall } from "./maker.ts";
import { newVideo } from "./new.ts";
import { hyperframes, normalizeLoudness, renderProject } from "./render.ts";
import { loadVideo, type FormatName, type LoadedVideo } from "./script.ts";
import { cachePaths, cacheRoot, ready, setup, type Need } from "./setup.ts";
import { toSrt } from "./srt.ts";
import { buildTimeline, narrate, type SpokenLine, type Timeline } from "./timeline.ts";
import { KokoroProvider, readWav, speak } from "./tts.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
// npm runs scripts in the package folder; paths on the command line are relative to where it was typed.
const CALLER = process.env.INIT_CWD ?? process.cwd();
const CACHE = cacheRoot(ROOT);
const { tts: TTS_CACHE, models: MODELS } = cachePaths(CACHE);
// HyperFrames asks npm for a newer version on every run, from a process that outlives ours; the
// tool pins its version, and runs offline.
process.env.HYPERFRAMES_NO_UPDATE_CHECK = "1";
const log = (msg: string) => console.log(msg);

const HELP = `Usage: npm run video -- <command> [video] [options]

A video is a folder holding a video.yaml: a bare name is a folder in this tool's videos/,
anything with a slash is a path, relative to where the command is run.

Commands
  setup            Fetch once what the other commands need: the voice model and HyperFrames'
                   Chrome. The only command that uses the network (AGENTS.md, "Offline")
  new <video>      A video's first video.yaml, never over one: the maker's data for its clip (the
                   folder's name, or --make's), a line per text, cued to its event (AGENTS.md, "new")
  make <video>     The whole video, inside its folder: the maker's data for each made clip, the
                   fit to the voice, the maker's drawing, check and build. Writes the folder's
                   clips/, build/ and out/ (AGENTS.md, "make")
  build <video>    Narrate, compose, render and post-process a video into out/<name>/
  compose <video>  Narrate and generate the HyperFrames project in build/<name>/ (no render)
  check <video>    Compose, then run HyperFrames' lint and layout checks
  preview <video>  Compose, then open the live preview
  request <video>  Fit each clip scene to the voice: write <clip>.request.json beside each clip,
                   how long each span should last (only the clips' JSON is needed)
  voices [text]    Write a sample of several voices to out/voice-samples/

Options
  --format <landscape|portrait>   Only this format (default: every format in the script)
  --draft                         Fast, lower-quality render for iteration
  --fit                           make only: stop after the fit, to try the lines and the timing
  --make <name>                   new only: what the maker draws, when it is not the folder's name
  --out <folder>                  build only: write the finished files here instead of out/<name>/
`;

/** The folder a command-line video names: a bare name is in videos/, anything else is a path. */
function videoDir(arg: string): string {
  const isPath = /[\\/]/.test(arg) || arg === "." || arg === ".." || path.isAbsolute(arg);
  if (isPath) return path.resolve(CALLER, arg);
  const dir = path.join(ROOT, "videos", arg);
  if (!existsSync(dir) && existsSync(path.join(CALLER, arg, "video.yaml"))) {
    throw new Error(`No video "${arg}" in ${path.join(ROOT, "videos")}. For the folder here, give it as a path: ./${arg}`);
  }
  return dir;
}

/** The formats to make: the one --format names, else every one the script asks for. */
function formatsOf(video: LoadedVideo, only: string | undefined): FormatName[] {
  const formats = (only ? [only] : video.script.formats) as FormatName[];
  for (const f of formats) {
    if (f !== "landscape" && f !== "portrait") throw new Error(`Unknown format "${f}"`);
  }
  return formats;
}

/** The script, its clips (checked before any narration is made, so a bad one fails at once) and the measured voice. */
async function load(dir: string, only: string | undefined, readVideo: boolean) {
  const video = await loadVideo(dir);
  log(`Video: ${video.dir}`);
  await checkPages(video);
  const formats = formatsOf(video, only);
  const clips = await loadClips(video, formats, { readVideo });
  for (const [id, scene] of clips) {
    for (const [format, clip] of Object.entries(scene.byFormat)) {
      const { made, events, texts } = clip.data;
      const picture = clip.video ? `${clip.video.width}x${clip.video.height}, ` : "";
      log(`Clip ${id} (${format}): ${path.basename(clip.file)}, ${picture}${scene.duration}s, ${events.length} events, ${texts.length} texts; made by ${made.by} from ${made.from}`);
    }
  }
  log(`Narration (${video.script.voice})`);
  const spoken = await narrate(video.script, new KokoroProvider(MODELS), TTS_CACHE, log);
  return { video, formats, clips, spoken };
}

/**
 * Each clip scene fitted to the measured voice. For a request (`mouths`), each line's voice is
 * read back from the cache as well, and the fit gives the line its mouth track.
 */
async function fitAll(video: LoadedVideo, clips: Map<string, SceneClips>, spoken: SpokenLine[][], mouths = false): Promise<Map<string, Fit>> {
  const { fps, timing } = video.script;
  const fits = new Map<string, Fit>();
  for (const [i, scene] of video.script.scenes.entries()) {
    const clip = clips.get(scene.id);
    if (clip && scene.scene === "clip") {
      let lines: FitLine[] = spoken[i]!;
      if (mouths) lines = await Promise.all(spoken[i]!.map(async (line) => ({ ...line, voice: await readWav(line.audioFile) })));
      fits.set(scene.id, fitClip(clip.events, clip.duration, lines, { fps, ...timing, ...timing.moves }, scene.limits));
    }
  }
  return fits;
}

/** Composes each format into `<buildDir>/<format>`, and says which clip scenes are not drawn to the voice. */
async function prepare(dir: string, only: string | undefined, arg: string, buildDir: (video: LoadedVideo) => string) {
  const { video, formats, clips, spoken } = await load(dir, only, true);
  const timeline = buildTimeline(video.script, clips, spoken, log);
  log(`Timeline: ${timeline.duration.toFixed(2)}s at ${timeline.fps} fps`);
  const undrawn: string[] = [];
  for (const [id, fit] of await fitAll(video, clips, spoken)) {
    const clip = clips.get(id)!;
    if (drawnTo(fit, clip.events, clip.duration, video.script.fps)) log(`Clip ${id}: drawn to the voice`);
    else {
      undrawn.push(id);
      log(`Clip ${id}: not drawn to the voice (it would last ${fit.duration.toFixed(2)}s, not ${clip.duration}s); "npm run video -- request ${arg}" writes how long each span should last`);
    }
  }
  const projects: Record<string, string> = {};
  for (const format of formats) {
    projects[format] = await compose(ROOT, video, clips, timeline, format, buildDir(video));
  }
  return { video, timeline, formats, projects, undrawn };
}

/** Prints each fit, and writes it as a request beside each of its scene's clips. */
async function writeRequests(video: LoadedVideo, clips: Map<string, SceneClips>, fits: Map<string, Fit>) {
  for (const [id, fit] of fits) {
    const clip = clips.get(id)!;
    log(`\nRequest for ${id}: ${fit.duration.toFixed(3)}s, ${fit.frames} frames (the clip's own pace: ${clip.duration}s)`);
    for (const s of fit.spans) {
      const motion = s.move !== undefined && s.move < s.duration ? `, moving ${s.move.toFixed(2)}s then holding` : "";
      log(`  ${s.event.padEnd(14)} ${s.span}  ${s.natural.toFixed(2)}s -> ${s.duration.toFixed(2)}s at ${s.at.toFixed(2)}s${motion}`);
    }
    for (const [n, line] of fit.lines.entries()) {
      if (line.waits > 0) log(`  line ${n + 1} waits ${line.waits.toFixed(2)}s for "${line.cue}": moves at their fastest, holds at their least`);
    }
    for (const c of new Set(Object.values(clip.byFormat))) {
      const file = requestFileOf(c.file);
      // The script, as a path from the request: the same on every run, however the tool was started.
      const script = path.relative(path.dirname(file), video.file).split(path.sep).join("/");
      const meta = { from: `${script}, scene ${id}`, clip: path.basename(c.dataFile), fps: video.script.fps };
      await writeFile(file, requestText(requestDocument(fit, meta)));
      log(`  ${file}`);
    }
  }
}

/** HyperFrames' lint and layout checks on each format's project: false when one finds errors. */
async function checkProjects(formats: FormatName[], projects: Record<string, string>): Promise<boolean> {
  let passed = true;
  for (const format of formats) {
    log(`\nCheck (${format})`);
    // Scrolled-off text is geometrically outside the social safe areas by design; the scene parks
    // each cue inside them, so the portrait check skips that audit rather than drown in warnings.
    const args = format === "portrait" ? ["check", "--safe-zone", "off"] : ["check"];
    if ((await hyperframes(ROOT, projects[format]!, args, { fold: true })) !== 0) passed = false;
  }
  return passed;
}

/** Renders each format, brings it to the script's loudness, and writes it and the subtitles into `outDir`. */
async function render(
  video: LoadedVideo,
  timeline: Timeline,
  formats: FormatName[],
  projects: Record<string, string>,
  outDir: string,
  draft: boolean,
) {
  await mkdir(outDir, { recursive: true });
  const suffix = draft ? "-draft" : "";
  for (const format of formats) {
    const raw = path.join(projects[format]!, "renders", "raw.mp4");
    const final = path.join(outDir, `${video.slug}-${format}${suffix}.mp4`);
    log(`\nRender (${format}${draft ? ", draft" : ""})`);
    await renderProject(ROOT, projects[format]!, raw, { fps: timeline.fps, draft });
    log(`Loudness (${format}, ${video.script.loudness} LUFS)`);
    await normalizeLoudness(raw, final, video.script.loudness);
    log(`  ${final}`);
  }
  const srt = path.join(outDir, `${video.slug}.srt`);
  await writeFile(srt, toSrt(timeline));
  log(`\nSubtitles: ${srt}`);
}

/**
 * `make`: the maker's data for each made clip, the fit to the voice, the maker's drawing, check and
 * build, in that order, stopping at the first that fails. All it writes is in the video's folder
 * (clips/, build/, out/), but for the voice cache, which stays in the tool.
 */
async function make(dir: string, arg: string, only: string | undefined, opts: { fit: boolean; draft: boolean }) {
  const video = await loadVideo(dir);
  await checkPages(video);
  const formats = formatsOf(video, only);
  const maker = makerOf(video);
  const made = new Set(madeScenes(video).map((s) => s.id));
  const steps = opts.fit ? 2 : 5;
  const begin = (n: number, what: string) => log(`\n== ${n}/${steps}: ${what}\n`);

  const callMaker = async (step: MakerCall["step"]) => {
    if (!maker) return log("No made clip.");
    for (const { scene, call } of makerCalls(video, formats, step)) {
      const line = commandLine(maker.maker, call);
      log(`${line}\n  (in ${maker.dir})`);
      const code = await runShell(line, maker.dir);
      if (code !== 0) {
        const what = step === "data" ? "writing its data" : "drawing it";
        throw new Error(`\nStopped: the maker failed on scene "${scene}" (${call.format}), ${what}, with exit code ${code}; it says why above.`);
      }
    }
  };

  begin(1, "the made clips' data");
  if (maker) await mkdir(path.join(video.dir, "clips"), { recursive: true });
  await callMaker("data");

  begin(2, "the fit to the voice");
  // Requests for made clips only: make draws no other, and one drawn elsewhere may lie outside the folder.
  const { clips, spoken } = await load(dir, only, false);
  await writeRequests(video, clips, new Map([...(await fitAll(video, clips, spoken, true))].filter(([id]) => made.has(id))));
  if (opts.fit) return;

  begin(3, "the made clips, drawn to the voice");
  await callMaker("draw");

  begin(4, "check");
  const { timeline, projects, undrawn } = await prepare(dir, only, arg, (v) => path.join(v.dir, "build"));
  const broken = undrawn.filter((id) => made.has(id));
  if (broken.length) throw new Error(`\nStopped: the maker drew ${broken.join(", ")}, but not to the request.`);
  if (!(await checkProjects(formats, projects))) throw new Error("\nStopped: check found errors (above).");

  begin(5, "the video");
  await render(video, timeline, formats, projects, path.join(video.dir, "out"), opts.draft);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: "string" },
      draft: { type: "boolean", default: false },
      fit: { type: "boolean", default: false },
      make: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) return log(HELP);
  if (command === "setup") return setup(ROOT, CACHE, log);

  if (command === "voices") {
    ready(ROOT, CACHE, ["voice"]);
    const text = arg ?? "This is a sample of my voice, so you can pick the one you like.";
    const provider = new KokoroProvider(MODELS);
    const dir = path.join(ROOT, "out", "voice-samples");
    await mkdir(dir, { recursive: true });
    const wanted = ["af_heart", "af_bella", "af_nicole", "am_michael", "am_fenrir", "am_puck", "bf_emma", "bm_george", "bm_fable"];
    const available = await provider.voices();
    log(`All voices: ${available.join(", ")}`);
    for (const voice of wanted.filter((v) => available.includes(v))) {
      const spoken = await speak(provider, TTS_CACHE, { text, voice, speed: 1 });
      await copyFile(spoken.file, path.join(dir, `${voice}.wav`));
      log(`  ${voice}.wav`);
    }
    return log(`Samples written to ${dir}`);
  }

  if (!["new", "make", "build", "compose", "check", "preview", "request"].includes(command)) throw new Error(`Unknown command "${command}"\n\n${HELP}`);
  if (!arg) {
    throw new Error(`"${command}" needs a video: a name in videos/ or a folder's path, e.g. npm run video -- ${command} scroll-demo`);
  }
  if (values.out !== undefined && command !== "build") {
    throw new Error(`--out is for build; ${command === "make" ? "make writes into the video's folder, out/" : `${command} writes only to build/`}`);
  }
  if (values.fit && command !== "make") throw new Error("--fit is for make; the fit alone is request");
  if (values.make !== undefined && command !== "new") throw new Error("--make is for new; a script names its clip in make:");
  // Only the maker's data: nothing spoken or drawn, so it needs nothing from setup.
  if (command === "new") return void (await newVideo(videoDir(arg), { make: values.make, format: values.format }, log));
  // Before anything is written: what the command needs is on this disk, or it names what is not.
  // Every command speaks; all but these draw or check with HyperFrames, in its Chrome.
  const needs: Need[] = command === "compose" || command === "request" || values.fit ? ["voice"] : ["voice", "browser"];
  Object.assign(process.env, ready(ROOT, CACHE, needs));

  if (command === "make") return make(videoDir(arg), arg, values.format, { fit: values.fit, draft: values.draft });

  if (command === "request") {
    // Only the clips' JSON is read: the clips themselves may not be drawn yet.
    const { video, clips, spoken } = await load(videoDir(arg), values.format, false);
    if (clips.size === 0) throw new Error(`${video.file} has no clip scene to fit`);
    return writeRequests(video, clips, await fitAll(video, clips, spoken, true));
  }

  const { video, timeline, formats, projects } = await prepare(videoDir(arg), values.format, arg, (v) => path.join(ROOT, "build", v.slug));

  if (command === "compose") {
    return log(`Projects: ${Object.values(projects).join(", ")}`);
  }
  if (command === "check") {
    if (!(await checkProjects(formats, projects))) process.exitCode = 1;
    return;
  }
  if (command === "preview") {
    await hyperframes(ROOT, projects[formats[0]!]!, ["preview"]);
    return;
  }

  const outDir = values.out !== undefined ? path.resolve(CALLER, values.out) : path.join(ROOT, "out", video.slug);
  await render(video, timeline, formats, projects, outDir, values.draft);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
