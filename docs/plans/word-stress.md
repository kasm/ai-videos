# Plan: word stress in Ukrainian and Russian

## Now

- Plan written 2026-11-27, at the user's ask, their yes that day.
- Measured that day, before any step: Supertonic takes a combining acute
  (U+0301) after a vowel as the word's stress.
  - How: twelve words of two syllables, said alone by `ru_f1` and
    `uk_f1`, each marked on its first vowel and on its second, three
    seeds each; the second syllable's energy against the first's.
  - The acute: the mark on the second vowel put 6.5 dB (Russian) and
    7.7 dB (Ukrainian) more into the second syllable than the mark on
    the first, over 3 dB in each of the 11 words that could be measured.
  - A grave, a `+` before the vowel and a capital vowel: no such move
    (over 3 dB in 1 to 4 words of 5 or 6).
  - A sentence marked all through lasts 4 to 6 % longer.
  - Not yet heard by the user. The samples, the log and the two scripts
    are in `out/stress-probe/`.
- Step 1 built 2026-11-27, and waits for the user's ear: its "Done
  when" has them mark a word in a Russian video and in a Ukrainian one,
  and hear each right.
  - Checked so far: `src/stress.test.ts` finds the mark in what the
    voice is asked to say, of a plan's line and of a script's, and in no
    caption; `src/check.test.ts` takes a marked word, anchored at too,
    and refuses a mark that is not right after a vowel. `npm test` (374)
    and `npm run typecheck`, the tool's and cartoons' (67), pass.
  - Two try cartoons, in Ukrainian and in Russian, their lines marked,
    were checked and made as pages, then deleted: each `compiled.json`
    kept its lines' marks, Supertonic said them, and no caption of
    `cartoons/out/stress-try-uk.html` and `-ru.html` has one. Not heard
    by the user yet.
  - RayCraft's `water-switch` and cartoons' `hello` and `meet-uk`
    checked as before.
- **Next: the user's part of step 1; then step 2.**


## Goal

A word that Supertonic stresses wrong, in a video in Ukrainian or
Russian, is said right. A mark after a vowel in a line's text (`за́мок`)
is the word's stress: the voice gets it, and the captions don't show it.
The tool marks the words it knows by itself, on this machine, so a
writer marks only what the tool got wrong or could not decide.

**Out of scope:** English (Kokoro stresses its own words); another voice
engine; a sentence's emphasis and intonation; marks shown in the
captions; a project's own list of words (a name the tool does not know
is marked in each line that says it); Python (a dictionary or a model is
read from Node, as Supertonic's are).


## Steps (one session each)

### 1. A mark in a line

A mark after a vowel in a line's text, of a script or of a plan, is the
word's stress in a Ukrainian or Russian voice. The captions, the web
page and the words an anchor names are the text without it; the guide,
in each language, says how a word is marked. **Done when:** the user
marks a word they hear stressed wrong in a Russian video of theirs and
in a Ukrainian one, and hears each right in the video made, its caption
unmarked; a test finds the mark in what the voice reads and in no
caption; `npm test` and `npm run typecheck` pass.

### 2. Where the tool's marks come from

The dictionaries and models that mark stress in Ukrainian and in
Russian, each tried from Node, offline, on the lines of the user's own
videos. **Done when:** the user picks one for each language, knowing its
licence, its download, how long it takes, how many of those words it
marks right, and what it does with a word that has two stresses or that
it does not know. Nothing in `src/` changes.

### 3. The tool marks the words

Each word with no mark of the writer's is marked by step 2's pick before
the voice says it; `setup` fetches the pick, pinned and checked, and no
other command uses the network. `check` and `make` say the words it
could not decide, each with its line; a writer's mark always wins.
**Done when:** a Ukrainian and a Russian video of the user's, with no
mark written, are made with the network off, and the user counts fewer
words stressed wrong than before, each one left mended by a mark in its
line; a test finds the tool's marks on words whose stress is known, and
a writer's mark kept; `make cartoons/videos/hello.yaml` takes its voices
and its sound from the cache; `npm test` and `npm run typecheck` pass.
