// The check of a video written as a script (AGENTS.md, "A script"), the only pass that refuses, as
// `check`, `make` and `import` run it: the tool's and the plugin's (scenario.ts), then each speaker's
// voice one the tool speaks in, known with no model on the disk, and each sound that is played a
// file that ffmpeg reads.
import path from "node:path";
import type { PluginHost } from "./make.ts";
import { NARRATOR, linesIn, type Checked, type CheckedLine, type Issue } from "./scenario.ts";
import { voiceOf } from "./script.ts";
import { measureSound } from "./sound.ts";
import { kokoroVoices } from "./tts.ts";
import { LIBRARY_FILE, type VideoFile } from "./video-file.ts";

/** A script checked: the scenario worked out, the defaults it takes, and how long each sound it plays lasts, seconds, by its file. */
export type CheckedScript = Extract<Checked, { scenes: unknown }> & { lengths: Record<string, number> };

/** The lines of a checked script, the cartoon's own first. */
export const checkedLines = ({ over, scenes }: Pick<CheckedScript, "over" | "scenes">): CheckedLine[] => [...(over ? [over] : []), ...scenes].flatMap(({ items }) => linesIn(items));

/** The sounds that lines play, each file measured once: how long it lasts, seconds, or a mistake of the lines that play it. */
async function measured(lines: CheckedLine[], dir: string): Promise<{ lengths: Record<string, number>; issues: Issue[] }> {
  const played = Map.groupBy(
    lines.filter((line) => "sound" in line),
    ({ sound }) => sound,
  );
  const lengths: Record<string, number> = {};
  const issues: Issue[] = [];
  for (const [sound, [first, ...others]] of played) {
    const length = await measureSound(path.resolve(dir, sound));
    if (typeof length === "number") lengths[sound] = length;
    else {
      const { line, who } = first!;
      const also = others.length > 0 ? { also: others.map((one) => one.line) } : {};
      const message = length === "missing" ? `there is no file ${sound}, which ${LIBRARY_FILE} has for ${who}` : `${sound}, which ${LIBRARY_FILE} has for ${who}, holds no sound that ffmpeg reads`;
      issues.push({ line, ...also, message, hint: `${length === "missing" ? "put it there" : "put a sound there"}, a path from the folder of ${LIBRARY_FILE}, or give ${who} another file` });
    }
  }
  return { lengths, issues };
}

/**
 * A video file written as a script (`video.script`), checked by the tool, by its plugin in `host`,
 * then its voices and its sounds' files: the scenario worked out, with the defaults it takes, or
 * every mistake of the first pass that has one, each with its line of the file and a hint.
 */
export async function checkScript(video: VideoFile, host: PluginHost): Promise<CheckedScript | { issues: Issue[] }> {
  const checked = await host.checkScript(video.file, video.script!, video.library, Object.keys(video.settings.cast), video.settings.timing, video.volumes, video.sounds);
  if ("issues" in checked) return checked;
  const voices = new Set((await kokoroVoices()).map((voice) => voice.name));
  const unspoken = checked.scenes.flatMap((scene) => linesIn(scene.items)).flatMap((line): Issue[] => {
    if (!("text" in line)) return [];
    const voice = voiceOf(video.settings, line.who === NARRATOR ? {} : { speaker: line.who });
    if (voices.has(voice)) return [];
    const home = line.who === NARRATOR ? `the ${NARRATOR}'s voice is the video's, voice:` : `${line.who}'s voice is in ${LIBRARY_FILE}, or the file's cast:`;
    return [{ line: line.line, message: `${line.who} speaks in ${voice}, which is not one of the tool's voices`, hint: `${home} give one that npm run -s video -- voices lists` }];
  });
  const { lengths, issues } = await measured(checkedLines(checked), video.plugin.dir);
  if (unspoken.length + issues.length > 0) return { issues: [...unspoken, ...issues] };
  return { ...checked, lengths };
}
