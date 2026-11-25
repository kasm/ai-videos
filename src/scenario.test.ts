// A scenario written as a script (scenario.ts): the check, which gives the scenario worked out or
// every mistake with its line and a hint. The plugin's part here is a small one written for the
// test, its schema by hand. Reading a script's text is tried in read.test.ts, and what has no time in
// plan.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nearest } from "./names.ts";
import type { Schema, SchemaIssue } from "./plugin.ts";
import { readScript } from "./read.ts";
import { checkScenario, issuesText, type Issue, type SceneActions, type ScriptPlugin, type WrittenScript } from "./scenario.ts";

/** What `slide` takes: `to`, a side, and nothing else. */
const side: Schema<{ to: "left" | "right" }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(values) {
      const { to, ...rest } = values as Record<string, unknown>;
      const issues: SchemaIssue[] = Object.keys(rest).map((key) => ({ message: `slide takes no ${key}` }));
      if (to === "left" || to === "right") return issues.length > 0 ? { issues } : { value: { to } };
      return { issues: [...issues, { message: "it is left or right", path: ["to"] }] };
    },
    jsonSchema: { input: () => ({}), output: () => ({}) },
  },
};

/** A square that slides to a side: its scene names its colour, which the library has. */
const scripted = (seen: SceneActions[][] = []): ScriptPlugin => ({
  actions: { slide: { description: "The square slides to a side.", example: "sq slide to=right", values: side, channels: ["place"], fits: true } },
  guide: "A square slides to a side, and speaks.",
  check(scenes, library) {
    seen.push(scenes);
    const colours = (library?.raw as { colours?: Record<string, string> } | undefined)?.colours ?? {};
    const issues: Issue[] = [];
    const worked = scenes.map((scene) => {
      const colour = colours[String(scene.setting.colour)];
      if (!colour) issues.push({ line: scene.line, message: `no colour is named "${scene.setting.colour}"`, hint: `the library has ${Object.keys(colours).join(", ")}` });
      return { setting: { colour: colour ?? "", x: 20 }, actions: scene.actions.map((a) => ({ values: { x: (a.values as { to: string }).to === "right" ? 120 : 20 }, length: 1.5 })) };
    });
    return issues.length > 0 ? { issues } : { scenes: worked };
  },
  draw: () => () => "<svg/>",
});

const LIBRARY = { file: "library.yaml", raw: { colours: { red: "#d04040" } } };

/** A scenario of one scene, its colour red, its script beginning on line 5 of the file. */
const written = (script: string, colour = "red"): WrittenScript => {
  const { items, issues } = readScript(script, 5);
  return { scenes: [{ line: 3, setting: { colour }, items }], issues };
};
/** The video's pauses. */
const TIMING = { lead: 0.6, gap: 0.4, tail: 1 };
const check = (script: string, plugin = scripted(), colour?: string) => checkScenario(plugin, written(script, colour), LIBRARY, ["sq"], TIMING);
const issuesOf = async (script: string, plugin?: ScriptPlugin, colour?: string) => {
  const checked = await check(script, plugin, colour);
  assert.ok("issues" in checked, "it is refused");
  return checked.issues;
};

test("the check gives the scenario worked out: what is said, and the plugin's actions in plain numbers", async () => {
  const seen: SceneActions[][] = [];
  const checked = await check("sq say: Here I go!\nsq slide to=right\nnarrator say: It went.", scripted(seen));
  assert.deepEqual(checked, {
    scenes: [
      {
        line: 3,
        setting: { colour: "#d04040", x: 20 },
        lead: 0.6,
        pause: 0.4,
        tail: 1,
        items: [
          { line: 5, who: "sq", action: "say", text: "Here I go!", volume: 0 },
          { line: 6, who: "sq", action: "slide", values: { x: 120 }, channels: ["place"], length: 1.5 },
          { line: 7, who: "narrator", action: "say", text: "It went.", volume: 0 },
        ],
      },
    ],
    defaults: [
      { name: "lead", value: "0.6s", lines: [3] },
      { name: "pause", value: "0.4s", lines: [3] },
      { name: "tail", value: "1s", lines: [3] },
      { name: "volume", value: "0dB", lines: [5, 7] },
      { name: "speed", value: "1, or what the words beside it take", lines: [6] },
    ],
  });
  // The plugin gets each scene's own keys, and its own actions with what their schema gave.
  assert.deepEqual(seen, [[{ line: 3, setting: { colour: "red" }, actions: [{ line: 6, who: "sq", action: "slide", values: { to: "right" }, begun: [] }] }]]);
});

test("an unknown action is refused with its line, the actions there are, and the nearest", async () => {
  assert.deepEqual(await issuesOf("sq say: Hi.\nsq slid to=right"), [{ line: 6, message: 'no action is named "slid"', hint: "the actions are say, slide, play and loop: did you mean slide?" }]);
  assert.deepEqual((await issuesOf("sq dance"))[0]!.hint, "the actions are say, slide, play and loop");
});

test("a wrong value is refused with its line, the schema's reason, and the action's example", async () => {
  assert.deepEqual(await issuesOf("sq slide to=up"), [{ line: 5, message: "slide, to=up: it is left or right", hint: "as in: sq slide to=right" }]);
  assert.deepEqual(await issuesOf("sq slide"), [{ line: 5, message: "slide, to: it is left or right", hint: "as in: sq slide to=right" }]);
  assert.deepEqual(await issuesOf("sq slide to=left fast=1"), [{ line: 5, message: "slide: slide takes no fast", hint: "as in: sq slide to=right" }]);
  assert.deepEqual(await issuesOf("sq slide to=left: Whee!"), [{ line: 5, message: "slide takes no words after a colon: only say does", hint: "as in: sq slide to=right" }]);
  const beside: ScriptPlugin = { ...scripted(), constructions: { beside: { description: "Beside a place.", example: "beside(mo, 2)" } } };
  assert.deepEqual(await issuesOf("sq slide to=beside(mo, 1 + 1)", beside), [{ line: 5, message: "slide, to=beside(mo, 2): it is left or right", hint: "as in: sq slide to=right" }]);
});

test("say is the tool's: its speaker has a voice or is the narrator, it has words, and takes no values", async () => {
  assert.deepEqual(await issuesOf("sk say: Hi."), [
    { line: 5, message: '"sk" is neither the narrator nor a character with a voice', hint: "the characters with a voice are sq: did you mean sq?" },
  ]);
  assert.deepEqual((await issuesOf("sq say")).map((i) => i.message), ["sq says nothing"]);
  assert.deepEqual(await issuesOf("sq say loud=2: Hi."), [{ line: 5, message: "say takes no loud", hint: "write only who says it, how loud if it is not as the rest, and the words: sq say volume=-6dB: Hello!" }]);
  assert.deepEqual((await issuesOf("sq say loud=2 volume=-6dB fast=1: Hi.")).map((i) => i.message), ["say takes no loud and fast"]);
  const nobody = await checkScenario(scripted(), written("mo say: Hi."), LIBRARY, [], TIMING);
  assert.ok("issues" in nobody);
  assert.equal(nobody.issues[0]!.hint, "no character has a voice");
});

/** The library's sounds, each with its file. */
const SOUNDS = { bell: "sounds/bell.wav", rain: "sounds/rain.flac" };
/** A script of one scene, and the cartoon's own, whose first row is on line 2, checked with the library's sounds. */
const played = async (script: string, own?: string, sounds: Record<string, string> = SOUNDS) => {
  const over = own === undefined ? {} : { over: { line: 1, items: readScript(own, 2).items } };
  return checkScenario(scripted(), { ...written(script), ...over }, LIBRARY, ["sq"], TIMING, { rain: -20 }, sounds);
};

test("play and loop are the tool's: the sound is one of the library's, and the check gives its file and how loud it is", async () => {
  const checked = await played("rain loop\nsq say: Here I go!\nbell play volume=-6dB", "rain2 loop", { ...SOUNDS, rain2: "sounds/rain2.mp3" });
  assert.ok("scenes" in checked, JSON.stringify(checked));
  assert.deepEqual(checked.scenes[0]!.items, [
    { line: 5, who: "rain", action: "loop", sound: "sounds/rain.flac", volume: -20 },
    { line: 6, who: "sq", action: "say", text: "Here I go!", volume: 0 },
    { line: 7, who: "bell", action: "play", sound: "sounds/bell.wav", volume: -6 },
  ]);
  assert.deepEqual(checked.over, { line: 1, items: [{ line: 2, who: "rain2", action: "loop", sound: "sounds/rain2.mp3", volume: 0 }] });
  // With no script of its own, a cartoon has none checked.
  const alone = await played("bell play");
  assert.ok("scenes" in alone && !("over" in alone));
});

test("a sound that the library lacks is refused, and what is no sound's: words, and values but how loud", async () => {
  const wrong = async (script: string, sounds?: Record<string, string>) => {
    const checked = await played(script, undefined, sounds);
    assert.ok("issues" in checked, "it is refused");
    return checked.issues.map(({ line, message, hint }) => [line, message, hint]);
  };
  assert.deepEqual(await wrong("bel play"), [[5, 'no sound is named "bel"', "the library's sounds are bell and rain: did you mean bell?"]]);
  assert.deepEqual(await wrong("sq loop\nsq say: Hi."), [[5, 'no sound is named "sq"', "the library's sounds are bell and rain"]]);
  assert.deepEqual(await wrong("play bell"), [[5, 'no action is named "bell"', "a sound's name comes first: bell play"]]);
  assert.deepEqual(await wrong("loop bel"), [[5, 'no action is named "bel"', "the actions are say, slide, play and loop"]]);
  assert.deepEqual(await wrong("bell play", {}), [[5, 'no sound is named "bell"', "the library has no sound: its sounds: name each with its file"]]);
  const form = (line: string) => `write only the sound, and how loud it is: ${line} volume=-12dB`;
  assert.deepEqual(await wrong("bell play takes=2s fast=1"), [[5, "play takes no takes and fast", form("bell play")]]);
  assert.deepEqual(await wrong("bell play: Ding!"), [[5, "play takes no words after a colon: only say does", form("bell play")]]);
  assert.deepEqual(await wrong("rain loop pause=1s\nsq say: Hi."), [[5, "loop takes no pause", form("rain loop")]]);
  assert.deepEqual((await wrong("bell play volume=2"))[0]!.slice(0, 2), [5, "volume=2: it is a number, and not a volume"]);
});

test("the cartoon's own script has sounds alone: anything else in it is refused, with its line", async () => {
  const wrong = async (own: string) => {
    const checked = await played("sq say: Hi.", own);
    assert.ok("issues" in checked, "it is refused");
    return checked.issues.map(({ line, message }) => [line, message]);
  };
  assert.deepEqual(await wrong("rain loop\nnarrator say: Once.\nsq slide to=right\nbel play"), [
    [3, "the cartoon's own script plays sounds alone, and narrator say is none"],
    [4, "the cartoon's own script plays sounds alone, and sq slide is none"],
    [5, 'no sound is named "bel"'],
  ]);
  assert.deepEqual(await wrong("in order:\n  bell play\n  sq say: Hi."), [[4, "the cartoon's own script plays sounds alone, and sq say is none"]]);
  assert.deepEqual(await wrong("rain loop\nrain loop"), [[3, "rain's sound is busy with line 2, which goes on to the end of the cartoon"]]);
  const checked = await played("sq say: Hi.", "sq slide to=right");
  assert.ok("issues" in checked);
  assert.equal(checked.issues[0]!.hint, "write it in a scene's script; a sound is played by play or loop: tune loop");
});

test("the plugin's check is told of its own actions alone, whatever is played beside them", async () => {
  const seen: SceneActions[][] = [];
  const script = { ...written("rain loop\nsq slide to=right\n& bell play\nsq slide to=left"), over: { line: 1, items: readScript("rain2 loop", 2).items } };
  const checked = await checkScenario(scripted(seen), script, LIBRARY, ["sq"], TIMING, {}, { ...SOUNDS, rain2: "x" });
  assert.ok("scenes" in checked, JSON.stringify(checked));
  assert.deepEqual(seen[0]![0]!.actions.map(({ line, action, begun }) => [line, action, begun]), [[6, "slide", []], [8, "slide", [6]]]);
});

test("every mistake is found in one pass, and the plugin's own check runs only on a script with none before it", async () => {
  const seen: SceneActions[][] = [];
  const issues = await issuesOf("sq\nsq slid to=right\nsq slide to=up\nmo say: Hi.", scripted(seen), "blue");
  assert.deepEqual(issues.map((i) => i.line), [5, 6, 7, 8]);
  assert.equal(seen.length, 0, "the plugin follows the lines in order: one missing would mislead it");
  // With the lines right, the plugin's mistakes come, each with its line and hint.
  assert.deepEqual(await issuesOf("sq slide to=right", scripted(seen), "blue"), [{ line: 3, message: 'no colour is named "blue"', hint: "the library has red" }]);
  assert.equal(seen.length, 1);
});

test("a script with a row that does not read has no mistake of its values or its times shown: the row may be what they read", async () => {
  const rest = "sq slide to=left takes=a.length\nsq slide to=left speed=2s\nsq say @ a.end: Hi.";
  assert.deepEqual((await issuesOf(`[a] sq slide right\n${rest}`)).map(({ line, message }) => [line, message]), [[5, '"right" is not a value']]);
  // The row mended, they are.
  assert.deepEqual((await issuesOf(`[a] sq slide to=right\n${rest}`)).map(({ line, message }) => [line, message]), [
    [6, "takes=a.length: how long line 5 lasts is its own, or what the words beside it take, known only once they have their place"],
    [7, "speed=2s: it is a time, and a speed is so many times its own"],
  ]);
});

test("what the plugin's check gives is held to the contract: a scene and an action for each, in plain numbers", async () => {
  const giving = (scenes: unknown): ScriptPlugin => ({ ...scripted(), check: () => ({ scenes }) as never });
  const script = "sq slide to=right";
  const action = { values: { x: 120 }, length: 1.5 };
  await assert.rejects(check(script, giving([])), /the plugin's check of the script gave 0 scenes for 1/);
  await assert.rejects(check(script, giving([{ setting: {}, actions: [] }])), /scene 1 \(line 3\) 0 actions for 1/);
  await assert.rejects(check(script, giving([{ setting: { at: null }, actions: [action] }])), /a setting that is not numbers and names alone/);
  await assert.rejects(check(script, giving([{ setting: {}, actions: [{ ...action, values: { on: true } }] }])), /line 5 values that are not numbers and names alone/);
  await assert.rejects(check(script, giving([{ setting: {}, actions: [{ ...action, length: 0 }] }])), /line 5 the length 0: an action's own length is seconds, above 0/);
  await assert.rejects(check(script, { ...scripted(), check: () => ({ issues: [] }) }), /refused it with no mistake named/);
});

test("an action that is open has no length of its own: the plugin's check gives it none, and any other one", async () => {
  const { slide } = scripted().actions;
  const opened: ScriptPlugin = {
    ...scripted(),
    actions: { slide: slide!, watch: { ...slide!, example: "sq watch to=right", channels: ["head"], open: true } },
    check: (scenes) => ({ scenes: scenes.map(({ actions }) => ({ setting: {}, actions: actions.map(({ action }) => ({ values: { x: 20 }, ...(action === "watch" ? {} : { length: 1.5 }) })) })) }),
  };
  const checked = await check("sq slide to=right\n& sq watch to=left", opened);
  assert.ok("scenes" in checked);
  assert.deepEqual(checked.scenes[0]!.items, [
    {
      line: 5,
      order: "together",
      joined: true,
      items: [
        { line: 5, who: "sq", action: "slide", values: { x: 20 }, channels: ["place"], length: 1.5 },
        { line: 6, who: "sq", action: "watch", values: { x: 20 }, channels: ["head"], length: "open" },
      ],
    },
  ]);
  const none: ScriptPlugin = { ...opened, check: (scenes) => ({ scenes: scenes.map(({ actions }) => ({ setting: {}, actions: actions.map(() => ({ values: {} })) })) }) };
  await assert.rejects(check("sq slide to=right\n& sq watch to=left", none), /line 5 the length NaN: an action's own length is seconds, above 0/);
});

test("mistakes are shown in the file's order, each with the file, its line as written, the other lines it is between, and the hint", () => {
  const text = "use: square\nscenes:\n  - colour: red\n    script: |\n      sq slid to=right\n";
  const issues = [
    { line: 5, also: [1, 3], message: 'no action is named "slid"', hint: "the actions are say and slide: did you mean slide?" },
    { line: 3, message: 'no colour is named "red"', hint: "the library has none" },
  ];
  assert.equal(
    issuesText("videos/sq.yaml", text, issues),
    '2 mistakes in videos/sq.yaml:\n\nvideos/sq.yaml:3: - colour: red\n  no colour is named "red"\n  Hint: the library has none\n\n' +
      'videos/sq.yaml:5: sq slid to=right\n  no action is named "slid"\n  videos/sq.yaml:1: use: square\n  videos/sq.yaml:3: - colour: red\n  Hint: the actions are say and slide: did you mean slide?',
  );
  assert.equal(issuesText("sq", undefined, issues.slice(0, 1)), '1 mistake in sq:\n\nsq:5:\n  no action is named "slid"\n  sq:1:\n  sq:3:\n  Hint: the actions are say and slide: did you mean slide?');
});

test("the nearest name is a slip of a letter or two, and none when none is near", () => {
  assert.equal(nearest("wlak", ["say", "walk"]), "walk");
  assert.equal(nearest("medow", ["meadow", "morning"]), "meadow");
  assert.equal(nearest("dance", ["say", "walk"]), undefined);
  assert.equal(nearest("mo", ["pip"]), undefined);
});
