// The check of a video written as a script (AGENTS.md, "A script"), the only pass that refuses, as
// `check`, `make` and `import` run it: the tool's and the plugin's (scenario.ts), then each speaker's
// voice one the tool speaks in, in the video's language, known with no model on the disk, its words
// none in Cyrillic letters when that language is English, each stress they mark a vowel's, and each
// sound that is played a file that ffmpeg reads. A plan's lines have the same voice check (unspoken).
import path from "node:path";
import type { PluginHost } from "./make.ts";
import { listed } from "./names.ts";
import { NARRATOR, linesIn, type Checked, type CheckedLine, type Issue } from "./scenario.ts";
import { LANGUAGES, voiceIn, type VideoScript, type Voices } from "./script.ts";
import { measureSound } from "./sound.ts";
import { STRESS, mismarked } from "./stress.ts";
import { spokenIn, toolVoices, type Voice } from "./tts.ts";
import { LIBRARY_FILE, type VideoFile } from "./video-file.ts";

/** A video's voices: the narrator's, the cast's, and the language its lines are said in. */
type Voicing = Pick<VideoScript, "voice" | "cast" | "language">;

/** The voices `who` is given, as written: a speaker's in the cast, the narrator's (and one the cast lacks) the video's. */
const givenTo = (video: Voicing, who: string): Voices => (who !== NARRATOR && Object.hasOwn(video.cast, who) ? video.cast[who]! : video.voice);

/** The voice a script's line by `who` is said in (voiceOf). None when it has none in the video's language. */
export const lineVoice = (video: Voicing, who: string): string | undefined => voiceIn(givenTo(video, who), video.language);

/**
 * Why a line by `who` cannot be said in the video's language, and a hint, or nothing when it can: its
 * speaker has no voice in that language, or one that is none of the tool's, or of another language.
 */
function unsayable(video: Voicing, who: string, voices: Voice[]): { wrong: string; hint: string } | undefined {
  const { language } = video;
  const name = LANGUAGES[language];
  const given = givenTo(video, who);
  const voice = voiceIn(given, language);
  const known = voices.find((one) => one.name === voice);
  const wrong =
    voice === undefined ? `has no voice in ${name}`
    : !known ? `speaks in ${voice}, which is not one of the tool's voices`
    : spokenIn(known) !== language ? `speaks in ${voice}, which is ${LANGUAGES[spokenIn(known)]}, and the video is in ${name} (language: ${language})`
    : undefined;
  if (!wrong) return undefined;
  // Its voices in other languages, which stay beside the one it is given.
  const own = typeof given === "string" ? (known ? { [spokenIn(known)]: given } : {}) : given;
  const others = Object.entries(own).filter(([its, one]) => its !== language && voices.some((v) => v.name === one && spokenIn(v) === its));
  const where = who === NARRATOR ? `the video's voice, in package.json's "ai-videos" or in the file` : `under it in ${LIBRARY_FILE}, or in the file's cast`;
  const beside = others.length === 0 ? "" : `, beside its others: voice: { ${[...others.map(([its, one]) => `${its}: ${one}`), `${language}: …`].join(", ")} }`;
  const names = voices.filter((one) => spokenIn(one) === language).map((one) => one.name);
  return { wrong, hint: `give ${who === NARRATOR ? `the ${NARRATOR}` : who} a voice in ${name}, ${where}${beside}; the ${name} voices are ${listed(names)}` };
}

/**
 * Why a line's words cannot be said in an English voice, or nothing: they are in Cyrillic letters,
 * which no English voice reads. So a video in Ukrainian or Russian that does not say its language,
 * and is English by default, is refused, not said as gibberish.
 */
function unreadable(video: Voicing, text: string): { wrong: string; hint: string } | undefined {
  if (video.language !== "en" || !/\p{Script=Cyrillic}/u.test(text)) return undefined;
  const others = Object.entries(LANGUAGES).filter(([code]) => code !== "en");
  return {
    wrong: "says it in Cyrillic letters, which no English voice reads, and the video is in English: it says no other language",
    hint: `a video in ${listed(others.map(([, name]) => name), "or")} says so on top, beside use: ${listed(others.map(([code]) => `language: ${code}`), "or")}; else write the line in English`,
  };
}

/**
 * Why a line's words mark a stress that is none, or nothing: a word of Ukrainian or Russian whose
 * mark is not right after a vowel (stress.ts). The voice would read it as it could, and the captions
 * would show it.
 */
function unstressable(text: string): { wrong: string; hint: string } | undefined {
  const word = mismarked(text);
  if (word === undefined) return undefined;
  return {
    wrong: `has a stress mark in "${word}" that is not right after a vowel`,
    hint: `a word's stress is an acute (U+0301) right after its stressed vowel, one for a stress: за${STRESS}мок`,
  };
}

/** Why a line's words cannot be said as written, in the video's language, or nothing. */
const unwritable = (video: Voicing, text: string) => unreadable(video, text) ?? unstressable(text);

/** The first line of a plan's script that cannot be said in its speaker's voice, as a mistake to throw; nothing when each can. */
export async function unspoken(script: VideoScript): Promise<string | undefined> {
  const voices = await toolVoices();
  for (const line of script.scenes.flatMap((scene) => scene.narration)) {
    const who = line.speaker ?? NARRATOR;
    const why = unsayable(script, who, voices) ?? unwritable(script, line.text);
    if (why) return `"${line.text}" is said by ${who === NARRATOR ? `the ${NARRATOR}` : who}, who ${why.wrong}: ${why.hint}`;
  }
  return undefined;
}

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
  const voices = await toolVoices();
  const unsaid = checked.scenes.flatMap((scene) => linesIn(scene.items)).flatMap((line): Issue[] => {
    const why = "text" in line ? (unsayable(video.settings, line.who, voices) ?? unwritable(video.settings, line.text)) : undefined;
    return why ? [{ line: line.line, message: `${line.who === NARRATOR ? `the ${NARRATOR}` : line.who} ${why.wrong}`, hint: why.hint }] : [];
  });
  const { lengths, issues } = await measured(checkedLines(checked), video.plugin.dir);
  if (unsaid.length + issues.length > 0) return { issues: [...unsaid, ...issues] };
  return { ...checked, lengths };
}
