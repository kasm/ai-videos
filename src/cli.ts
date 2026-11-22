// Entry point: npm run video -- <command> [video] [options]
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkPages } from "./bundle.ts";
import { loadClips, madeFiles, readClipData, type SceneClips } from "./clip.ts";
import { compose } from "./compose.ts";
import { drawnTo, fitClip, requestDocument, requestFileOf, requestText, type Fit, type FitLine } from "./fit.ts";
import { drawerOf, madeScenes, makerCalls, pluginOf, startPlugin, type Drawer, type PluginHost } from "./make.ts";
import { MakerCall } from "./maker.ts";
import { importReply } from "./import.ts";
import { lock } from "./lock.ts";
import { newVideo } from "./new.ts";
import { promptFor } from "./prompt.ts";
import { writePage, pageVideo } from "./page.ts";
import { hyperframes, muxSound, normalizeLoudness, renderProject } from "./render.ts";
import { FORMATS, loadVideo, type FormatName, type LoadedVideo } from "./script.ts";
import { cachePaths, cacheRoot, ready, setup, type Need } from "./setup.ts";
import { writeSound } from "./sound.ts";
import { toSrt } from "./srt.ts";
import { codeKey, folderKey, keyOf, stagesIn } from "./stages.ts";
import { runStory, windowsIO } from "./story.ts";
import { buildTimeline, narrate, type SpokenLine, type Timeline } from "./timeline.ts";
import { KokoroProvider, readWav, speak } from "./tts.ts";
import { PROFILES, formatOf, readProject, readVideoFile, scriptOf, type VideoFile } from "./video-file.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
// npm runs scripts in the package folder; paths on the command line are relative to where it was typed.
const CALLER = process.env.INIT_CWD ?? process.cwd();
const CACHE = cacheRoot(ROOT);
const { tts: TTS_CACHE, models: MODELS } = cachePaths(CACHE);
// HyperFrames asks npm for a newer version on every run, from a process that outlives ours; the
// tool pins its version, and runs offline.
process.env.HYPERFRAMES_NO_UPDATE_CHECK = "1";
// The HyperFrames the tool pins: a build checked or rendered by another is checked and rendered again.
const HYPERFRAMES = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies.hyperframes;
const log = (msg: string) => console.log(msg);

const HELP = `Usage: npm run video -- <command> [video] [options]

A video is a folder holding a video.yaml: a bare name is a folder in this tool's videos/,
anything with a slash is a path, relative to where the command is run. A plugin's video is one
file, <name>.yaml, and only make takes it (AGENTS.md, "A video file").

Commands
  setup            Fetch once what the other commands need: the voice model and HyperFrames'
                   Chrome. The only command that uses the network (AGENTS.md, "Offline")
  new <video>      A video's first video.yaml, never over one: the maker's data for its clip (the
                   folder's name, or --make's), a line per text, cued to its event (AGENTS.md, "new")
  make <video>     The whole video, inside its folder: the maker's data for each made clip, the
                   fit to the voice, the maker's drawing, check and build. Writes the folder's
                   clips/, build/ and out/ (AGENTS.md, "make")
  make <file.yaml> A plugin's video: its plan, the voices and the fit, the sound, then what its
                   outputs turn on: its page (off by default), and the drawing, check and the
                   video, each stage from the cache when what it is made from is unchanged. Writes
                   the project's .cache/<name>/ and out/<name>.mp4 and .srt (and .html). A second
                   make of the video, while one runs, is refused (AGENTS.md, "The cache")
  story <story.md> A story to its videos, by a web chat and the clipboard: the prompt copied, each
                   answer copied back into <name>.reply.md and imported, what was refused copied
                   for the chat, then each episode made. Goes on from the reply's file when it is
                   there (AGENTS.md, "story"). Windows only
  prompt <story.md> The prompt for a web chat, on stdout: the tool's instructions, the format from
                   the plugin, the library and the voices, and the story (AGENTS.md, "prompt")
  import <reply>   A web chat's reply to the prompt, pasted into a file: each episode the tool and
                   the plugin take written as videos/<name>.yaml, what it adds to library.yaml,
                   nothing written over; what was refused as a message for the chat (AGENTS.md, "import")
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
  --profile <${Object.keys(PROFILES).join("|")}>   make of a file only: these settings over the rest;
                                  the finished files are <name>-<profile>.*
  --as <video|web>                make of a file only: the video, or its web page, out/<name>.html,
                                  one file that plays offline, whatever its outputs say
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
 * `make` of a video folder: the data for each made clip, the fit to the voice, the drawing, check
 * and build, in that order, stopping at the first that fails; the project's maker writes the data
 * and draws. All it writes is in the video's folder (clips/, build/, out/), but for the voice
 * cache, which stays in the tool.
 */
async function make(dir: string, arg: string, only: string | undefined, opts: { fit: boolean; draft: boolean }) {
  const video = await loadVideo(dir);
  await checkPages(video);
  const formats = formatsOf(video, only);
  await makeWith(await drawerOf(video), video, dir, arg, only, formats, opts);
}

/** make's five steps, with what draws its made clips (none when it has none). */
async function makeWith(
  drawer: Drawer | undefined,
  video: LoadedVideo,
  dir: string,
  arg: string,
  only: string | undefined,
  formats: FormatName[],
  opts: { fit: boolean; draft: boolean },
) {
  const made = new Set(madeScenes(video).map((s) => s.id));
  const steps = opts.fit ? 2 : 5;
  const begin = (n: number, what: string) => log(`\n== ${n}/${steps}: ${what}\n`);

  const callDrawer = async (step: MakerCall["step"]) => {
    if (!drawer) return log("No made clip.");
    for (const { scene, call } of makerCalls(video, formats, step)) {
      const failed = await drawer.run(call, log);
      if (failed !== undefined) {
        const what = step === "data" ? "writing its data" : "drawing it";
        throw new Error(`\nStopped: the maker failed on scene "${scene}" (${call.format}), ${what}${failed}`);
      }
    }
  };

  begin(1, "the made clips' data");
  if (drawer) await mkdir(path.join(video.dir, "clips"), { recursive: true });
  await callDrawer("data");

  begin(2, "the fit to the voice");
  // Requests for made clips only: make draws no other, and one drawn elsewhere may lie outside the folder.
  const { clips, spoken } = await load(dir, only, false);
  await writeRequests(video, clips, new Map([...(await fitAll(video, clips, spoken, true))].filter(([id]) => made.has(id))));
  if (opts.fit) return;

  begin(3, "the made clips, drawn to the voice");
  await callDrawer("draw");

  begin(4, "check");
  const { timeline, projects, undrawn } = await prepare(dir, only, arg, (v) => path.join(v.dir, "build"));
  const broken = undrawn.filter((id) => made.has(id));
  if (broken.length) throw new Error(`\nStopped: the maker drew ${broken.join(", ")}, but not to the request.`);
  if (!(await checkProjects(formats, projects))) throw new Error("\nStopped: check found errors (above).");

  begin(5, "the video");
  await render(video, timeline, formats, projects, path.join(video.dir, "out"), opts.draft);
}

/** What `make <file>` makes, after the stages both share: the video (the default), or its web page. */
const MODES = ["video", "web"] as const;
type Mode = (typeof MODES)[number];

/**
 * `make <file>`: a plugin's video from its one file (AGENTS.md, "A video file"). First what both
 * modes share: the plan, the voices and the fit, and the sound. Then what its outputs turn on, or
 * the one `--as` names: its page, then the video (the drawing, check, and the render with the
 * sound). Each stage is taken from the cache when what it is made from is unchanged (stages.ts);
 * the finished files are written every time, and returned. It holds the video's lock (lock.ts)
 * and writes the project's .cache/<name>/ and out/; the plugin runs only for a stage it makes.
 */
async function makeFile(file: string, opts: { fit: boolean; profile: string | undefined; as: Mode | undefined }): Promise<string[]> {
  const video = await readVideoFile(file, opts.profile);
  const outputs = opts.fit ? [] : opts.as ? [opts.as] : MODES.filter((mode) => video.settings.outputs[mode]);
  if (!opts.fit && outputs.length === 0) throw new Error(`${video.file}: its outputs turn off both the video and the web page, so there is nothing to make: turn one on, or give --as`);
  // Before anything is written: what the command needs is on this disk, or it names what is not.
  // Only the video is drawn and checked with HyperFrames, in its Chrome.
  Object.assign(process.env, ready(ROOT, CACHE, outputs.includes("video") ? ["voice", "browser"] : ["voice"]));
  const release = await lock(video.cache, video.name, process.argv.slice(2).join(" "));
  const as = outputs.map((mode) => (mode === "web" ? "a web page" : "a video")).join(" and ");
  log(`Video: ${video.file}${video.profile ? `, profile ${video.profile}` : ""}${opts.fit ? "" : `, as ${as}`}`);
  let started: Promise<PluginHost> | undefined;
  const plugin = () => (started ??= startPlugin(video.plugin, log));
  try {
    return await makeFileWith(video, { fit: opts.fit, outputs }, plugin);
  } finally {
    // A plugin that did not start has nothing to close.
    await started?.then((host) => host.close(), () => {});
    await release();
  }
}

async function makeFileWith(video: VideoFile, opts: { fit: boolean; outputs: Mode[] }, plugin: () => Promise<PluginHost>): Promise<string[]> {
  const web = opts.outputs.includes("web");
  const steps = opts.fit ? 2 : 3 + (web ? 1 : 0) + (opts.outputs.includes("video") ? 3 : 0);
  let step = 0;
  const begin = (what: string) => log(`\n== ${++step}/${steps}: ${what}\n`);
  const shown = (file: string) => path.relative(video.plugin.dir, file);
  const cached = (what: string) => log(`From the cache: ${what}`);
  const stages = await stagesIn(video.cache);
  const code = await codeKey(video.plugin.file);
  /** The plugin, started at the first stage that needs it: the one the file's `use:` names. */
  const host = async () => {
    let started: PluginHost;
    try {
      started = await plugin();
    } catch (e) {
      throw new Error(`\nStopped: ${(e as Error).message}`);
    }
    if (started.scene !== video.use) throw new Error(`\nStopped: ${shown(video.file)} says use: ${video.use}, and the plugin ${shown(video.plugin.file)} draws ${started.scene}`);
    return started;
  };
  const call = async (job: MakerCall, what: string) => {
    const plugin = await host();
    try {
      return await plugin.run({ call: MakerCall.parse(job), file: video.file, source: video.source, library: video.library }, log);
    } catch (e) {
      throw new Error(`\nStopped: the plugin failed on ${shown(video.file)}, ${what}: ${(e as Error).message}`);
    }
  };

  begin("the plan");
  // The plan's format is the stage's, which only the plugin knows: it is recorded with the plan.
  const planFile = path.join(video.cache, "plan.json");
  // The library without its voices: a voice changed redoes the voices, not the plan.
  const planKey = keyOf("plan", video.use, video.source, video.library?.raw, code);
  let planned = stages.cached("plan", planKey, [planFile]);
  if (planned) cached(`the plan, ${shown(planFile)}`);
  else {
    await stages.forget("plan");
    const { scene, stage } = await host();
    const format = formatOf(scene, stage);
    const { repaired } = await call({ step: "data", name: video.name, format, data: planFile }, "writing its plan");
    await stages.made("plan", planKey, { format, repaired });
    planned = { key: planKey, format, repaired };
  }
  // What the plugin mended is said every time, from the cache too: the file still holds it.
  const repaired = (planned.repaired ?? []) as string[];
  if (repaired.length > 0) {
    log(`Mended by the plugin, in what it draws (${shown(video.file)} is as written):\n${repaired.map((r) => `  - ${r}`).join("\n")}`);
  }
  const format = planned.format as FormatName;
  const plan = await readClipData(planFile);
  const script = scriptOf(video, format, plan);
  // The pipeline's video: its folder is the cache's, laid out as a video folder's made parts.
  const loaded: LoadedVideo = { slug: video.name, dir: video.cache, file: video.file, project: undefined, script };
  const files = madeFiles(video.cache, video.name, format);

  begin("the voices and the fit");
  log(`Narration (${script.voice})`);
  const spoken = await narrate(script, new KokoroProvider(MODELS), TTS_CACHE, log);
  const voiced = spoken.flat().map((l) => [l.text, l.speaker, l.cue, l.pause, path.basename(l.audioFile), l.duration]);
  const fitKey = keyOf("fit", plan, voiced, script.fps, script.timing);
  // With --fit the fit is shown, from the cache or not.
  if (!opts.fit && stages.cached("fit", fitKey, [files.request])) cached(`the fit, ${shown(files.request)}`);
  else {
    await stages.forget("fit");
    const own = new Map([[video.name, { byFormat: { [format]: { file: files.clip, dataFile: files.data, data: plan } }, duration: plan.duration, events: plan.events }]]);
    await mkdir(path.dirname(files.request), { recursive: true });
    await writeRequests(loaded, own, await fitAll(loaded, own, spoken, true));
    await stages.made("fit", fitKey);
  }
  if (opts.fit) return [];
  // The timeline of the fit: each event where the request puts it, as the drawn clip's data puts it
  // (host.ts), so the sound and the page need no drawing.
  const request = JSON.parse(await readFile(files.request, "utf8")) as ReturnType<typeof requestDocument>;
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  const fitted = new Map([[video.name, { byFormat: {}, duration: request.duration, events: request.spans.map((s) => ({ name: s.event, at: ms(s.at), span: s.span, natural: s.natural })) }]]);
  const timeline = buildTimeline(script, fitted, spoken, log);
  log(`Timeline: ${timeline.duration.toFixed(2)}s at ${timeline.fps} fps`);

  begin("the sound");
  const { quality, loudness } = video.settings;
  const sound = path.join(video.cache, "sound.m4a");
  const lines = timeline.scenes.flatMap((s) => s.lines.map((l) => [path.basename(l.audioFile), l.start]));
  const soundKey = keyOf("sound", lines, timeline.duration, loudness);
  if (stages.cached("sound", soundKey, [sound])) cached(`the sound, ${shown(sound)}`);
  else {
    await stages.forget("sound");
    log(`Sound: the voices mixed at ${loudness} LUFS`);
    await writeSound(timeline, sound, loudness);
    await stages.made("sound", soundKey);
    log(`  ${shown(sound)}`);
  }

  const made: string[] = [];
  if (web) {
    begin("the page");
    const page = `${video.out}.html`;
    const bytes = await writePage(ROOT, {
      title: video.name,
      source: shown(video.file).split(path.sep).join("/"),
      pluginFile: video.plugin.file,
      video: pageVideo({ dir: video.plugin.dir, file: video.file, source: video.source, library: video.library, request, size: FORMATS[format], format, timeline }),
      sound,
      out: page,
    });
    log(`Page: ${shown(page)}, ${(bytes / 1e6).toFixed(1)} MB`);
    made.push(page);
  }
  if (!opts.outputs.includes("video")) return made;

  begin("the drawing");
  const drawKey = keyOf("drawing", await readFile(files.request, "utf8"), video.use, video.source, video.library?.raw, code);
  if (stages.cached("drawing", drawKey, [files.clip, files.data, `${files.clip}.frames`, `${files.clip}.svgs`])) cached(`the clip, ${shown(files.clip)}`);
  else {
    await stages.forget("drawing");
    await call({ step: "draw", name: video.name, format, ...FORMATS[format], request: files.request, clip: files.clip, data: files.data }, "drawing it");
    await stages.made("drawing", drawKey);
  }

  begin("check");
  const clips = await loadClips(loaded, [format]);
  const clip = clips.get(video.name)!;
  if (!drawnTo((await fitAll(loaded, clips, spoken)).get(video.name)!, clip.events, clip.duration, script.fps)) {
    throw new Error(`\nStopped: the plugin drew ${shown(files.clip)}, but not to the request.`);
  }
  const project = await compose(ROOT, loaded, clips, timeline, format, path.join(video.cache, "build"));
  // What HyperFrames reads: the build but its own folder and the renders, and HyperFrames itself.
  const built = await folderKey(project, (rel) => rel.startsWith(".hyperframes/") || rel.startsWith("renders/"));
  const buildKey = keyOf("build", built, HYPERFRAMES);
  if (stages.cached("check", buildKey)) cached("check, passed on this build");
  else {
    await stages.forget("check");
    if (!(await checkProjects([format], { [format]: project }))) throw new Error("\nStopped: check found errors (above).");
    await stages.made("check", buildKey);
  }

  begin("the video");
  const rendered = path.join(video.cache, "render.mp4");
  const renderKey = keyOf("render", buildKey, quality, script.fps);
  if (stages.cached("render", renderKey, [rendered])) cached(`the render, ${shown(rendered)}`);
  else {
    await stages.forget("render");
    log(`Render (${quality})`);
    await renderProject(ROOT, project, rendered, { fps: script.fps, draft: quality === "draft" });
    await stages.made("render", renderKey);
  }
  // The render's picture, with the one sound: the page plays the same.
  await muxSound(rendered, sound, `${video.out}.mp4`);
  log(`Video: ${shown(`${video.out}.mp4`)}, the render's picture with the sound`);
  await writeFile(`${video.out}.srt`, toSrt(timeline));
  log(`Subtitles: ${shown(`${video.out}.srt`)}`);
  return [...made, `${video.out}.mp4`];
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
      profile: { type: "string" },
      as: { type: "string" },
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

  if (command === "prompt") {
    if (!arg) throw new Error('"prompt" needs a story: its file, e.g. npm run -s video -- prompt stories/the-river-bank.md');
    // The prompt alone goes to stdout, to be copied or piped; what was read goes to stderr.
    const prompt = await promptFor(path.resolve(CALLER, arg), (m) => console.error(m));
    return void process.stdout.write(prompt);
  }

  if (command === "import") {
    if (!arg) throw new Error('"import" needs the reply: the file it is pasted into, e.g. npm run -s video -- import stories/the-river-bank.reply.md');
    const { refused } = await importReply(path.resolve(CALLER, arg), log);
    if (refused !== undefined) {
      log(`\nTo send back to the chat, as it is:\n\n${"-".repeat(72)}\n${refused}\n${"-".repeat(72)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "story") {
    if (!arg) throw new Error('"story" needs a story: its file, e.g. npm run video -- story stories/the-river-bank.md');
    const story = path.resolve(CALLER, arg);
    // Before the chat: what its episodes' makes need is on this disk. The project's outputs say whether a video is drawn.
    const plugin = await pluginOf(story);
    const outputs = plugin ? ((await readProject(plugin)).settings.outputs as { video: boolean }) : { video: true };
    Object.assign(process.env, ready(ROOT, CACHE, outputs.video ? ["voice", "browser"] : ["voice"]));
    await runStory(story, windowsIO(), async (video, as) => (await makeFile(video, { fit: false, profile: undefined, as }))[0]!, log);
    return;
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
  // A plugin's video is one file, and make alone takes it: its format is its plugin's stage, its profile is picked here.
  const isFile = arg.endsWith(".yaml");
  if (isFile && command !== "make") throw new Error(`${command} takes a video folder; a video file (${arg}) is made with make`);
  if (isFile && values.format !== undefined) throw new Error(`--format is for a video folder: a video file's format is its plugin's stage`);
  if (isFile && values.draft) throw new Error("--draft is for a video folder: a video file's draft is --profile draft");
  if (values.profile !== undefined && !isFile) throw new Error("--profile is for make of a video file (<name>.yaml)");
  if (values.as !== undefined && !(command === "make" && isFile)) throw new Error("--as is for make of a video file (<name>.yaml): a video, or its web page");
  if (values.as !== undefined && !(MODES as readonly string[]).includes(values.as)) throw new Error(`--as ${values.as}: it is ${MODES.join(" (the default) or ")} (a web page)`);
  if (values.as !== undefined && values.fit) throw new Error("--fit stops before either mode: leave out --as");
  // Only the maker's data: nothing spoken or drawn, so it needs nothing from setup.
  if (command === "new") return void (await newVideo(videoDir(arg), { make: values.make, format: values.format }, log));
  // A video file's needs are its outputs': make checks them once it has read the file.
  if (command === "make" && isFile) return void (await makeFile(path.resolve(CALLER, arg), { fit: values.fit, profile: values.profile, as: values.as as Mode | undefined }));
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
