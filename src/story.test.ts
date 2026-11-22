// A story taken through a chat by the clipboard, with a fake clipboard, keyboard, browser and
// make: the prompt given, each answer added to the reply's file and imported, "continue" and what
// was refused asked for, the episodes made as their outputs say, and a run gone on from its file.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { GO_ON, replyFileOf, runStory, type StoryIO } from "./story.ts";

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

/** A project with the square plugin, its settings as given, a library of red, and a story. */
async function project(name: string, settings: Record<string, unknown> = {}) {
  const root = path.join(scratch, name);
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "stories"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "src/plugin.mjs", ...settings } }));
  await writeFile(path.join(root, "src", "plugin.mjs"), PLUGIN);
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
  const made = await runStory(story, io, make, (m) => said.push(m));
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
  await runStory(story, again.io, remade.make, (m) => said2.push(m));
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
  const made = await runStory(story, io, make, (m) => said.push(m));
  assert.match(said.join("\n"), /The clipboard holds no YAML block: copy the chat's whole answer with its copy button, which keeps the ```yaml blocks\./);
  assert.match(given[1]!, /- sq-2: no colour is named blue/);
  assert.deepEqual(calls, ["sq-1 video"]);
  assert.deepEqual(made, [path.join(root, "out", "sq-1.mp4")]);
});

test("nothing taken is nothing to make; a reply is no story", async () => {
  const { root, story } = await project("none");
  const { io } = user([{ copied: episode("sq-1", "blue") }, { type: GO_ON }, { type: GO_ON }]);
  const { make, calls } = makes(root);
  await assert.rejects(runStory(story, io, make, () => {}), /Stopped: no episode of stories\/sq\.reply\.md was taken, so there is nothing to make\./);
  assert.deepEqual(calls, []);
  await assert.rejects(runStory(replyFileOf(story), io, make, () => {}), /sq\.reply\.md: a story is <name>\.md, its name in lowercase letters, digits and dashes \(a reply, <name>\.reply\.md, is not one\)/);
});
