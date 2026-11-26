// The prompt a story is wrapped in: the tool's part (the reply's shape and names), the plugin's
// guide and commands, or the guide to a script for a plugin that has one, the library as written,
// the voices of the episodes' language with who has each, and the story at the end; in English, or
// in the episodes' language.
import assert from "node:assert/strict";
import { test } from "node:test";
import { guideOf } from "./guide.ts";
import { ALL_WRITTEN, PROMPT_WORDS, episodesOf, promptOf, promptVoices, saysAllWritten, type PromptParts } from "./prompt.ts";
import { SUPERTONIC_VOICES } from "./supertonic.ts";

const PARTS: PromptParts = {
  story: "the-pond",
  language: "en",
  text: "# The pond\n\nA frog sat by the pond and said hello.\n",
  plugin: {
    scene: "cartoon",
    guide: "\nA cartoon is drawn on one stage.\n",
    commands: {
      walk: { description: "The character walks to a mark.", example: { who: "pip", to: "middle" } },
      background: { description: "The background from this beat on.", example: "night" },
    },
  },
  library: "characters:\n  pip: # the orange one\n    voice: am_puck\n",
  narrator: "af_heart",
  cast: { pip: "am_puck" },
  voices: [
    { name: "af_heart", language: "en-us", gender: "Female", grade: "A" },
    { name: "af_sky", language: "en-us", gender: "Female", grade: "C-" },
    { name: "af_bella", language: "en-us", gender: "Female", grade: "A-" },
    { name: "am_puck", language: "en-us", gender: "Male", grade: "C+" },
    { name: "am_adam", language: "en-us", gender: "Male", grade: "F+" },
    { name: "bm_george", language: "en-gb", gender: "Male", grade: "C" },
  ],
};

/** A plugin whose videos are scripts, its texts in English, Ukrainian and Russian. */
const slide = { description: { en: "The square slides to a side.", uk: "Квадрат ковзає вбік.", ru: "Квадрат скользит в сторону." }, example: "sq slide to=right", channels: ["place"], fits: true };
const SCRIPT = {
  guide: { en: "\nA square slides to a side.\n", uk: "\nКвадрат ковзає вбік.\n", ru: "\nКвадрат скользит в сторону.\n" },
  actions: { slide },
  names: { fast: 1.6 },
  constructions: {},
};

/** The same parts, for episodes in Ukrainian: the library's voices as cartoons' are, uk_f5 alone free. */
const UK: PromptParts = {
  ...PARTS,
  story: episodesOf("the-pond", "uk"),
  language: "uk",
  plugin: { ...PARTS.plugin, script: SCRIPT },
  library: "characters:\n  pip: # the orange one\n    voice: { en: am_puck, uk: uk_m1, ru: ru_m1 }\n",
  narrator: "uk_f1",
  cast: { pip: "uk_m1", mo: "uk_f2", tuk: "uk_m2", mole: "uk_m3", rabbit: "uk_m4", squirrel: "uk_f3", marten: "uk_m2", badger: "uk_m5", bramble: "uk_f4" },
  voices: SUPERTONIC_VOICES.filter((voice) => voice.language === "uk"),
};

test("the prompt names the episodes after the story, and says what a reply is", () => {
  const prompt = promptOf(PARTS);
  assert.match(prompt, /^# Videos from a story\n/);
  assert.match(prompt, /```yaml\nepisode: the-pond-1 +# the episode's name\nlibrary: +# only what the library below lacks/);
  assert.match(prompt, /\nuse: cartoon\n\.\.\. +# the episode, in the format below\n```/);
  assert.match(prompt, /Name the episodes the-pond-1, the-pond-2, and so on\. If the whole story is one episode, name it the-pond\./);
  assert.ok(prompt.includes(`write the line "${ALL_WRITTEN}"`));
  assert.match(prompt, /I will say "continue"/);
});

test("the format is the plugin's guide, then its commands, each with its example as it is written", () => {
  const prompt = promptOf(PARTS);
  assert.match(prompt, /## The format\n\nA cartoon is drawn on one stage\.\n\n## The commands\n/);
  assert.ok(prompt.includes("- **walk**: The character walks to a mark. For example: `walk: { who: pip, to: middle }`"));
  assert.ok(prompt.includes("- **background**: The background from this beat on. For example: `background: night`"));
});

test("a plugin whose videos are written as scripts is taught scripts alone: the guide to a script in place of its format and its commands", () => {
  const prompt = promptOf({ ...PARTS, plugin: { ...PARTS.plugin, script: SCRIPT } });
  // In English, whatever else the plugin writes.
  assert.ok(prompt.includes(`\n\n${guideOf(SCRIPT, "en").trim()}\n\n## The library\n\n`));
  assert.doesNotMatch(prompt, /Квадрат/);
  assert.match(prompt, /## Your reply\n[\s\S]*\n## A script\n\nA scene's `script` says what happens in it[\s\S]*\n## The format\n\nA square slides to a side\.\n\n## The actions\n/);
  assert.ok(prompt.includes("- **slide**: The square slides to a side. Channel: `place`; it is fitted. For example: `sq slide to=right`"));
  // The beats, or events, are not taught.
  assert.doesNotMatch(prompt, /## The commands|A cartoon is drawn on one stage|walk: \{ who: pip/);
  assert.ok(prompt.endsWith("A frog sat by the pond and said hello.\n"));
});

test("the library comes as written, and the voices by group, those nobody has first, the best first, then each of the others with who has it", () => {
  const prompt = promptOf(PARTS);
  assert.ok(prompt.includes("```yaml\ncharacters:\n  pip: # the orange one\n    voice: am_puck\n```"));
  assert.match(prompt, /\n## The voices\n\nThe voices, by group\. In each, first those nobody has, the best first, then those somebody has, each with who has it\.\n\n/);
  assert.match(prompt, /\n- American English, women: af_bella, af_sky, af_heart \(the narrator\)\n- American English, men: am_adam, am_puck \(pip\)\n- British English, men: bm_george\n/);
  assert.match(prompt, /- Give each new character a voice from the list below that nobody has yet, and that suits it\. If none that suits it is free, give it the voice of a character of the library who is in none of its episodes\.\n/);
  // The story is last, whole.
  assert.ok(prompt.endsWith("## The story\n\nThe story is everything below, to the end of this message.\n\n# The pond\n\nA frog sat by the pond and said hello.\n"));
});

test("a project with no library gets no library: in its reply", () => {
  const prompt = promptOf({ ...PARTS, library: undefined, cast: {} });
  assert.doesNotMatch(prompt, /library/i);
  assert.match(prompt, /\n- American English, women: af_bella, af_sky, af_heart \(the narrator\)\n/);
});

test("the prompt offers the tool's voices of the episodes' language, read without a model", async () => {
  const english = await promptVoices("en");
  assert.equal(english.length, 28);
  assert.deepEqual(english.find((v) => v.name === "af_heart"), { name: "af_heart", language: "en-us", gender: "Female", grade: "A" });
  assert.deepEqual(new Set(english.map((v) => v.language)), new Set(["en-us", "en-gb"]));
  for (const language of ["uk", "ru"] as const) {
    const voices = await promptVoices(language);
    assert.deepEqual(voices.map((v) => v.name), ["f1", "f2", "f3", "f4", "f5", "m1", "m2", "m3", "m4", "m5"].map((style) => `${language}_${style}`));
  }
});

/** The prompt's prose: what is not code, the library, a name or the story. */
function prose(prompt: string): string {
  return prompt
    .slice(0, prompt.lastIndexOf("\n## "))
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/\b[a-z][a-z0-9_]*(-[a-z0-9]+)+\b|\b(uk|ru)_[fm]\d\b|\((pip|mo|tuk|marten|mole|rabbit|squirrel|badger|bramble)[^)]*\)/g, "");
}

test("a prompt in Ukrainian or Russian is in that language but for names, the script's syntax and the library as written", () => {
  for (const language of ["uk", "ru"] as const) {
    const words = PROMPT_WORDS[language];
    const prompt = promptOf({ ...UK, language, story: episodesOf("the-pond", language), voices: SUPERTONIC_VOICES.filter((voice) => voice.language === language) });
    assert.ok(prompt.startsWith(`# ${words.title}\n`));
    // The episodes are named with the language's code, and say their language.
    assert.match(prompt, new RegExp(`\`\`\`yaml\nepisode: the-pond-${language}-1 +# ${words.skeleton.name}\n`));
    assert.match(prompt, new RegExp(`\nuse: cartoon\nlanguage: ${language} +# ${words.skeleton.language}\n\\.\\.\\. +# `));
    assert.ok(prompt.includes(words.rules.names(`the-pond-${language}`)));
    // The words the chat writes or is told are in the language.
    assert.ok(prompt.includes(`«${words.allWritten}»`) && prompt.includes(`«${words.goOn}»`));
    // The guide to a script in it, the plugin's part too.
    assert.ok(prompt.includes(`\n\n${guideOf(SCRIPT, language).trim()}\n\n## ${words.library.heading}\n\n`));
    // The library as written, and the story.
    assert.ok(prompt.includes("```yaml\ncharacters:\n  pip: # the orange one\n    voice: { en: am_puck, uk: uk_m1, ru: ru_m1 }\n```"));
    assert.ok(prompt.endsWith(`## ${words.story.heading}\n\n${words.story.is}\n\n# The pond\n\nA frog sat by the pond and said hello.\n`));
    // No word of English is left but in names, code and the library, and no sentence of the English prompt.
    const english = prose(prompt).match(/\b(the|and|of|is|in|to|it|a|with|for|its|that|by|or)\b/gi);
    assert.equal(english, null, `${language}: ${english?.join(", ")}`);
    assert.match(prose(prompt), /YAML/);
  }
});

test("a new character gets a voice in a language whose voices are all taken: each is offered with who has it", () => {
  const all = { ...UK.cast, owl: "uk_f5" };
  const prompt = promptOf({ ...UK, cast: all });
  const words = PROMPT_WORDS.uk;
  assert.match(prompt, new RegExp(`\n## ${words.voices.heading}\n\n${words.voices.are}\n\n- жіночі: uk_f1 \\(оповідач\\), uk_f2 \\(mo\\), uk_f3 \\(squirrel\\), uk_f4 \\(bramble\\), uk_f5 \\(owl\\)\n- чоловічі: uk_m1 \\(pip\\), uk_m2 \\(tuk, marten\\), uk_m3 \\(mole\\), uk_m4 \\(rabbit\\), uk_m5 \\(badger\\)\n\n`));
  // And it is told to share one with a character who is in none of its episodes.
  assert.ok(prompt.includes(`- ${words.rules.newVoice}\n`));
  // With one free, that one comes first.
  assert.match(promptOf(UK), /\n- жіночі: uk_f5, uk_f1 \(оповідач\), uk_f2 \(mo\)/);
});

test("a plugin whose videos are no scripts has its prompt in English alone", () => {
  assert.throws(() => promptOf({ ...PARTS, language: "uk" }), /^Error: the plugin's videos are not written as scripts, and its guide and commands are in English alone: a prompt in Ukrainian is for a plugin with a script, in that language$/);
  assert.throws(() => promptOf({ ...UK, plugin: { ...UK.plugin, script: { ...SCRIPT, guide: { en: "A square." } } } }), /the plugin's guide to a script is in English, and not in Ukrainian/);
});

test("a reply says every episode is written in any of the tool's languages; an episode's name has its language's code", () => {
  for (const line of ["All episodes written.", "all episodes written", "Усі епізоди написано.", "Все эпизоды написаны.", "все эпизоды написаны"]) assert.ok(saysAllWritten(`Here.\n${line}\n`), line);
  assert.ok(!saysAllWritten("Усі епізоди: ще ні."));
  assert.deepEqual([episodesOf("forest1", "en"), episodesOf("forest1", "uk"), episodesOf("forest1", "ru")], ["forest1", "forest1-uk", "forest1-ru"]);
});
