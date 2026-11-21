// `new`: a video's first script, from its clip's own texts (AGENTS.md, "new"). It runs step one
// only, the plugin's or the maker's, so it needs no voice and no Chrome, and no AI: the lines are the texts.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { madeFiles, readClipData, type ClipJson } from "./clip.ts";
import { makerDrawer, pluginDrawer, pluginOf, type Drawer } from "./make.ts";
import { MakerCall } from "./maker.ts";
import { FORMATS, PROJECT_FILE, ProjectFile, readProject, slug, videoName, type FormatName } from "./script.ts";

/**
 * A line per text, cued to the event it begins at: the last one at or before its `from` (the first
 * event is at 0, so there is always one). In the clip's time order, so no cue goes back. A text
 * with a speaker gives the line its speaker, written first, as in a play.
 */
export function linesOf(data: ClipJson): { speaker?: string; text: string; cue: string }[] {
  return data.texts
    .toSorted((a, b) => a.from - b.from)
    .map(({ text, speaker, from }) => {
      // A millisecond's slack, for a maker that rounds an event's time and its text's apart.
      const event = data.events.findLast((e) => e.at <= from + 1e-3)!;
      return { ...(speaker ? { speaker } : {}), text, cue: event.name };
    });
}

const HEADER = `# The first script, written by \`new\` from the clip's own texts: a line each, cued to the event it
# begins at. The voice, formats and loudness are the project file's, beside this folder; a setting
# written here overrides it. A line's speaker takes its voice from the cast there; a line with none
# is said in the project's voice. After changing a line, \`make <this folder> --fit\` tries the timing.
`;

/**
 * Writes the first video.yaml of the video folder `dir` (made if missing), never over one: a made
 * clip, `make` the folder's name or the one given, and its texts as the narration. The settings are
 * left to the project file. Returns the file written.
 */
export async function newVideo(dir: string, opts: { make?: string; format?: string }, log: (msg: string) => void): Promise<string> {
  const file = path.join(dir, "video.yaml");
  if (existsSync(file)) throw new Error(`${file} is there already: new writes a video's first script, never over one`);
  const title = videoName(dir);
  const name = opts.make ?? title;
  // The scene is named after what it draws, and the scene's id names its files.
  if (!slug.safeParse(name).success) throw new Error(`--make ${name}: use lowercase letters, digits and dashes, a letter first`);
  const sources = path.dirname(path.resolve(dir));
  const project = await readProject(sources);
  const plugin = await pluginOf(dir);
  let drawer: Drawer;
  if (plugin) drawer = pluginDrawer(plugin, project, sources);
  else {
    if (!project) throw new Error(`No ${PROJECT_FILE} beside ${dir} to name the maker that draws its clip`);
    if (!project.script.maker) throw new Error(`${project.file} names no maker to draw ${dir}'s clip`);
    drawer = makerDrawer({ maker: project.script.maker, dir: project.dir });
  }
  const format = opts.format ?? (project?.script ?? ProjectFile.parse({})).formats[0]!;
  if (!(format in FORMATS)) throw new Error(`Unknown format "${format}"`);

  // Step one alone: the texts and events, at the clip's own pace. make writes the same file again.
  const call = MakerCall.parse({ step: "data", name, format, data: madeFiles(path.resolve(dir), name, format as FormatName).data });
  await mkdir(path.dirname(call.data), { recursive: true });
  let failed: string | undefined;
  try {
    failed = await drawer.run(call, log);
  } finally {
    drawer.close();
  }
  if (failed !== undefined) throw new Error(`\nStopped: the ${drawer.kind} failed writing "${name}"'s data (${format})${failed}`);
  const narration = linesOf(await readClipData(call.data));
  if (narration.length === 0) throw new Error(`${call.data} holds no text, so there is no line to write: write the video.yaml by hand`);

  const script = { title, scenes: [{ id: name, scene: "clip", make: name, narration }] };
  // No folding: a line stays one line, as it is said.
  await writeFile(file, HEADER + stringify(script, { lineWidth: 0 }));
  log(`${file}: ${narration.length} lines, cued to ${narration.map((l) => l.cue).join(", ")}`);
  // make refuses a speaker with no voice; said here, the cast is filled in before the first make.
  const cast = project?.script.cast ?? {};
  const voiceless = [...new Set(narration.flatMap((l) => (l.speaker && !Object.hasOwn(cast, l.speaker) ? [l.speaker] : [])))];
  if (voiceless.length) log(`  no voice yet for ${voiceless.join(", ")}: give each one under cast: in ${project?.file ?? path.join(sources, PROJECT_FILE)}`);
  return file;
}
