// The server of `serve`, started on a free port in a project of a square plugin: its page; a text
// saved and wrapped in the prompt that `prompt` prints for its file, in English and, told by its
// letters, in Ukrainian; a name another text has refused, with nothing written over; and a request
// that is not its own page's (another site's, or at another name for this machine) refused.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request, type IncomingHttpHeaders } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { promptFor } from "./prompt.ts";
import { languageOf, serve } from "./serve.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-serve-"));

/** A square of a colour of the library, whose videos are scripts, its guide in English and Ukrainian. */
const PLUGIN = `
export default {
  scene: "square",
  stage: { width: 160, height: 90 },
  script: {
    actions: {},
    guide: { en: "A square of a colour of the library says its lines.", uk: "Квадрат кольору з бібліотеки каже свої репліки." },
    check: (scenes) => ({ scenes: scenes.map((scene) => ({ setting: {}, actions: [] })) }),
    draw: () => () => "<svg/>",
  },
};
`;

// A project with no stories yet: the server makes their folder.
const root = path.join(scratch, "squares");
await mkdir(path.join(root, "src"), { recursive: true });
await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "src/plugin.mjs", voice: { en: "af_heart", uk: "uk_f1" } } }));
await writeFile(path.join(root, "src", "plugin.mjs"), PLUGIN);
await writeFile(path.join(root, "library.yaml"), "colours:\n  red: '#d04040'\n");

const said: string[] = [];
const serving = await serve(root, 0, (m) => said.push(m));
const port = new URL(serving.url).port;
// The plugin's process leaves the project's folder a moment after it is closed: on Windows the folder is busy until then.
after(async () => {
  await serving.close();
  await rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/** A request with the headers given, and no other of a browser's: its answer. */
function call(opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(opts.path ?? "/", serving.url), { method: opts.method ?? "GET", headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(opts.body);
  });
}

/** What the server's own page asks: JSON, from its address. `headers` go over the page's. */
async function ask(where: string, body: unknown, headers: Record<string, string> = {}) {
  const { status, body: answer } = await call({ method: "POST", path: where, headers: { Origin: serving.url, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status, answer: JSON.parse(answer) as { error?: string; language?: string; file?: string; saved?: boolean; prompt?: string } };
}

const story = (name: string) => path.join(root, "stories", `${name}.md`);

test("the page: a field for the story's name, one for its text, its language and its prompt, and nothing run in it but its own", async () => {
  const { status, headers, body } = await call({});
  assert.equal(status, 200);
  assert.equal(headers["content-type"], "text/html; charset=utf-8");
  for (const field of ['<input id="name"', '<textarea id="text"', '<select id="language">', '<textarea id="prompt"', '<button id="save"', '<button id="copy"']) assert.ok(body.includes(field), field);
  assert.ok(body.includes('<select id="language"><option value="en">English</option><option value="uk">Ukrainian</option><option value="ru">Russian</option></select>'));
  assert.ok(body.includes(`<code>${root}</code>`));
  assert.doesNotMatch(body, /\{\{/);
  // Its script and its style are named by a nonce, new for each page, and nothing else runs or loads.
  const nonce = /script-src 'nonce-([^']+)'/.exec(headers["content-security-policy"] as string)![1]!;
  assert.ok(body.includes(`<script nonce="${nonce}">`) && body.includes(`<style nonce="${nonce}">`));
  assert.match(headers["content-security-policy"] as string, /^default-src 'none'; .*connect-src 'self'; .*frame-ancestors 'none'$/);
  assert.ok(!(await call({})).body.includes(nonce));
});

test("a text under a new name is saved as stories/<name>.md, and its prompt is what prompt prints for that file", async () => {
  const text = "Two squares meet in a field.\r\nOne of them says hello.";
  assert.deepEqual((await ask("/language", { text })).answer, { language: "en" });
  const { status, answer } = await ask("/story", { name: "sq", text, language: "en" });
  assert.equal(status, 200);
  assert.equal(await readFile(story("sq"), "utf8"), "Two squares meet in a field.\nOne of them says hello.\n");
  assert.deepEqual(answer, { file: "stories/sq.md", saved: true, language: "en", prompt: await promptFor(story("sq"), "en", () => {}) });
  assert.match(answer.prompt!, /^# Videos from a story\n[\s\S]*Name the episodes sq-1, sq-2[\s\S]*\nTwo squares meet in a field\.\nOne of them says hello\.\n$/);
  assert.match(said.join("\n"), /\nSaved: stories\/sq\.md\n[\s\S]*\nThe prompt of stories\/sq\.md, in English: \d+ characters$/);

  // Again, the file holding this text already: nothing is written, and the prompt is the same. Then in another language.
  const again = await ask("/story", { name: "sq", text: `${text}\n`, language: "en" });
  assert.deepEqual(again.answer, { ...answer, saved: false });
  // A language the plugin teaches no script in has no prompt, and says why.
  const russian = await ask("/story", { name: "sq", text, language: "ru" });
  assert.deepEqual(russian, { status: 422, answer: { error: "No prompt for stories/sq.md, in Russian: the plugin's guide to a script is in English and Ukrainian, and not in Russian" } });
});

test("a text in Ukrainian is told by its letters, and its prompt is what prompt --language uk prints", async () => {
  const text = "Два квадрати зустрілися в полі. Один із них привітався.\n";
  const { answer: told } = await ask("/language", { text });
  assert.deepEqual(told, { language: "uk" });
  const { status, answer } = await ask("/story", { name: "kvadraty", text, language: told.language });
  assert.equal(status, 200);
  assert.equal(await readFile(story("kvadraty"), "utf8"), text);
  assert.equal(answer.prompt, await promptFor(story("kvadraty"), "uk", () => {}));
  assert.match(answer.prompt!, /^# Відео з історії\n[\s\S]*\nepisode: kvadraty-uk-1 [\s\S]*\nДва квадрати зустрілися в полі\. Один із них привітався\.\n$/);
  // The language is the one picked, whatever the letters say.
  const english = await ask("/story", { name: "kvadraty", text, language: "en" });
  assert.equal(english.answer.prompt, await promptFor(story("kvadraty"), "en", () => {}));
});

test("the language of a text is its letters': English, or the one of Ukrainian and Russian whose own letters it has more of", () => {
  assert.equal(languageOf("The Mole had been working all morning."), "en");
  assert.equal(languageOf("Кріт працював увесь ранок: прибирав свою хатку."), "uk");
  assert.equal(languageOf("Крот работал всё утро: это была весенняя уборка, и пыль была везде."), "ru");
  // Names of another alphabet in it change nothing; with no letters, or none of either's own, it is the first.
  assert.equal(languageOf("The Mole (Кріт) had been working all morning."), "en");
  assert.equal(languageOf("Кріт на ім'я Mole працював увесь ранок."), "uk");
  assert.equal(languageOf(""), "en");
  assert.equal(languageOf("1908"), "en");
  assert.equal(languageOf("Привет"), "uk");
});

test("a name another text has is refused, and nothing is written over", async () => {
  const before = await readFile(story("sq"), "utf8");
  const { status, answer } = await ask("/story", { name: "sq", text: "Three squares meet in a field.", language: "en" });
  assert.equal(status, 409);
  assert.deepEqual(answer, { error: "stories/sq.md is another text, and nothing is written over: give this one another name." });
  assert.equal(await readFile(story("sq"), "utf8"), before);
});

test("what has no name, no text or no language of the tool's is refused, with nothing written", async () => {
  const text = "A square waits.";
  for (const [name, why] of [["", /^The story has no name: give it one in lowercase letters/], ["The Race", /^"The Race" is no name for a story: give it one in lowercase letters, digits and dashes, a letter first \(the-race\)/], ["../sq", /is no name for a story/], ["sq.reply", /is no name for a story/]] as const) {
    const { status, answer } = await ask("/story", { name, text, language: "en" });
    assert.equal(status, 400);
    assert.match(answer.error!, why);
  }
  assert.deepEqual(await ask("/story", { name: "waits", text: " \n", language: "en" }), { status: 400, answer: { error: "There is no text: paste the story." } });
  assert.deepEqual(await ask("/story", { name: "waits", text, language: "de" }), { status: 400, answer: { error: '"de" is no language of the tool\'s: it is en (English), uk (Ukrainian), ru (Russian)' } });
  assert.equal((await ask("/story", { name: "waits", text })).status, 400);
  assert.equal((await ask("/language", { text: "a".repeat(2_000_001) })).status, 413);
  assert.equal((await call({ method: "POST", path: "/story", headers: { Origin: serving.url, "Content-Type": "application/json" }, body: "{" })).status, 400);
  assert.equal((await ask("/videos", {})).status, 404);
  assert.equal((await call({ path: "/story" })).status, 405);
  assert.ok(!existsSync(story("waits")));
});

test("a request from another site's page is refused, and one at another name for this machine", async () => {
  const body = { name: "theirs", text: "A square of theirs.", language: "en" };
  // Another site's page, a page with no address of its own (a file, a frame shut in), and what names no page.
  for (const origin of ["https://example.com", `http://127.0.0.1:${Number(port) + 1}`, `https://127.0.0.1:${port}`, "null"]) {
    const { status, answer } = await ask("/story", body, { Origin: origin });
    assert.equal(status, 403);
    assert.equal(answer.error, `This server answers its own page alone, ${serving.url}: a request from ${origin} is refused.`);
  }
  const none = await call({ method: "POST", path: "/story", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(none.status, 403);
  assert.match(none.body, /a request from no page is refused/);
  assert.equal((await ask("/language", { text: "A square." }, { Origin: "https://example.com" })).status, 403);
  // A site's name made to mean this machine: its page's requests name that site as their Host, and so does its own page's.
  const renamed = await ask("/story", body, { Host: `example.com:${port}`, Origin: `http://example.com:${port}` });
  assert.equal(renamed.status, 403);
  assert.equal(renamed.answer.error, `This server answers at its own address alone, ${serving.url}: not at example.com:${port}.`);
  assert.equal((await call({ headers: { Host: `example.com:${port}` } })).status, 403);
  assert.ok(!existsSync(story("theirs")));
  // No answer says another site's page may read it.
  for (const answer of [await call({}), await call({ method: "POST", path: "/story", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: "{}" })]) {
    assert.equal(answer.headers["access-control-allow-origin"], undefined);
  }
  // The page's own address by its other name is its own too.
  const local = await ask("/language", { text: "A square." }, { Host: `localhost:${port}`, Origin: `http://localhost:${port}` });
  assert.deepEqual(local, { status: 200, answer: { language: "en" } });
});

test("a port that is taken is said, and a folder that is no project", async () => {
  await assert.rejects(serve(root, Number(port), () => {}), new RegExp(`^Error: Port ${port} is taken: serve may be running already \\(http://127\\.0\\.0\\.1:${port}\\)\\. Stop that one, or give this one another port: --port ${Number(port) + 1}$`));
  const none = path.join(scratch, "none");
  await mkdir(none, { recursive: true });
  await writeFile(path.join(none, "package.json"), "{}");
  await assert.rejects(serve(none, 0, () => {}), /none: no package\.json here, or above, names a plugin \("ai-videos": \{ "plugin" \}\)\. serve is typed in a project's folder/);
});
