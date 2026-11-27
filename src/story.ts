// A story to its videos, in one command (AGENTS.md, "story"): the prompt, the chat's replies and
// the import, then each episode made. The chat is a web chat of the user's, reached by the
// clipboard: the prompt and what was refused are put on it, and each answer the user copies is
// added to the reply's file. That file is all the command keeps, so a run stopped half-way goes on
// from it. What it makes is each episode's outputs (video-file.ts): the pages first, each opened
// as the preview, then the videos. The episodes are in a language: the prompt is written in it,
// and each language has a reply's file of its own. What is an answer, how it is added, and how the
// episodes are made (answerOf, addAnswer, makeEpisodes), is serve's too, whose page has a field in
// place of the clipboard.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fenceEpisodes, importReply, readReply, type Reply } from "./import.ts";
import { pluginOf } from "./make.ts";
import { PROMPT_WORDS, episodesOf, promptFor, saysAllWritten, storyOf } from "./prompt.ts";
import type { Language } from "./script.ts";
import { readVideoFile } from "./video-file.ts";

/** What story does through the user: the clipboard, the keyboard and the browser. */
export interface StoryIO {
  /** Puts `text` on the clipboard. */
  copy(text: string): Promise<void>;
  /** The clipboard's text: "" when it holds none. */
  paste(): Promise<string>;
  /** Asks, and gives back the line typed: "" for Enter alone. */
  ask(question: string): Promise<string>;
  /** Opens a file in the browser. */
  open(file: string): Promise<void>;
}

/** Makes one output of a video file (make's, cli.ts), and gives the file it wrote. */
export type MakeOne = (video: string, as: "video" | "web") => Promise<string>;

/** Typed in place of Enter, it goes on with what there is: for a chat that never says it is done, or a block it cannot mend. */
export const GO_ON = "done";

/**
 * The file a story's replies in a language go into, beside it, named as its episodes are:
 * stories/<name>.reply.md, and in another language than English stories/<name>-uk.reply.md.
 */
export const replyFileOf = (story: string, language: Language = "en") => path.join(path.dirname(story), `${episodesOf(storyOf(story), language)}.reply.md`);

/**
 * Why a text is not the chat's next answer: it is `none`; it is what was last `given` for the chat
 * (the prompt, or what was refused); it is the answer `added` last; or it has `no-blocks`, no YAML
 * block, whole or cut off, and does not say that every episode is written.
 */
export type NoAnswer = "none" | "given" | "added" | "no-blocks";

/**
 * A text, from the clipboard or a page's field, as the chat's next answer: its lines ended by "\n",
 * an episode with no ```yaml fence given one (import.ts, fenceEpisodes; `did` says so), and its blocks
 * read. Or why it is none (`not`), which whoever asked for it words. `last` is what was last given
 * for the chat, and last added from it: each is told whatever ends its lines, as a prompt holds the
 * library as written (on Windows, with CRLF), and a field gives line feeds.
 */
export function answerOf(pasted: string, last: { given: string; added: string }): { text: string; read: Reply; did: string[] } | { not: NoAnswer } {
  const lines = (text: string) => text.replace(/\r\n?/g, "\n");
  const raw = lines(pasted);
  if (raw.trim() === "") return { not: "none" };
  if (raw.trim() === lines(last.given).trim()) return { not: "given" };
  // The answer added last is the one mended: the same text pasted again is mended the same.
  const { text, did } = fenceEpisodes(raw);
  if (text.trim() === lines(last.added).trim()) return { not: "added" };
  const read = readReply(text);
  if (read.blocks.length === 0 && read.cut.length === 0 && !saysAllWritten(text)) return { not: "no-blocks" };
  return { text, read, did };
}

/** Adds an answer to a reply's file, after the answers it holds, and gives what to say of it: how many blocks it brought, and what was mended in it. */
export async function addAnswer(reply: string, answer: { text: string; read: Reply; did: string[] }): Promise<string> {
  const { text, read, did } = answer;
  const before = existsSync(reply) ? await readFile(reply, "utf8") : "";
  const gap = before === "" ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(reply, `${before}${gap}${text}${text.endsWith("\n") ? "" : "\n"}`);
  return `the answer, ${read.blocks.length} whole block${read.blocks.length === 1 ? "" : "s"}${read.cut.length > 0 ? ", and one cut off" : ""}${did.map((one) => `; ${one}`).join("")}`;
}

/**
 * Takes the story in `file` through the chat and makes its episodes in `language`: returns the
 * files made. With its reply's file in that language there already, it goes on from it: no new
 * prompt, its import first.
 */
export async function runStory(file: string, language: Language, io: StoryIO, make: MakeOne, log: (msg: string) => void): Promise<string[]> {
  storyOf(file, " (a reply, <name>.reply.md, is not one)");
  const words = PROMPT_WORDS[language];
  const plugin = await pluginOf(file);
  if (!plugin) throw new Error(`${file}: no package.json above it names a plugin ("ai-videos": { "plugin" }), and a story is made by a plugin`);
  const shown = (f: string) => path.relative(plugin.dir, f).split(path.sep).join("/");
  const reply = replyFileOf(file, language);

  // What was last put on the clipboard for the chat, and last added from it: either one there still is too soon.
  const last = { given: "", added: "" };
  const tooSoon: Record<NoAnswer, string> = {
    none: "The clipboard holds no text: copy the chat's answer.",
    given: "The clipboard still holds what was put there for the chat: copy the chat's answer.",
    added: `That answer is in ${shown(reply)} already: copy the chat's next one.`,
    "no-blocks": "The clipboard holds no YAML block: copy the chat's whole answer with its copy button, which keeps the ```yaml blocks.",
  };
  /** Waits for the chat's answer on the clipboard, and adds it to the reply: false when GO_ON is typed instead. */
  const take = async (goOn: boolean): Promise<boolean> => {
    for (;;) {
      const typed = await io.ask(goOn ? `Press Enter when it is copied (or type ${GO_ON} to go on with what there is): ` : "Press Enter when it is copied: ");
      if (goOn && typed.trim().toLowerCase() === GO_ON) return false;
      const answer = answerOf(await io.paste(), last);
      if ("not" in answer) {
        log(tooSoon[answer.not]);
        continue;
      }
      log(`Added to ${shown(reply)}: ${await addAnswer(reply, answer)}.`);
      last.added = answer.text;
      return true;
    }
  };
  const give = async (text: string, what: string) => {
    await io.copy(text);
    last.given = text;
    log(`\n${what}`);
  };

  if (existsSync(reply)) log(`${shown(reply)} is there: going on from it. To begin anew, in a new chat, delete it.`);
  else {
    const prompt = await promptFor(file, language, log);
    await give(prompt, `The prompt is on the clipboard (${prompt.length} characters): paste it into a new chat. When the chat has answered, copy its whole answer.`);
    await take(false);
  }

  // Imported after each answer: whole blocks count as they come, and an episode taken stays taken.
  let goingOn = false;
  let videos: string[];
  for (;;) {
    log("");
    const imported = await importReply(reply, log);
    if (!imported.ended && !goingOn) {
      log(`\nThe chat has not said "${words.allWritten}". If it stopped before the end, type ${words.goOn} in the chat, and copy its answer.`);
      if (await take(true)) continue;
      goingOn = true;
    }
    if (imported.refused !== undefined) {
      await give(imported.refused, "What was refused is on the clipboard: paste it into the chat, and copy its answer.");
      if (await take(true)) continue;
    }
    videos = imported.videos;
    break;
  }
  if (videos.length === 0) throw new Error(`\nStopped: no episode of ${shown(reply)} was taken, so there is nothing to make.`);

  // Each page is opened as the preview, as it is made.
  const made = await makeEpisodes(videos, make, shown, log, async (page, as) => {
    if (as === "web") await io.open(page);
  });
  log(`\nMade, from ${shown(file)}:\n${made.map((f) => `  ${shown(f)}`).join("\n")}`);
  return made;
}

/**
 * Makes each episode's outputs, as its settings say (video-file.ts): the pages first, then the
 * videos. Returns the files made, in that order; `made` is told each as it is there. The first make
 * that fails stops it. `shown` names a file in the log. It is serve's too, whose page shows the makes.
 */
export async function makeEpisodes(
  videos: string[],
  make: MakeOne,
  shown: (file: string) => string,
  log: (msg: string) => void,
  made: (file: string, as: "video" | "web") => void | Promise<void> = () => {},
): Promise<string[]> {
  const outputs = await Promise.all(videos.map(async (video) => ({ video, outputs: (await readVideoFile(video)).settings.outputs })));
  for (const { video, outputs: o } of outputs) if (!o.video && !o.web) log(`${shown(video)}: its outputs turn off both the video and the page: nothing made.`);
  const files: string[] = [];
  for (const as of ["web", "video"] as const) {
    for (const { video } of outputs.filter((v) => v.outputs[as])) {
      log(`\n=== ${shown(video)}: its ${as === "web" ? "page" : "video"}\n`);
      const file = await make(video, as);
      files.push(file);
      await made(file, as);
    }
  }
  return files;
}

/** Runs a PowerShell script, and throws what it said when it fails. */
async function powershell(script: string): Promise<void> {
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "ignore", "pipe"] });
  let said = "";
  child.stderr.on("data", (d: Buffer) => (said += d.toString()));
  const [code] = (await once(child, "exit")) as [number | null];
  if (code !== 0) throw new Error(`PowerShell failed (exit code ${code}): ${said.trim()}`);
}

/**
 * The clipboard, the keyboard and the browser of a terminal on Windows. The clipboard's text goes
 * through a file in UTF-8, as PowerShell's own pipes would change what is not ASCII. The keyboard
 * is open only while it asks: a make's HyperFrames is given the same stdin, and on Windows a read
 * waiting on a pipe holds up another process that touches it (HyperFrames' check never began).
 */
export function windowsIO(): StoryIO {
  if (process.platform !== "win32") throw new Error("story reaches the chat by Windows' clipboard: on another system, use prompt, import and make (AGENTS.md, Projects)");
  const quoted = (file: string) => `'${file.replaceAll("'", "''")}'`;
  const through = async <T>(use: (file: string) => Promise<T>): Promise<T> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ai-videos-clipboard-"));
    try {
      return await use(path.join(dir, "text.txt"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  let ended = false;
  return {
    copy: (text) =>
      through(async (file) => {
        await writeFile(file, text);
        await powershell(`Set-Clipboard -Value ([IO.File]::ReadAllText(${quoted(file)}, [Text.Encoding]::UTF8))`);
      }),
    paste: () =>
      through(async (file) => {
        await powershell(`[IO.File]::WriteAllText(${quoted(file)}, [string](Get-Clipboard -Raw), (New-Object Text.UTF8Encoding $false))`);
        return readFile(file, "utf8");
      }),
    ask: (question) =>
      new Promise((resolve, reject) => {
        const gone = () => reject(new Error("\nStopped: the keyboard's input ended. story runs in a terminal, and waits for Enter there."));
        if (ended) return gone();
        const keyboard = createInterface({ input: process.stdin, output: process.stdout });
        let answered = false;
        // Closed with no answer: the input ended.
        keyboard.on("close", () => {
          if (answered) return;
          ended = true;
          gone();
        });
        keyboard.question(question, (answer) => {
          answered = true;
          keyboard.close();
          resolve(answer);
        });
      }),
    async open(file) {
      // Explorer opens a file in its program, the browser for a page; it says nothing back.
      spawn("explorer.exe", [path.resolve(file)], { detached: true, stdio: "ignore" }).unref();
    },
  };
}
