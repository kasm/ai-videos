// `check <file>` and a script's `make`, as they are typed (cli.ts), on a cache with nothing in it:
// the check speaks nothing, so it needs no voice model. A script's mistakes come each with the file,
// its line as written and a hint; any other video file is checked as its plugin checks it. The
// plugin here is a small one written for the test.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { run } from "./render.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-check-"));
after(() => rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

/** A cache with nothing in it: no voice model, no Chrome. */
const cache = path.join(scratch, "cache");
await mkdir(cache);
const cli = (args: string[]) => run(process.execPath, [path.join(ROOT, "src", "cli.ts"), ...args], { cwd: ROOT, env: { ...process.env, AI_VIDEOS_CACHE: cache } });

/** A square that slides to a side and speaks: written in events, or as a script whose scenes name a colour of the library. */
const PLUGIN = `
const any = { "~standard": { version: 1, vendor: "test", validate: (v) => ({ value: v }), jsonSchema: { input: () => ({}), output: () => ({}) } } };
const side = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (v) => (v.to === "left" || v.to === "right" ? { value: v } : { issues: [{ message: "it is left or right", path: ["to"] }] }),
    jsonSchema: { input: () => ({}), output: () => ({}) },
  },
};
export default {
  scene: "square",
  stage: { width: 160, height: 90 },
  commands: { colour: { description: "The square's colour.", example: "red", schema: any } },
  guide: "A square waits, then slides.",
  check(raw, file) {
    if (typeof raw.wait !== "number") throw new Error(file + ": say how long the square waits");
    return raw;
  },
  repair: (raw) => (raw.wait === "1" ? { source: { ...raw, wait: 1 }, did: ["the wait 1 is a number"] } : { source: raw, did: [] }),
  plan: (s) => ({
    duration: s.wait + 1,
    events: [{ name: "start", at: 0, span: "hold" }, { name: "slide", at: s.wait, span: "move" }],
    texts: [{ text: "It waits.", from: 0, to: s.wait }, { text: "It slides.", speaker: s.who ?? "sq", from: s.wait, to: s.wait + 1 }],
  }),
  frame: () => "<svg/>",
  script: {
    actions: { slide: { description: "The square slides to a side.", example: "sq slide to=right", values: side } },
    guide: "A square slides to a side, and speaks.",
    check(scenes, library) {
      const colours = library?.raw?.colours ?? {};
      const issues = scenes.filter((scene) => !colours[scene.setting.colour]).map((scene) => ({ line: scene.line, message: 'no colour is named "' + scene.setting.colour + '"', hint: "the library has " + Object.keys(colours).join(", ") }));
      if (issues.length) return { issues };
      return { scenes: scenes.map((scene) => ({ setting: { colour: colours[scene.setting.colour] }, actions: scene.actions.map((a) => ({ values: { x: a.values.to === "right" ? 120 : 20 }, length: 1.5 })) })) };
    },
    draw: () => () => "<svg/>",
  },
};
`;

const LIBRARY = "characters:\n  sq: { voice: am_puck }\n  odd: { voice: am_nobody }\ncolours:\n  red: '#d04040'\n";

/** The project, with these video files. */
const root = path.join(scratch, "square");
await mkdir(path.join(root, "src"), { recursive: true });
await mkdir(path.join(root, "videos"));
await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "./src/plugin.mjs" } }));
await writeFile(path.join(root, "src", "plugin.mjs"), PLUGIN);
await writeFile(path.join(root, "library.yaml"), LIBRARY);
const video = async (name: string, text: string) => {
  const file = path.join(root, "videos", `${name}.yaml`);
  await writeFile(file, text);
  return file;
};
const script = (lines: string[], colour = "red") => ["use: square", "scenes:", `  - colour: ${colour}`, "    script: |", ...lines.map((line) => `      ${line}`), ""].join("\n");

test("check takes a script with no mistake, with no voice model on the disk, and writes nothing", async () => {
  const file = await video("good", script(["sq slide to=right", "sq say: Here I am.", "narrator say: And it stays."]));
  const { code, stdout, stderr } = await cli(["check", file]);
  assert.equal(code, 0, stderr);
  assert.match(stdout, /^Checked: .*good\.yaml, a script of 1 scene and 3 lines, 2 of them said\.\n$/);
  assert.equal(existsSync(path.join(root, ".cache")), false);
  assert.equal(existsSync(path.join(cache, "tts")), false);
});

test("check refuses an unknown action, a wrong value and an unknown name, each with its line and a hint", async () => {
  const file = await video("wrong", script(["sq slid to=right", "sq slide to=up", "sk say: Here I am.", "sq say Here I am."]));
  const { code, stdout, stderr } = await cli(["check", file]);
  assert.equal(code, 1);
  assert.equal(stdout, "");
  const shown = stderr.replaceAll(path.relative(ROOT, file), "wrong.yaml").replaceAll(file, "wrong.yaml");
  assert.equal(
    shown,
    [
      "4 mistakes in wrong.yaml:",
      "",
      "wrong.yaml:5: sq slid to=right",
      '  no action is named "slid"',
      "  Hint: the actions are say and slide: did you mean slide?",
      "",
      "wrong.yaml:6: sq slide to=up",
      "  slide, to=up: it is left or right",
      "  Hint: as in: sq slide to=right",
      "",
      "wrong.yaml:7: sk say: Here I am.",
      '  "sk" is neither the narrator nor a character with a voice',
      "  Hint: the characters with a voice are sq and odd: did you mean sq?",
      "",
      "wrong.yaml:8: sq say Here I am.",
      '  "Here" is not a value',
      "  Hint: write a value as name=value, before the colon, and what is said after it: sq say: Hello!",
      "",
    ].join("\n"),
  );
});

test("check refuses a name from below, a loop, and a voice that follows a cut one in its block, each with both lines and a hint", async () => {
  const refused = async (name: string, lines: string[]) => {
    const file = await video(name, script(lines));
    const { code, stdout, stderr } = await cli(["check", file]);
    assert.equal(code, 1);
    assert.equal(stdout, "");
    return stderr.replaceAll(path.relative(ROOT, file), `${name}.yaml`).replaceAll(file, `${name}.yaml`);
  };
  assert.equal(
    await refused("below", ["sq say @ b.end - 0.5s: One.", "[b] odd say: Two."]),
    [
      "1 mistake in below.yaml:",
      "",
      "below.yaml:5: sq say @ b.end - 0.5s: One.",
      '  "b" is below, at line 6: a line begins by what is above it',
      "  below.yaml:6: [b] odd say: Two.",
      "  Hint: write line 6 above this one, or begin this one by something else",
      "",
    ].join("\n"),
  );
  assert.equal(
    await refused("round", ["together:", "  [s] sq slide to=right", "  narrator say: It goes.", "  sq say @ s.end: Here."]),
    [
      "1 mistake in round.yaml:",
      "",
      "round.yaml:8: sq say @ s.end: Here.",
      "  it goes round: line 6 waits for line 8 and line 8 waits for line 6",
      "  round.yaml:6: [s] sq slide to=right",
      "  Hint: begin it by the start, a share or a word of something above, or write it after the block",
      "",
    ].join("\n"),
  );
  assert.equal(
    await refused("cut", ["in order:", "  under:", "    sq say: One, two, three.", "  narrator say: It counts.", "  sq say: Four."]),
    [
      "1 mistake in cut.yaml:",
      "",
      "cut.yaml:9: sq say: Four.",
      "  sq is busy with line 7, which goes on under the rest to the end of the block both are in",
      "  cut.yaml:7: sq say: One, two, three.",
      "  Hint: write it after that block, or in the same under:, below that line",
      "",
    ].join("\n"),
  );
  // Blocks that have a time are taken, and their lines counted.
  const good = await cli(["check", await video("blocks", script(["sq slide to=right", "& narrator say: It slides.", "in order:", "  under:", "    sq say: One, two, three.", "  narrator say @ prev.start + 1s: It counts."]))]);
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /blocks\.yaml, a script of 1 scene and 4 lines, 3 of them said\.\n$/);
});

test("check refuses a name the plugin does not find, at its scene's line, and a voice the tool does not speak in", async () => {
  const blue = await cli(["check", await video("blue", script(["sq slide to=left"], "blue"))]);
  assert.equal(blue.code, 1);
  assert.match(blue.stderr, /^1 mistake in .*blue\.yaml:\n\n.*blue\.yaml:3: - colour: blue\n {2}no colour is named "blue"\n {2}Hint: the library has red\n$/);
  const odd = await cli(["check", await video("odd", script(["odd say: Hello."]))]);
  assert.equal(odd.code, 1);
  assert.match(odd.stderr, /odd\.yaml:5: odd say: Hello\.\n {2}odd speaks in am_nobody, which is not one of the tool's voices\n {2}Hint: odd's voice is in library\.yaml, or the file's cast: give one that npm run -s video -- voices lists\n$/);
});

test("check takes any other video file as its plugin checks it: mended, planned, every speaker with a voice", async () => {
  const good = await cli(["check", await video("events", "use: square\nwait: '1'\n")]);
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /^Checked: .*events\.yaml, 2 events and 2 lines\.\nMended by the plugin, in what it draws \(the file is as written\):\n {2}- the wait 1 is a number\n$/);
  const refused = await cli(["check", await video("no-wait", "use: square\n")]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /no-wait\.yaml: say how long the square waits/);
  const voiceless = await cli(["check", await video("voiceless", "use: square\nwait: 1\nwho: mo\n")]);
  assert.match(voiceless.stderr, /voiceless\.yaml: mo says "It slides\.", and the cast \(sq, odd\) gives mo no voice/);
  const unspoken = await cli(["check", await video("unspoken", "use: square\nwait: 1\nwho: odd\n")]);
  assert.match(unspoken.stderr, /unspoken\.yaml: "It slides\." is said in am_nobody, which is not one of the tool's voices/);
  const other = await cli(["check", await video("other", "use: circle\nwait: 1\n")]);
  assert.match(other.stderr, /other\.yaml says use: circle, and the plugin .*plugin\.mjs draws square/);
  assert.match((await cli(["check"])).stderr, /"check" needs a video: its file, <name>\.yaml/);
});

test("make of a script speaks, so it needs the voice model, and HyperFrames' Chrome for a video; nothing is written without", async () => {
  const file = await video("good", script(["sq slide to=right", "sq say: Here I am."]));
  const whole = await cli(["make", file]);
  assert.equal(whole.code, 1);
  assert.match(whole.stderr, /^Missing, and not fetched:\n {2}- the voice model[\s\S]*\n {2}- HyperFrames' Chrome/);
  for (const args of [["--fit"], ["--as", "web"]]) {
    const { code, stderr } = await cli(["make", file, ...args]);
    assert.equal(code, 1);
    assert.match(stderr, /^Missing, and not fetched:\n {2}- the voice model/);
    assert.doesNotMatch(stderr, /Chrome/);
  }
  assert.equal(existsSync(path.join(root, ".cache")), false);
});
