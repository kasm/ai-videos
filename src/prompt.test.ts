// The prompt a story is wrapped in: the tool's part (the reply's shape and names), the plugin's
// guide and commands, the library as written, the voices nobody has, and the story at the end.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_WRITTEN, promptOf, type PromptParts } from "./prompt.ts";
import { kokoroVoices } from "./tts.ts";

const PARTS: PromptParts = {
  story: "the-pond",
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

test("the prompt names the episodes after the story, and says what a reply is", () => {
  const prompt = promptOf(PARTS);
  assert.match(prompt, /^# Videos from a story\n/);
  assert.match(prompt, /```yaml\nepisode: the-pond-1 +# the episode's name\nlibrary: +# only what the library below lacks/);
  assert.match(prompt, /\nuse: cartoon\n/);
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

test("the library comes as written, and the voices nobody has, best first", () => {
  const prompt = promptOf(PARTS);
  assert.ok(prompt.includes("```yaml\ncharacters:\n  pip: # the orange one\n    voice: am_puck\n```"));
  assert.match(prompt, /The narrator speaks in af_heart\. The library's characters speak in theirs: pip am_puck\./);
  assert.match(prompt, /- American English, women: af_bella, af_sky\n- American English, men: am_adam\n- British English, men: bm_george\n/);
  // The story is last, whole.
  assert.ok(prompt.endsWith("## The story\n\nThe story is everything below, to the end of this message.\n\n# The pond\n\nA frog sat by the pond and said hello.\n"));
});

test("a project with no library gets no library: in its reply", () => {
  const prompt = promptOf({ ...PARTS, library: undefined, cast: {} });
  assert.doesNotMatch(prompt, /library/i);
  assert.match(prompt, /The narrator speaks in af_heart\.\n/);
});

test("the tool's voices are kokoro-js's, read without the model", async () => {
  const voices = await kokoroVoices();
  assert.equal(voices.length, 28);
  assert.deepEqual(voices.find((v) => v.name === "af_heart"), { name: "af_heart", language: "en-us", gender: "Female", grade: "A" });
  assert.deepEqual(new Set(voices.map((v) => v.language)), new Set(["en-us", "en-gb"]));
});
