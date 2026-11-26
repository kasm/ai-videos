// `check <file>` and a script's `make`, as they are typed (cli.ts), on a cache with nothing in it:
// the check speaks nothing, so it needs no voice model. A script's mistakes come each with the file,
// its line as written and a hint; a sound's file is measured; any other video file is checked as its
// plugin checks it. The plugin here is a small one written for the test.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { run } from "./render.ts";
import { encodeWav } from "./tts.ts";

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
    actions: { slide: { description: "The square slides to a side.", example: "sq slide to=right", values: side, channels: ["place"], fits: true } },
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

const LIBRARY = "characters:\n  sq: { voice: am_puck, volume: -3dB }\n  odd: { voice: am_nobody }\ncolours:\n  red: '#d04040'\n";

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
  assert.equal(
    stdout.replace(path.relative(ROOT, file), "good.yaml").replace(file, "good.yaml"),
    [
      "Checked: good.yaml, a script of 1 scene and 3 lines, 2 of them said.",
      "By default, as nothing sets it:",
      "  lead: 0.6s (line 3)",
      "  pause: 0.4s (line 3)",
      "  tail: 1s (line 3)",
      "  speed: 1, or what the words beside it take (line 5)",
      "  volume: 0dB (line 7)",
      "",
    ].join("\n"),
  );
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
      "  Hint: the actions are say, slide, play and loop: did you mean slide?",
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

test("check refuses a name from below, a loop, a voice that follows a cut one in its block, and two on one channel at once, each with its lines and a hint", async () => {
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
      "  Hint: begin it by the start, a share or a word of something above, or write it after the block, or give the action its length (takes=2s)",
      "",
    ].join("\n"),
  );
  assert.equal(
    await refused("cut", ["in order:", "  under:", "    sq say: One, two, three.", "  narrator say: It counts.", "  sq say: Four."]),
    [
      "1 mistake in cut.yaml:",
      "",
      "cut.yaml:9: sq say: Four.",
      "  sq's voice is busy with line 7, which goes on under the rest to the end of the block both are in",
      "  cut.yaml:7: sq say: One, two, three.",
      "  Hint: write it after that block, or in the same under:, below that line",
      "",
    ].join("\n"),
  );
  assert.equal(
    await refused("twice", ["together:", "  sq slide to=right", "  sq say: One.", "  sq slide to=left"]),
    [
      "1 mistake in twice.yaml:",
      "",
      "twice.yaml:8: sq slide to=left",
      "  sq's place is busy with line 6, and the two would begin at once",
      "  twice.yaml:5: together:",
      "  twice.yaml:6: sq slide to=right",
      "  Hint: write the two one after the other, in an in order: there, or begin this one by the end of the other (@ prev.end, or its label)",
      "",
    ].join("\n"),
  );
  // Blocks that have a time are taken, and their lines counted.
  const good = await cli(["check", await video("blocks", script(["sq slide to=right", "& narrator say: It slides.", "in order:", "  under:", "    sq say: One, two, three.", "  narrator say @ prev.start + 1s: It counts."]))]);
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /blocks\.yaml, a script of 1 scene and 4 lines, 3 of them said\.\n/);
});

test("check refuses, in a block that ends its lines together, a voice twice, a line anchored to another and a block, each with its lines and a hint", async () => {
  const file = await video("ending", script(["ending together:", "  [a] sq say: One.", "  narrator say @ a.50%: Two.", "  sq say: Three.", "  in order:", "    odd say: Four.", "sq say: Five."]));
  const { code, stdout, stderr } = await cli(["check", file]);
  assert.equal(code, 1);
  assert.equal(stdout, "");
  assert.equal(
    stderr.replaceAll(path.relative(ROOT, file), "ending.yaml").replaceAll(file, "ending.yaml"),
    [
      "3 mistakes in ending.yaml:",
      "",
      "ending.yaml:7: narrator say @ a.50%: Two.",
      "  the block of line 5 ends its lines together, so a line in it has no start of its own",
      "  ending.yaml:5: ending together:",
      "  Hint: leave its anchor out, or begin the whole block by it: ending together @ a.50%:",
      "",
      "ending.yaml:8: sq say: Three.",
      "  sq's voice is busy with line 6, which ends when this does: the block of line 5 ends its lines together",
      "  ending.yaml:5: ending together:",
      "  ending.yaml:6: [a] sq say: One.",
      "  Hint: write one of the two before that block or after it, or give it to another",
      "",
      "ending.yaml:9: in order:",
      "  the block of line 5 ends its lines together, and holds no block",
      "  ending.yaml:5: ending together:",
      "  Hint: write its lines as lines of that block, or all of it beside that block, in a together: around both",
      "",
    ].join("\n"),
  );
  const good = await cli(["check", await video("ending-good", script(["ending together:", "  sq slide to=right", "  narrator say: It slides.", "  sq say: Whee!"]))]);
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /ending-good\.yaml, a script of 1 scene and 3 lines, 2 of them said\.\n[^]* {2}speed: 1 \(line 6\)\n {2}volume: 0dB \(line 7\)\n$/);
});

test("check refuses a move given both a speed and a length, and values that go round with their chain, and says the defaults taken", async () => {
  const wrong = await video(
    "values-wrong",
    ["use: square", "values: { beat: pause / 2, pause: beat * 2 }", "scenes:", "  - colour: red", "    values: { sq.speed: 2 }", "    script: |", "      sq slide to=right", "      sq slide to=left takes=1s speed=3", "      narrator say: It slid.", ""].join("\n"),
  );
  const { code, stdout, stderr } = await cli(["check", wrong]);
  assert.equal(code, 1);
  assert.equal(stdout, "");
  assert.equal(
    stderr.replaceAll(path.relative(ROOT, wrong), "wrong.yaml").replaceAll(wrong, "wrong.yaml"),
    [
      "2 mistakes in wrong.yaml:",
      "",
      "wrong.yaml:2: values: { beat: pause / 2, pause: beat * 2 }",
      "  the values go round: beat is pause / 2 and pause is beat * 2",
      "  wrong.yaml:4: - colour: red",
      "  Hint: give one of them a value that reads none of the others",
      "",
      "wrong.yaml:8: sq slide to=left takes=1s speed=3",
      "  sq slide is given both takes and speed, and each says how long it lasts",
      "  Hint: keep one of them on this level: the others are worked out from it",
      "",
    ].join("\n"),
  );
  // A key on top that nothing reads, as a slip of values: would be.
  const slip = await cli(["check", await video("slip", ["use: square", "valuse: { pause: 1s }", "scenes:", "  - colour: red", "    script: |", "      sq say: Hi.", ""].join("\n"))]);
  assert.equal(slip.code, 1);
  assert.match(slip.stderr, /slip\.yaml:2: valuse: \{ pause: 1s \}\n {2}nothing reads "valuse"\n {2}Hint: on top of a script are .*: did you mean values\?\n$/);
  // What is set is no default: the rest is said, with the lines that take it.
  const good = await cli(["check", await video("values", ["use: square", "values: { beat: 0.4s, pause: beat }", "scenes:", "  - colour: red", "    values: { lead: beat }", "    script: |", "      sq slide to=right speed=2", "      sq slide to=left", "      sq say: Here.", ""].join("\n"))]);
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /2 lines|3 lines, 1 of them said\.\nBy default, as nothing sets it:\n {2}tail: 1s \(line 4\)\n {2}speed: 1, or what the words beside it take \(line 8\)\n$/);
});

test("check refuses a name the plugin does not find, at its scene's line, and a voice the tool does not speak in", async () => {
  const blue = await cli(["check", await video("blue", script(["sq slide to=left"], "blue"))]);
  assert.equal(blue.code, 1);
  assert.match(blue.stderr, /^1 mistake in .*blue\.yaml:\n\n.*blue\.yaml:3: - colour: blue\n {2}no colour is named "blue"\n {2}Hint: the library has red\n$/);
  const odd = await cli(["check", await video("odd", script(["odd say: Hello."]))]);
  assert.equal(odd.code, 1);
  assert.match(odd.stderr, /odd\.yaml:5: odd say: Hello\.\n {2}odd speaks in am_nobody, which is not one of the tool's voices\n {2}Hint: give odd a voice in English, under it in library\.yaml, or in the file's cast; the English voices are af_heart, (\w+, )+\w+ and \w+\n$/);
});

test("check takes only voices of the video's language: a speaker's in it, the narrator's too, each refused with that language's voices", async () => {
  // In Ukrainian, Pip speaks in its Ukrainian voice; Sq has only an English one, and the narrator the project's.
  const uk = ["uk_f1", "uk_f2", "uk_f3", "uk_f4", "uk_f5", "uk_m1", "uk_m2", "uk_m3", "uk_m4"].join(", ") + " and uk_m5";
  const lines = (language: string, ...rows: string[]) => script(rows).replace("use: square\n", `use: square\nlanguage: ${language}\ncast: { pip: { en: am_puck, uk: uk_m1 } }\n`);
  const good = await cli(["check", await video("pip-uk", lines("uk", "pip say: Привіт, усім!"))]);
  assert.equal(good.code, 0, good.stderr);
  const english = await cli(["check", await video("sq-uk", lines("uk", "pip say: Привіт!", "sq say: Привіт.", "narrator say: Ось вони."))]);
  assert.equal(english.code, 1);
  assert.match(english.stderr, /^2 mistakes in .*sq-uk\.yaml:\n/);
  assert.match(english.stderr, /sq-uk\.yaml:8: sq say: Привіт\.\n {2}sq speaks in am_puck, which is English, and the video is in Ukrainian \(language: uk\)\n {2}Hint: give sq a voice in Ukrainian, under it in library\.yaml, or in the file's cast, beside its others: voice: \{ en: am_puck, uk: … \}; the Ukrainian voices are (.*)\n/);
  assert.equal(english.stderr.match(/Ukrainian voices are (.*)\n/)![1], uk);
  assert.match(english.stderr, /sq-uk\.yaml:9: narrator say: Ось вони\.\n {2}the narrator speaks in af_heart, which is English, and the video is in Ukrainian \(language: uk\)\n {2}Hint: give the narrator a voice in Ukrainian, the video's voice, in package\.json's "ai-videos" or in the file, beside its others: voice: \{ en: af_heart, uk: … \}; the Ukrainian voices are uk_f1, /);
  // In Russian Pip has none, and a voice given for a language is of it.
  const none = await cli(["check", await video("pip-ru", lines("ru", "pip say: Привет!"))]);
  assert.match(none.stderr, /pip-ru\.yaml:7: pip say: Привет!\n {2}pip has no voice in Russian\n {2}Hint: give pip a voice in Russian, under it in library\.yaml, or in the file's cast, beside its others: voice: \{ en: am_puck, uk: uk_m1, ru: … \}; the Russian voices are ru_f1, /);
  const wrong = await cli(["check", await video("mixed", lines("ru", "pip say: Привет!").replace("uk: uk_m1", "ru: uk_m1"))]);
  assert.match(wrong.stderr, /pip speaks in uk_m1, which is Ukrainian, and the video is in Russian \(language: ru\)\n {2}Hint: give pip a voice in Russian, .*, beside its others: voice: \{ en: am_puck, ru: … \}/);
  // A plan's lines are checked alike.
  const plan = await cli(["check", await video("plan-uk", "use: square\nlanguage: uk\nvoice: uk_f1\nwait: 1\n")]);
  assert.match(plan.stderr, /plan-uk\.yaml: "It slides\." is said by sq, who speaks in am_puck, which is English, and the video is in Ukrainian \(language: uk\): give sq a voice in Ukrainian, /);
  const language = await cli(["check", await video("de", lines("de", "pip say: Hallo!"))]);
  assert.match(language.stderr, /de\.yaml: a setting is not valid:\n.*a language is en, uk, ru\n {2}→ at language/);
});

test("check refuses a sound whose file is missing, by its name, and one that holds no sound, with the lines that play it", async () => {
  // The library's bell has its file, and so has the tune; the gong's is missing, and the words are none.
  const library = `${LIBRARY}sounds:\n  bell: { file: sounds/bell.wav }\n  gong: { file: sounds/gong.flac }\n  words: { file: sounds/words.wav }\n  tune: { file: sounds/tune.wav, volume: -20dB }\n`;
  await writeFile(path.join(root, "library.yaml"), library);
  await mkdir(path.join(root, "sounds"), { recursive: true });
  const tone = Float32Array.from({ length: 4800 }, (_, i) => 0.3 * Math.sin(i / 10));
  await writeFile(path.join(root, "sounds", "bell.wav"), encodeWav(tone, 48000));
  await writeFile(path.join(root, "sounds", "tune.wav"), encodeWav(tone, 48000));
  await writeFile(path.join(root, "sounds", "words.wav"), "These are words, and no sound.");
  try {
    const file = await video("sounds", script(["bell play", "gong loop", "sq say: Here I am.", "words play", "in order:", "  gong play", "  odd say: Hello."]));
    const { code, stdout, stderr } = await cli(["check", file]);
    assert.equal(code, 1);
    assert.equal(stdout, "");
    // The first pass is the script's own: one sound does one thing at a time.
    assert.match(stderr, /1 mistake in .*\n\n.*:10: gong play\n {2}gong's sound is busy with line 6, which goes on to the end of the scene\n/);
    const again = await video("sounds", script(["bell play", "gong play", "sq say: Here I am.", "words play", "gong play", "odd say: Hello."]));
    const missing = await cli(["check", again]);
    assert.equal(missing.code, 1);
    assert.equal(
      missing.stderr.replaceAll(path.relative(ROOT, again), "sounds.yaml").replaceAll(again, "sounds.yaml"),
      [
        "3 mistakes in sounds.yaml:",
        "",
        "sounds.yaml:6: gong play",
        "  there is no file sounds/gong.flac, which library.yaml has for gong",
        "  sounds.yaml:9: gong play",
        "  Hint: put it there, a path from the folder of library.yaml, or give gong another file",
        "",
        "sounds.yaml:8: words play",
        "  sounds/words.wav, which library.yaml has for words, holds no sound that ffmpeg reads",
        "  Hint: put a sound there, a path from the folder of library.yaml, or give words another file",
        "",
        "sounds.yaml:10: odd say: Hello.",
        "  odd speaks in am_nobody, which is not one of the tool's voices",
        "  Hint: give odd a voice in English, under it in library.yaml, or in the file's cast; the English voices are af_heart, af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky, am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa, bf_emma, bf_isabella, bm_george, bm_lewis, bf_alice, bf_lily, bm_daniel and bm_fable",
        "",
      ].join("\n"),
    );
    // A file nothing plays is nobody's mistake, and neither is one over the scenes that is there.
    const good = await video("sounds", ["use: square", "script: |", "  tune loop", "scenes:", "  - colour: red", "    script: |", "      bell play", "      sq say: Here I am.", ""].join("\n"));
    const taken = await cli(["check", good]);
    assert.equal(taken.code, 0, taken.stderr);
    assert.match(taken.stdout, /sounds\.yaml, a script of 1 scene and 3 lines, 1 of them said and 2 played\.\nBy default, as nothing sets it:\n[^]*\n {2}volume: 0dB \(line 7\)\n$/);
    const over = await video("sounds", ["use: square", "script: |", "  gong loop", "scenes:", "  - colour: red", "    script: |", "      sq say: Here I am.", ""].join("\n"));
    assert.match((await cli(["check", over])).stderr, /sounds\.yaml:3: gong loop\n {2}there is no file sounds\/gong\.flac/);
    // Any other video file plays none, so its library's files are nothing to it.
    assert.equal((await cli(["check", await video("events", "use: square\nwait: 1\n")])).code, 0);
  } finally {
    await writeFile(path.join(root, "library.yaml"), LIBRARY);
  }
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
  assert.match(unspoken.stderr, /unspoken\.yaml: "It slides\." is said by odd, who speaks in am_nobody, which is not one of the tool's voices: give odd a voice in English, /);
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
