// Entry point: npm run video -- <command> [file] [options]
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkScript, checkedLines, lineVoice, unspoken, type CheckedScript } from "./check.ts";
import { loadClip, loadDrawn, madeFiles, readClipData, type SceneClip } from "./clip.ts";
import { compile, compiledText, type Compiled, type Voiced } from "./compile.ts";
import { compose, composeCompiled } from "./compose.ts";
import { drawnTo, fitClip, requestDocument, requestText, type Fit } from "./fit.ts";
import { Call, pluginOf, startPlugin, type PluginHost } from "./make.ts";
import { importReply } from "./import.ts";
import { lock } from "./lock.ts";
import { mouthTrack } from "./mouth.ts";
import { listed } from "./names.ts";
import { promptFor } from "./prompt.ts";
import { compiledPage, writePage, pageVideo, type PagePicture, type PageVideo } from "./page.ts";
import { LOOP } from "./read.ts";
import { hyperframes, muxSound, renderProject } from "./render.ts";
import { NARRATOR, issuesText, linesIn, type Default } from "./scenario.ts";
import { FORMATS, LANGUAGES, voiceOf, type EventLimitsScript, type FormatName, type LoadedVideo } from "./script.ts";
import { cachePaths, cacheRoot, ready, setup } from "./setup.ts";
import { pictureOf } from "./shown.ts";
import { compiledSounds, compiledVoices, mixKey, writeMix, writeSound } from "./sound.ts";
import { PLAYING, codeKey, folderKey, inputsKey, keyOf, stagesIn, type Stages } from "./stages.ts";
import { runStory, windowsIO } from "./story.ts";
import { buildTimeline, narrate } from "./timeline.ts";
import { enginesIn, readWav, speak, toolVoices } from "./tts.ts";
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

const HELP = `Usage: npm run video -- <command> [file] [options]

A video is one file, <name>.yaml, in a project whose package.json names the plugin that draws it
(AGENTS.md, "A video file"). A path is relative to where the command is run.

Commands
  setup             Fetch once what the other commands need: the voice model and HyperFrames'
                    Chrome. The only command that uses the network (AGENTS.md, "Offline")
  make <file.yaml>  A video: its plan, the voices and the fit, the sound, then what its outputs
                    turn on: its page (off by default), and the drawing, check and the video, each
                    stage from the cache when what it is made from is unchanged. Writes the
                    project's .cache/<name>/ and out/<name>.mp4 (and .html). A second make
                    of the video, while one runs, is refused (AGENTS.md, "The cache"). A video
                    written as a script is checked and compiled, .cache/<name>/compiled.json, in
                    place of the plan and the fit, and made from that (AGENTS.md, "A script")
  check <file.yaml> A video file checked, with nothing spoken or written: a script's mistakes each
                    with its line and a hint, or the defaults it takes; any other file as its
                    plugin checks it. Needs nothing from setup (AGENTS.md, "A script")
  story <story.md>  A story to its videos, by a web chat and the clipboard: the prompt copied, each
                    answer copied back into <name>.reply.md and imported, what was refused copied
                    for the chat, then each episode made. Goes on from the reply's file when it is
                    there (AGENTS.md, "story"). Windows only
  prompt <story.md> The prompt for a web chat, on stdout: the tool's instructions, the format from
                    the plugin, the library and the voices, and the story (AGENTS.md, "prompt")
  import <reply>    A web chat's reply to the prompt, pasted into a file: each episode the tool and
                    the plugin take written as videos/<name>.yaml, what it adds to library.yaml,
                    nothing written over; what was refused as a message for the chat (AGENTS.md, "import")
  voices [text]     Write a sample of several voices to out/voice-samples/

Options, for make
  --fit                           Stop after the fit (a script's compiling), to try the lines and the timing
  --profile <${Object.keys(PROFILES).join("|")}>   These settings over the rest; the finished files are <name>-<profile>.*
  --as <video|web>                The video, or its web page, out/<name>.html, one file that
                                  plays offline, whatever its outputs say
`;

/**
 * The fit as a table, and as a request beside the clip: the file the plugin draws to. Its source
 * is the video file, as a path from the request: the same on every run, however the tool was started.
 */
async function writeRequest(video: LoadedVideo, files: { request: string; data: string }, fit: Fit, natural: number) {
  log(`\nRequest for ${video.slug}: ${fit.duration.toFixed(3)}s, ${fit.frames} frames (the clip's own pace: ${natural}s)`);
  for (const s of fit.spans) {
    const motion = s.move !== undefined && s.move < s.duration ? `, moving ${s.move.toFixed(2)}s then holding` : "";
    log(`  ${s.event.padEnd(14)} ${s.span}  ${s.natural.toFixed(2)}s -> ${s.duration.toFixed(2)}s at ${s.at.toFixed(2)}s${motion}`);
  }
  for (const [n, line] of fit.lines.entries()) {
    if (line.waits > 0) log(`  line ${n + 1} waits ${line.waits.toFixed(2)}s for "${line.cue}": moves at their fastest, holds at their least`);
  }
  const source = path.relative(path.dirname(files.request), video.file).split(path.sep).join("/");
  const meta = { from: `${source}, scene ${video.slug}`, clip: path.basename(files.data), fps: video.script.fps };
  await writeFile(files.request, requestText(requestDocument(fit, meta)));
  log(`  ${files.request}`);
}

/** What `make` makes, after the stages both share: the video (the default), or its web page. */
const MODES = ["video", "web"] as const;
type Mode = (typeof MODES)[number];

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** The scene a video file says its plugin draws is the one the plugin draws. */
function sameScene(video: VideoFile, host: PluginHost): void {
  if (host.scene !== video.use) throw new Error(`${video.file} says use: ${video.use}, and the plugin ${video.plugin.file} draws ${host.scene}`);
}

/** A video file written as a script, checked (check.ts), or every mistake with its line and a hint, thrown. */
async function checkedScript(video: VideoFile, host: PluginHost): Promise<CheckedScript> {
  sameScene(video, host);
  const checked = await checkScript(video, host);
  if ("issues" in checked) throw new Error(issuesText(path.relative(CALLER, video.file), video.text, checked.issues));
  return checked;
}

/** The defaults a script takes, a row for each value that nothing sets: what it is then, and the lines that take it. */
function logDefaults({ defaults }: { defaults: Default[] }): void {
  if (defaults.length > 0) log("By default, as nothing sets it:");
  for (const { name, value, lines } of defaults) log(`  ${name}: ${value} (${lines.length === 1 ? "line" : "lines"} ${listed(lines.map(String))})`);
}

/**
 * `check <file>`: a video file checked, with nothing spoken and nothing written. A script by the
 * check above; any other file as import checks an episode: mended, checked and planned by its
 * plugin, every speaker with a voice the tool speaks in.
 */
async function checkFile(file: string): Promise<void> {
  const video = await readVideoFile(file);
  const shown = path.relative(CALLER, video.file);
  const host = await startPlugin(video.plugin, () => {});
  try {
    if (video.script) {
      const checked = await checkedScript(video, host);
      const lines = checkedLines(checked);
      const said = lines.filter((line) => "text" in line).length;
      const played = lines.filter((line) => "sound" in line).length;
      log(`Checked: ${shown}, a script of ${count(video.script.scenes.length, "scene")} and ${count(lines.length, "line")}, ${said} of them said${played > 0 ? ` and ${played} played` : ""}.`);
      return logDefaults(checked);
    }
    sameScene(video, host);
    const { repaired, plan } = await host.check(video.file, video.source, video.library);
    const script = scriptOf(video, plan, plan.limits);
    const said = script.scenes.flatMap((scene) => scene.narration);
    const unsaid = await unspoken(script);
    if (unsaid) throw new Error(`${video.file}: ${unsaid}`);
    log(`Checked: ${shown}, ${count(plan.events.length, "event")} and ${count(said.length, "line")}.`);
    if (repaired.length > 0) log(`Mended by the plugin, in what it draws (the file is as written):\n${repaired.map((r) => `  - ${r}`).join("\n")}`);
  } finally {
    host.close();
  }
}

/** A make under way: its steps as the log says them, and its stages in the cache. */
interface Making {
  stages: Stages;
  /** A step begins. */
  begin(what: string): void;
  /** What a stage makes is taken from the cache. */
  cached(what: string): void;
  /** A file of the project's, as a path from its folder. */
  shown(file: string): string;
}

/**
 * What is played, however its file is written: a plan fitted to the voice, or a script compiled.
 * The sound, the page and the video are made from it.
 */
interface Played {
  fps: number;
  /** How loud its sound is, LUFS. */
  loudness: number;
  /** Its sound: what it is made from, and how it is written into a file, with what it says of that. */
  sound: { key: string; write(file: string): Promise<string | undefined> };
  /** Its picture is recorded, not drawn: its page plays the clip. */
  recorded: boolean;
  /** Draws its clip, or takes it from the cache. */
  draw(): Promise<void>;
  /** What its page shows, and what that is made from. */
  page(): { picture: PagePicture; video: PageVideo };
  /** The drawn clip read back, and the build composed from it: the HyperFrames project. */
  build(): Promise<string>;
}

/**
 * A video written as a script, as it is played (AGENTS.md, "A script"): the check, the voices
 * measured, and the compiled scenario, .cache/<name>/compiled.json, its timing shown. What follows
 * is made from that file, read back, and the library's drawings. The check and the compiling run
 * every time. Nothing more with `fit`.
 */
async function playScript(video: VideoFile, fit: boolean, plugin: () => Promise<PluginHost>, { stages, begin, cached, shown }: Making): Promise<Played | undefined> {
  begin("the script's check");
  const host = await plugin();
  const format = formatOf(host.scene, host.stage);
  const checked = await checkedScript(video, host);
  const { scenes, over, lengths } = checked;
  const lines = checkedLines(checked);
  log(`${count(scenes.length, "scene")}, ${count(lines.length, "line")}`);
  logDefaults(checked);

  begin("the voices and the compiled scenario");
  const { language, speed, fps, loudness, timing } = video.settings;
  log(`Narration (${lineVoice(video.settings, NARRATOR) ?? "no voice"}, ${LANGUAGES[language]})`);
  const engines = enginesIn(MODELS);
  const voices: Voiced[] = [];
  /** How long each line lasts by itself, seconds, by its line in the file: none for an open one. */
  const own = new Map<number, number>();
  for (const line of lines) {
    if ("sound" in line) {
      if (line.action !== LOOP) own.set(line.line, lengths[line.sound]!);
      log(`  line ${line.line} (${line.who}, ${line.sound}): ${lengths[line.sound]!.toFixed(2)}s${line.action === LOOP ? ", again and again" : ""}`);
      continue;
    }
    if (!("text" in line)) {
      if (line.length !== "open") own.set(line.line, line.length);
      continue;
    }
    // The check has given each said line a voice in the video's language.
    const spokenIn = lineVoice(video.settings, line.who)!;
    const spoken = await speak(engines(spokenIn), TTS_CACHE, { text: line.text, voice: spokenIn, speed });
    log(`  line ${line.line} (${line.who}, ${spokenIn}): ${spoken.duration.toFixed(2)}s ${spoken.cached ? "(cached)" : "(generated)"}`);
    own.set(line.line, spoken.duration);
    // A line begins on a frame, so its mouth is the same wherever it begins.
    const mouth = mouthTrack(await readWav(spoken.file), 0, fps).open;
    voices.push({ file: path.basename(spoken.file), duration: spoken.duration, mouth });
  }
  const file = path.join(video.cache, "compiled.json");
  const from = path.relative(video.cache, video.file).split(path.sep).join("/");
  await mkdir(video.cache, { recursive: true });
  await writeFile(file, compiledText(compile(scenes, voices, { fps, loudness, moves: timing.moves }, from, lengths, over)));
  const compiled = JSON.parse(await readFile(file, "utf8")) as Compiled;
  const seconds = (frames: number) => `${(frames / compiled.fps).toFixed(2)}s`;
  log(`\nCompiled ${video.name}: ${seconds(compiled.frames)}, ${compiled.frames} frames at ${compiled.fps} a second`);
  const parts = [...(over ? [{ what: "over the scenes", lines: compiled.lines!, items: over.items }] : []), ...compiled.scenes.map((scene, i) => ({ what: `scene ${i + 1}, at ${seconds(scene.from)} for ${seconds(scene.frames)}`, lines: scene.lines, items: scenes[i]!.items }))];
  for (const part of parts) {
    log(`  ${part.what}`);
    for (const line of linesIn(part.items)) {
      const written = `${line.who} ${line.action}${"text" in line ? `: ${line.text}` : ""}`;
      const what = `    line ${String(line.line).padEnd(3)} ${written.length > 40 ? `${written.slice(0, 37)}...` : written.padEnd(40)}`;
      const on = part.lines.find((compiled) => compiled.line === line.line);
      if (!on) {
        log(`${what}  not there: ${own.has(line.line) ? "what it is under ends" : "its block ends"} before it begins`);
        continue;
      }
      // A voice or a sound with fewer frames than it needs is cut, and a fitted action has another length than its own.
      // An action that is over at once, in less than a frame, has no speed, and an open one has none either.
      const needs = (own.get(line.line) ?? 0) * compiled.fps;
      const heard = !("values" in line);
      const cut = heard && Math.ceil(needs - 1e-6) > on.frames;
      const fitted = !heard && Math.round(needs) > 0 && Math.round(needs) !== on.frames;
      const loud = "volume" in on && on.volume !== 0 ? `, at ${on.volume}dB` : "";
      const how = !own.has(line.line) ? ", to the end of its block" : cut ? ", cut" : fitted ? `, ${(needs / on.frames).toFixed(2)} times its own speed` : "";
      log(`${what}  at ${seconds(on.from).padStart(7)} for ${seconds(on.frames).padStart(6)}, frames ${on.from} to ${on.from + on.frames - 1}${how}${loud}`);
    }
  }
  log(`  ${shown(file)}`);
  if (fit) return undefined;

  const { clip } = madeFiles(video.cache, video.name, format);
  const size = FORMATS[format];
  const drawKey = keyOf("drawing", pictureOf(compiled), video.library?.raw, await codeKey(video.plugin.file, PLAYING));
  const placed = [...compiledVoices(compiled, TTS_CACHE), ...compiledSounds(compiled, video.plugin.dir)];
  const length = compiled.frames / compiled.fps;
  return {
    fps: compiled.fps,
    loudness: compiled.loudness,
    sound: {
      key: await mixKey(placed, length, compiled.loudness),
      async write(sound) {
        const { gain, lowered, loudness } = await writeMix(placed, length, sound, compiled.loudness);
        if (!Number.isFinite(loudness)) return "nothing is heard: it is silence";
        return `one gain of ${gain.toFixed(1)} dB, to ${loudness.toFixed(1)} LUFS${lowered > 0.05 ? `; its peaks lowered by at most ${lowered.toFixed(1)} dB` : ""}`;
      },
    },
    recorded: false,
    async draw() {
      if (stages.cached("drawing", drawKey, [clip, `${clip}.frames`, `${clip}.svgs`])) return cached(`the clip, ${shown(clip)}`);
      await stages.forget("drawing");
      await host.play({ format, ...size, compiled: file, clip }, video.library, log).catch((e: Error) => {
        throw new Error(`\nStopped: the plugin failed on ${shown(file)}, drawing it: ${e.message}`);
      });
      await stages.made("drawing", drawKey);
    },
    page: () => ({
      picture: { plugin: video.plugin.file },
      video: compiledPage({ dir: video.plugin.dir, name: video.name, compiled, library: video.library, size, format }),
    }),
    build: async () => composeCompiled(ROOT, video, compiled, { file: clip, video: await loadDrawn(clip, compiled.frames, compiled.fps) }, format, path.join(video.cache, "build")),
  };
}

/**
 * A video file's events as they are played: its plan, the voices, and the fit, each from the cache
 * when what it is made from is unchanged (stages.ts), with the request written. Nothing more with
 * `fit`.
 */
async function playPlan(video: VideoFile, fit: boolean, plugin: () => Promise<PluginHost>, { stages, begin, cached, shown }: Making): Promise<Played | undefined> {
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
  const call = async (job: Call, what: string) => {
    const plugin = await host();
    try {
      return await plugin.run({ call: Call.parse(job), file: video.file, source: video.source, library: video.library }, log);
    } catch (e) {
      throw new Error(`\nStopped: the plugin failed on ${shown(video.file)}, ${what}: ${(e as Error).message}`);
    }
  };

  begin("the plan");
  // The plan's format is the stage's, which only the plugin knows, and so are how it pictures, its
  // limits and the files it is made from (plugin.ts, inputs): they are recorded with the plan.
  const planFile = path.join(video.cache, "plan.json");
  // The library without its voices and volumes: a voice changed redoes the voices, not the plan. The files the
  // plugin named last time go in too: one changed makes the plan again, which names them anew.
  const planKeyOf = (inputs: string) => keyOf("plan", video.use, video.source, video.library?.raw, code, inputs);
  let inputs = await inputsKey(video.plugin.dir, (stages.last("plan")?.inputs ?? []) as string[]);
  let planned = stages.cached("plan", planKeyOf(inputs), [planFile]);
  if (planned) cached(`the plan, ${shown(planFile)}`);
  else {
    await stages.forget("plan");
    const { scene, stage, picture } = await host();
    const format = formatOf(scene, stage);
    const done = await call({ step: "data", name: video.name, format, data: planFile }, "writing its plan");
    inputs = await inputsKey(video.plugin.dir, done.inputs);
    const record = { format, picture, repaired: done.repaired, limits: done.limits, inputs: done.inputs };
    await stages.made("plan", planKeyOf(inputs), record);
    planned = { key: planKeyOf(inputs), ...record };
  }
  // What the plugin mended is said every time, from the cache too: the file still holds it.
  const repaired = (planned.repaired ?? []) as string[];
  if (repaired.length > 0) {
    log(`Mended by the plugin, in what it draws (${shown(video.file)} is as written):\n${repaired.map((r) => `  - ${r}`).join("\n")}`);
  }
  const format = planned.format as FormatName;
  const recorded = planned.picture === "recorded";
  const plan = await readClipData(planFile);
  const script = scriptOf(video, plan, (planned.limits ?? {}) as Record<string, EventLimitsScript>);
  const [scene] = script.scenes;
  const loaded: LoadedVideo = { slug: video.name, file: video.file, script };
  const files = madeFiles(video.cache, video.name, format);

  begin("the voices and the fit");
  const unsaid = await unspoken(script);
  if (unsaid) throw new Error(`${video.file}: ${unsaid}`);
  log(`Narration (${voiceOf(script, {}) ?? "no voice"}, ${LANGUAGES[script.language]})`);
  const [spoken] = await narrate(script, enginesIn(MODELS), TTS_CACHE, log);
  const voiced = spoken!.map((l) => [l.text, l.speaker, l.cue, path.basename(l.audioFile), l.duration]);
  const fitKey = keyOf("fit", plan, voiced, script.fps, script.timing);
  // With --fit the fit is shown, from the cache or not.
  if (!fit && stages.cached("fit", fitKey, [files.request])) cached(`the fit, ${shown(files.request)}`);
  else {
    await stages.forget("fit");
    // Each line's voice, read back from the cache, gives the line its mouth track.
    const lines = await Promise.all(spoken!.map(async (line) => ({ ...line, voice: await readWav(line.audioFile) })));
    const { fps, timing } = script;
    const fitted = fitClip(plan.events, plan.duration, lines, { fps, ...timing, ...timing.moves }, scene!.limits);
    await mkdir(path.dirname(files.request), { recursive: true });
    await writeRequest(loaded, files, fitted, plan.duration);
    await stages.made("fit", fitKey);
  }
  if (fit) return undefined;
  // The timeline of the fit: each event where the request puts it, as the drawn clip's data puts it
  // (host.ts), so the sound and the page need no drawing.
  const request = JSON.parse(await readFile(files.request, "utf8")) as ReturnType<typeof requestDocument>;
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  const fitted = new Map<string, SceneClip>([[video.name, { duration: request.duration, events: request.spans.map((s) => ({ name: s.event, at: ms(s.at), span: s.span, natural: s.natural })) }]]);
  const timeline = buildTimeline(script, fitted, [spoken!], log);
  log(`Timeline: ${timeline.duration.toFixed(2)}s at ${timeline.fps} fps`);

  const drawKey = keyOf("drawing", await readFile(files.request, "utf8"), video.use, video.source, video.library?.raw, code, inputs);
  // A drawn clip has its SVGs' hashes beside it, for the page's test; a recorded one, none.
  const drawnFiles = [files.clip, files.data, `${files.clip}.frames`, ...(recorded ? [] : [`${files.clip}.svgs`])];
  const { duration } = timeline;
  const { loudness } = video.settings;
  const placed = timeline.scenes.flatMap((s) => s.lines.map((line) => ({ file: line.audioFile, start: line.start })));
  return {
    fps: script.fps,
    loudness,
    sound: {
      key: keyOf("sound", placed.map(({ file, start }) => [path.basename(file), start]), duration, loudness),
      async write(sound) {
        await writeSound(placed, duration, sound, loudness);
        return undefined;
      },
    },
    recorded,
    async draw() {
      if (stages.cached("drawing", drawKey, drawnFiles)) return cached(`the clip, ${shown(files.clip)}`);
      await stages.forget("drawing");
      await call({ step: "draw", name: video.name, format, ...FORMATS[format], request: files.request, clip: files.clip, data: files.data }, "drawing it");
      await stages.made("drawing", drawKey);
    },
    page: () => ({
      picture: recorded ? { clip: files.clip } : { plugin: video.plugin.file },
      video: pageVideo({ dir: video.plugin.dir, file: video.file, source: video.source, library: video.library, request, size: FORMATS[format], format, timeline }),
    }),
    async build() {
      const clip = await loadClip(files.clip);
      if (!drawnTo(request, clip.data.events, clip.data.duration, script.fps)) {
        throw new Error(`\nStopped: the plugin drew ${shown(files.clip)}, but not to the request.`);
      }
      const clips = new Map<string, SceneClip>([[video.name, { clip, duration: clip.data.duration, events: clip.data.events }]]);
      return compose(ROOT, loaded, clips, timeline, format, path.join(video.cache, "build"));
    },
  };
}

/**
 * `make <file>`: a plugin's video from its one file (AGENTS.md, "A video file"), or with `fit` only
 * what is played (`playPlan`, or `playScript` for a script). Then the sound, and what its outputs
 * turn on, or the one `--as` names: its page, then the video (the drawing, check, and the render
 * with the sound); a recording plugin's drawing comes before its page, which plays the clip. Each
 * stage is taken from the cache when what it is made from is unchanged (stages.ts); the finished
 * files are written every time, and returned. It holds the video's lock (lock.ts) and writes the
 * project's .cache/<name>/ and out/; the plugin runs only for a stage it makes, or a script's check.
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
  log(`Video: ${video.file}${video.profile ? `, profile ${video.profile}` : ""}${video.script ? ", a script" : ""}${opts.fit ? "" : `, as ${as}`}`);
  const steps = opts.fit ? 2 : 3 + (outputs.includes("web") ? 1 : 0) + (outputs.includes("video") ? 3 : 0);
  let step = 0;
  let started: Promise<PluginHost> | undefined;
  const plugin = () => (started ??= startPlugin(video.plugin, log));
  try {
    const making: Making = {
      stages: await stagesIn(video.cache),
      begin: (what) => log(`\n== ${++step}/${steps}: ${what}\n`),
      cached: (what) => log(`From the cache: ${what}`),
      shown: (file) => path.relative(video.plugin.dir, file),
    };
    const played = await (video.script ? playScript : playPlan)(video, opts.fit, plugin, making);
    return played ? await makePlayed(video, outputs, played, making) : [];
  } finally {
    // A plugin that did not start has nothing to close.
    await started?.then((host) => host.close(), () => {});
    await release();
  }
}

/** The stages after what is played, the same for both: the sound, and each of the outputs. */
async function makePlayed(video: VideoFile, outputs: Mode[], played: Played, { stages, begin, cached, shown }: Making): Promise<string[]> {
  // A finished file is shown as it opens from where the command was typed: its project may be another folder.
  const finished = (file: string) => path.relative(CALLER, file);
  const { loudness, recorded } = played;

  begin("the sound");
  const { quality } = video.settings;
  const sound = path.join(video.cache, "sound.m4a");
  if (stages.cached("sound", played.sound.key, [sound])) cached(`the sound, ${shown(sound)}`);
  else {
    await stages.forget("sound");
    log(`Sound: ${video.script ? "what is heard" : "the voices"} mixed at ${loudness} LUFS`);
    const how = await played.sound.write(sound);
    await stages.made("sound", played.sound.key);
    if (how) log(`  ${how}`);
    log(`  ${shown(sound)}`);
  }

  const asVideo = outputs.includes("video");
  // A recorded picture's page plays the clip, so the clip is drawn first: a step of its own when
  // the video follows, else the page's.
  if (recorded && asVideo) {
    begin("the drawing");
    await played.draw();
  }

  const made: string[] = [];
  if (outputs.includes("web")) {
    begin(recorded && !asVideo ? "the drawing and the page" : "the page");
    if (recorded && !asVideo) await played.draw();
    const page = `${video.out}.html`;
    const bytes = await writePage(ROOT, { title: video.name, language: video.settings.language, source: shown(video.file).split(path.sep).join("/"), ...played.page(), sound, out: page });
    log(`Page: ${finished(page)}, ${(bytes / 1e6).toFixed(1)} MB`);
    made.push(page);
  }
  if (!asVideo) return made;

  if (!recorded) {
    begin("the drawing");
    await played.draw();
  }

  begin("check");
  const project = await played.build();
  // What HyperFrames reads: the build but its own folder and the renders, and HyperFrames itself.
  const built = await folderKey(project, (rel) => rel.startsWith(".hyperframes/") || rel.startsWith("renders/"));
  const buildKey = keyOf("build", built, HYPERFRAMES);
  if (stages.cached("check", buildKey)) cached("check, passed on this build");
  else {
    await stages.forget("check");
    log(`\nCheck (${path.basename(project)})`);
    if ((await hyperframes(ROOT, project, ["check"], { fold: true })) !== 0) throw new Error("\nStopped: check found errors (above).");
    await stages.made("check", buildKey);
  }

  begin("the video");
  const rendered = path.join(video.cache, "render.mp4");
  const renderKey = keyOf("render", buildKey, quality, played.fps);
  if (stages.cached("render", renderKey, [rendered])) cached(`the render, ${shown(rendered)}`);
  else {
    await stages.forget("render");
    log(`Render (${quality})`);
    await renderProject(ROOT, project, rendered, { fps: played.fps, draft: quality === "draft" });
    await stages.made("render", renderKey);
  }
  // The render's picture, with the one sound: the page plays the same.
  await muxSound(rendered, sound, `${video.out}.mp4`);
  log(`Video: ${finished(`${video.out}.mp4`)}, the render's picture with the sound`);
  return [...made, `${video.out}.mp4`];
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      fit: { type: "boolean", default: false },
      profile: { type: "string" },
      as: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) return log(HELP);
  if (command !== "make" && (values.fit || values.profile !== undefined || values.as !== undefined)) {
    throw new Error("--fit, --profile and --as are for make");
  }
  if (command === "setup") return setup(ROOT, CACHE, log);

  if (command === "voices") {
    ready(ROOT, CACHE, ["voice"]);
    const engines = enginesIn(MODELS);
    const dir = path.join(ROOT, "out", "voice-samples");
    await mkdir(dir, { recursive: true });
    const voices = await toolVoices();
    log("All voices, by language:");
    for (const language of new Set(voices.map((v) => v.language))) log(`  ${language}: ${voices.filter((v) => v.language === language).map((v) => v.name).join(", ")}`);
    // A few of Kokoro's, and each of the others, saying the text given, or a sample in its own language.
    const sampled = ["af_heart", "af_bella", "af_nicole", "am_michael", "am_fenrir", "am_puck", "bf_emma", "bm_george", "bm_fable"];
    const samples: Record<string, string> = {
      en: "This is a sample of my voice, so you can pick the one you like.",
      uk: "Це зразок мого голосу, щоб ви могли вибрати той, який вам до вподоби.",
      ru: "Это образец моего голоса, чтобы вы могли выбрать тот, который вам нравится.",
    };
    for (const { name, language } of voices.filter((v) => !v.language.startsWith("en-") || sampled.includes(v.name))) {
      const spoken = await speak(engines(name), TTS_CACHE, { text: arg ?? samples[language.slice(0, 2)]!, voice: name, speed: 1 });
      await copyFile(spoken.file, path.join(dir, `${name}.wav`));
      log(`  ${name}.wav ${spoken.cached ? "(cached)" : "(generated)"}`);
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

  if (command === "check") {
    if (!arg?.endsWith(".yaml")) throw new Error(`"check" needs a video: its file, <name>.yaml, e.g. npm run -s video -- check videos/hello.yaml`);
    return checkFile(path.resolve(CALLER, arg));
  }

  if (command !== "make") throw new Error(`Unknown command "${command}"\n\n${HELP}`);
  if (!arg?.endsWith(".yaml")) throw new Error(`"make" needs a video: its file, <name>.yaml, e.g. npm run video -- make videos/hello.yaml`);
  if (values.as !== undefined && !(MODES as readonly string[]).includes(values.as)) throw new Error(`--as ${values.as}: it is ${MODES.join(" (the default) or ")} (a web page)`);
  if (values.as !== undefined && values.fit) throw new Error("--fit stops before either mode: leave out --as");
  // A video file's needs are its outputs': make checks them once it has read the file.
  await makeFile(path.resolve(CALLER, arg), { fit: values.fit, profile: values.profile, as: values.as as Mode | undefined });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
