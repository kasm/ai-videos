// The prompt (AGENTS.md, "prompt"): a story, wrapped in what a web chat needs to write its
// episodes' files with no tools and no files of its own. The tool's part says what the reply is
// (a YAML block per episode, named, and what to do on "continue"); then the format: for a plugin
// whose videos are written as scripts, the guide to a script (guide.ts), else the plugin's guide
// (host.ts, Described) with its commands, each described once; then the library as written, the
// voices and the story. import.ts reads the reply.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { guideOf } from "./guide.ts";
import type { Described } from "./host.ts";
import { pluginOf, startPlugin } from "./make.ts";
import { slug, voiceIn } from "./script.ts";
import { toolVoices, type Voice } from "./tts.ts";
import { readProject } from "./video-file.ts";

/** The line a reply ends with once every episode is in it: import looks for it, to tell a reply cut off between two blocks. */
export const ALL_WRITTEN = "All episodes written.";

export interface PromptParts {
  /** The story's name, its file's: it names the episodes. */
  story: string;
  /** The story, as written. */
  text: string;
  plugin: Pick<Described, "scene" | "guide" | "commands" | "script">;
  /** library.yaml as written; none when the project has none. */
  library: string | undefined;
  /** The narrator's voice, the project's `voice`: a line no character says is said in it. None when it has none in the episodes' language. */
  narrator: string | undefined;
  /** The library's characters' voices in the episodes' language, by name. */
  cast: Record<string, string>;
  /** The voices the tool speaks in. */
  voices: Voice[];
}

/** A command's example as it is written in a source: `walk: { who: pip, to: middle }`. */
const written = (name: string, example: unknown) => `${name}: ${stringify(example, { collectionStyle: "flow" }).trim()}`;

/** Kokoro's grade as a number to sort by, best first: A+ before A before A-, then B. A voice with none keeps its place. */
const rank = (grade: string | undefined) => (grade === undefined ? 0 : (grade.charCodeAt(0) - 65) * 3 + (grade[1] === "+" ? 0 : grade[1] === "-" ? 2 : 1));

const LANGUAGES: Record<string, string> = { "en-us": "American English", "en-gb": "British English" };

/** The voices nobody has yet, grouped by English and gender, best first in each group. */
function freeVoices(voices: Voice[], taken: Set<string>): string[] {
  const groups = new Map<string, Voice[]>();
  for (const voice of voices.filter((v) => !taken.has(v.name))) {
    const group = `${LANGUAGES[voice.language] ?? voice.language}, ${voice.gender === "Female" ? "women" : "men"}`;
    groups.set(group, [...(groups.get(group) ?? []), voice]);
  }
  return [...groups].map(([group, list]) => `- ${group}: ${list.toSorted((a, b) => rank(a.grade) - rank(b.grade)).map((v) => v.name).join(", ")}`);
}

/** The voices a prompt offers: the tool's English ones, as its episodes are in English. */
export const promptVoices = async (): Promise<Voice[]> => (await toolVoices()).filter((voice) => voice.language.startsWith("en-"));

/** The prompt for one story, in Markdown: the tool's part, the plugin's, the library, the voices, the story. */
export function promptOf(p: PromptParts): string {
  const { story, plugin } = p;
  const lib = p.library !== undefined;
  const cast = Object.entries(p.cast);
  const taken = new Set([...(p.narrator ? [p.narrator] : []), ...cast.map(([, voice]) => voice)]);
  // The reply's skeleton, each line with what it is, the comments in a column.
  const lines: [string, string?][] = [
    [`episode: ${story}-1`, "the episode's name"],
    ...(lib
      ? ([
          ["library:", "only what the library below lacks, in its format; leave it out when it lacks nothing"],
          ["  characters:"],
          ["    <new-name>:"],
          ["      voice: <voice>", "a voice from the list below"],
          ["      ..."],
        ] as [string, string?][])
      : []),
    [`use: ${plugin.scene}`],
    ["...", "the episode, in the format below"],
  ];
  const width = Math.max(...lines.map(([code]) => code.length)) + 2;
  const block = ["```yaml", ...lines.map(([code, note]) => (note ? `${code.padEnd(width)}# ${note}` : code)), "```"];
  const commands = Object.entries(plugin.commands ?? {}).map(([name, { description, example }]) => `- **${name}**: ${description} For example: \`${written(name, example)}\``);
  return [
    "# Videos from a story",
    "",
    `You will turn the story at the end of this message into short videos, called episodes. Write each episode as a file in the format below. A tool on my computer makes the video from the file with no AI: a voice on the machine says the lines, and the picture is drawn as the file says. So the tool takes only what the format has. A key it does not know, ${lib ? "a name the library lacks " : ""}or a voice that is not in the list is refused, and I send you back why.`,
    "",
    "## Your reply",
    "",
    "Reply with one YAML block per episode, in the story's order:",
    "",
    ...block,
    "",
    `- Name the episodes ${story}-1, ${story}-2, and so on. If the whole story is one episode, name it ${story}.`,
    "- An episode lasts one to three minutes: about 10 to 30 lines. Split a longer story where it turns, so that each episode begins and ends at a good place and can be watched on its own.",
    ...(lib
      ? [
          "- Name what the library has, and never draw it again. Draw what it lacks under `library:`, in the first episode that has it; later episodes only name it.",
          "- Give each new character a voice from the list below that no character has yet, and that suits it.",
        ]
      : []),
    `- After the last block, write the line "${ALL_WRITTEN}" Then say, in a few lines, what of the story you left out.`,
    '- If your reply is cut off, I will say "continue". Then begin again with the block of the episode that was cut off, whole, and go on.',
    "- If I send you what the tool refused, reply with the blocks it names, each whole and mended.",
    "",
    // A plugin with a script is taught scripts alone: its plan's part, if it has one, is not. The prompt is in English.
    ...(plugin.script
      ? [guideOf(plugin.script, "en").trim(), ""]
      : ["## The format", "", (plugin.guide ?? "").trim(), "", "## The commands", "", ...(commands.length > 0 ? commands : ["The format has no commands."]), ""]),
    ...(lib
      ? [
          "## The library",
          "",
          "What the episodes name. A character's `voice` is the voice its lines are said in.",
          "",
          "```yaml",
          p.library!.trimEnd(),
          "```",
          "",
        ]
      : []),
    "## The voices",
    "",
    [
      ...(p.narrator ? [`The narrator speaks in ${p.narrator}.`] : []),
      ...(cast.length > 0 ? [`The library's characters speak in theirs: ${cast.map(([who, voice]) => `${who} ${voice}`).join(", ")}.`] : []),
    ].join(" "),
    "",
    "These voices are free, the best first in each group:",
    "",
    ...freeVoices(p.voices, taken),
    "",
    "## The story",
    "",
    "The story is everything below, to the end of this message.",
    "",
    p.text.trim(),
    "",
  ].join("\n");
}

/**
 * The prompt for a story file, `stories/<name>.md` in a project with a plugin: the plugin is
 * started for its guide and commands, and closed. Nothing is written; the log says what was read.
 */
export async function promptFor(file: string, log: (msg: string) => void): Promise<string> {
  const name = slug.safeParse(path.basename(file).replace(/\.md$/, ""));
  if (!file.endsWith(".md") || !name.success) {
    throw new Error(`${file}: a story is <name>.md, its name in lowercase letters, digits and dashes: it names the episodes`);
  }
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`No story at ${file}`);
  }
  const plugin = await pluginOf(file);
  if (!plugin) throw new Error(`${file}: no package.json above it names a plugin ("ai-videos": { "plugin" }), and the prompt is a plugin's`);
  const project = await readProject(plugin);
  const host = await startPlugin(plugin, log);
  try {
    log(`Story: ${file}${project.libraryFile ? `; library: ${project.libraryFile.file}` : ""}`);
    return promptOf({
      story: name.data,
      text,
      plugin: host,
      library: project.libraryFile?.text,
      // The episodes are in English: each voice is its English one.
      narrator: voiceIn(project.settings.voice, "en"),
      cast: Object.fromEntries(
        Object.entries(project.settings.cast).flatMap(([who, given]) => {
          const voice = voiceIn(given, "en");
          return voice === undefined ? [] : [[who, voice]];
        }),
      ),
      voices: await promptVoices(),
    });
  } finally {
    host.close();
  }
}
