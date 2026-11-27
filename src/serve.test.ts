// The server of `serve`, started on a free port in a project of a square plugin: its page; a text
// saved and wrapped in the prompt that `prompt` prints for its file, in English and, told by its
// letters, in Ukrainian; a name another text has refused, with nothing written over; the chat's
// answers added to the reply's file and imported, one cut off and continued, an episode refused
// and then mended, to the files `story` writes (story.test.ts); and a request that is not its own
// page's (another site's, or at another name for this machine) refused.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request, type IncomingHttpHeaders } from "node:http";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { promptFor } from "./prompt.ts";
import { languageOf, serve } from "./serve.ts";

const fence = "```";
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-serve-"));

/**
 * A square of a colour of the library says a line: story.test.ts's two plugins in one. A video is a
 * plan's (`colour: red`) or written as a script, its guide in English and Ukrainian; a colour the
 * library lacks is refused in both.
 */
const PLUGIN = `
const string = { "~standard": { version: 1, vendor: "test", validate: (v) => ({ value: v }), jsonSchema: { input: () => ({}), output: () => ({}) } } };
export default {
  scene: "square",
  stage: { width: 160, height: 90 },
  commands: { colour: { description: "The square's colour, by name.", example: "red", schema: string } },
  guide: "A square of a colour of the library says a line.",
  check(raw, file, library) {
    if (!library?.raw?.colours?.[raw.colour]) throw new Error(file + ": no colour is named " + raw.colour);
    return raw;
  },
  plan: (s) => ({ duration: 2, events: [{ name: "start", at: 0, span: "hold" }], texts: [{ text: "Hello.", from: 0, to: 2 }] }),
  frame: () => "<svg/>",
  script: {
    actions: {},
    guide: { en: "A square of a colour of the library says its lines.", uk: "Квадрат кольору з бібліотеки каже свої репліки." },
    check(scenes, library) {
      const issues = scenes.filter((scene) => !library?.raw?.colours?.[scene.setting.colour]).map((scene) => ({ line: scene.line, message: "no colour is named " + scene.setting.colour, hint: "name a colour of the library" }));
      return issues.length ? { issues } : { scenes: scenes.map((scene) => ({ setting: { colour: scene.setting.colour }, actions: [] })) };
    },
    draw: () => () => "<svg/>",
  },
};
`;

// A project with no stories yet: the server makes their folder.
const root = path.join(scratch, "squares");
await mkdir(path.join(root, "src"), { recursive: true });
await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "src/plugin.mjs", voice: { en: "af_heart", uk: "uk_f1" } } }));
await writeFile(path.join(root, "src", "plugin.mjs"), PLUGIN);
// The library as a checkout on Windows has it, its lines ended by CRLF: so the prompt, which holds it as written, has both endings.
await writeFile(path.join(root, "library.yaml"), "colours:\r\n  red: '#d04040'\r\n");

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

/** What the server gives its page: why it refused, or what /language, /story or /answer did. */
interface Answered {
  error?: string;
  language?: string;
  file?: string;
  saved?: boolean;
  prompt?: string;
  reply?: string;
  added?: string | null;
  episodes?: string[];
  refused?: string | null;
  ended?: boolean;
  words?: { allWritten: string; goOn: string };
  log?: string;
}

/** What the server's own page asks: JSON, from its address. `headers` go over the page's. */
async function ask(where: string, body: unknown, headers: Record<string, string> = {}) {
  const { status, body: answer } = await call({ method: "POST", path: where, headers: { Origin: serving.url, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status, answer: JSON.parse(answer) as Answered };
}

const story = (name: string) => path.join(root, "stories", `${name}.md`);
const reply = (name: string) => path.join(root, "stories", `${name}.reply.md`);
const video = (name: string) => path.join(root, "videos", `${name}.yaml`);

/** The stories the tests save, each under its name: one in English and one in Ukrainian. */
const SQ = "Two squares meet in a field.\r\nOne of them says hello.";
const KVADRATY = "Два квадрати зустрілися в полі. Один із них привітався.\n";

/** An episode of a plan, as story.test.ts has it, and one in Ukrainian, written as a script. */
const episode = (name: string, colour: string) => `${fence}yaml\nepisode: ${name}\nuse: square\ncolour: ${colour}\n${fence}\n`;
const ukrainian = (name: string, colour: string) => `${fence}yaml\nepisode: ${name}\nuse: square\nlanguage: uk\nscenes:\n  - colour: ${colour}\n    script: |\n      narrator say: Два квадрати зустрілися.\n${fence}\n`;

/** What an answer did, without the import's log. */
const did = ({ log: _, ...rest }: Answered) => rest;

test("the page: a field for the story's name, one for its text, its language, its prompt and the chat's answer, and nothing run in it but its own", async () => {
  const { status, headers, body } = await call({});
  assert.equal(status, 200);
  assert.equal(headers["content-type"], "text/html; charset=utf-8");
  for (const field of ['<input id="name"', '<textarea id="text"', '<select id="language">', '<textarea id="prompt"', '<button id="save"', '<button id="copy"', '<textarea id="answer"', '<button id="start"', '<textarea id="refused"', '<button id="copy-refused"', '<pre id="log">']) {
    assert.ok(body.includes(field), field);
  }
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
  const text = SQ;
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
  const text = KVADRATY;
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

test("the chat's answers: one cut off and continued, an episode refused and then mended, to the files story writes", async () => {
  const { answer: saved } = await ask("/story", { name: "sq", text: SQ, language: "en" });
  const answers = (answer: string) => ask("/answer", { name: "sq", language: "en", answer });
  const words = { allWritten: "All episodes written.", goOn: "continue" };

  // Before any answer there is nothing to go on from. The prompt in place of the chat's answer is none,
  // though it holds YAML blocks: as the page's field gives it, its lines ended by line feeds, where the
  // prompt has the library's CRLF, and as it is. Nor is an answer copied without its blocks.
  assert.deepEqual(await answers(""), { status: 400, answer: { error: "There is no answer: paste the chat's whole answer, copied with its copy button." } });
  assert.ok(saved.prompt!.includes("\ncolours:\r\n  red: '#d04040'\n"), "the prompt holds the library as written");
  for (const pasted of [saved.prompt!.replace(/\r\n/g, "\n"), saved.prompt!]) {
    assert.deepEqual(await answers(pasted), { status: 400, answer: { error: "This is what the page gave for the chat, and not the chat's answer: copy the chat's answer, and paste it." } });
  }
  assert.deepEqual(await answers("Sure! The squares meet."), { status: 400, answer: { error: "The answer holds no YAML block: copy the chat's whole answer with its copy button, which keeps the ```yaml blocks." } });
  assert.ok(!existsSync(reply("sq")));

  // The first answer is cut off in its second block: its first episode is taken, and the chat is to go on.
  const first = `Here they are.\n\n${episode("sq-1", "red")}\n${fence}yaml\nepisode: sq-2\nuse: sq`;
  const one = await answers(first.replace(/\n/g, "\r\n"));
  assert.equal(one.status, 200);
  assert.deepEqual(did(one.answer), { reply: "stories/sq.reply.md", added: "the answer, 1 whole block, and one cut off", episodes: ["videos/sq-1.yaml"], refused: null, ended: false, words });
  assert.match(one.answer.log!, /^Reply: stories\/sq\.reply\.md: 1 whole block\n {2}The block at line 9 is cut off: not counted\.\n[\s\S]*\nvideos\/sq-1\.yaml: written$/);
  assert.match(said.join("\n"), /\nAdded to stories\/sq\.reply\.md: the answer, 1 whole block, and one cut off\.\nReply: stories\/sq\.reply\.md: 1 whole block\n/);
  // The same answer again is no next one.
  assert.deepEqual(await answers(first), { status: 400, answer: { error: "That answer is in stories/sq.reply.md already: paste the chat's next one. With the field empty, Start goes on from the file." } });

  // The second ends the reply, and its episode names a colour the library lacks: refused, as the message for the chat.
  const second = `${episode("sq-2", "green")}\nAll episodes written.\nI left out the field.\n`;
  const two = await answers(second);
  assert.deepEqual(did({ ...two.answer, refused: null }), { reply: "stories/sq.reply.md", added: "the answer, 1 whole block", episodes: ["videos/sq-1.yaml"], refused: null, ended: true, words });
  assert.match(two.answer.refused!, /^The tool refused these episodes\. Send each again, its block whole and mended:\n\n- sq-2: no colour is named green/);
  assert.match(two.answer.log!, /\nvideos\/sq-1\.yaml: there already, as imported\nRefused: sq-2: no colour is named green$/);
  assert.ok(!existsSync(video("sq-2")));
  // That message in place of the chat's answer is none either.
  assert.deepEqual(await answers(two.answer.refused!), { status: 400, answer: { error: "This is what the page gave for the chat, and not the chat's answer: copy the chat's answer, and paste it." } });

  // Mended, it is taken.
  const mended = episode("sq-2", "red");
  const three = await answers(mended);
  const all = { reply: "stories/sq.reply.md", episodes: ["videos/sq-1.yaml", "videos/sq-2.yaml"], refused: null, ended: true, words };
  assert.deepEqual(did(three.answer), { ...all, added: "the answer, 1 whole block" });

  // The files are those story writes (story.test.ts): the reply's is the three answers, one after another.
  const replied = `${first}\n\n${second}\n${mended}`;
  assert.equal(await readFile(reply("sq"), "utf8"), replied);
  assert.equal(await readFile(video("sq-1"), "utf8"), "use: square\ncolour: red\n");
  assert.equal(await readFile(video("sq-2"), "utf8"), "use: square\ncolour: red\n");

  // With no answer, it goes on from the reply's file: nothing is added, and the episodes are the same.
  const again = await answers(" \n");
  assert.deepEqual(did(again.answer), { ...all, added: null });
  assert.match(again.answer.log!, /\nvideos\/sq-1\.yaml: there already, as imported\nvideos\/sq-2\.yaml: there already, as imported$/);
  assert.match(said.join("\n"), /\nNo new answer: going on from stories\/sq\.reply\.md\.\nReply: /);
  assert.equal(await readFile(reply("sq"), "utf8"), replied);
});

test("a story in Ukrainian: its answers in its own reply's file, cut off and refused at once, and the prompt's words for the chat", async () => {
  await ask("/story", { name: "kvadraty", text: KVADRATY, language: "uk" });
  const answers = (answer: string) => ask("/answer", { name: "kvadraty", language: "uk", answer });
  const words = { allWritten: "Усі епізоди написано.", goOn: "продовжуй" };

  // Cut off in its second block, and its first episode refused: the page gets both.
  const first = `Ось вони.\n\n${ukrainian("kvadraty-uk-1", "green")}\n${fence}yaml\nepisode: kvadraty-uk-2\nuse: sq`;
  const one = await answers(first);
  assert.deepEqual(did({ ...one.answer, refused: null }), { reply: "stories/kvadraty-uk.reply.md", added: "the answer, 1 whole block, and one cut off", episodes: [], refused: null, ended: false, words });
  assert.match(one.answer.refused!, /^The tool refused these episodes\. Send each again, its block whole and mended:\n\n- kvadraty-uk-1: a mistake, at its line of the block[\s\S]*no colour is named green/);

  // Its line in Ukrainian ends it.
  const second = `${ukrainian("kvadraty-uk-1", "red")}\n${ukrainian("kvadraty-uk-2", "red")}\nУсі епізоди написано.\n`;
  const two = await answers(second);
  assert.deepEqual(did(two.answer), { reply: "stories/kvadraty-uk.reply.md", added: "the answer, 2 whole blocks", episodes: ["videos/kvadraty-uk-1.yaml", "videos/kvadraty-uk-2.yaml"], refused: null, ended: true, words });
  assert.equal(await readFile(reply("kvadraty-uk"), "utf8"), `${first}\n\n${second}`);
  assert.ok(!existsSync(reply("kvadraty")));
  assert.equal(await readFile(video("kvadraty-uk-2"), "utf8"), "use: square\nlanguage: uk\nscenes:\n  - colour: red\n    script: |\n      narrator say: Два квадрати зустрілися.\n");
});

test("an episode with no yaml fence is read as one: a code block's own copy, and a block fenced with no language", async () => {
  await ask("/story", { name: "bare", text: "A bare square.", language: "en" });
  const answers = (answer: string) => ask("/answer", { name: "bare", language: "en", answer });
  const words = { allWritten: "All episodes written.", goOn: "continue" };
  const body = (name: string) => `episode: ${name}\nuse: square\ncolour: red\n`;

  // The episode alone, as its code block's copy button gives it: taken, and the chat has not said it is done.
  const one = await answers(body("bare-1"));
  assert.deepEqual(did(one.answer), { reply: "stories/bare.reply.md", added: "the answer, 1 whole block; its episode had no ```yaml fence, and was given one", episodes: ["videos/bare-1.yaml"], refused: null, ended: false, words });
  // In a fence with no language, with the chat's last line after it.
  const two = await answers(`${fence}\n${body("bare-2")}${fence}\n\nAll episodes written.\n`);
  assert.deepEqual(did(two.answer), { reply: "stories/bare.reply.md", added: "the answer, 1 whole block; its block's fence had no language, and was given yaml", episodes: ["videos/bare-1.yaml", "videos/bare-2.yaml"], refused: null, ended: true, words });
  // Pasted again as it was, it is the answer added last.
  assert.equal((await answers(`${fence}\n${body("bare-2")}${fence}\n\nAll episodes written.\n`)).status, 400);

  // The reply's file holds each as a YAML block, so import reads it as any reply.
  assert.equal(await readFile(reply("bare"), "utf8"), `${episode("bare-1", "red")}\n${episode("bare-2", "red")}\nAll episodes written.\n`);
  assert.equal(await readFile(video("bare-2"), "utf8"), "use: square\ncolour: red\n");
});

test("two answers at once are taken one after the other: the second is added when the first is imported", async () => {
  await ask("/story", { name: "pair", text: "A pair of squares.", language: "en" });
  const [a, b] = [`${episode("pair-1", "red")}`, `${episode("pair-2", "red")}\nAll episodes written.\n`];
  const from = said.length;
  const both = await Promise.all([a, b].map((answer) => ask("/answer", { name: "pair", language: "en", answer })));
  assert.deepEqual(both.map(({ status }) => status), [200, 200]);
  const replied = await readFile(reply("pair"), "utf8");
  assert.ok(replied === `${a}\n${b}` || replied === `${b}\n${a}`, replied);
  assert.ok(existsSync(video("pair-1")) && existsSync(video("pair-2")));
  // Between the two answers added, the first one's episode is written.
  const log = said.slice(from);
  const added = log.flatMap((line, i) => (line.includes("Added to stories/pair.reply.md") ? [i] : []));
  assert.equal(added.length, 2);
  assert.ok(log.slice(added[0], added[1]).some((line) => /^videos\/pair-\d\.yaml: written$/.test(line)), log.join("\n"));
});

test("an answer for a story that is not saved, or with no name or language of the tool's, is refused, with nothing written", async () => {
  const answer = `${episode("nobody", "red")}\nAll episodes written.\n`;
  assert.deepEqual(await ask("/answer", { name: "nobody", language: "en", answer }), { status: 404, answer: { error: "There is no stories/nobody.md: save the story under this name first, and give its prompt to a chat." } });
  for (const [name, why] of [["", /^The story has no name: give it one in lowercase letters/], ["../sq", /is no name for a story/], ["sq.reply", /is no name for a story/]] as const) {
    const refused = await ask("/answer", { name, language: "en", answer });
    assert.equal(refused.status, 400);
    assert.match(refused.answer.error!, why);
  }
  assert.deepEqual(await ask("/answer", { name: "sq", language: "de", answer }), { status: 400, answer: { error: '"de" is no language of the tool\'s: it is en (English), uk (Ukrainian), ru (Russian)' } });
  assert.equal((await ask("/answer", { name: "sq", language: "en" })).status, 400);
  assert.equal((await ask("/answer", { name: "sq", language: "en", answer }, { Origin: "https://example.com" })).status, 403);
  assert.equal((await call({ path: "/answer" })).status, 405);
  assert.ok(!existsSync(reply("nobody")) && !existsSync(video("nobody")));
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
