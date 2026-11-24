# Cartoons

Simple 2D cartoons with talking characters, made by [ai-videos](../README.md) from one text file
each. Characters are flat shapes that walk, turn, jump, wave, point, blink and talk in front of a
background, each in a voice of its own, with captions. There are no props, no changing faces, and
one move at a time: the narrator tells the rest.

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

## By hand

Save this as `videos/first-talk.yaml`:

```yaml
use: cartoon

scenes:
  - background: meadow # a background of library.yaml
    places: { pip: left, mo: off-right } # where each character stands as the scene begins
    faces: { mo: left } # the others face right
    beats: # what happens, a moment at a time
      - name: mo-comes
        walk: { who: mo, to: right }
        says:
          - { who: narrator, text: "Here comes Mo." }
      - name: pip-waves
        pose: { pip: wave }
        says:
          - { who: pip, text: "Hello, Mo!" }
      - name: mo-jumps
        pose: { pip: stand }
        jump: { who: mo, times: 2 }
        says:
          - { who: mo, text: "Hello, Pip! What a fine day." }
```

Check it and see its timing, in seconds, then make it:

```
npm run -s video -- make videos/first-talk.yaml --fit
npm run -s video -- make videos/first-talk.yaml
```

The video is `out/first-talk.mp4`. A mistake in the file stops `make`, with the place and the
reason. One with a single right answer, such as a walk backwards, is
[mended](CLAUDE.md#mending) in the video instead, and `make` says so.

What a beat may have, besides its `name`:

| Key | What happens |
| --- | --- |
| `walk: { who: mo, to: right }` | Mo walks to a mark: `off-left`, `left`, `middle`, `right` or `off-right`. |
| `turn: { who: mo }` | Mo turns to face the other way. |
| `jump: { who: mo, times: 2 }` | Mo hops in place. |
| `pose: { pip: wave }` | Pip's arm: `stand`, `wave` or `point`, until it is changed. |
| `background: night` | The background changes, as a cut. |
| `says:` | The lines, each with `who` (a character, or `narrator`) and `text`. |
| `takes: 2` | The beat's length in seconds, for a pause with nothing said. |

A beat has at most one move (`walk`, `turn` or `jump`), and two characters never stand on one mark
of the stage. The full format is in [CLAUDE.md](CLAUDE.md#the-scenario), and these show it in use:

- [hello.yaml](videos/hello.yaml): the smallest whole one
- [meet.yaml](videos/meet.yaml): two characters and the narrator
- [the-shy-visitor.yaml](videos/the-shy-visitor.yaml): every move and pose, and backgrounds that
  change

## To change something

| To change | Edit |
| --- | --- |
| What is said or done | The video's file, `videos/<name>.yaml`. |
| A character: its look or its voice | Its entry in `library.yaml`. Every video with it changes when it is made again. |
| The characters and backgrounds there are | `library.yaml`: [how to draw one](CLAUDE.md#the-library). |
| The narrator's voice, for every video | `voice` in `package.json`, under `"ai-videos"`. |
| One video's narrator, speed or loudness | `voice:`, `speed:` or `loudness:` in its file, beside `use:`. |
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
