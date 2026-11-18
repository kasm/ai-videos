// Entry point: npm run video -- <command> [video] [options]
import { existsSync } from "node:fs";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadClips, type SceneClips } from "./clip.ts";
import { compose } from "./compose.ts";
import { drawnTo, fitClip, requestDocument, requestFileOf, type Fit } from "./fit.ts";
import { hyperframes, normalizeLoudness, renderProject } from "./render.ts";
import { loadVideo, type FormatName, type LoadedVideo } from "./script.ts";
import { toSrt } from "./srt.ts";
import { buildTimeline, narrate, type SpokenLine } from "./timeline.ts";
import { KokoroProvider, speak } from "./tts.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
// npm runs scripts in the package folder; paths on the command line are relative to where it was typed.
const CALLER = process.env.INIT_CWD ?? process.cwd();
const TTS_CACHE = path.join(ROOT, ".cache", "tts");
const log = (msg: string) => console.log(msg);

const HELP = `Usage: npm run video -- <command> [video] [options]

A video is a folder holding a video.yaml: a bare name is a folder in this tool's videos/,
anything with a slash is a path, relative to where the command is run.

Commands
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

/** The script, its clips (checked before any narration is made, so a bad one fails at once) and the measured voice. */
async function load(dir: string, only: string | undefined, readVideo: boolean) {
  const video = await loadVideo(dir);
  log(`Video: ${video.dir}`);
  const formats = (only ? [only] : video.script.formats) as FormatName[];
  for (const f of formats) {
    if (f !== "landscape" && f !== "portrait") throw new Error(`Unknown format "${f}"`);
  }
  const clips = await loadClips(video, formats, { readVideo });
  for (const [id, scene] of clips) {
    for (const [format, clip] of Object.entries(scene.byFormat)) {
      const { made, events, texts } = clip.data;
      const picture = clip.video ? `${clip.video.width}x${clip.video.height}, ` : "";
      log(`Clip ${id} (${format}): ${path.basename(clip.file)}, ${picture}${scene.duration}s, ${events.length} events, ${texts.length} texts; made by ${made.by} from ${made.from}`);
    }
  }
  log(`Narration (${video.script.voice})`);
  const spoken = await narrate(video.script, new KokoroProvider(), TTS_CACHE, log);
  return { video, formats, clips, spoken };
}

/** Each clip scene fitted to the measured voice. */
function fitAll(video: LoadedVideo, clips: Map<string, SceneClips>, spoken: SpokenLine[][]): Map<string, Fit> {
  const { fps, timing } = video.script;
  const fits = new Map<string, Fit>();
  for (const [i, scene] of video.script.scenes.entries()) {
    const clip = clips.get(scene.id);
    if (clip && scene.scene === "clip") {
      fits.set(scene.id, fitClip(clip.events, clip.duration, spoken[i]!, { fps, ...timing, ...timing.moves }, scene.limits));
    }
  }
  return fits;
}

async function prepare(dir: string, only: string | undefined, arg: string) {
  const { video, formats, clips, spoken } = await load(dir, only, true);
  const timeline = buildTimeline(video.script, clips, spoken, log);
  log(`Timeline: ${timeline.duration.toFixed(2)}s at ${timeline.fps} fps`);
  for (const [id, fit] of fitAll(video, clips, spoken)) {
    const clip = clips.get(id)!;
    if (drawnTo(fit, clip.events, clip.duration, video.script.fps)) log(`Clip ${id}: drawn to the voice`);
    else log(`Clip ${id}: not drawn to the voice (it would last ${fit.duration.toFixed(2)}s, not ${clip.duration}s); "npm run video -- request ${arg}" writes how long each span should last`);
  }
  const projects: Record<string, string> = {};
  for (const format of formats) {
    projects[format] = await compose(ROOT, video, clips, timeline, format);
  }
  return { video, timeline, formats, projects };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: "string" },
      draft: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) return log(HELP);

  if (command === "voices") {
    const text = arg ?? "This is a sample of my voice, so you can pick the one you like.";
    const provider = new KokoroProvider();
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

  if (!["build", "compose", "check", "preview", "request"].includes(command)) throw new Error(`Unknown command "${command}"\n\n${HELP}`);
  if (!arg) {
    throw new Error(`"${command}" needs a video: a name in videos/ or a folder's path, e.g. npm run video -- ${command} scroll-demo`);
  }
  if (values.out !== undefined && command !== "build") throw new Error(`--out is for build; ${command} writes only to build/`);

  if (command === "request") {
    // Only the clips' JSON is read: the clips themselves may not be drawn yet.
    const { video, clips, spoken } = await load(videoDir(arg), values.format, false);
    if (clips.size === 0) throw new Error(`${video.file} has no clip scene to fit`);
    for (const [id, fit] of fitAll(video, clips, spoken)) {
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
        await writeFile(file, `${JSON.stringify(requestDocument(fit, meta), null, 2)}\n`);
        log(`  ${file}`);
      }
    }
    return;
  }

  const { video, timeline, formats, projects } = await prepare(videoDir(arg), values.format, arg);

  if (command === "compose") {
    return log(`Projects: ${Object.values(projects).join(", ")}`);
  }
  if (command === "check") {
    let failed = false;
    for (const format of formats) {
      log(`\nCheck (${format})`);
      // Scrolled-off text is geometrically outside the social safe areas by design; the scene parks
      // each cue inside them, so the portrait check skips that audit rather than drown in warnings.
      const args = format === "portrait" ? ["check", "--safe-zone", "off"] : ["check"];
      if ((await hyperframes(ROOT, projects[format]!, args)) !== 0) failed = true;
    }
    if (failed) process.exitCode = 1;
    return;
  }
  if (command === "preview") {
    await hyperframes(ROOT, projects[formats[0]!]!, ["preview"]);
    return;
  }

  const outDir = values.out !== undefined ? path.resolve(CALLER, values.out) : path.join(ROOT, "out", video.slug);
  await mkdir(outDir, { recursive: true });
  const suffix = values.draft ? "-draft" : "";
  for (const format of formats) {
    const raw = path.join(projects[format]!, "renders", "raw.mp4");
    const final = path.join(outDir, `${video.slug}-${format}${suffix}.mp4`);
    log(`\nRender (${format}${values.draft ? ", draft" : ""})`);
    await renderProject(ROOT, projects[format]!, raw, { fps: timeline.fps, draft: values.draft });
    log(`Loudness (${format}, ${video.script.loudness} LUFS)`);
    await normalizeLoudness(raw, final, video.script.loudness);
    log(`  ${final}`);
  }
  const srt = path.join(outDir, `${video.slug}.srt`);
  await writeFile(srt, toSrt(timeline));
  log(`\nSubtitles: ${srt}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
