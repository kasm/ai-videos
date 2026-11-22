---
name: episode
description: Write a cartoon from a story - turn a story (a file in stories/, or told in the chat) into episodes, videos/<name>-1.yaml and on, through the video tool's prompt and import (a new character or background goes into library.yaml), and make the videos. Use for "write an episode from stories/x.md", "make a cartoon of this story", "turn this story into a scenario".
---

# Episodes from a story

A story comes in as prose: `stories/<name>.md`, or told in the chat. It goes out as episodes,
`videos/<name>-1.yaml` and on (or `videos/<name>.yaml` for one), and videos the user watches.

You answer the tool's prompt as a web chat would, and the tool does the rest. The format, its
rules, the library and the voices are all in the prompt, so this skill holds none of them: what
the prompt does not have, a cartoon does not have.

A story told in the chat goes into `stories/<name>.md` first, `<name>` short, in lowercase
letters, digits and dashes. Run the commands from the repo's folder.

## 1. The prompt

```
npm run -s video -- prompt stories/<name>.md > <a temporary folder outside the repo>/prompt.md
```

Read all of it. It is your instructions: follow it as it says.

## 2. The reply

Write your reply, as the prompt asks, into `stories/<name>.reply.md`: the blocks, the line it
asks for after the last, and what you left out.

## 3. Import

```
npm run -s video -- import stories/<name>.reply.md
```

It writes each episode it takes as `videos/<episode>.yaml`, and what your blocks add to
`library.yaml` (the user's standing yes), and writes nothing over.

- What it refused, it says, with a message for the chat. Do as the message says: write those
  blocks again, mended and whole, at the end of the reply's file, and import again.
- A video file it kept, being there already with other text, is another cartoon of that name:
  ask the user before deleting it.

## 4. Make and look

1. `npm run -s video -- make videos/<episode>.yaml` makes each video, into `out/<episode>.mp4`. The
   first time it can take a few minutes. It lists what the plugin mended (`CLAUDE.md`, "Mending").
2. Look at it. From the fit's `at` times (`make videos/<episode>.yaml --fit` prints them) take a
   frame from the middle of each beat that changes the picture, into a temporary folder outside
   the repo, and read each as an image:
   `ffmpeg -v error -y -ss <seconds> -i out/<episode>.mp4 -frames:v 1 <folder>/<beat>.png`
   Check that everyone who should be seen is, apart from the others and above the caption; that
   talkers face each other; that a new character reads as one (eyes and mouth on the body, the arm
   at its side, raised in a wave, straight ahead in a point).
3. What you could not get right in a picture, change in the video file itself, and make again:
   `make` redoes only the stages a change goes into.

## 5. Report

Say in a few lines: the videos' paths, the cast with each new character's voice (and what was
added to `library.yaml`), what of the story was left out or given to the narrator, and anything in
the frames you could not get right. Don't commit: the user watches first.
