// Import (AGENTS.md, "import"): a web chat's reply to the prompt (prompt.ts), pasted into a file,
// its messages one after another when the chat was told "continue". Each whole YAML block is an
// episode: its name, what it adds to the library, and its video file. Every episode is checked as
// make checks it, by the tool and by the plugin, against the library with what the reply adds,
// before anything is written; nothing already there is written over. What was refused comes out as
// a message to paste back into the chat.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isMap, isScalar, parseDocument, stringify, type Pair } from "yaml";
import { checkScript, unspoken } from "./check.ts";
import { pluginOf, startPlugin } from "./make.ts";
import { listed } from "./names.ts";
import { ALL_WRITTEN, saysAllWritten } from "./prompt.ts";
import { issueItems, type Issue } from "./scenario.ts";
import { LANGUAGES, slug, type Language } from "./script.ts";
import { spokenIn, toolVoices, type Voice } from "./tts.ts";
import { LIBRARY_FILE, libraryOf, readProject, scriptOf, videoFileOf, writtenScript, type Project } from "./video-file.ts";

/** A whole YAML block of the reply: its text, and the line its fence is on, from 1. */
export interface Block {
  line: number;
  text: string;
}

export interface Reply {
  blocks: Block[];
  /** The lines of the blocks cut off, which are not counted: one with no end, or one a new block began inside. */
  cut: number[];
  /**
   * Whether the reply says, outside its blocks and after one, that every episode is in it. The
   * chat says it after its last block; the blocks it mends come after, and it stays said.
   */
  ended: boolean;
}

/** A fence that opens a block of code: its indent, its fence, and its language. */
const FENCE = /^( *)(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const isYaml = (language: string) => /^ya?ml$/i.test(language);

/** The reply's whole YAML blocks, in order. A block of another language is passed over. */
export function readReply(text: string): Reply {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const cut: number[] = [];
  let open: { line: number; indent: number; fence: string; yaml: boolean; body: string[] } | undefined;
  // The lines outside the blocks, after the first block's end.
  const outside: string[] = [];
  let closed = false;
  for (const [i, line] of lines.entries()) {
    const fence = FENCE.exec(line);
    if (open) {
      const close = line.trim();
      if (close.length >= open.fence.length && close === open.fence[0]!.repeat(close.length)) {
        if (open.yaml) blocks.push({ line: open.line, text: open.body.join("\n") + "\n" });
        open = undefined;
        closed = true;
      } else if (open.yaml && fence && isYaml(fence[3]!)) {
        // A YAML block begun inside one: the one before was cut off, and the chat began it again.
        cut.push(open.line);
        open = { line: i + 1, indent: fence[1]!.length, fence: fence[2]!, yaml: true, body: [] };
      } else {
        // A block indented in the message (in a list) is read as if it were not.
        const indent = Math.min(open.indent, line.length - line.trimStart().length);
        open.body.push(line.slice(indent));
      }
    } else if (fence) {
      open = { line: i + 1, indent: fence[1]!.length, fence: fence[2]!, yaml: isYaml(fence[3]!), body: [] };
    } else if (closed) outside.push(line);
  }
  if (open?.yaml) cut.push(open.line);
  return { blocks, cut, ended: saysAllWritten(outside.join("\n")) };
}

/** The line an episode's block begins with: its name. */
const EPISODE = /^episode:(\s|$)/;

/**
 * One answer of a chat with each of its episodes in a YAML block, where the chat, or the way it was
 * copied, left the fence out: its lines ended by "\n", and in `did` what was mended. Two cases, each
 * with one right answer:
 * - a block fenced with no language that begins with `episode:` (a chat's plain code block): its
 *   fence is given `yaml`;
 * - a text with no fence at all that begins with `episode:` (what a code block's own copy button
 *   gives): each episode gets a fence, from an `episode:` at the start of a line to the next, the last
 *   one to the line that says every episode is written, or to the text's end.
 * Any other text is as it was. It is for one answer by itself: in a reply's file, where the answers
 * follow each other, a fence left out could be another answer's, so readReply reads a file as written.
 */
export function fenceEpisodes(answer: string): { text: string; did: string[] } {
  const lines = answer.replace(/\r\n?/g, "\n").split("\n");
  const same = { text: lines.join("\n"), did: [] };

  if (!lines.some((line) => FENCE.test(line))) {
    const first = lines.findIndex((line) => line.trim() !== "");
    if (first < 0 || !EPISODE.test(lines[first]!)) return same;
    // Where the chat says it is done, on a line of its own: a script's lines are indented.
    const said = lines.findIndex((line, i) => i > first && !/^\s/.test(line) && saysAllWritten(line));
    const end = said < 0 ? lines.length : said;
    const out = lines.slice(0, first);
    let block: string[] = [];
    let count = 0;
    const close = () => {
      while (block.at(-1)?.trim() === "") block.pop();
      out.push("```yaml", ...block, "```", "");
      count++;
    };
    for (const line of lines.slice(first, end)) {
      if (EPISODE.test(line) && block.length > 0) {
        close();
        block = [];
      }
      block.push(line);
    }
    close();
    return { text: [...out, ...lines.slice(end)].join("\n"), did: [count === 1 ? "its episode had no ```yaml fence, and was given one" : `its ${count} episodes had no \`\`\`yaml fence, and each was given one`] };
  }

  // The blocks are followed as readReply follows them; one with no language is told by its first line.
  const out = [...lines];
  let open: { at: number; fence: string; yaml: boolean | undefined } | undefined;
  let count = 0;
  for (const [i, line] of lines.entries()) {
    const fence = FENCE.exec(line);
    if (open) {
      const close = line.trim();
      if (close.length >= open.fence.length && close === open.fence[0]!.repeat(close.length)) open = undefined;
      else if (open.yaml && fence && isYaml(fence[3]!)) open = { at: i, fence: fence[2]!, yaml: true };
      else if (open.yaml === undefined && line.trim() !== "") {
        open.yaml = EPISODE.test(line.trim());
        if (open.yaml) {
          out[open.at] = `${lines[open.at]!.trimEnd()}yaml`;
          count++;
        }
      }
    } else if (fence) open = { at: i, fence: fence[2]!, yaml: fence[3] === "" ? undefined : isYaml(fence[3]!) };
  }
  if (count === 0) return same;
  return { text: out.join("\n"), did: [count === 1 ? "its block's fence had no language, and was given yaml" : `its ${count} blocks' fences had no language, and were given yaml`] };
}

/** One thing a block adds to the library: its section (`characters`), its name, and its text as written there. */
export interface Entry {
  section: string;
  name: string;
  value: unknown;
  /** The entry as the block writes it, its comments with it, its key at the start of its line. */
  text: string;
}

/** A block read as an episode: its name, what it adds to the library, and its video file. */
export interface Episode {
  name: string;
  line: number;
  /** The block, as written. */
  text: string;
  entries: Entry[];
  /** The video file: the block but its episode: and library:, as written. */
  file: string;
  /** Where each line of the file is in the block, from 1: `lines[0]` is the block's line that is the file's first. */
  lines: number[];
  /** The video file, parsed. */
  raw: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Why a new character's voice is none the tool speaks in, or nothing: one of its voices, or one in each language, each of that language. */
function newVoiceWrong(voice: unknown, voices: Voice[]): string | undefined {
  const of = (name: unknown) => voices.find((v) => v.name === name);
  if (voice === undefined) return "it has none";
  if (!isRecord(voice)) return of(voice) ? undefined : `${String(voice)} is not one the tool speaks in`;
  for (const [language, name] of Object.entries(voice)) {
    if (!Object.hasOwn(LANGUAGES, language)) return `${language} is no language of the tool's: they are ${listed(Object.keys(LANGUAGES))}`;
    const known = of(name);
    if (!known) return `${String(name)} is not one the tool speaks in`;
    if (spokenIn(known) !== language) return `its voice in ${LANGUAGES[language as Language]}, ${known.name}, speaks ${LANGUAGES[spokenIn(known)]}`;
  }
  return undefined;
}

/** Where the line that holds `at` begins. */
const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;

/**
 * Where a node that ends at `at` ends in whole lines: after the rest of its line (a comment on it),
 * or at the start of the line when only its indent comes before `at`.
 */
function lineEnd(text: string, at: number): number {
  const start = lineStart(text, at);
  if (text.slice(start, at).trim() === "") return start;
  const next = text.indexOf("\n", at);
  return next < 0 ? text.length : next + 1;
}

/** The whole lines a pair of a block mapping is written on: from its key's line to its value's end. */
function pairLines(text: string, pair: Pair): [number, number] {
  const key = pair.key as { range: [number, number, number] };
  const value = pair.value as { range?: [number, number, number] } | null;
  return [lineStart(text, key.range[0]), lineEnd(text, (value?.range ?? key.range)[1])];
}

/** Lines moved left by `by` spaces, as far as each has them. */
const dedent = (text: string, by: number) =>
  text
    .split("\n")
    .map((l) => l.slice(Math.min(by, l.length - l.trimStart().length)))
    .join("\n");

/** A block as an episode. Throws why it is not one, for the chat. */
export function episodeOf(block: Block): Episode {
  const doc = parseDocument(block.text);
  if (doc.errors.length > 0) throw new Error(`it is not YAML: ${doc.errors[0]!.message}`);
  const top = doc.contents;
  if (!isMap(top)) throw new Error("it is not a mapping: begin it with episode: <its name>");
  const { episode, library, ...raw } = doc.toJS() as Record<string, unknown>;
  const name = slug.safeParse(episode);
  if (!name.success || episode === "main" || episode === "root") {
    throw new Error("give it its name on top, episode: <the name>, the names the prompt gives: lowercase letters, digits and dashes");
  }
  const pairOf = (map: typeof top, key: string) => map.items.find((p) => isScalar(p.key) && p.key.value === key);

  const entries: Entry[] = [];
  const lib = pairOf(top, "library");
  if (lib && library !== null && library !== undefined) {
    if (!isMap(lib.value) || !isRecord(library)) throw new Error("its library: is a mapping, by section (characters:), of what the library lacks");
    for (const section of lib.value.items) {
      const key = String((section.key as { value: unknown }).value);
      if (section.value === null || (isScalar(section.value) && section.value.value === null)) continue;
      if (!isMap(section.value)) throw new Error(`its library: ${key}: is a mapping: each new one by its name`);
      for (const pair of section.value.items) {
        const entryName = String((pair.key as { value: unknown }).value);
        const value = (library[key] as Record<string, unknown>)[entryName];
        const [start, end] = pairLines(block.text, pair);
        const column = (pair.key as { range: number[] }).range[0]! - start;
        // An entry written in blocks keeps its text and comments; one written inline is written again.
        const own = !section.value.flow && block.text.slice(start, start + column).trim() === "";
        const text = own ? dedent(block.text.slice(start, end), column) : stringify({ [entryName]: value });
        entries.push({ section: key, name: entryName, value, text: text.endsWith("\n") ? text : `${text}\n` });
      }
    }
  }

  // The video file is the block without its episode: and library:, the rest as the chat wrote it,
  // but the empty lines it would begin with.
  let file = block.text;
  const drop = [pairOf(top, "episode"), lib].filter((p) => p !== undefined).map((p) => pairLines(block.text, p));
  for (const [start, end] of drop.toSorted((a, b) => b[0] - a[0])) file = file.slice(0, start) + file.slice(end);
  // Where each line of the file was in the block: the lines of neither pair, from the first that is not empty.
  let at = 0;
  const kept = block.text.split("\n").flatMap((text, i) => {
    const start = at;
    at += text.length + 1;
    return drop.some(([from, to]) => start >= from && start < to) ? [] : [{ line: i + 1, empty: text.trim() === "" }];
  });
  const lines = kept.slice(kept.findIndex((line) => !line.empty)).map(({ line }) => line);
  return { name: name.data, line: block.line, text: block.text, entries, file: `${file.replace(/^\s*\n/, "").trimEnd()}\n`, lines, raw };
}

/**
 * library.yaml with the entries added, each at the end of its section, as the block wrote it: the
 * rest of the file stays as it is, its comments and its line endings. A section it lacks is added
 * at its end.
 */
export function addEntries(text: string | undefined, entries: Entry[]): string {
  let out = text ?? "";
  // The lines added end as most of the file's do; the file's own lines stay as they are.
  const eol = (out.match(/\r\n/g)?.length ?? 0) > (out.match(/(?<!\r)\n/g)?.length ?? 0) ? "\r\n" : "\n";
  if (out !== "" && !out.endsWith("\n")) out += eol;
  const indented = (list: Entry[], by: number) => list.map((e) => e.text.replace(/^(?=.)/gm, " ".repeat(by)).replace(/\n/g, eol)).join("");
  for (const section of new Set(entries.map((e) => e.section))) {
    const mine = entries.filter((e) => e.section === section);
    const top = parseDocument(out).contents;
    if (top !== null && !isMap(top)) throw new Error(`${LIBRARY_FILE} is not a mapping`);
    const pair = top?.items.find((p) => isScalar(p.key) && p.key.value === section);
    if (!pair) {
      out += `${out.trim() === "" ? "" : eol}${section}:${eol}${indented(mine, 2)}`;
      continue;
    }
    const value = pair.value;
    let at: number;
    let by = 2;
    if (value === null || (isScalar(value) && value.value === null)) at = pairLines(out, pair)[1];
    else if (isMap(value) && !value.flow && value.items.length > 0) {
      const last = value.items.at(-1)!;
      at = pairLines(out, last)[1];
      const first = value.items[0]!.key as { range: number[] };
      by = first.range[0]! - lineStart(out, first.range[0]!);
    } else throw new Error(`${section}: in ${LIBRARY_FILE} is not written in blocks, an entry a line: import adds to it only then`);
    out = out.slice(0, at) + indented(mine, by) + out.slice(at);
  }
  return out;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A script episode's mistakes, as `check` tells them, each at its line of the episode's block, as the chat wrote it. */
function mistakesIn(episode: Episode, issues: Issue[]): string {
  const inBlock = (line: number) => episode.lines[line - 1] ?? line;
  const moved = issues.map((issue) => ({ ...issue, line: inBlock(issue.line), ...(issue.also ? { also: issue.also.map(inBlock) } : {}) }));
  const many = issues.length === 1 ? "a mistake, at its line" : `${issues.length} mistakes, each at its line`;
  return `${many} of the block (the one after its fence is line 1):\n\n${issueItems(episode.text, moved, (line) => `line ${line}`)}`;
}

/** The message for the chat: each refused episode with why, those refused for one reason together. */
export function refusedMessage(refused: Map<string, string>): string {
  const byReason = new Map<string, string[]>();
  for (const [what, why] of refused) byReason.set(why, [...(byReason.get(why) ?? []), what]);
  const items = [...byReason].map(([why, what]) => `- ${what.join(", ")}: ${why.replace(/\n/g, "\n  ")}`);
  return ["The tool refused these episodes. Send each again, its block whole and mended:", "", ...items].join("\n");
}

/** What an import did: the episodes' video files, the message for the chat, and whether the reply says it is all. */
export interface Imported {
  /** The video file of each episode taken: written now, or there already as imported. Not one kept with other text. */
  videos: string[];
  /** The message for the chat, when something was refused. */
  refused: string | undefined;
  /** Whether the reply says every episode is in it (`Reply`'s `ended`). */
  ended: boolean;
}

/**
 * Imports the reply in `file`: writes each episode the tool and the plugin take as
 * videos/<name>.yaml, and what they add to library.yaml, and writes nothing over.
 */
export async function importReply(file: string, log: (msg: string) => void): Promise<Imported> {
  const plugin = await pluginOf(file);
  if (!plugin) {
    throw new Error(
      `${file}: no package.json above it names a plugin ("ai-videos": { "plugin" }). A reply goes into the project of its story, ` +
        `beside it (stories/<name>.reply.md): its episodes are written into that project's videos/`,
    );
  }
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(`No reply at ${file}`);
  }
  const shown = (f: string) => path.relative(plugin.dir, f).split(path.sep).join("/");
  const reply = readReply(text);
  if (reply.blocks.length === 0 && reply.cut.length === 0) throw new Error(`${file} holds no YAML block: paste the chat's reply into it, its blocks as the chat wrote them`);
  log(`Reply: ${shown(file)}: ${reply.blocks.length} whole block${reply.blocks.length === 1 ? "" : "s"}`);
  for (const line of reply.cut) log(`  The block at line ${line} is cut off: not counted.`);
  if (!reply.ended) {
    log(`  It does not say "${ALL_WRITTEN}" (or its prompt's line, in another language) after its blocks: if the chat stopped before the end, tell it to continue, in the prompt's word, and add its answer to ${shown(file)}.`);
  }

  // Each episode is its last whole block.
  const refused = new Map<string, string>();
  // What was refused is listed in the reply's order: an episode where its first block was.
  const order: string[] = [];
  const episodes = new Map<string, Episode>();
  for (const block of reply.blocks) {
    try {
      const episode = episodeOf(block);
      if (episodes.has(episode.name)) log(`  ${episode.name} again at line ${block.line}: this block counts.`);
      episodes.delete(episode.name);
      episodes.set(episode.name, episode);
      order.push(episode.name);
    } catch (e) {
      const first = block.text.split("\n").find((l) => l.trim() !== "") ?? "";
      const what = `the block that begins "${first.trim()}"`;
      refused.set(what, message(e));
      order.push(what);
    }
  }

  // What the reply adds to the library: the entries it lacks, from the episodes in order, the last
  // word counting. A new character's voice is the tool's to check, and a sound is a file, which no chat has.
  const project = await readProject(plugin);
  const voices = await toolVoices();
  const has = project.libraryFile?.raw ?? {};
  const added = new Map<string, Entry>();
  const kept = new Set<string>();
  const inLibrary = (section: string, name: string) => (isRecord(has[section]) ? (has[section] as Record<string, unknown>)[name] : undefined);
  for (const episode of [...episodes.values()]) {
    const sounds = episode.entries.filter(({ section, name }) => section === "sounds" && inLibrary(section, name) === undefined).map(({ name }) => name);
    if (sounds.length > 0) {
      refused.set(episode.name, `it adds ${sounds.length > 1 ? "sounds" : "a sound"} to the library (${listed(sounds)}): a sound is a file, which only a person adds, so leave sounds: out of library:`);
      episodes.delete(episode.name);
      continue;
    }
    const voiceless = episode.entries
      .flatMap((e) => (e.section === "characters" ? [{ name: e.name, why: newVoiceWrong(isRecord(e.value) ? e.value.voice : undefined, voices) }] : []))
      .find(({ why }) => why !== undefined);
    if (voiceless) {
      refused.set(episode.name, `its new character ${voiceless.name} needs a voice: ${voiceless.why}; give it one from the list`);
      episodes.delete(episode.name);
      continue;
    }
    for (const entry of episode.entries) {
      const there = inLibrary(entry.section, entry.name);
      if (there === undefined) added.set(`${entry.section}/${entry.name}`, entry);
      else if (!isDeepStrictEqual(there, entry.value)) kept.add(`${entry.section}: ${entry.name}`);
    }
  }
  const merged = structuredClone(has);
  for (const { section, name, value } of added.values()) {
    if (merged[section] !== undefined && merged[section] !== null && !isRecord(merged[section])) throw new Error(`${project.libraryFile!.file}: its ${section}: is not a mapping`);
    merged[section] = { ...(merged[section] as Record<string, unknown> | undefined), [name]: value };
  }
  const libraryFile = project.libraryFile?.file ?? path.join(plugin.dir, LIBRARY_FILE);
  const label = added.size > 0 ? `${libraryFile} with what the reply adds` : libraryFile;

  // Each episode checked as make checks it, before anything is written.
  const accepted: { episode: Episode; target: string; repaired: string[] }[] = [];
  if (episodes.size > 0) {
    let withAdded: Project;
    try {
      const { library, cast, sounds, volumes } = libraryOf(label, merged);
      withAdded = { ...project, library: project.libraryFile || added.size > 0 ? library : undefined, sounds, volumes, settings: { ...project.settings, cast } };
    } catch (e) {
      for (const name of episodes.keys()) refused.set(name, message(e));
      episodes.clear();
      withAdded = project;
    }
    const host = episodes.size > 0 ? await startPlugin(plugin, log) : undefined;
    try {
      for (const episode of episodes.values()) {
        const target = path.join(plugin.dir, "videos", `${episode.name}.yaml`);
        try {
          const written = writtenScript(episode.file);
          const video = { ...videoFileOf(withAdded, target, episode.raw), text: episode.file, ...(written ? { script: written } : {}) };
          if (video.use !== host!.scene) throw new Error(`it says use: ${video.use}, and the plugin draws ${host!.scene}: write use: ${host!.scene}`);
          if (video.script) {
            // A script is checked as check and make check it, and its mistakes are told as check tells them, at the block's lines.
            const checked = await checkScript(video, host!);
            if ("issues" in checked) throw new Error(mistakesIn(episode, checked.issues));
            accepted.push({ episode, target, repaired: [] });
            continue;
          }
          const { repaired, plan } = await host!.check(episode.name, video.source, withAdded.library);
          const unsaid = await unspoken(scriptOf(video, plan, plan.limits));
          if (unsaid) throw new Error(unsaid);
          accepted.push({ episode, target, repaired });
        } catch (e) {
          // The reason names the episode, as the chat knows it, not the file it would have been.
          refused.set(episode.name, message(e).replaceAll(target, episode.name).replace(new RegExp(`^${episode.name}: `), ""));
        }
      }
    } finally {
      host?.close();
    }
  }

  // The library first, then the episodes, each only where nothing is there yet.
  if (added.size > 0) {
    const voiceOf = ({ value }: Entry) => (!isRecord(value) ? undefined : isRecord(value.voice) ? Object.values(value.voice).join(", ") : typeof value.voice === "string" ? value.voice : undefined);
    const list = [...added.values()].map((e) => `${e.name}${voiceOf(e) ? ` (${voiceOf(e)})` : ""}`).join(", ");
    if (accepted.length > 0) {
      await writeFile(libraryFile, addEntries(project.libraryFile?.text, [...added.values()]));
      log(`Library: ${shown(libraryFile)}: added ${list}`);
    } else log(`Library: nothing added (${list}), as no episode is imported`);
  }
  for (const what of kept) log(`  ${what}: kept as the library has it; the reply draws it otherwise`);
  const videos: string[] = [];
  for (const { episode, target, repaired } of accepted) {
    if (existsSync(target)) {
      const there = await readFile(target, "utf8");
      if (there.replace(/\r\n/g, "\n") === episode.file) {
        log(`${shown(target)}: there already, as imported`);
        videos.push(target);
      } else log(`${shown(target)}: there already, with other text: kept. Delete it to import this block.`);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, episode.file);
    log(`${shown(target)}: written`);
    if (repaired.length > 0) log(`  The plugin mends, in what it draws (the file is as written):\n${repaired.map((r) => `    - ${r}`).join("\n")}`);
    videos.push(target);
  }
  if (refused.size === 0) return { videos, refused: undefined, ended: reply.ended };
  const inOrder = new Map([...refused].toSorted(([a], [b]) => order.indexOf(a) - order.indexOf(b)));
  for (const [what, why] of inOrder) log(`Refused: ${what}: ${why.replace(/\n/g, "\n  ")}`);
  return { videos, refused: refusedMessage(inOrder), ended: reply.ended };
}
