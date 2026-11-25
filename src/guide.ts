// The guide to writing a video as a script (AGENTS.md, "A script"): the tool's part, how a script's
// lines, blocks and values are written, with a plugin's own (host.ts, Described): what its videos can
// show and a scene's keys, its actions and its constructions, each described once, and its names for
// numbers. Each step of the plan adds what it gives a script to say; the prompt for a web chat
// (prompt.ts) will be made from it.
import type { Described } from "./host.ts";
import { listed } from "./names.ts";
import { SOUND, VOICE } from "./plan.ts";
import { LOOP, PLAY, SAY } from "./read.ts";

/** The tool's part, in Markdown. Each `script` block in it is a script the tool takes, and each `yaml` block a file's, its characters, `go` and `nod` made up (guide.test.ts). */
export const SCRIPT = `
A scene's \`script\` says what happens in it, a row for each thing. It is written as a block: \`script: |\`, then its rows under it. A row is a line, or the header of a block of lines. The characters and the sounds in the examples here are made up, and so are three actions, \`go\`, \`nod\` and \`watch\`: yours are the library's, and the actions below.

### Lines

A line is one thing one character does or says, or one sound that is played:

- who does it comes first: a character's name, or \`narrator\`, whom nobody sees; for a sound, the sound's name; for an action below that nobody does, the name its example has;
- then the action: \`${SAY}\`, one of the actions below, or for a sound \`${PLAY}\` or \`${LOOP}\` (Sounds, below);
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

For what does not happen in order there are four blocks. A block is a header on a row of its own, ending with a colon, and its rows under it, indented by two spaces. A block is used as a line is: the row after it waits for the whole of it, and a block may be in a block.

- \`together:\` all its rows begin at once. It lasts until the last of them has ended, so what comes after waits for the longest.
- \`ending together:\` all its rows end at once, where the longest of them does: the shorter ones begin later. Its rows are lines alone, no two of them by one character on one channel (below). An action in it is not hurried or slowed: it goes at its own speed, or the one it is given.
- \`in order:\` each row begins when all above it in the block has ended, as in the script itself. It is for several lines in a row inside a \`together:\`, or for what an \`under:\` is under.
- \`under:\` its rows, in order, go on under the rest of the block it is in, and are cut off where that ends. Nothing waits for them.

Two who talk at once each have a caption, in a smaller row of its own, the one who began first above. Of three at once, the quietest has none, so keep what is heard at once to two, or the third quieter.

Voices at once, and the next line after both:

\`\`\`script
together:
  ann ${SAY}: Good morning!
  ben ${SAY}: Good morning!
narrator ${SAY}: And nobody answered.
\`\`\`

Somebody goes somewhere at their own pace, and the words about it end as they arrive:

\`\`\`script
ending together:
  cat go to=pond
  narrator ${SAY}: And the cat went home.
ann ${SAY}: Good night, cat.
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

\`&\` before a row joins it to the row just above it, a line or a block: the two begin at once, and the next row waits for both. It is the short way to write two rows together:

\`\`\`script
ann ${SAY}: Who is there?
& ben ${SAY}: Who is there?
narrator ${SAY}: They had both heard it.
\`\`\`

An action that is fitted (the actions below say which are), joined to words or in a \`together:\` with words, is hurried or slowed to end when they do, so somebody goes somewhere while somebody talks. Any other action keeps its own pace, whatever is said beside it.

An action that is open (the actions below say which are) has no length: it goes on to the end of the block it is in, and nothing waits for it. So join it to what it goes with, and it ends where that does. Here \`watch\` is open, and Ben watches as long as the cat is on its way and the narrator talks:

\`\`\`script
cat go to=pond
& narrator ${SAY}: The cat goes by, and looks at nobody.
& ben watch at=cat
ben ${SAY}: Good morning to you too.
\`\`\`

### Channels

What a character says is on its channel \`voice\`, and what it does on the channels that the actions below name. Different channels go on at once, and so do different characters. One channel does one thing at a time. Here \`go\` is on a character's \`place\`, and is fitted, and \`nod\` is on its \`head\`. So Ann goes, nods and talks at once, and Ben nods a second later:

\`\`\`script
together:
  ann go to=pond
  ann nod
  ann ${SAY}: Good morning, Ben, and what a fine day!
  ben nod @ block.start + 1s
ben ${SAY}: Good morning.
\`\`\`

- Two rows that would begin at once, directly in one \`together:\` or joined by \`&\`, are never on one channel of one character. Write the two one after the other, in an \`in order:\` there, or begin the later by the end of the first: \`@ prev.end\`.
- An open action keeps its channel busy to the end of its block, so what comes next on that channel is written after the block.
- In blocks of their own, the one written below waits for the one above: in a \`together:\` of two \`in order:\` blocks, what Ann says in the second waits for what she says in the first.

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

A value is a number, a name, or a formula of these with \`+ - * /\` and parentheses, a minus with a space on each side. A time is in seconds (\`0.5s\`), a volume in decibels (\`-12dB\`) and a share in hundredths (\`50%\`); any other number has no unit. A name stands for what it is set to. Values are set at four levels, and each holds for everything inside it: the whole file and a scene, under \`values:\`; a block, on its header; and a line.

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
- \`volume\`: how loud what is said or played is (How loud, below). On any level.
- how long an action lasts, one of these three, on any level:
  - \`takes=2s\`, its seconds;
  - \`speed=0.5\`, so many times its own speed: 0.5 is half as fast, 2 twice;
  - \`arrive=a.end - 0.5s\`, a moment of something above, written as after an \`@\`: it is hurried or slowed, within reason, to end then.

An action given its seconds or its speed keeps them, whatever is said beside it. Given none of the three, it goes at its own speed, or, one that is fitted, takes as long as the words it is joined to. A voice lasts as long as its words, a sound as long as its file, and an open action to the end of its block: they take none of the three.

\`a.length\` is how long a line above lasts, if that line is said or played once, or is an action given its seconds or its speed, or one that is neither fitted nor open. It is read by \`takes\`, by \`pause\` and after an anchor's moment. \`pause=5s - a.length\` is what is left of 5 seconds, and none when the line is longer:

\`\`\`script
[a] ann ${SAY}: It is a long way to the pond.
& ann go to=pond takes=a.length * 2
ben go to=pond speed=0.5
[c] cat ${SAY}: Wait for me, all of you, I am coming too!
& cat go to=pond arrive=c.word(coming)
narrator ${SAY} @ prev.end + 1s: Nobody waited.
\`\`\`

### How loud

Everybody's words are equally loud, whichever voice says them. \`volume\`, in decibels, makes what is said quieter or louder than that: at \`-6dB\` somebody talks a little lower, at \`-12dB\` in a murmur or far off, and at \`-20dB\` is hardly heard under the others. It is a value as any: on a line, a block, a scene or the file, for everything that is heard, for what is said alone (\`${SAY}.volume\`) or for one character (\`radio.volume\`), and the nearest wins. A character may have its own in the library, which any of these replaces.

Here the counting is a murmur under the talk, and the cat talks low:

\`\`\`script
in order:
  under volume=-12dB:
    ben ${SAY}: One leaf, two leaves, three leaves, four leaves.
    ben ${SAY}: Five leaves, six leaves, seven leaves, eight leaves.
  ann ${SAY}: What is that?
  cat ${SAY} volume=-6dB: Hush. Nobody may stop the counting.
ann ${SAY}: Nobody ever could.
\`\`\`

- What goes on under a talk, as an \`under:\` or a radio, is at \`-8dB\` to \`-14dB\`, so that the talk is heard.
- Only differences are heard: a whole video at \`-10dB\` is as loud as one at \`0dB\`. A volume is from \`-60dB\` to \`12dB\`.
- What is quieter comes out as much quieter as it is written, and what is louder a little less so: a shout at \`6dB\` is about 5 over the rest, and one at \`12dB\` about 10.

### Sounds

The library's \`sounds\` are files, each by its name: music, a noise, a jingle. There are no others, and a story that needs one does without. A sound is played by a line of its own, which begins with the sound's name:

- \`bell ${PLAY}\` plays it once. It is a line as any other: what comes after it waits for it, \`&\` or a block has it at once with others, an anchor begins it at a word, and an \`under:\` cuts it.
- \`rain ${LOOP}\` plays it again and again. It is open: it goes on to the end of the block it is in, and nothing waits for it.

Here the bell rings before anybody talks, and again at a word; the rain goes on under the talk, and is over where the block ends:

\`\`\`script
bell ${PLAY}
in order:
  rain ${LOOP} volume=-20dB
  [a] ann ${SAY}: Somebody rings the bell, and in this rain!
  bell ${PLAY} @ a.word(bell)
  ben ${SAY}: I hear nothing.
ben ${SAY}: And now not even the rain.
\`\`\`

Music or a noise under a whole scene is a \`${LOOP}\` in the scene's first row. Music that goes on from one scene into the next is the cartoon's own: a \`script\` on top of the file, with sounds alone. All its rows begin with the cartoon, and go on under all the scenes: nothing waits for them, and what has not ended is cut where the last scene ends. One that begins later has an anchor, as \`@ prev.end\` or \`@ block.end - 10s\` (here the block is the cartoon), and several, one after another, are in an \`in order:\`.

\`\`\`yaml
values: { rain.volume: -24dB }
script: |
  tune ${LOOP} volume=-20dB
scenes:
  - script: |
      rain ${LOOP}
      ann ${SAY}: What a day to stay at home.
      ben ${SAY}: We always stay at home.
  - script: |
      ann ${SAY}: Now the rain is over, and here we are.
\`\`\`

- At \`0dB\` a sound is as loud as anybody's words, whichever file it is. Music and rain under a talk are at \`-18dB\` to \`-24dB\`, and a noise beside words at \`-6dB\` to \`-12dB\`. A sound may have its own volume in the library, as a character may: then leave it out of the line, unless the story has the sound louder or quieter than it is. \`tune.volume\` is for one sound.
- A \`volume\` on a block, a scene or the file is for its sounds too. For the words alone, write \`${SAY}.volume\`.
- A sound has no mouth and no caption, so nobody sees what it is: the words or the picture say it.
- One sound does one thing at a time. To have it twice at once, or both over the scenes and in one, is refused.

### What is refused

- An anchor to something below it, or in another scene.
- A row that waits for what waits for it: \`@ block.end\` in a block that waits for the row, or the end of a line that is \`under:\` in the same block. Begin it by a start, a share or a word.
- An action in an \`under:\`. Only what is said or played may be cut.
- A line by somebody who is \`under:\` in the same block: they are busy until it ends. Give it to another, or write it after the block.
- An \`under:\` with nothing to be under, and an open action or a \`${LOOP}\` with nothing to go with: last in a block in order, or alone in its block, an \`under:\` too. A \`${LOOP}\` needs no \`under:\`.
- A row on a channel that an open action above it keeps busy, in the same block. Write it after the block, or join the open action to what it goes with, so that it ends sooner.
- Two rows on one channel of one character, directly in one \`together:\` or joined by \`&\`, the later with no start of its own.
- In an \`ending together:\`, a row that has a time of its own, by an \`@\` or by \`arrive\`; a block, or a row joined by \`&\`; and two rows on one channel of one character. Anchor the whole block, and write a block beside it, in a \`together:\` around both.
- A \`volume\` that is not in decibels, and one for an action: only what is said or played has one.
- A sound that the library does not have, one whose file is not there, and anything but sounds in the cartoon's own script.
- A value that nothing reads, values that read each other in a circle, and two of \`takes\`, \`speed\` and \`arrive\` set for one action on one level.
- The length of a block, or of an action that is fitted to words or open: those are known only once everything has its place.

A channel does one thing at a time: two lines of one character, or two of its actions on one channel, never overlap, whatever blocks they are in. The second waits for the first.
`;

/** How a construction is written, for a plugin that has some. */
const CONSTRUCTED = "A value may be worked out from others by a construction: its name, and in parentheses what it is worked out from, each a value itself, a comma between one and the next. It stands by itself, or in another's parentheses: it is no number, so nothing is added to it. Between `{` and `}` a comma ends a value, so there a construction is written in quotes, or its key on a row of its own.";

/** The guide for a plugin whose videos are written as scripts: the tool's part, the plugin's, the actions, the constructions, and its names for numbers. */
export function guideOf(script: NonNullable<Described["script"]>): string {
  const names = Object.entries(script.names).map(([name, number]) => `\`${name}\` is ${number}`);
  const forExample = (example: string) => `For example: \`${example}\``;
  const onChannels = (channels: string[], how = "") => `${channels.length > 1 ? "Channels" : "Channel"}: ${listed(channels.map((channel) => `\`${channel}\``))}${how}.`;
  const actions = Object.entries(script.actions).map(([name, { description, example, channels, fits, open }]) => `- **${name}**: ${description} ${onChannels(channels, fits ? "; it is fitted" : open ? "; it is open" : "")} ${forExample(example)}`);
  const constructions = Object.entries(script.constructions).map(([name, { description, example }]) => `- **${name}**: ${description} ${forExample(example)}`);
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
    `- **${SAY}**: The character says the words after the colon, in its voice; the narrator's are said in the video's. ${onChannels([VOICE])} ${forExample(`narrator ${SAY}: Once upon a time.`)}`,
    `- **${PLAY}**: The sound is played once, for as long as its file lasts. ${onChannels([SOUND])} ${forExample(`bell ${PLAY}`)}`,
    `- **${LOOP}**: The sound is played again and again. ${onChannels([SOUND], "; it is open")} ${forExample(`tune ${LOOP} volume=-20dB`)}`,
    ...actions,
    "",
    ...(constructions.length > 0 ? ["## The constructions", "", CONSTRUCTED, "", ...constructions, ""] : []),
    ...(names.length > 0 ? [`These names stand for numbers in any value: ${listed(names)}.`, ""] : []),
  ].join("\n");
}
