// The prompt (AGENTS.md, "prompt"): a story, wrapped in what a web chat needs to write its
// episodes' files with no tools and no files of its own, in the language the episodes are to be
// in. The tool's part says what the reply is (a YAML block per episode, named, and what to do on
// "continue"); then the format: for a plugin whose videos are written as scripts, the guide to a
// script (guide.ts), else the plugin's guide (host.ts, Described) with its commands, each
// described once, in English alone; then the library as written, the voices of the language and
// the story. Its words are here in English, and in guide-uk.ts and guide-ru.ts in Ukrainian and
// Russian. import.ts reads the reply.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { guideOf } from "./guide.ts";
import { PROMPT_RU } from "./guide-ru.ts";
import { PROMPT_UK } from "./guide-uk.ts";
import type { Described } from "./host.ts";
import { pluginOf, startPlugin } from "./make.ts";
import { LANGUAGES, slug, voiceIn, type Language } from "./script.ts";
import { spokenIn, toolVoices, type Voice } from "./tts.ts";
import { readProject } from "./video-file.ts";

/** What the prompt says in one language, beside the guide (guide.ts, GuideWords). */
export interface PromptWords {
  /** The line a reply ends with once every episode is in it: import looks for it, in any language, to tell a reply cut off between two blocks. */
  allWritten: string;
  /** The word the user tells a chat whose reply is cut off. */
  goOn: string;
  title: string;
  /** What the task is, and what the tool refuses: `library` when the project has one. */
  task: (library: boolean) => string;
  reply: { heading: string; is: string };
  /** The comments of the reply's skeleton: the episode's name, the library's part, a new character's name (in a language whose words are not in Latin letters) and voice, the episode's language, and the episode. */
  skeleton: { name: string; library: string; newName?: string; voice: string; language: string; episode: string };
  /** The rules of a reply. `story` is the episodes' name, `all` the line a reply ends with, `goOn` the word for a reply cut off. */
  rules: { names: (story: string) => string; length: string; library: string; newVoice: string; ended: (all: string) => string; cut: (goOn: string) => string; refused: string };
  library: { heading: string; is: string };
  /** The voices: what the list is, the narrator's name in it, and each voice's group. */
  voices: { heading: string; are: string; narrator: string; group: (voice: Voice) => string };
  story: { heading: string; is: string };
}

/** Kokoro's two Englishes, by their code. */
const ENGLISHES: Record<string, string> = { "en-us": "American English", "en-gb": "British English" };

/** The prompt's words in English. */
export const PROMPT_EN: PromptWords = {
  allWritten: "All episodes written.",
  goOn: "continue",
  title: "Videos from a story",
  task: (lib) =>
    `You will turn the story at the end of this message into short videos, called episodes. Write each episode as a file in the format below. A tool on my computer makes the video from the file with no AI: a voice on the machine says the lines, and the picture is drawn as the file says. So the tool takes only what the format has. A key it does not know, ${lib ? "a name the library lacks " : ""}or a voice that is not in the list is refused, and I send you back why.`,
  reply: { heading: "Your reply", is: "Reply with one YAML block per episode, in the story's order:" },
  skeleton: {
    name: "the episode's name",
    library: "only what the library below lacks, in its format; leave it out when it lacks nothing",
    voice: "a voice from the list below",
    language: "the episode's language",
    episode: "the episode, in the format below",
  },
  rules: {
    names: (story) => `Name the episodes ${story}-1, ${story}-2, and so on. If the whole story is one episode, name it ${story}.`,
    length: "An episode lasts one to three minutes: about 10 to 30 lines. Split a longer story where it turns, so that each episode begins and ends at a good place and can be watched on its own.",
    library: "Name what the library has, and never draw it again. Draw what it lacks under `library:`, in the first episode that has it; later episodes only name it.",
    newVoice: "Give each new character a voice from the list below that nobody has yet, and that suits it. If none that suits it is free, give it the voice of a character of the library who is in none of its episodes.",
    ended: (all) => `After the last block, write the line "${all}" Then say, in a few lines, what of the story you left out.`,
    cut: (goOn) => `If your reply is cut off, I will say "${goOn}". Then begin again with the block of the episode that was cut off, whole, and go on.`,
    refused: "If I send you what the tool refused, reply with the blocks it names, each whole and mended.",
  },
  library: { heading: "The library", is: "What the episodes name. A character's `voice` is the voice its lines are said in." },
  voices: {
    heading: "The voices",
    are: "The voices, by group. In each, first those nobody has, the best first, then those somebody has, each with who has it.",
    narrator: "the narrator",
    group: (voice) => `${ENGLISHES[voice.language] ?? voice.language}, ${voice.gender === "Female" ? "women" : "men"}`,
  },
  story: { heading: "The story", is: "The story is everything below, to the end of this message." },
};

/** The prompt's words in each language the tool writes it in. */
export const PROMPT_WORDS: Record<Language, PromptWords> = { en: PROMPT_EN, uk: PROMPT_UK, ru: PROMPT_RU };

/** The line a reply in English ends with. */
export const ALL_WRITTEN = PROMPT_EN.allWritten;

/** Whether a text says, in any of the tool's languages, that every episode is written: the line, whatever its case and with or without its full stop. */
export const saysAllWritten = (text: string): boolean => Object.values(PROMPT_WORDS).some(({ allWritten }) => text.toLowerCase().includes(allWritten.toLowerCase().replace(/\.$/, "")));

/** The name a story's episodes are named after, in a language: the story's own in English, and with the language's code after it in another (`forest1-uk`), so the two are told apart. */
export const episodesOf = (story: string, language: Language): string => (language === "en" ? story : `${story}-${language}`);

export interface PromptParts {
  /** The episodes' name: the story's, in English, else with the language's code (episodesOf). */
  story: string;
  /** The language the episodes are to be in: the prompt is written in it. */
  language: Language;
  /** The story, as written. */
  text: string;
  plugin: Pick<Described, "scene" | "guide" | "commands" | "script">;
  /** library.yaml as written; none when the project has none. */
  library: string | undefined;
  /** The narrator's voice, the project's `voice`: a line no character says is said in it. None when it has none in the episodes' language. */
  narrator: string | undefined;
  /** The library's characters' voices in the episodes' language, by name. */
  cast: Record<string, string>;
  /** The voices the tool speaks in, in the episodes' language. */
  voices: Voice[];
}

/** A command's example as it is written in a source: `walk: { who: pip, to: middle }`. */
const written = (name: string, example: unknown) => `${name}: ${stringify(example, { collectionStyle: "flow" }).trim()}`;

/** Kokoro's grade as a number to sort by, best first: A+ before A before A-, then B. A voice with none keeps its place. */
const rank = (grade: string | undefined) => (grade === undefined ? 0 : (grade.charCodeAt(0) - 65) * 3 + (grade[1] === "+" ? 0 : grade[1] === "-" ? 2 : 1));

/** The voices by group: in each, those nobody has, best first, then those somebody has, best first, each with who has it. */
function voiceList(voices: Voice[], owners: Map<string, string[]>, words: PromptWords): string[] {
  const groups = Map.groupBy(voices, (voice) => words.voices.group(voice));
  const best = (list: Voice[]) => list.toSorted((a, b) => rank(a.grade) - rank(b.grade));
  return [...groups].map(([group, list]) => {
    const free = best(list.filter((voice) => !owners.has(voice.name))).map((voice) => voice.name);
    const taken = best(list.filter((voice) => owners.has(voice.name))).map((voice) => `${voice.name} (${owners.get(voice.name)!.join(", ")})`);
    return `- ${group}: ${[...free, ...taken].join(", ")}`;
  });
}

/** The voices a prompt offers: the tool's, of the episodes' language. */
export const promptVoices = async (language: Language): Promise<Voice[]> => (await toolVoices()).filter((voice) => spokenIn(voice) === language);

/**
 * The prompt for one story, in Markdown, in the episodes' language: the tool's part, the plugin's,
 * the library, the voices, the story. A plugin whose videos are no scripts writes its part in
 * English alone, so its prompt is in English.
 */
export function promptOf(p: PromptParts): string {
  const { story, plugin, language } = p;
  if (language !== "en" && !plugin.script) {
    throw new Error(`the plugin's videos are not written as scripts, and its guide and commands are in English alone: a prompt in ${LANGUAGES[language]} is for a plugin with a script, in that language`);
  }
  const words = PROMPT_WORDS[language];
  const lib = p.library !== undefined;
  // Who has each voice: the narrator first, then the library's characters, in its order.
  const owners = new Map<string, string[]>();
  const had: [string, string][] = [...(p.narrator ? [[words.voices.narrator, p.narrator] as [string, string]] : []), ...Object.entries(p.cast)];
  for (const [who, voice] of had) owners.set(voice, [...(owners.get(voice) ?? []), who]);
  // The reply's skeleton, each line with what it is, the comments in a column.
  const { skeleton } = words;
  const lines: [string, string?][] = [
    [`episode: ${story}-1`, skeleton.name],
    ...(lib
      ? ([
          ["library:", skeleton.library],
          ["  characters:"],
          ["    <new-name>:", skeleton.newName],
          ["      voice: <voice>", skeleton.voice],
          ["      ..."],
        ] as [string, string?][])
      : []),
    [`use: ${plugin.scene}`],
    // An episode in English needs no line of its language, as English is the default.
    ...(language === "en" ? [] : ([[`language: ${language}`, skeleton.language]] as [string, string?][])),
    ["...", skeleton.episode],
  ];
  const width = Math.max(...lines.map(([code]) => code.length)) + 2;
  const block = ["```yaml", ...lines.map(([code, note]) => (note ? `${code.padEnd(width)}# ${note}` : code)), "```"];
  const commands = Object.entries(plugin.commands ?? {}).map(([name, { description, example }]) => `- **${name}**: ${description} For example: \`${written(name, example)}\``);
  const { rules } = words;
  return [
    `# ${words.title}`,
    "",
    words.task(lib),
    "",
    `## ${words.reply.heading}`,
    "",
    words.reply.is,
    "",
    ...block,
    "",
    `- ${rules.names(story)}`,
    `- ${rules.length}`,
    ...(lib ? [`- ${rules.library}`, `- ${rules.newVoice}`] : []),
    `- ${rules.ended(words.allWritten)}`,
    `- ${rules.cut(words.goOn)}`,
    `- ${rules.refused}`,
    "",
    // A plugin with a script is taught scripts alone: its plan's part, if it has one, is not.
    ...(plugin.script
      ? [guideOf(plugin.script, language).trim(), ""]
      : ["## The format", "", (plugin.guide ?? "").trim(), "", "## The commands", "", ...(commands.length > 0 ? commands : ["The format has no commands."]), ""]),
    ...(lib ? [`## ${words.library.heading}`, "", words.library.is, "", "```yaml", p.library!.trimEnd(), "```", ""] : []),
    `## ${words.voices.heading}`,
    "",
    words.voices.are,
    "",
    ...voiceList(p.voices, owners, words),
    "",
    `## ${words.story.heading}`,
    "",
    words.story.is,
    "",
    p.text.trim(),
    "",
  ].join("\n");
}

/** A story's name, its file's: `stories/forest1.md` is forest1. Throws when the file is no story. */
export function storyOf(file: string, also = ""): string {
  const name = slug.safeParse(path.basename(file).replace(/\.md$/, ""));
  if (!file.endsWith(".md") || !name.success) throw new Error(`${file}: a story is <name>.md, its name in lowercase letters, digits and dashes${also}: it names the episodes`);
  return name.data;
}

/**
 * The prompt for a story file, `stories/<name>.md` in a project with a plugin, for its episodes in
 * `language`: the plugin is started for its guide and commands, and closed. Nothing is written; the
 * log says what was read.
 */
export async function promptFor(file: string, language: Language, log: (msg: string) => void): Promise<string> {
  const name = storyOf(file);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`No story at ${file}`);
  }
  const plugin = await pluginOf(file);
  if (!plugin) throw new Error(`${file}: no package.json above it names a plugin ("ai-videos": { "plugin" }), and the prompt is a plugin's`);
  const project = await readProject(plugin);
  const voices = await promptVoices(language);
  // A voice of the episodes' language, of those given: none when it has none in it.
  const inLanguage = (given: Parameters<typeof voiceIn>[0]) => {
    const voice = voiceIn(given, language);
    return voices.some((one) => one.name === voice) ? voice : undefined;
  };
  const host = await startPlugin(plugin, log);
  try {
    log(`Story: ${file}${project.libraryFile ? `; library: ${project.libraryFile.file}` : ""}; the episodes in ${LANGUAGES[language]}`);
    return promptOf({
      story: episodesOf(name, language),
      language,
      text,
      plugin: host,
      library: project.libraryFile?.text,
      narrator: inLanguage(project.settings.voice),
      cast: Object.fromEntries(
        Object.entries(project.settings.cast).flatMap(([who, given]) => {
          const voice = inLanguage(given);
          return voice === undefined ? [] : [[who, voice]];
        }),
      ),
      voices,
    });
  } finally {
    host.close();
  }
}
