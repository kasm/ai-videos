// The library as the plugin reads it (library.ts): the characters and the backgrounds the cartoons
// name, each drawn once, checked, with every mistake reported against library.yaml.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { readLibrary } from "./library.ts";

const root = path.join(import.meta.dirname, "..");
/** The project's library, as the tool gives it to the plugin: without each character's voice and volume, and without its sounds. */
const libraryOf = (file = path.join(root, "library.yaml")) => {
  const raw = parse(readFileSync(file, "utf8"));
  for (const character of Object.values(raw.characters ?? {})) {
    delete (character as { voice?: string }).voice;
    delete (character as { volume?: string }).volume;
  }
  delete raw.sounds;
  return { file, raw };
};

/** The smallest library: one character and one background, as parsed YAML. */
const library = () => ({
  characters: { pip: { parts: { body: [{ shape: "rect", at: [0, -100], size: [100, 200], fill: "#f2a33a" }] } } as Record<string, object> },
  backgrounds: { meadow: { fill: "#bfe3ff" } } as Record<string, object>,
});
/** `library` with an arm on Pip. */
const withArm = () => {
  const l = library();
  Object.assign(l.characters.pip!, { shoulder: [50, -150] });
  Object.assign((l.characters.pip as { parts: object }).parts, { arm: [{ shape: "rect", at: [50, -110], size: [20, 100], fill: "#d9861f" }] });
  return l;
};
const read = (raw: unknown) => readLibrary({ file: "library.yaml", raw });

test("the project's library reads: its characters, each with its parts, and its backgrounds", () => {
  const { characters, backgrounds } = readLibrary(libraryOf());
  for (const who of ["pip", "mo", "tuk"]) assert.ok(characters[who]!.parts.body!.length > 0, who);
  for (const where of ["meadow", "morning", "sundown", "night"]) assert.match(backgrounds[where]!.fill, /^#[0-9a-f]{6}$/i, where);
  // An arm turns around its shoulder.
  assert.ok(characters.pip!.parts.arm && characters.pip!.shoulder);
});

test("what a library leaves out is empty, and a project with none has nothing", () => {
  assert.deepEqual(read(withArm()).backgrounds, { meadow: { fill: "#bfe3ff", shapes: [] } });
  assert.deepEqual(read({}), { characters: {}, backgrounds: {} });
  assert.deepEqual(readLibrary(undefined), { characters: {}, backgrounds: {} });
});

test("a mistake in the library is reported against the library", () => {
  const noShoulder = withArm();
  delete (noShoulder.characters.pip as { shoulder?: unknown }).shoulder;
  assert.throws(() => read(noShoulder), /^Error: library\.yaml is not a library[\s\S]*"pip" has an arm and no shoulder/);

  const named = library();
  Object.assign(named.characters, { narrator: named.characters.pip });
  assert.throws(() => read(named), /library\.yaml is not a library[\s\S]*"narrator" is the speaker nobody draws/);
  const scene = library();
  Object.assign(scene.characters, { scene: scene.characters.pip });
  assert.throws(() => read(scene), /library\.yaml is not a library[\s\S]*"scene" is whose line changes the background, and nobody on the stage/);

  assert.throws(() => read({ characters: {}, backgrounds: {}, props: {} }), /library\.yaml is not a library[\s\S]*props/);
  const shapeless = library();
  Object.assign(shapeless.backgrounds, { night: { fill: "dark" } });
  assert.throws(() => read(shapeless), /library\.yaml is not a library[\s\S]*a colour is #rrggbb[\s\S]*backgrounds\.night\.fill/);
  assert.throws(() => read({ characters: { Pip: library().characters.pip } }), /library\.yaml is not a library[\s\S]*characters\.Pip/);
});
