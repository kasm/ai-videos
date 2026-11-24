// The guide to writing a video as a script (AGENTS.md, "A script"): the tool's part, how a script's
// lines are written, with a plugin's own (host.ts, Described): what its videos can show and a
// scene's keys, and its actions, each described once. Each step of the plan adds what it gives a
// script to say; the prompt for a web chat (prompt.ts) will be made from it.
import type { Described } from "./host.ts";
import { SAY } from "./scenario.ts";

/** The tool's part, in Markdown. Its `script` block is a script the tool takes (guide.test.ts). */
export const SCRIPT = `
A scene's \`script\` says what happens in it, a line for each thing. It is written as a block: \`script: |\`, then its lines under it, all at one margin.

A line is one thing one character does or says:

- who does it comes first: a character's name, or \`narrator\`, whom nobody sees;
- then the action: \`${SAY}\`, or one of the actions below;
- then the action's values, each as \`name=value\`, where a value is a name or a number: the actions below say what each takes;
- then, for \`${SAY}\`, a colon and the words, to the end of the line, as they are said: no quotes.

\`\`\`script
narrator ${SAY}: It is morning, and nothing moves.
narrator ${SAY}: Then somebody calls: hello, is anyone there?
\`\`\`

- The lines happen in order, one after another: a line begins when the line above it has ended, after a short pause. So what is written above a line is over before the line is said.
- A character's line is said in that character's voice, and the narrator's in the video's.
- Write only what a line has: an action the list does not have, a value it does not take, or a name nobody has is refused, with the line and a hint.
- A line that begins with \`#\` is a note: the tool passes over it, and over an empty line.
`;

/** The guide for a plugin whose videos are written as scripts: the tool's part, the plugin's, and the actions. */
export function guideOf(script: NonNullable<Described["script"]>): string {
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
  ].join("\n");
}
