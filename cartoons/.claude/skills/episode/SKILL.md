---
name: episode
description: Write a cartoon from a story - turn a story (a file in stories/, or told in the chat) into videos/<name>.yaml (the cast, the scenes, the lines, the poses and moves), add a new character or background to library.yaml, and make the video. Use for "write an episode from stories/x.md", "make a cartoon of this story", "turn this story into a scenario".
---

# An episode from a story

A story comes in as prose (`stories/<name>.md`, or in the chat). It goes
out as `videos/<name>.yaml` and a video the user watches. The format is
`CLAUDE.md`, "The scenario" and "The library": read them first, then
`videos/the-shy-visitor.yaml`, which uses all of it, and `library.yaml`,
what a cartoon can name. `src/` is not needed.

`<name>` is the story file's name; a story told in the chat gets a short
name of its own (lowercase letters, digits and dashes). A file
`videos/<name>.yaml` that is there already is another cartoon: ask before
writing over it.

## 1. Read the story for what can be shown

Before writing, list:

- who is in it, and which of them `library.yaml` has;
- where and when it happens: the backgrounds, and which of them
  `library.yaml` has;
- what happens, in order, one thing at a time: the beats;
- what is said, and by whom: the lines.

A cartoon here has characters built of rectangles and ellipses, who stand
on a stage, walk, turn and jump, wave and point, blink and talk, in front
of a background that changes as a cut. It has no props, no faces that
change, no two moves at once, nobody lying down or sitting. What the story
has and the format lacks, the narrator says, or it is left out. Never
invent a key or a pose: the plugin refuses it. Keep a list of what was left
out, for the report.

## 2. The cast

- **A name** is the story's, in lowercase (`Tuk` is `tuk`). The same name
  goes in `library.yaml`'s `characters`, in the scene's `places`, and in
  each line's `who`: that is how a line finds its voice and its mouth.
- **A character drawn before** (`pip`, `mo`, `tuk`) is named, as it is in
  `library.yaml`, so it looks the same in every cartoon. Change nothing
  already there.
- **A new character** is drawn in `library.yaml`, under `characters`. You
  may add it without asking (the user's standing yes); say in the report
  what you added. Give it all four parts (`body`,
  `arm`, `eyes`, `mouth`) and a `shoulder`, so it can do everything the
  others do. Make it easy to tell apart: its own colour and its own size
  (Pip is 220 by 340, Mo 190 by 430; say in a comment what it is). Write
  it facing right, pupils nearer the right side of each eye. Keep the
  eyes, the mouth and the room under the mouth (0.9 of its width) inside
  the body.
- **Its voice** is its `voice:` in `library.yaml`, beside its `parts`.
  The narrator's `voice` and the rest of `package.json` are not yours, and
  a voice a character has already stays as it is.
  - The voices that speak English (the tool's, Kokoro; any other name
    fails when `make` speaks the line, and names the command that lists
    them):
    - American women: `af_alloy`, `af_aoede`, `af_bella`, `af_heart`,
      `af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`,
      `af_sarah`, `af_sky`;
    - American men: `am_adam`, `am_echo`, `am_eric`, `am_fenrir`,
      `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa`;
    - British women: `bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily`;
    - British men: `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis`.
  - Take one no character in the library has, nor the narrator, and that
    suits the character. You cannot hear it: say which you took, so the
    user can change it.
- **A new background** is drawn in `library.yaml` too, under
  `backgrounds`, when no background there is the story's place. You may
  add it without asking, as a character. Keep its grass from y 820 down,
  as the others'.

## 3. Scenes and beats

- **One scene** is one stretch of the story in one place. Time passing in
  the same place is a beat's `background:`, not a new scene. A new scene
  puts everyone in new places, facing as it says, standing.
- **The stage** has three marks, `left`, `middle` and `right`, one
  character each, and two out of sight, `off-left` and `off-right`, where
  any number wait.
- **Coming and going** is a walk from or to a mark out of sight. The one
  who walks faces the way it goes: from the right it begins with
  `faces: left`. A walk turns nobody, so going back the way it came needs
  a `turn` beat first.
- **Who looks at whom.** Everyone faces right unless `faces` or a `turn`
  says otherwise. Work out each character's facing beat by beat: two who
  talk face each other, and a `point` goes straight ahead, so the pointer
  faces what it points at.
- **A beat is one thing happening**, with at most one move. What the story
  tells as one sentence is often several beats: he stops, says hello,
  turns away. A pose is not a move: one beat can change poses and hold a
  walk as well. Put a pose back to `stand` when its moment is over; a wave
  left on goes on waving.
- **`takes`** is the beat's length at its own pace: leave it out, and a
  move takes its own time, a hold its words'. Write it only for a pause
  with nothing said (`takes: 2`), or a move slower than its own.

## 4. Lines

- A line is a sentence or two, said by one character or by the narrator.
  A longer speech is several lines, in one beat or in beats that follow.
- Keep a line to about 45 characters: a longer one is a caption of two
  rows, and the upper row covers feet at y 880.
- What a character says in the story, it says: write reported speech
  ("Mo asks where he comes from") as the words themselves.
- The narrator says what nobody says and the picture cannot show: where we
  are, who somebody is, what somebody feels, time passing. Don't have the
  narrator repeat what the picture shows anyway.
- Write for the ear: plain words, no brackets, no stage directions. The
  line is also the caption.

## 5. Check, make and look

Run these from the repo's folder.

1. `npm run -s video -- make videos/<name>.yaml --fit`. This is the check:
   the plugin's first call reads the file and refuses one that breaks the
   format, with the file, the place and the reason. Fix it and run again.
   It lists what the plugin mended (`CLAUDE.md`, "Mending"): write those
   beats into the file as mended, so the file says what is drawn. Then it
   speaks the lines and prints each beat as `its own length -> its length
   in the video`.
2. `npm run -s video -- make videos/<name>.yaml` makes the video. The first
   time it can take a few minutes.
3. Look at it. From the fit's `at` times take a frame from the middle of
   each beat that changes the picture, into a temporary folder outside
   the repo, and read each as an image:
   `ffmpeg -v error -y -ss <seconds> -i out/<name>.mp4 -frames:v 1 <folder>/<beat>.png`
   Check that everyone who should be seen is, apart from the others and
   above the caption; that talkers face each other; that a new character
   reads as one (eyes and mouth on the body, the arm at its side, raised
   in a wave, straight ahead in a point).
4. Change the file and `make` again. Each line is written once, in its
   beat's `says`; `make` redoes only the stages a change goes into, and
   says which it took from the cache.

## 6. Report

Say in a few lines: the video's path, the cast with each new character's
voice (and what was added to `library.yaml`), what of the story was
left out or given to the narrator, and anything in the frames you could
not get right. Don't commit: the user watches first.
