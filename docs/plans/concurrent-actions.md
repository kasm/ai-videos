# Plan: concurrent actions

## Now

- Plan written 2026-11-24, the user's yes: the judge's final plan from
  `.review/concurrent-actions/`, with the user's addition that day: the
  scenario says what sets the time, and the volumes (the goal and steps
  1, 2, 4, 5 and 6). The user's picks: cartoons stay at -14 LUFS, judged
  by ear in step 3; two rows of captions at most, smaller, a third
  speaker with none (step 5); the sample's sounds are plain ones made
  with ffmpeg (step 6).
- Not started. **Next: step 1.**


## Goal

In a cartoon, voices can sound at once: together, one beginning some
seconds into another, or one going on over several beats, in one line or
in several that follow each other. Each has its own voice and volume
(its character's, or the line's own). Several characters can move in one
beat, each move with its own start and length. Music and sound effects
play under the voices, at the volume the scenario gives each, and the
captions show everyone who speaks. When something long goes on over
several beats (a **radio**: speech or a sound), the scenario says what
sets the time: the short lines, and the radio is cut where they end, or
the radio, and it plays whole while the beats wait for its end. The MP4
and the web page have all of it, and a web chat can write it. Videos
that use none of it are planned, fitted and drawn as before; a cartoon's
sound changes a little (step 3), RayCraft's does not.

**Out of scope:** RayCraft's tutorials (its repo is not touched); one
character making two moves at the same moment (jumping while walking); a
move going on past its beat; music that lowers itself under a voice;
left and right in the sound; a voice that whispers rather than only
sounds quieter; finding or composing music (the audio files are the
user's, or plain ones made with ffmpeg).


## Steps (one session each)

Every step: `npm test` and `npm run typecheck` pass here and in
`cartoons/`; `npm --prefix ../RayCraft/media run typecheck` and
`npm --prefix ../RayCraft run test:libs` pass, no file of RayCraft
changed; `make --fit` gives the ten requests as before; the step's own
notes (`AGENTS.md` or `cartoons/CLAUDE.md`) say what it added. **As
before** means equal to the baseline step 1 copies out of the projects'
`.cache/` first, into `.review/concurrent-actions/before/`: the seven
cartoons' and RayCraft's three tutorials' plans, requests, `.frames`,
`sound.m4a` and builds.

### 1. Write the contract (the tool)

`AGENTS.md`, the plugin's types and the clip's schema say how a plan
gives a line's start (with another line, some seconds into it, or after
it ends), what waits for its end or where it is cut, its volume, and the
sounds under it with the same choices, and how a library gives a
character's volume and names the sounds. Every new key is optional, the
formats stay at version 1, and `Moment` and `Request` get no key a
plugin must give. **Done when:** the user has accepted the text; a test
shows a plan with each new key reaching `plan.json` whole, and a wrong
one refused with its reason; the ten plans are as before.

### 2. Fit voices that sound at once (the tool)

A line keeps the start its plan gives it however long the voices turn
out. One that goes on over later beats holds none of them back, unless
the plan has a beat wait for its end; one the plan cuts ends there, its
mouth and its caption with it. The sound and the captions take each
line's time from the request. `Effort: xhigh`. **Done when:**
`src/fit.test.ts` shows two lines begun together, one begun a second
into another, one going on over three beats and another of its voice
after it, then the same two cut where the third beat ends, a beat that
waits for a voice begun beats before, and a clip that ends after its last
voice not cut; a test finds each of them in the sound at the request's
time, and the cut ones silent after the cut.

### 3. Mix voices at their volumes (the tool)

A character's volume in the library, and a line's own over it, set how
loud each line is; the mix comes to the video's loudness by one gain,
its peaks limited, so the differences stay. Today's levelling is not one
gain at -14 LUFS, so every cartoon's sound changes a little. **Done
when:** a test finds two lines written 12 dB apart 12 dB apart (to 1 dB)
in a `sound.m4a` at -14 LUFS, their peaks as far over their loudness as
Kokoro's, so that today's levelling fails it, and two full voices at once
unclipped; RayCraft's `water-switch`, made again, has its `.frames` as
before and each line as loud as before, to 0.5 dB; the user has listened
to `the-shy-visitor` made again.

### 4. Mix music and sound effects (the tool)

A library names the project's audio files, and a plan plays one once or
looped, from a moment to another, at the volume the plan gives it, in
the one sound both outputs play. As a line, it can be cut where a beat
ends, or play whole with a beat waiting for its end. A sound keeps its
own quality there; a video with none keeps its sound as step 3 left it.
**Done when:** `src/sound.test.ts` finds each sound at its time and
level, a tone above 12 kHz among them, and a mix with none the same as
step 3's; `src/fit.test.ts` shows one cut and one waited for; a file
missing is refused by name before anything is written; one whose bytes
changed redoes the sound and no drawing; `import` refuses a reply that
adds a sound.

### 5. Caption everyone who speaks (the tool)

Lines that sound at once show one above the other, in the video and on
the page, each as long as its own words, or to its cut. How many rows
show, how large and where, clear of the mouths, is agreed with the user
first. **Done when:** a scratch project's video with two lines at once
passes HyperFrames' check, and a frame of it and of its page shows both,
neither over the other; the user accepts two and three at once over a
frame with Tuk, whose mouth is the lowest; a test shows a video with no
two lines at once keeping its captions, and RayCraft's `water-switch`,
made again, has its captions and `.frames` as before.

### 6. Write voices and sounds in a cartoon (cartoons)

A line says when it begins, how far it goes on and how loud it is; the
cartoon, a scene or a beat says its music and sounds, and how loud each
is. The scenario says of each radio, speech or sound, if it is cut or
sets the time. The audio files, in git, are ones the user gives,
licensed for a public repo, or plain ones made with ffmpeg (a tone,
rain, a step). **Done when:** a new `videos/all-at-once.yaml` with a
chorus, an interruption, a murmur of two lines over three beats, a quiet
line and a loud one, music over two scenes, an effect, a radio cut where
the talk over it ends and one the talk waits for (one speech, one a
sound) makes as a video and a page, and the user, having watched both,
accepts it; the seven plans are as before.

### 7. Move several characters in one beat (cartoons)

Each character may make one move in a beat, with its own start and
length, and the beat's moves stretch together to its lines; mending no
longer splits such a beat. `Effort: xhigh`. **Done when:**
`src/picture.test.ts` shows one walking from the beat's start while
another hops and a third turns a second later, one of them longer than
its own pace, and their order kept in a beat stretched by its lines; two
who walk to one mark are refused, and two moves by one character are
still mended into beats; `all-at-once` has such a beat and the user
accepts it; the seven `.frames` are as before.

### 8. Teach it to a web chat (cartoons, and the tool's prompt)

The guide says when and how to use each, with an example that passes the
checks; the tool's part of the prompt says a reply adds no sound; the
READMEs and `docs/workflow.html` say what a cartoon can now do. **Done
when:** a fresh `claude -p` with no tools, given only the prompt for a
story written for it (people talking over each other, two who run off
together, and a sound the library has), gives episodes that import and
make with no edit by hand, one of them with lines at once, moves at once
and a sound, and the user accepts it.
