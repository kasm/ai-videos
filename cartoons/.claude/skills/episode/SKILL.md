---
name: episode
description: Write a cartoon from a story - turn a story (a file in stories/, or told in the chat) into videos/<name>/scenario.yaml (the cast, the scenes, the lines, the poses and moves), give a new character its voice, and make the video. Use for "write an episode from stories/x.md", "make a cartoon of this story", "turn this story into a scenario".
---

# An episode from a story

A story comes in as prose (`stories/<name>.md`, or in the chat). It goes
out as `videos/<name>/scenario.yaml` and a video the user watches. The
format is `CLAUDE.md`, "The scenario": read it first, then
`videos/sundown/scenario.yaml`, which uses all of it. `src/` is not needed.

`<name>` is the story file's name; a story told in the chat gets a short
name of its own (lowercase letters, digits and dashes). A folder
`videos/<name>` that is there already is another cartoon: ask before
writing into it.

## 1. Read the story for what can be shown

Before writing, list:

- who is in it, and which of them `videos/project.yaml`'s `cast` names;
- where and when it happens: the backgrounds;
- what happens, in order, one thing at a time: the beats;
- what is said, and by whom: the lines.

A cartoon here has characters built of rectangles and ellipses, who stand
on a stage, walk, turn and jump, wave and point, blink and talk, in front
of a background that changes as a cut. It has no props, no faces that
change, no two moves at once, nobody lying down or sitting. What the story
has and the format lacks, the narrator says, or it is left out. Never
invent a key or a pose: the maker refuses it. Keep a list of what was left
out, for the report.

## 2. The cast

- **A name** is the story's, in lowercase (`Tuk` is `tuk`). The same name
  goes in the scenario's `characters`, in each line's `who`, and in
  `project.yaml`'s `cast`: that is how a line finds its voice and its
  mouth.
- **A character drawn before** (`pip`, `mo`): copy its block from
  `videos/sundown/scenario.yaml` as it is, so it looks the same in every
  cartoon. Each scenario carries its own `characters`; there is no shared
  file.
- **A new character** is drawn here. Give it all four parts (`body`,
  `arm`, `eyes`, `mouth`) and a `shoulder`, so it can do everything the
  others do. Make it easy to tell apart: its own colour and its own size
  (Pip is 220 by 340, Mo 190 by 430; say in a comment what it is). Write
  it facing right, pupils nearer the right side of each eye. Keep the
  eyes, the mouth and the room under the mouth (0.9 of its width) inside
  the body.
- **Its voice.** A character the cast lacks gets a line under `cast:` in
  `videos/project.yaml`, before `make`. You may add that line without
  asking: it is the user's standing yes. Nothing else in that file is
  yours: the maker, the narrator's `voice`, `fps`, `formats` and the cast's
  other lines stay as they are, and so does a voice a character has
  already.
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
  - Take one nobody in the cast has, nor the narrator, and that suits the
    character. You cannot hear it: say which you took, so the user can
    change it.

## 3. Scenes and beats

- **One scene** is one stretch of the story in one place. Time passing in
  the same place is a beat's `background:`, not a new scene. A new scene
  puts everyone in new places, facing as it says, standing.
- **The stage.** Feet stand at y 880, as in the other cartoons (lower, the
  caption covers them). Leave 350 or more between two characters' x, or
  they overlap. Out of sight is x -250 on the left and 2170 on the right.
- **Coming and going** is a walk from or to a place out of sight. The one
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
- **`takes`** is the beat's length at its own pace. A spoken line takes
  about 0.3 seconds a word. Give a beat with a move about as long as its
  line, or the move is played up to twice as fast to keep up with the
  voice. A walk across half the stage looks right at about 3 seconds.

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

1. `npm run -s video -- new videos/<name>`. This is the check: the maker's
   first call reads the scenario and refuses one that breaks the format,
   with the file, the place and the reason. Fix it and run again, until it
   writes `video.yaml` and names no speaker without a voice.
2. `npm run -s video -- make videos/<name> --fit` speaks the lines and
   prints each beat as `takes -> its length in the video`. A move much
   shorter than its `takes` is rushed (step 3's `takes`).
3. `npm run -s video -- make videos/<name>` makes the video. It can take
   a few minutes.
4. Look at it. From the fit's `at` times take a frame from the middle of
   each beat that changes the picture, into a temporary folder outside
   the repo, and read each as an image:
   `ffmpeg -v error -y -ss <seconds> -i videos/<name>/out/<name>-landscape.mp4 -frames:v 1 <folder>/<beat>.png`
   Check that everyone who should be seen is, apart from the others and
   above the caption; that talkers face each other; that a new character
   reads as one (eyes and mouth on the body, the arm at its side, raised
   in a wave, straight ahead in a point).
5. Change the scenario and go round again. `video.yaml` is the script the
   tool reads, and `new` never writes over it:
   - places, moves, poses, `takes` and pictures changed: `make` again;
   - lines changed (a text, who says it, the beat it is in, a beat's
     name): delete the `video.yaml` that `new` wrote in this session and
     run `new` again. One the user has edited is not deleted: make the
     same change in both files.

## 6. Report

Say in a few lines: the video's path, the cast with each new character's
voice (and that it was added to `project.yaml`), what of the story was
left out or given to the narrator, and anything in the frames you could
not get right. Don't commit: the user watches first.
