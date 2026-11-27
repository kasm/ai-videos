// A story taken through a chat by the clipboard, with a fake clipboard, keyboard, browser and
// make: the prompt given, each answer added to the reply's file and imported, "continue" and what
// was refused asked for, the episodes made as their outputs say, and a run gone on from its file.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { GO_ON, answerOf, replyFileOf, runStory, type StoryIO } from "./story.ts";

const fence = "```";
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-story-"));
// The plugin's process leaves the project's folder a moment after it is closed: on Windows the folder is busy until then.
after(() => rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

/** A square of a colour of the library says a line. */
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
};
`;

/** A square of a colour of the library, whose videos are scripts, its guide in English and Ukrainian. */
const SCRIPT_PLUGIN = `
export default {
  scene: "square",
  stage: { width: 160, height: 90 },
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

/** A project with a square plugin, its settings as given, a library of red, and a story. */
async function project(name: string, settings: Record<string, unknown> = {}, plugin = PLUGIN) {
  const root = path.join(scratch, name);
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "stories"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "src/plugin.mjs", ...settings } }));
  await writeFile(path.join(root, "src", "plugin.mjs"), plugin);
  await writeFile(path.join(root, "library.yaml"), "colours:\n  red: '#d04040'\n");
  await writeFile(path.join(root, "stories", "sq.md"), "Two squares meet in a field.\n");
  return { root, story: path.join(root, "stories", "sq.md") };
}

const episode = (name: string, colour: string) => `${fence}yaml\nepisode: ${name}\nuse: square\ncolour: ${colour}\n${fence}\n`;

/**
 * The user, as a script: each Enter (or word typed) with what the clipboard then holds. What the
 * tool puts on the clipboard is kept, and is what a paste gives until the script copies again.
 */
function user(steps: { type?: string; copied?: string }[]) {
  const given: string[] = [];
  const asked: string[] = [];
  const opened: string[] = [];
  let clipboard = "what the user had copied";
  const io: StoryIO = {
    async copy(text) {
      given.push(text);
      clipboard = text;
    },
    async paste() {
      return clipboard;
    },
    async ask(question) {
      asked.push(question);
      const step = steps.shift();
      if (!step) throw new Error(`asked more than the script has: ${question}`);
      if (step.copied !== undefined) clipboard = step.copied;
      return step.type ?? "";
    },
    async open(file) {
      opened.push(file);
    },
  };
  return { io, given, asked, opened, left: steps };
}

/** A make that writes nothing, and says what it was asked. */
function makes(root: string) {
  const calls: string[] = [];
  return {
    calls,
    make: async (video: string, as: "video" | "web") => {
      const name = path.basename(video, ".yaml");
      calls.push(`${name} ${as}`);
      return path.join(root, "out", `${name}.${as === "web" ? "html" : "mp4"}`);
    },
  };
}

test("a story through the chat: the prompt, an answer cut off and continued, what was refused mended, then the pages and the videos", async () => {
  const { root, story } = await project("flow", { outputs: { web: true } });
  const first = `Here they are.\n\n${episode("sq-1", "red")}\n${fence}yaml\nepisode: sq-2\nuse: sq`;
  const second = `${episode("sq-2", "green")}\nAll episodes written.\nI left out the field.\n`;
  const mended = `${episode("sq-2", "red")}`;
  const { io, given, asked, opened, left } = user([
    {}, // Enter too soon: the clipboard still holds the prompt
    { copied: first },
    { copied: first }, // the same answer again
    { copied: second },
    { copied: mended },
  ]);
  const { make, calls } = makes(root);
  const said: string[] = [];
  const made = await runStory(story, "en", io, make, (m) => said.push(m));
  const log = said.join("\n");

  // The prompt first, the story in it, then what was refused, as the import words it for the chat.
  assert.equal(given.length, 2);
  assert.match(given[0]!, /Two squares meet in a field\./);
  assert.match(given[1]!, /^The tool refused these episodes\. Send each again, its block whole and mended:\n\n- sq-2: no colour is named green/);
  assert.match(log, /The clipboard still holds what was put there for the chat: copy the chat's answer\./);
  assert.match(log, /That answer is in stories\/sq\.reply\.md already: copy the chat's next one\./);
  assert.match(log, /The chat has not said "All episodes written\."\. If it stopped before the end, type continue in the chat, and copy its answer\./);
  assert.equal(asked.filter((q) => q.includes(GO_ON)).length, 3, "done is offered once the chat has answered");
  assert.equal(left.length, 0);

  // The reply's file is the three answers, one after another.
  assert.equal(await readFile(replyFileOf(story), "utf8"), `${first}\n\n${second}\n${mended}`);
  assert.equal(await readFile(path.join(root, "videos", "sq-2.yaml"), "utf8"), "use: square\ncolour: red\n");

  // The pages first, each opened, then the videos.
  assert.deepEqual(calls, ["sq-1 web", "sq-2 web", "sq-1 video", "sq-2 video"]);
  assert.deepEqual(opened, [path.join(root, "out", "sq-1.html"), path.join(root, "out", "sq-2.html")]);
  assert.deepEqual(made, [...opened, path.join(root, "out", "sq-1.mp4"), path.join(root, "out", "sq-2.mp4")]);
  assert.match(log, /Made, from stories\/sq\.md:\n {2}out\/sq-1\.html\n {2}out\/sq-2\.html\n {2}out\/sq-1\.mp4\n {2}out\/sq-2\.mp4$/);

  // Run again, it goes on from the reply's file: no prompt, nothing asked, the same episodes made.
  const again = user([]);
  const remade = makes(root);
  const said2: string[] = [];
  await runStory(story, "en", again.io, remade.make, (m) => said2.push(m));
  assert.deepEqual([again.given, again.asked], [[], []]);
  assert.match(said2.join("\n"), /stories\/sq\.reply\.md is there: going on from it\. To begin anew, in a new chat, delete it\./);
  assert.deepEqual(remade.calls, calls);
});

test("by default only the videos are made; done goes on with what there is", async () => {
  const { root, story } = await project("done");
  // A chat that never says it is done, and a block it does not mend.
  const { io, given } = user([
    { copied: "Sure! The squares meet." }, // no block in it
    { copied: `${episode("sq-1", "red")}${episode("sq-2", "blue")}` },
    { type: GO_ON },
    { type: ` ${GO_ON.toUpperCase()} ` },
  ]);
  const { make, calls } = makes(root);
  const said: string[] = [];
  const made = await runStory(story, "en", io, make, (m) => said.push(m));
  assert.match(said.join("\n"), /The clipboard holds no YAML block: copy the chat's whole answer with its copy button, which keeps the ```yaml blocks\./);
  assert.match(given[1]!, /- sq-2: no colour is named blue/);
  assert.deepEqual(calls, ["sq-1 video"]);
  assert.deepEqual(made, [path.join(root, "out", "sq-1.mp4")]);
});

test("nothing taken is nothing to make; a reply is no story", async () => {
  const { root, story } = await project("none");
  const { io } = user([{ copied: episode("sq-1", "blue") }, { type: GO_ON }, { type: GO_ON }]);
  const { make, calls } = makes(root);
  await assert.rejects(runStory(story, "en", io, make, () => {}), /Stopped: no episode of stories\/sq\.reply\.md was taken, so there is nothing to make\./);
  assert.deepEqual(calls, []);
  await assert.rejects(runStory(replyFileOf(story), "en", io, make, () => {}), /sq\.reply\.md: a story is <name>\.md, its name in lowercase letters, digits and dashes \(a reply, <name>\.reply\.md, is not one\)/);
});

test("what was given for the chat, or added from it, is no next answer, whatever ends its lines", () => {
  // A prompt holds the library as written, on Windows with CRLF; the clipboard's text, or a page's field, is read with line feeds.
  const last = { given: `The prompt.\r\n\r\n${episode("sq-1", "red").replace(/\n/g, "\r\n")}`, added: `${episode("sq-1", "red")}\nAll episodes written.\n` };
  assert.deepEqual(answerOf(last.given.replace(/\r\n/g, "\n"), last), { not: "given" });
  assert.deepEqual(answerOf(`\n${last.given}\n`, last), { not: "given" });
  assert.deepEqual(answerOf(last.added.replace(/\n/g, "\r\n"), last), { not: "added" });
  assert.deepEqual(answerOf(" \r\n", last), { not: "none" });
  assert.deepEqual(answerOf("Sure! The squares meet.", last), { not: "no-blocks" });
  // Any other text with a block, or one that says it is done, is an answer, its lines ended by line feeds.
  const next = answerOf(episode("sq-2", "red").replace(/\n/g, "\r\n"), last);
  assert.ok("text" in next);
  assert.deepEqual([next.text, next.read.blocks.length, next.read.cut.length, next.did], [episode("sq-2", "red"), 1, 0, []]);
  assert.ok("text" in answerOf("all episodes written", last));
  // An episode with no ```yaml fence, as a code block's own copy button gives it, is given one, and is an answer.
  const bare = answerOf("episode: sq-2\r\nuse: square\r\ncolour: red\r\n", last);
  assert.ok("text" in bare);
  assert.deepEqual([bare.text, bare.read.blocks.length, bare.did], [episode("sq-2", "red"), 1, ["its episode had no ```yaml fence, and was given one"]]);
  // Pasted again, it is the answer added last, as it was mended.
  assert.deepEqual(answerOf("episode: sq-2\nuse: square\ncolour: red\n", { given: "", added: bare.text }), { not: "added" });
});

/** An episode in Ukrainian, written as a script: the narrator says a line on a square of a colour. */
const ukrainian = (name: string, colour: string) => `${fence}yaml\nepisode: ${name}\nuse: square\nlanguage: uk\nscenes:\n  - colour: ${colour}\n    script: |\n      narrator say: Два квадрати зустрілися.\n${fence}\n`;

test("a story in Ukrainian: the prompt in it, the reply in its own file, continued and mended in its words, and its episodes made", async () => {
  const { root, story } = await project("uk", { voice: { en: "af_heart", uk: "uk_f1" } }, SCRIPT_PLUGIN);
  const first = `Ось вони.\n\n${ukrainian("sq-uk-1", "red")}\n${fence}yaml\nepisode: sq-uk-2\nuse: sq`;
  const second = `${ukrainian("sq-uk-2", "green")}\nУсі епізоди написано.\nПоле лишилося поза епізодами.\n`;
  const mended = ukrainian("sq-uk-2", "red");
  const { io, given, left } = user([{ copied: first }, { copied: second }, { copied: mended }]);
  const { make, calls } = makes(root);
  const said: string[] = [];
  await runStory(story, "uk", io, make, (m) => said.push(m));
  const log = said.join("\n");

  // The prompt is in Ukrainian, its episodes named with the language's code, and the story in it as written.
  assert.match(given[0]!, /^# Відео з історії\n/);
  assert.match(given[0]!, /\nepisode: sq-uk-1 +# ім'я епізоду\n/);
  assert.match(given[0]!, /\n## Формат\n\nКвадрат кольору з бібліотеки каже свої репліки\.\n/);
  assert.match(given[0]!, /Two squares meet in a field\.\n$/);
  // Cut off, the chat is told to go on in the prompt's word; it ends with the line in Ukrainian.
  assert.match(log, /The chat has not said "Усі епізоди написано\."\. If it stopped before the end, type продовжуй in the chat, and copy its answer\./);
  assert.match(given[1]!, /^The tool refused these episodes\. Send each again, its block whole and mended:\n\n- sq-uk-2: a mistake, at its line of the block[\s\S]*no colour is named green/);
  assert.equal(left.length, 0);

  // The reply's file is the language's own, beside the story, and the episodes say their language.
  assert.equal(replyFileOf(story, "uk"), path.join(root, "stories", "sq-uk.reply.md"));
  assert.equal(await readFile(replyFileOf(story, "uk"), "utf8"), `${first}\n\n${second}\n${mended}`);
  await assert.rejects(readFile(replyFileOf(story), "utf8"));
  assert.equal(await readFile(path.join(root, "videos", "sq-uk-2.yaml"), "utf8"), "use: square\nlanguage: uk\nscenes:\n  - colour: red\n    script: |\n      narrator say: Два квадрати зустрілися.\n");
  assert.deepEqual(calls, ["sq-uk-1 video", "sq-uk-2 video"]);

  // Run again in Ukrainian, it goes on from its file.
  const again = user([]);
  await runStory(story, "uk", again.io, makes(root).make, () => {});
  assert.deepEqual([again.given, again.asked], [[], []]);
});
