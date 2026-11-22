// A chat's reply, imported: its whole YAML blocks, each an episode with what it adds to the
// library, and the library with the entries added as the block wrote them. Then a reply imported
// into a project with a small plugin: what is written, what is refused, and nothing written over.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { addEntries, episodeOf, importReply, readReply } from "./import.ts";

const fence = "```";

test("the reply's whole YAML blocks count; one cut off, or begun again, does not", () => {
  const reply = [
    "Here are the episodes.",
    `${fence}yaml`,
    "episode: a-1",
    `${fence}`,
    `${fence}text`,
    "not an episode",
    `${fence}`,
    `${fence}yaml`,
    "episode: a-2",
    "scenes: [", // cut off here; told "continue", the chat begins the block again
    `${fence}yaml`,
    "episode: a-2",
    "scenes: []",
    `${fence}`,
    "",
    "All episodes written.",
    "I left out the boat.",
  ].join("\r\n");
  const { blocks, cut, ended } = readReply(reply);
  assert.deepEqual(blocks, [
    { line: 2, text: "episode: a-1\n" },
    { line: 11, text: "episode: a-2\nscenes: []\n" },
  ]);
  assert.deepEqual(cut, [8]);
  assert.equal(ended, true);

  // Cut off at the end: the reply does not say it is all.
  const short = readReply(`${fence}yaml\nepisode: a-1\n${fence}\n${fence}yaml\nepisode: a-2\n`);
  assert.deepEqual([short.blocks.length, short.cut, short.ended], [1, [4], false]);
  // A block indented in the message is read as if it were not.
  assert.deepEqual(readReply(`1. One:\n   ${fence}yaml\n   episode: a-1\n   use: x\n   ${fence}\n`).blocks, [{ line: 2, text: "episode: a-1\nuse: x\n" }]);
});

const BLOCK = `# The first one
episode: the-pond-1 # its name
library:
  characters:
    frog: # small and green
      voice: am_echo
      parts: { body: [1] }

  # and where it lives
  backgrounds:
    pond: { fill: "#4f9bd6" }
use: cartoon # the scene
scenes: # what happens
  - background: pond
`;

test("a block is an episode: its name, the entries it adds as written, and its video file", () => {
  const episode = episodeOf({ line: 1, text: BLOCK });
  assert.equal(episode.name, "the-pond-1");
  assert.deepEqual(episode.raw, { use: "cartoon", scenes: [{ background: "pond" }] });
  assert.deepEqual(episode.entries, [
    { section: "characters", name: "frog", value: { voice: "am_echo", parts: { body: [1] } }, text: "frog: # small and green\n  voice: am_echo\n  parts: { body: [1] }\n" },
    { section: "backgrounds", name: "pond", value: { fill: "#4f9bd6" }, text: 'pond: { fill: "#4f9bd6" }\n' },
  ]);
  // The rest as the chat wrote it, comments and all.
  assert.equal(episode.file, "# The first one\nuse: cartoon # the scene\nscenes: # what happens\n  - background: pond\n");
  // An entry written inline is written again, in blocks.
  const inline = episodeOf({ line: 1, text: "episode: a\nlibrary: { backgrounds: { pond: { fill: red } } }\nuse: x\n" });
  assert.deepEqual(inline.entries.map((e) => e.text), ["pond:\n  fill: red\n"]);
  assert.equal(inline.file, "use: x\n");
});

test("a block that is no episode says why", () => {
  assert.throws(() => episodeOf({ line: 1, text: "use: cartoon\n" }), /give it its name on top, episode: <the name>/);
  assert.throws(() => episodeOf({ line: 1, text: "episode: ../up\n" }), /give it its name on top/);
  assert.throws(() => episodeOf({ line: 1, text: "episode: a\nscenes: [\n" }), /it is not YAML/);
  assert.throws(() => episodeOf({ line: 1, text: "episode: a\nlibrary: [frog]\n" }), /its library: is a mapping/);
});

const LIBRARY = `# What the videos name.

characters:
  pip:
    voice: am_puck # orange
    parts:
      body:
        - { shape: rect, at: [0, -170] }

backgrounds:
  meadow: # plain
    fill: "#bfe3ff"
  # the last one
  night:
    fill: "#1b2a4a"
`;

test("entries go at the end of their sections, the rest of the library as it was", () => {
  const { entries } = episodeOf({ line: 1, text: BLOCK });
  assert.equal(
    addEntries(LIBRARY, entries),
    LIBRARY.replace("[0, -170] }\n", '[0, -170] }\n  frog: # small and green\n    voice: am_echo\n    parts: { body: [1] }\n') + '  pond: { fill: "#4f9bd6" }\n',
  );
  // Line endings stay the file's: the lines added end as most of its lines do, and its own lines as they did.
  assert.equal(addEntries(LIBRARY.replace(/\n/g, "\r\n"), entries), addEntries(LIBRARY, entries).replace(/\n/g, "\r\n"));
  const mixed = LIBRARY.replace(/\n/g, "\r\n").replace("# What the videos name.\r\n", "# What the videos name.\n");
  assert.equal(addEntries(mixed, entries), addEntries(LIBRARY, entries).replace(/\n/g, "\r\n").replace("# What the videos name.\r\n", "# What the videos name.\n"));
  // A section the library lacks is added at its end; no library is a new one.
  assert.equal(addEntries("characters:\n  pip:\n    voice: am_puck\n", entries.slice(1)), 'characters:\n  pip:\n    voice: am_puck\n\nbackgrounds:\n  pond: { fill: "#4f9bd6" }\n');
  assert.equal(addEntries(undefined, entries.slice(1)), 'backgrounds:\n  pond: { fill: "#4f9bd6" }\n');
  assert.equal(addEntries("backgrounds:\n", entries.slice(1)), 'backgrounds:\n  pond: { fill: "#4f9bd6" }\n');
  assert.throws(() => addEntries("backgrounds: { meadow: {} }\n", entries.slice(1)), /backgrounds: in library\.yaml is not written in blocks/);
});

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-import-"));
// The plugin's process leaves the project's folder a moment after it is closed: on Windows the folder is busy until then.
after(() => rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));

/** Squares that wait and say a line: a colour each, by name from the library's colours, and who says the line. */
const PLUGIN = `
const string = { "~standard": { version: 1, vendor: "test", validate: (v) => ({ value: v }), jsonSchema: { input: () => ({}), output: () => ({}) } } };
export default {
  scene: "square",
  stage: { width: 160, height: 90 },
  commands: { colour: { description: "The square's colour, by name.", example: "red", schema: string } },
  guide: "A square of a colour of the library says a line.",
  check(raw, file, library) {
    const colour = library?.raw?.colours?.[raw.colour];
    if (!colour) throw new Error(file + ": no colour is named " + raw.colour);
    if (raw.who !== undefined && !library.raw.characters?.[raw.who]) throw new Error(file + ": nobody is named " + raw.who);
    return { ...raw, colour };
  },
  repair: (raw) => (raw.colour === "rouge" ? { source: { ...raw, colour: "red" }, did: ["rouge is red"] } : { source: raw, did: [] }),
  plan: (s) => ({ duration: 2, events: [{ name: "start", at: 0, span: "hold" }], texts: [{ text: s.says ?? "Hello.", ...(s.who ? { speaker: s.who } : {}), from: 0, to: 2 }] }),
  frame: () => "<svg/>",
};
`;

const episode = (name: string, body: string) => `${fence}yaml\nepisode: ${name}\n${body}${fence}\n`;

test("a reply imported: each episode the plugin takes is written, what it adds goes into the library, and nothing is written over", async () => {
  const root = path.join(scratch, "project");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ "ai-videos": { plugin: "src/plugin.mjs" } }));
  await writeFile(path.join(root, "src", "plugin.mjs"), PLUGIN);
  const library = "colours:\n  red: '#d04040' # the first\n";
  await writeFile(path.join(root, "library.yaml"), library);
  const reply = path.join(root, "stories", "sq.reply.md");
  await mkdir(path.dirname(reply), { recursive: true });
  await writeFile(
    reply,
    [
      episode("sq-1", "library:\n  colours:\n    blue: '#4060d0' # new\n  characters:\n    bo:\n      voice: am_echo\nuse: square\ncolour: blue\nwho: bo\nsays: I am Bo.\n"),
      episode("sq-2", "use: square\ncolour: rouge\n"),
      episode("sq-3", "use: square\ncolour: green\n"),
      episode("sq-4", "library:\n  characters:\n    al:\n      voice: xx_none\nuse: square\ncolour: red\nwho: al\n"),
      episode("sq-5", "use: circle\ncolour: red\n"),
      episode("sq-6", "use: square\ncolour: red\nloudness: loud\n"),
      "All episodes written.\n",
    ].join("\n"),
  );
  const said: string[] = [];
  const refused = await importReply(reply, (m) => said.push(m));
  const log = said.join("\n");

  // The two the plugin takes are written as the blocks wrote them, and the library has what sq-1 adds.
  const videos = path.join(root, "videos");
  assert.equal(await readFile(path.join(videos, "sq-1.yaml"), "utf8"), "use: square\ncolour: blue\nwho: bo\nsays: I am Bo.\n");
  assert.equal(await readFile(path.join(videos, "sq-2.yaml"), "utf8"), "use: square\ncolour: rouge\n");
  assert.equal(await readFile(path.join(root, "library.yaml"), "utf8"), `${library}  blue: '#4060d0' # new\n\ncharacters:\n  bo:\n    voice: am_echo\n`);
  assert.match(log, /Library: library\.yaml: added blue, bo \(am_echo\)/);
  assert.match(log, /videos\/sq-2\.yaml: written\n {2}The plugin mends, in what it draws \(the file is as written\):\n {4}- rouge is red/);

  // The rest, refused with why, in a message for the chat.
  assert.match(
    refused!,
    new RegExp(
      [
        "^The tool refused these episodes\\. Send each again, its block whole and mended:\n",
        "- sq-3: no colour is named green",
        "- sq-4: its new character al needs a voice: xx_none is not one the tool speaks in; give it one from the list",
        "- sq-5: it says use: circle, and the plugin draws square: write use: square",
        "- sq-6: a setting is not valid:\n  ✖ Invalid input: expected number, received string\n    → at loudness$",
      ].join("\n"),
    ),
  );
  for (const name of ["sq-3", "sq-4", "sq-5", "sq-6"]) await assert.rejects(readFile(path.join(videos, `${name}.yaml`)));

  // Imported again, as it is: nothing new, and nothing written over.
  await writeFile(path.join(videos, "sq-2.yaml"), "use: square\ncolour: red\n");
  const again: string[] = [];
  await importReply(reply, (m) => again.push(m));
  assert.match(again.join("\n"), /videos\/sq-1\.yaml: there already, as imported/);
  assert.match(again.join("\n"), /videos\/sq-2\.yaml: there already, with other text: kept\. Delete it to import this block\./);
  assert.doesNotMatch(again.join("\n"), /Library:/);
  assert.equal(await readFile(path.join(videos, "sq-2.yaml"), "utf8"), "use: square\ncolour: red\n");

  // A file with no block in it is no reply.
  const empty = path.join(root, "stories", "empty.md");
  await writeFile(empty, "Sure! Here is a summary of the story.\n");
  await assert.rejects(importReply(empty, () => {}), /empty\.md holds no YAML block: paste the chat's reply into it/);
});
