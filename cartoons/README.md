# Cartoons

Simple 2D cartoons with talking characters, made by [ai-videos](../README.md) from one text file
each. Characters are flat shapes that walk, turn, look at one another, jump, wave, point, blink and
talk in front of a background, each in a voice of its own, with captions. Several of them act and talk
at once: a chorus, someone who breaks in, talk over a radio, two who run off together. Music and
sounds come from the library. There are no props and no changing faces: the narrator tells the rest.

First [set up the tool](../README.md#set-up). The commands below are typed in this folder; it needs
no install of its own to make videos.

## From a story, with a web chat

On Windows, one command takes a story to its videos. You need a web chat, any that takes a long
message. `<name>` is in lowercase letters, digits and dashes, and names the episodes:
`<name>`, or `<name>-1`, `<name>-2` and on.

| # | Who | What | Reads | Writes |
| --- | --- | --- | --- | --- |
| 1 | you | Write the story in prose. | | `stories/<name>.md` |
| 2 | you | Run `npm run -s video -- story stories/<name>.md`. | | |
| 3 | the tool | Puts the prompt on the clipboard. | the story, `library.yaml` | the clipboard |
| 4 | you | Paste it into a new chat. When it has answered, copy the whole answer with the chat's copy button, and press Enter in the terminal. | | the clipboard |
| 5 | the tool | Keeps the answer, checks it, and writes each episode it takes, with any new characters and backgrounds. | the clipboard | `stories/<name>.reply.md`, `videos/<episode>.yaml`, `library.yaml` |
| 6 | the tool | Makes each episode. | `videos/<episode>.yaml`, `library.yaml` | `out/<episode>.mp4` |

When it does not go straight through:

| What happens | What to do |
| --- | --- |
| The chat stopped before `All episodes written.` | Type "continue" in the chat, copy its answer, press Enter. |
| The tool refused an episode | The message for the chat is on the clipboard: paste it, copy the answer, press Enter. |
| The chat cannot mend it, or never says it is done | Type `done` instead of Enter: the episodes taken are made. |
| You stopped it, or a make failed | Run the same command: it goes on from `stories/<name>.reply.md`. |
| You want to begin anew | Delete `stories/<name>.reply.md`, and run it again with a new chat. |
| An episode's file is there already, with other text | It is kept, and the new one is not written. Delete the file to take the new one. |

**Without the clipboard**, and so not only on Windows, the same in three commands (on Windows, type
them in Git Bash: PowerShell's `>` can change a story's quotes and accents):

```
npm run -s video -- prompt stories/<name>.md > prompt.md
npm run -s video -- import stories/<name>.reply.md
npm run -s video -- make videos/<episode>.yaml
```

After the first, paste `prompt.md` into the chat, and the chat's reply into
`stories/<name>.reply.md`; `prompt.md` can then be deleted. When something is refused, `import`
prints the message for the chat: add the chat's answer to the end of the reply's file, and import
again.

**With Claude Code**, opened in the repository's root, ask it to "write an episode from
stories/\<name\>.md". It answers the same prompt itself, and looks at the frames it made.

A whole example: [stories/the-race.md](stories/the-race.md), a chat's reply to its prompt,
[the-race.reply.md](stories/the-race.reply.md), and the two episodes it gave,
[the-race-1.yaml](videos/the-race-1.yaml) and [the-race-2.yaml](videos/the-race-2.yaml), taken and made
as the chat wrote them.

## By hand

Save this as `videos/first-talk.yaml`:

```yaml
use: cartoon

scenes:
  - background: meadow # a background of library.yaml
    places: { pip: left, mo: off-right } # where each character stands as the scene begins
    faces: { mo: left } # the others face right
    script: | # a row for each thing that happens, in order
      tune loop
      mo walk to=right
      & narrator say: Here comes Mo.
      pip wave
      & pip say: Hello, Mo!
      [fine] mo say: Hello, Pip! What a fine day for a jump.
      & pip stand
      pip say @ fine.word(jump): A jump?
      together:
        pip jump times=2
        mo jump times=2
        narrator say: And so they jump, both at once.
```

The music goes on under the whole scene, Mo walks for as long as the narrator speaks, and Pip breaks
in at Mo's word "jump". Check it, see its timing, in seconds, then make it:

```
npm run -s video -- check videos/first-talk.yaml
npm run -s video -- make videos/first-talk.yaml --fit
npm run -s video -- make videos/first-talk.yaml
```

The video is `out/first-talk.mp4`. `check` shows every mistake in the file, each with its line and a
hint, and speaks nothing.

What a row may be:

| Row | What happens |
| --- | --- |
| `pip say: Hello!` | Pip says it, in Pip's voice. `narrator say:` is the narrator, whom nobody sees. |
| `mo walk to=right` | Mo walks to a place: a mark (`off-left`, `left`, `middle`, `right`, `off-right`), a point (`to=700`), or beside someone (`to=left-of(pip, near)`). |
| `mo turn` | Mo turns to face the other way. |
| `mo look-at target=pip` | Mo faces Pip wherever Pip goes, to the end of its block. |
| `mo jump times=2` | Mo hops. |
| `pip wave`, `pip point`, `pip stand` | Pip's arm, until it is changed. |
| `scene background to=night` | The background changes, as a cut. |
| `tune loop`, `rustle play` | A sound of the library, again and again, or once. |
| `together:`, `in order:`, `ending together:`, `under:` | A block: its rows, indented under it, begin at once, follow each other, end at once, or go on under the rest and are cut where it ends. |
| `& …` | The row begins with the one above it. |
| `… @ a.word(jump)` | The row begins at a moment of the one labelled `[a]`: its start, its end, a share of it, or a word. |
| `… speed=slow`, `takes=2s`, `volume=-6dB` | A value: how fast, how long, how loud. Set under `values:` on a scene or the file, it holds for all in it. |

A character does one thing at a time with its voice, its place, its facing, its arm and its hops, and
two characters never stand on one spot. The full format is in [CLAUDE.md](CLAUDE.md#the-script) and
the tool's [AGENTS.md](../AGENTS.md#a-script), and these show it in use:

- [hello.yaml](videos/hello.yaml): the smallest whole one
- [meet.yaml](videos/meet.yaml): two characters who talk, each in a voice of its own
- [sundown.yaml](videos/sundown.yaml): every action but a look, and a background that changes twice
- [all-at-once.yaml](videos/all-at-once.yaml): what can happen at once, in three scenes, with music
  and sounds

## To change something

| To change | Edit |
| --- | --- |
| What is said or done | The video's file, `videos/<name>.yaml`. |
| A character: its look or its voice | Its entry in `library.yaml`. Every video with it changes when it is made again. |
| The characters and backgrounds there are | `library.yaml`: [how to draw one](CLAUDE.md#the-library). |
| The narrator's voice, for every video | `voice` in `package.json`, under `"ai-videos"`. |
| One video's narrator, speed or loudness | `voice:`, `speed:` or `loudness:` in its file, beside `use:`. |
| How loud a line, a character or a sound is | `volume=-6dB` on the row, or a character's or a sound's `volume:` in `library.yaml`. |
| The sounds there are | `sounds:` in `library.yaml`, each a file you put in `sounds/`, licensed for a public repo. |
| Whether a web page is made too | `outputs: { web: true }` in its file, or `"outputs": { "web": true }` in `package.json` for all. |

`npm run -s video -- voices` writes samples of several voices into the tool's `out/voice-samples/`,
and lists every name.

## Working on the plugin

The plugin is `src/`. Its tests need an install in this folder:

```
npm ci
npm test
npm run typecheck
```

[CLAUDE.md](CLAUDE.md) says how a cartoon is drawn and what each file in `src/` is for. The contract
with the tool is in [its AGENTS.md](../AGENTS.md#plugins).
