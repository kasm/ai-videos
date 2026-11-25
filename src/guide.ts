// The guide to writing a video as a script (AGENTS.md, "A script"): the tool's part, how a script's
// lines, blocks and values are written, with a plugin's own (host.ts, Described): what its videos can
// show and a scene's keys, and its actions, each described once, and its names for numbers. Each step of the plan adds what it gives a
// script to say; the prompt for a web chat (prompt.ts) will be made from it.
import type { Described } from "./host.ts";
import { listed } from "./names.ts";
import { SAY } from "./read.ts";

/** The tool's part, in Markdown. Each `script` block in it is a script the tool takes, and each `yaml` block a file's, its characters and `go` made up (guide.test.ts). */
export const SCRIPT = `
A scene's \`script\` says what happens in it, a row for each thing. It is written as a block: \`script: |\`, then its rows under it. A row is a line, or the header of a block of lines. The characters in the examples here are made up, and so is \`go\`, an action: yours are the library's, and the actions below.

### Lines

A line is one thing one character does or says:

- who does it comes first: a character's name, or \`narrator\`, whom nobody sees;
- then the action: \`${SAY}\`, or one of the actions below;
- then the action's values, each as \`name=value\`: the actions below say what each takes;
- then, for \`${SAY}\`, a colon and the words, to the end of the line, as they are said: no quotes.

\`\`\`script
narrator ${SAY}: It is morning, and nothing moves.
narrator ${SAY}: Then somebody calls: hello, is anyone there?
\`\`\`

- The lines happen in order, one after another: a line begins when everything above it has ended, after a short pause. So what is written above a line is over before the line is said.
- A character's line is said in that character's voice, and the narrator's in the video's.
- Write only what a line has: an action the list does not have, a value it does not take, or a name nobody has is refused, with the line and a hint.
- A row that begins with \`#\` is a note: the tool passes over it, and over an empty row.

### At once

For what does not happen in order there are three blocks. A block is a header on a row of its own, ending with a colon, and its rows under it, indented by two spaces. A block is used as a line is: the row after it waits for the whole of it, and a block may be in a block.

- \`together:\` all its rows begin at once. It lasts until the last of them has ended, so what comes after waits for the longest.
- \`in order:\` each row begins when all above it in the block has ended, as in the script itself. It is for several lines in a row inside a \`together:\`, or for what an \`under:\` is under.
- \`under:\` its rows, in order, go on under the rest of the block it is in, and are cut off where that ends. Nothing waits for them.

Voices at once, and the next line after both:

\`\`\`script
together:
  ann ${SAY}: Good morning!
  ben ${SAY}: Good morning!
narrator ${SAY}: And nobody answered.
\`\`\`

Talk over something long that is waited for: the last line comes after the radio has ended:

\`\`\`script
together:
  radio ${SAY}: And now the news. Last night a mole was seen by the pond, for the first time in years.
  in order:
    ann ${SAY}: Did you hear that?
    ben ${SAY}: Hear what?
ann ${SAY}: Now it is over, and you missed it.
\`\`\`

Something that goes on under a talk and is cut off where the talk ends. In order, it is written above the lines it is under, and they begin when it does:

\`\`\`script
in order:
  under:
    ben ${SAY}: One flower, two flowers, three flowers, four flowers.
    ben ${SAY}: Five flowers, six flowers, seven flowers, eight flowers.
  ann ${SAY}: Is Ben counting again?
  cat ${SAY}: Ben always counts.
  ann ${SAY}: Well, somebody has to.
\`\`\`

\`&\` before a row joins it to the row just above it, a line or a block: the two begin at once, and the next row waits for both. It is the short way to write two rows together. An action joined to words, or in a \`together:\` with words, is hurried or slowed to end when they do, so a character goes somewhere while somebody talks:

\`\`\`script
ann ${SAY}: Who is there?
& ben ${SAY}: Who is there?
narrator ${SAY}: They had both heard it.
\`\`\`

### Where a row begins

A row may begin at a moment of something above it, in place of its block's rule: an \`@\` and the moment, after everything else and before the colon. It names:

- a line or a block with a label, a name in square brackets before it, given once in a scene: \`[a] ann ${SAY}: Hello!\`, \`[talk] in order:\`;
- \`prev\`, the line just above, or the whole block just above;
- \`block\`, the block the row is in.

The moment is one of these, and seconds may be added or taken away, \`+ 0.5s\` or \`- 0.5s\`:

- \`a.start\` and \`a.end\`;
- \`a.50%\`, a share of its length;
- \`a.word(mole)\`, where the line says that word, as the line has it. When it says the word more than once, write the words after it too: \`a.word(mole by)\`.

So somebody breaks in at a word of a line, which goes on, and somebody else a little before its end:

\`\`\`script
[a] ann ${SAY}: Last night I saw the mole by the pond, and it waved at me.
ben ${SAY} @ a.word(mole): The mole?
cat ${SAY} @ a.end - 0.4s: It waves at everybody.
narrator ${SAY}: Nobody had an answer to that.
\`\`\`

What comes after an anchored row waits for it, and for all else above, as for any row. A block takes an anchor too: \`under @ a.50%:\`, \`together @ prev.end - 1s:\`. With a row that has one, what \`&\` joins to it begins with it.

### Values

A value is a number, a name, or a formula of these with \`+ - * /\` and parentheses, a minus with a space on each side. A time is in seconds (\`0.5s\`) and a share in hundredths (\`50%\`); any other number has no unit. A name stands for what it is set to. Values are set at four levels, and each holds for everything inside it: the whole file and a scene, under \`values:\`; a block, on its header; and a line.

\`\`\`yaml
values: { beat: 0.4s, pause: beat }    # for the whole file
scenes:
  - values: { beat: 0.8s }             # for this scene
    script: |
      ann ${SAY}: Is anybody at home?
      in order pause=beat / 4:
        ben ${SAY}: Nobody.
        cat ${SAY}: Nobody at all.
      ann ${SAY}: Then who said that?
  - script: |
      narrator ${SAY}: Nobody answered.
      narrator ${SAY}: She went home.
\`\`\`

- The nearest wins: the line's own, then its block's, the block's around that, the scene's, the file's.
- A formula is worked out where it is read, by what its names are there. So above, the pauses of the first scene are 0.8 seconds, as its \`beat\` is, those in its block 0.2, and those of the second scene 0.4. One value changed changes all that reads it.
- A value is set for everything (\`speed\`), for one character (\`ann.speed\`) or for one action (\`go.speed\`). Of one level, the character's wins over the action's, and that over everything's. A line's own has no dot.

Use your own names for numbers the story repeats, and these, which are the tool's:

- \`pause\`: the seconds between what is in order. On the file, a scene or a block.
- \`lead\` and \`tail\`: the seconds before a scene's first row and after its last. On the file or a scene.
- how long an action lasts, one of these three, on any level:
  - \`takes=2s\`, its seconds;
  - \`speed=0.5\`, so many times its own speed: 0.5 is half as fast, 2 twice;
  - \`arrive=a.end - 0.5s\`, a moment of something above, written as after an \`@\`: it is hurried or slowed, within reason, to end then.

An action given its seconds or its speed keeps them, whatever is said beside it. Given none of the three, it goes at its own speed, or takes as long as the words it is joined to. A voice lasts as long as its words: it takes none of them.

\`a.length\` is how long a line above lasts, if that line is said, or is an action given its seconds or its speed. It is read by \`takes\`, by \`pause\` and after an anchor's moment. \`pause=5s - a.length\` is what is left of 5 seconds, and none when the line is longer:

\`\`\`script
[a] ann ${SAY}: It is a long way to the pond.
& ann go to=pond takes=a.length * 2
ben go to=pond speed=0.5
[c] cat ${SAY}: Wait for me, all of you, I am coming too!
& cat go to=pond arrive=c.word(coming)
narrator ${SAY} @ prev.end + 1s: Nobody waited.
\`\`\`

### What is refused

- An anchor to something below it, or in another scene.
- A row that waits for what waits for it: \`@ block.end\` in a block that waits for the row, or the end of a line that is \`under:\` in the same block. Begin it by a start, a share or a word.
- An action in an \`under:\`. Only what is said may be cut.
- A line by somebody who is \`under:\` in the same block: they are busy until it ends. Give it to another, or write it after the block.
- An \`under:\` with nothing to be under: last in a block in order, or alone in its block.
- A value that nothing reads, values that read each other in a circle, and two of \`takes\`, \`speed\` and \`arrive\` set for one action on one level.
- The length of a block, or of an action that is fitted to words: those are known only once everything has its place.

One character does one thing at a time: two of its lines, or two of its actions, never overlap, whatever block they are in. The second waits for the first.
`;

/** The guide for a plugin whose videos are written as scripts: the tool's part, the plugin's, the actions, and its names for numbers. */
export function guideOf(script: NonNullable<Described["script"]>): string {
  const names = Object.entries(script.names).map(([name, number]) => `\`${name}\` is ${number}`);
  const actions = Object.entries(script.actions).map(([name, { description, example }]) => `- **${name}**: ${description} For example: \`${example}\``);
  return [
    "## A script",
    "",
    SCRIPT.trim(),
    "",
    "## The format",
    "",
    script.guide.trim(),
    "",
    "## The actions",
    "",
    `- **${SAY}**: The character says the words after the colon, in its voice; the narrator's are said in the video's. For example: \`narrator ${SAY}: Once upon a time.\``,
    ...actions,
    "",
    ...(names.length > 0 ? [`These names stand for numbers in any value: ${listed(names)}.`, ""] : []),
  ].join("\n");
}
