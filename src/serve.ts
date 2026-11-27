// A story to its videos from a page in a browser (AGENTS.md, "serve"): `story` with a page in place
// of the terminal and the clipboard. A small server on this machine, started in a project, gives
// the page (serve.html) and does what the page asks, in three parts. A text is saved as the
// project's stories/<name>.md and wrapped in its prompt (prompt.ts), in the language its letters
// say, or the one picked. Then each of the chat's answers is added to the reply's file, beside the
// story, and the file imported (import.ts), as story does it (story.ts): the episodes taken, and
// what was refused, for the chat. Then the episodes are made, as story makes them, each make a
// process of its own (makeBy): the server keeps what the makes say, which the page asks for as they
// go, and gives the page the files made, out/<name>.mp4, to play. It answers this machine alone, as
// it listens on 127.0.0.1, and its own page alone: a request is refused unless its Host is the
// server's own address, one that does something, a POST, unless it comes from the server's page
// (its Origin), and a made file is given to no other site's page.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { importReply } from "./import.ts";
import { pluginOf } from "./make.ts";
import { PROMPT_WORDS, promptFor } from "./prompt.ts";
import { LANGUAGES, slug, type Language } from "./script.ts";
import { addAnswer, answerOf, makeEpisodes, replyFileOf, type NoAnswer } from "./story.ts";
import { readVideoFile } from "./video-file.ts";

/** The port the server listens on, when none is given. */
export const PORT = 4747;

/** The page, read for each request: a change to it shows when the page is loaded again. */
const PAGE = path.join(import.meta.dirname, "serve.html");

/** The longest request taken, bytes: a story is a chapter, a few hundred kilobytes at most. */
const LIMIT = 2_000_000;

/** Why a request is refused, with the HTTP status that says so. */
export class Refused extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The language a text is in, told from its letters alone: English, unless more of them are
 * Cyrillic than Latin; then Russian when it has more of the letters Russian alone has (ы, э, ъ, ё)
 * than of those Ukrainian alone has (і, ї, є, ґ), else Ukrainian.
 */
export function languageOf(text: string): Language {
  const count = (letters: RegExp) => text.match(letters)?.length ?? 0;
  if (count(/\p{Script=Cyrillic}/gu) <= count(/\p{Script=Latin}/gu)) return "en";
  return count(/[ыэъё]/giu) > count(/[іїєґ]/giu) ? "ru" : "uk";
}

/** A text as its file holds it: its lines ended by "\n", and one at its end. */
const written = (text: string) => `${text.replace(/\r\n?/g, "\n").trimEnd()}\n`;

/** The file of the story named, stories/<name>.md in the project's folder, `dir`: what is no name for a story is refused. */
function storyFile(dir: string, name: string): string {
  if (!slug.safeParse(name).success) {
    throw new Refused(400, `${name === "" ? "The story has no name" : `"${name}" is no name for a story`}: give it one in lowercase letters, digits and dashes, a letter first (the-race). It names the file and the episodes.`);
  }
  return path.join(dir, "stories", `${name}.md`);
}

/** A language of the tool's, by its code: any other is refused. */
function languageNamed(code: string): Language {
  if (!Object.hasOwn(LANGUAGES, code)) {
    throw new Refused(400, `"${code}" is no language of the tool's: it is ${Object.entries(LANGUAGES).map(([one, name]) => `${one} (${name})`).join(", ")}`);
  }
  return code as Language;
}

/**
 * Saves a story's text as stories/<name>.md in the project's folder, `dir`, and writes nothing
 * over: a name whose file holds this text already is taken as saved, and one whose file holds
 * another is refused.
 */
export async function saveStory(dir: string, name: string, text: string): Promise<{ file: string; saved: boolean }> {
  const file = storyFile(dir, name);
  if (text.trim() === "") throw new Refused(400, "There is no text: paste the story.");
  await mkdir(path.dirname(file), { recursive: true });
  try {
    // Written only where no file is: two requests at once cannot write over each other either.
    await writeFile(file, written(text), { flag: "wx" });
    return { file, saved: true };
  } catch (e) {
    if ((e as { code?: string }).code !== "EEXIST") throw e;
  }
  if (written(await readFile(file, "utf8")) === written(text)) return { file, saved: false };
  throw new Refused(409, `stories/${name}.md is another text, and nothing is written over: give this one another name.`);
}

/**
 * Makes one output of a video file, saying what it does as it goes, and gives the file it wrote:
 * make's, as a process of its own (makeBy), or a test's.
 */
export type Make = (video: string, as: "video" | "web", say: (msg: string) => void) => Promise<string>;

/** How many of the last lines a make said are why it failed, for the page. */
const LAST = 12;

/**
 * A make as a process of its own: `command` is how this tool is run (node, its options and
 * cli.ts), and it is given `make <video> --as <as>`. What it says comes a line at a time,
 * HyperFrames' too, as a terminal's make prints it where it is no terminal. One that fails throws
 * the last it said. It has no keyboard: a read waiting on the server's would hold HyperFrames up.
 */
export function makeBy(command: string[]): Make {
  return async (video, as, say) => {
    const [node, ...args] = command;
    const child = spawn(node!, [...args, "make", video, "--as", as], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const last: string[] = [];
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream.setEncoding("utf8") }).on("line", (raw) => {
        // What a terminal would colour, or write over, is plain here.
        const line = raw.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
        say(line);
        if (line.trim() !== "" && last.push(line) > LAST) last.shift();
      });
    }
    const [code] = (await once(child, "close")) as [number | null];
    if (code !== 0) throw new Error(`The make stopped (exit code ${code}). The last it said:\n${last.join("\n")}`);
    return `${(await readVideoFile(video)).out}.${as === "web" ? "html" : "mp4"}`;
  };
}

/** A made file the page may ask for, by its path: out/<name>.mp4, a video, or .html, its page. */
const MADE = /^\/out\/([a-z0-9][a-z0-9-]*\.(mp4|html))$/;
const TYPES: Record<string, string> = { mp4: "video/mp4", html: "text/html; charset=utf-8" };

/** The bytes of a file of `size` that a request's Range asks for, first and last: all of it with none, undefined for one that is none of the file's. */
function rangeOf(range: string | undefined, size: number): { first: number; last: number } | undefined {
  if (range === undefined) return { first: 0, last: size - 1 };
  const [, from, to] = /^bytes=(\d*)-(\d*)$/.exec(range.trim()) ?? [];
  if (from === undefined || to === undefined || (from === "" && to === "")) return undefined;
  // "-500" is the last 500 bytes.
  const first = from === "" ? Math.max(0, size - Number(to)) : Number(from);
  const last = from === "" || to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return first <= last && first < size ? { first, last } : undefined;
}

/** A story's episodes being made, from Start on: what the page shows of it, as it goes and after. */
interface Run {
  /** New for each: the page's log is this run's, or begins anew. */
  id: string;
  name: string;
  language: Language;
  /** The story's file, as the page names it. */
  story: string;
  state: "making" | "made" | "failed";
  /** What the makes said, in order. */
  said: string[];
  /** Each file made, as the page names it, and where the page gets it: none for a file that is not the project's out/<name>.mp4 or .html. */
  made: { file: string; as: "video" | "web"; url: string | null }[];
  /** Why it stopped, when it failed. */
  failed: string | null;
}

/** A request's body, as JSON: the page's own requests are that. */
async function bodyOf(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) throw new Refused(415, "A request is JSON (Content-Type: application/json).");
  const chunks: Buffer[] = [];
  let size = 0;
  // One that is too long is read to its end and not kept, so its answer finds the connection whole.
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= LIMIT) chunks.push(chunk);
  }
  if (size > LIMIT) throw new Refused(413, `A request of more than ${LIMIT / 1e6} MB is refused: this one is ${(size / 1e6).toFixed(1)} MB.`);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Refused(400, "The request is not JSON.");
  }
}

/** What a request gives, as its schema has it, or refused with what is wrong. */
function given<T>(schema: z.ZodType<T>, body: unknown, takes: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Refused(400, `${takes}:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

const Text = z.strictObject({ text: z.string() });
const Story = z.strictObject({ name: z.string(), text: z.string(), language: z.string() });
const Answer = z.strictObject({ name: z.string(), language: z.string(), answer: z.string() });
const Named = z.strictObject({ name: z.string(), language: z.string() });
const Making = z.strictObject({ run: z.string().nullable(), from: z.number().int().min(0) });

/** Why what the page's field holds is not the chat's next answer (story.ts, answerOf), as the page says it. `reply` is the reply's file. */
const noAnswer = (reply: string): Record<NoAnswer, string> => ({
  none: "There is no answer: paste the chat's whole answer, copied with its copy button.",
  given: "This is what the page gave for the chat, and not the chat's answer: copy the chat's answer, and paste it.",
  added: `That answer is in ${reply} already: paste the chat's next one. With the field empty, Start goes on from the file.`,
  "no-blocks": "The answer holds no YAML block: copy the chat's whole answer with its copy button, which keeps the ```yaml blocks.",
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A server that is listening: its page's address, the project's folder, and how it is stopped. */
export interface Serving {
  url: string;
  dir: string;
  close(): Promise<void>;
}

/**
 * Starts the server of the project `from` is in (the nearest package.json there or above, with a
 * plugin), on `port` of this machine, 0 for any free one. What it does is logged, what its makes
 * say too; `make` makes an episode's video, or its page.
 */
export async function serve(from: string, port: number, log: (msg: string) => void, make: Make): Promise<Serving> {
  const project = await pluginOf(path.join(from, "package.json"));
  if (!project) throw new Error(`${from}: no package.json here, or above, names a plugin ("ai-videos": { "plugin" }). serve is typed in a project's folder: cd cartoons`);
  const { dir } = project;

  /** The page, its placeholders filled: the script and the style it runs are its own, by a nonce new each time. */
  const page = async () => {
    const nonce = randomBytes(16).toString("base64");
    const values: Record<string, string> = {
      nonce,
      project: esc(dir),
      languages: Object.entries(LANGUAGES).map(([code, name]) => `<option value="${code}">${name}</option>`).join(""),
    };
    const html = (await readFile(PAGE, "utf8")).replace(/\{\{(\w+)\}\}/g, (whole, key: string) => values[key] ?? whole);
    const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
    return { html, policy };
  };

  /** A file of the project, as the page and the log name it: its path from the project's folder. */
  const shown = (file: string) => path.relative(dir, file).split(path.sep).join("/");

  // What reads or writes the project's files is done one at a time: two answers at once would be
  // added to one file, and imported twice.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(does: () => Promise<T>): Promise<T> => {
    const mine = turn.then(does, does);
    turn = mine.catch(() => {});
    return mine;
  };

  // What was last given for the chat, and last added from it, by the reply's file: either one in
  // the answer's field is no answer (story.ts, answerOf). Forgotten when the server stops, as story's are.
  const lasts = new Map<string, { given: string; added: string }>();
  const lastOf = (reply: string) => lasts.get(reply) ?? lasts.set(reply, { given: "", added: "" }).get(reply)!;

  // The episodes' makes: one run at a time, kept until the next begins, or the server stops, so a
  // page loaded again shows it, going on or ended.
  let run: Run | undefined;
  /** Under a run nothing is imported, and no other begun: a make reads the library an import writes. */
  const notMaking = () => {
    if (run?.state === "making") throw new Refused(409, `The episodes of ${run.story} are being made: wait for them to end. What their makes say is in the page, below.`);
  };
  /** Begins the makes of a story's episodes, as story makes them (story.ts): they go on when the request is answered. */
  const begin = (name: string, language: Language, story: string, videos: string[]) => {
    const mine: Run = { id: randomBytes(8).toString("hex"), name, language, story: shown(story), state: "making", said: [], made: [], failed: null };
    run = mine;
    const say = (msg: string) => {
      mine.said.push(msg);
      log(msg);
    };
    const one = (video: string, as: "video" | "web") =>
      make(video, as, say).catch((e: Error) => {
        throw new Error(`${shown(video)}: its ${as === "web" ? "page" : "video"} is not made. ${e.message.trim()}`);
      });
    say(`Making, from ${mine.story}: ${videos.map(shown).join(", ")}`);
    void makeEpisodes(videos, one, shown, say, async (file, as) => {
      // Asked for at its time, a file made again is played anew.
      const url = MADE.test(`/${shown(file)}`) ? `/${shown(file)}?at=${Math.round((await stat(file)).mtimeMs)}` : null;
      mine.made.push({ file: shown(file), as, url });
    }).then(
      (files) => {
        say(files.length === 0 ? `\nNothing made, from ${mine.story}.` : `\nMade, from ${mine.story}:\n${files.map((f) => `  ${shown(f)}`).join("\n")}`);
        mine.state = "made";
      },
      (e: Error) => {
        mine.failed = e.message.trim();
        say(`\nStopped: ${mine.failed}`);
        mine.state = "failed";
      },
    );
  };

  /** Gives the page a made file, out/<name>, or the bytes of it its Range asks for: a video is played, and sought in, by ranges. */
  const give = async (req: IncomingMessage, res: ServerResponse, name: string, kind: string) => {
    // Its own page alone: a browser says whose page asks, and another site's plays nothing of this machine's.
    const site = req.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin" && site !== "none") throw new Refused(403, `This server gives its files to its own page alone: a request from another site's page (${site}) is refused.`);
    const file = path.join(dir, "out", name);
    const info = await stat(file).catch(() => undefined);
    if (!info?.isFile()) throw new Refused(404, `There is no out/${name}: Start makes it.`);
    const headers: Record<string, string | number> = {
      "Content-Type": TYPES[kind]!,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Accept-Ranges": "bytes",
      // A video's own page, opened from the server's, runs with none of that page's rights: its requests come from no page.
      ...(kind === "html" ? { "Content-Security-Policy": "sandbox allow-scripts" } : {}),
    };
    const part = req.headers.range;
    const range = info.size === 0 ? undefined : rangeOf(part, info.size);
    if (part !== undefined && !range) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` });
      return void res.end();
    }
    if (!range) {
      res.writeHead(200, { ...headers, "Content-Length": 0 });
      return void res.end();
    }
    const { first, last } = range;
    res.writeHead(part === undefined ? 200 : 206, { ...headers, "Content-Length": last - first + 1, ...(part === undefined ? {} : { "Content-Range": `bytes ${first}-${last}/${info.size}` }) });
    // A browser ends a video's request when it has what it plays: that is no failure.
    await pipeline(createReadStream(file, { start: first, end: last }), res).catch(() => {});
  };

  /** What the page asks, by its path: each takes the request's JSON, and gives the answer's. */
  const asked: Record<string, (body: unknown) => Promise<unknown>> = {
    "/language": async (body) => ({ language: languageOf(given(Text, body, "/language takes { text }").text) }),
    "/story": (body) =>
      inTurn(async () => {
        const { name, text, language: code } = given(Story, body, "/story takes { name, text, language }");
        const language = languageNamed(code);
        const { file, saved } = await saveStory(dir, name, text);
        log(saved ? `\nSaved: ${shown(file)}` : `\n${shown(file)} holds this text already: nothing written`);
        // The story stays saved: with what is in the way mended, or another language, the same name gets its prompt.
        const prompt = await promptFor(file, language, log).catch((e: Error) => {
          throw new Refused(422, `No prompt for ${shown(file)}, in ${LANGUAGES[language]}: ${e.message}`);
        });
        lastOf(replyFileOf(file, language)).given = prompt;
        log(`The prompt of ${shown(file)}, in ${LANGUAGES[language]}: ${prompt.length} characters`);
        return { file: shown(file), saved, language, prompt };
      }),
    // The chat's next answer, added to the reply's file, and the file imported. With no answer, it
    // goes on from the file, as story typed again does. A reply that is whole, every episode
    // written and none refused, has its episodes made.
    "/answer": (body) =>
      inTurn(async () => {
        const { name, language: code, answer } = given(Answer, body, "/answer takes { name, language, answer }");
        const language = languageNamed(code);
        const story = storyFile(dir, name);
        if (!existsSync(story)) throw new Refused(404, `There is no ${shown(story)}: save the story under this name first, and give its prompt to a chat.`);
        notMaking();
        const reply = replyFileOf(story, language);
        const last = lastOf(reply);
        const taken = answerOf(answer, last);
        let added: string | null = null;
        if (!("not" in taken)) {
          added = await addAnswer(reply, taken);
          last.added = taken.text;
          log(`\nAdded to ${shown(reply)}: ${added}.`);
        } else if (taken.not === "none" && existsSync(reply)) log(`\nNo new answer: going on from ${shown(reply)}.`);
        else throw new Refused(400, noAnswer(shown(reply))[taken.not]);
        // An answer added stays added: when the import fails, Start with no answer goes on from the file.
        const said: string[] = [];
        const imported = await importReply(reply, (msg) => {
          said.push(msg);
          log(msg);
        }).catch((e: Error) => {
          throw new Refused(422, e.message);
        });
        if (imported.refused !== undefined) last.given = imported.refused;
        const making = imported.ended && imported.refused === undefined && imported.videos.length > 0;
        if (making) begin(name, language, story, imported.videos);
        const { allWritten, goOn } = PROMPT_WORDS[language];
        return {
          reply: shown(reply),
          // What the answer brought, when one was added: "the answer, 2 whole blocks".
          added,
          episodes: imported.videos.map(shown),
          refused: imported.refused ?? null,
          ended: imported.ended,
          words: { allWritten, goOn },
          log: said.join("\n"),
          // Its episodes' makes have begun: /making says how they go.
          making,
        };
      }),
    // The page's `done` (story.ts, GO_ON): the episodes taken so far are made, though the chat has
    // not said it is done, or some are refused. The reply's file is imported first, as it is.
    "/make": (body) =>
      inTurn(async () => {
        const { name, language: code } = given(Named, body, "/make takes { name, language }");
        const language = languageNamed(code);
        const story = storyFile(dir, name);
        const reply = replyFileOf(story, language);
        const lacks = [story, reply].find((file) => !existsSync(file));
        if (lacks) throw new Refused(404, `There is no ${shown(lacks)}: an episode is taken from the chat's answer first.`);
        notMaking();
        log(`\nGoing on with the episodes taken so far, from ${shown(reply)}.`);
        const imported = await importReply(reply, log).catch((e: Error) => {
          throw new Refused(422, e.message);
        });
        if (imported.videos.length === 0) throw new Refused(400, `No episode of ${shown(reply)} is taken, so there is nothing to make.`);
        begin(name, language, story, imported.videos);
        return { reply: shown(reply), episodes: imported.videos.map(shown) };
      }),
    // How the makes go: the run, and what it said from `from` on. A page that names another run, or
    // none (one loaded again), gets all this one said.
    "/making": async (body) => {
      const { run: id, from } = given(Making, body, "/making takes { run, from }");
      if (!run) return { run: null };
      const { said, made, ...rest } = run;
      const first = id === run.id ? Math.min(from, said.length) : 0;
      return { run: { ...rest, made: [...made], from: first, next: said.length, log: said.slice(first).join("\n") } };
    },
  };

  const answer = async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, type: string, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
      res.end(body);
    };
    try {
      // Its own address alone: a site whose name is made to mean this machine has another Host.
      const own = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
      const host = req.headers.host ?? "";
      if (!own.includes(host)) throw new Refused(403, `This server answers at its own address alone, http://${own[0]}: not at ${host || "none"}.`);
      const pathname = (req.url ?? "/").split("?")[0]!;
      if (pathname === "/") {
        if (req.method !== "GET") throw new Refused(405, "The page is asked for with GET.");
        const { html, policy } = await page();
        return send(200, "text/html", html, { "Content-Security-Policy": policy });
      }
      const made = MADE.exec(pathname);
      if (made) {
        if (req.method !== "GET") throw new Refused(405, `${pathname} is asked for with GET.`);
        return await give(req, res, made[1]!, made[2]!);
      }
      const does = Object.hasOwn(asked, pathname) ? asked[pathname]! : undefined;
      if (!does) throw new Refused(404, `There is no ${pathname} here.`);
      if (req.method !== "POST") throw new Refused(405, `${pathname} is asked with POST.`);
      // Its own page alone: a browser says which page a POST comes from, and another site's is not this one.
      const { origin } = req.headers;
      if (origin !== `http://${host}`) throw new Refused(403, `This server answers its own page alone, http://${host}: a request from ${origin ?? "no page"} is refused.`);
      send(200, "application/json", JSON.stringify(await does(await bodyOf(req))));
    } catch (e) {
      const status = e instanceof Refused ? e.status : 500;
      const message = e instanceof Error ? e.message : String(e);
      log(`${status === 500 ? "Failed" : "Refused"} (${req.method} ${req.url}): ${message}`);
      if (!res.headersSent) send(status, "application/json", JSON.stringify({ error: message }));
      else res.end();
    }
  };

  const server = createServer((req, res) => void answer(req, res));
  server.listen(port, "127.0.0.1");
  await once(server, "listening").catch((e: Error & { code?: string }) => {
    throw new Error(
      e.code === "EADDRINUSE"
        ? `Port ${port} is taken: serve may be running already (http://127.0.0.1:${port}). Stop that one, or give this one another port: --port ${port + 1}`
        : `The server did not start on port ${port}: ${e.message}`,
    );
  });
  const { port: at } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${at}`,
    dir,
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
