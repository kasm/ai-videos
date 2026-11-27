// A story to its videos from a page in a browser (AGENTS.md, "serve"): `story` with a page in place
// of the terminal and the clipboard. A small server on this machine, started in a project, gives
// the page (serve.html) and does what the page asks. So far the first part: a text saved as the
// project's stories/<name>.md and wrapped in its prompt (prompt.ts), in the language its letters
// say, or the one picked. It answers this machine alone, as it listens on 127.0.0.1, and its own
// page alone: a request is refused unless its Host is the server's own address, and one that does
// something, a POST, unless it comes from the server's page (its Origin).
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { z } from "zod";
import { pluginOf } from "./make.ts";
import { promptFor } from "./prompt.ts";
import { LANGUAGES, slug, type Language } from "./script.ts";

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

/**
 * Saves a story's text as stories/<name>.md in the project's folder, `dir`, and writes nothing
 * over: a name whose file holds this text already is taken as saved, and one whose file holds
 * another is refused.
 */
export async function saveStory(dir: string, name: string, text: string): Promise<{ file: string; saved: boolean }> {
  if (!slug.safeParse(name).success) {
    throw new Refused(400, `${name === "" ? "The story has no name" : `"${name}" is no name for a story`}: give it one in lowercase letters, digits and dashes, a letter first (the-race). It names the file and the episodes.`);
  }
  if (text.trim() === "") throw new Refused(400, "There is no text: paste the story.");
  const file = path.join(dir, "stories", `${name}.md`);
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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A server that is listening: its page's address, the project's folder, and how it is stopped. */
export interface Serving {
  url: string;
  dir: string;
  close(): Promise<void>;
}

/**
 * Starts the server of the project `from` is in (the nearest package.json there or above, with a
 * plugin), on `port` of this machine, 0 for any free one. What it does is logged.
 */
export async function serve(from: string, port: number, log: (msg: string) => void): Promise<Serving> {
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
    const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
    return { html, policy };
  };

  /** What the page asks, by its path: each takes the request's JSON, and gives the answer's. */
  const asked: Record<string, (body: unknown) => Promise<unknown>> = {
    "/language": async (body) => ({ language: languageOf(given(Text, body, "/language takes { text }").text) }),
    "/story": async (body) => {
      const { name, text, language } = given(Story, body, "/story takes { name, text, language }");
      if (!Object.hasOwn(LANGUAGES, language)) {
        throw new Refused(400, `"${language}" is no language of the tool's: it is ${Object.entries(LANGUAGES).map(([code, name]) => `${code} (${name})`).join(", ")}`);
      }
      const { file, saved } = await saveStory(dir, name, text);
      const shown = path.relative(dir, file).split(path.sep).join("/");
      log(saved ? `\nSaved: ${shown}` : `\n${shown} holds this text already: nothing written`);
      const inLanguage = LANGUAGES[language as Language];
      // The story stays saved: with what is in the way mended, or another language, the same name gets its prompt.
      const prompt = await promptFor(file, language as Language, log).catch((e: Error) => {
        throw new Refused(422, `No prompt for ${shown}, in ${inLanguage}: ${e.message}`);
      });
      log(`The prompt of ${shown}, in ${inLanguage}: ${prompt.length} characters`);
      return { file: shown, saved, language, prompt };
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
