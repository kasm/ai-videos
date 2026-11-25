# Plan: the compiled scenario

## Now

- Plan written 2026-11-24 in the chat that designed it, the user's yes
  that day. It replaces `concurrent-actions.md` (in git's history, `main`
  at 6be1a85), whose goal it carries whole.
- The user's picks that day: a scenario is script lines in the YAML
  video file; the seven cartoons are rewritten at the end; places by
  construction, two actions by one character at once, looking at someone
  who moves and a start at a word of a line are in; the hierarchy
  inherits, with no reusable pieces; the smallest script comes first; the
  work goes on the branch `compiled-scenario`, from `main`. Kept from the
  old plan: cartoons
  stay at -14 LUFS, judged by ear; two rows of captions at most, smaller,
  a third speaker with none; the sample's sounds are plain ones made with
  ffmpeg.
- `docs/scenario2.md` is the user's first sketch of this system. Where
  the two differ, this plan holds: its Markdown file, its plugins and its
  errors after the voices are not taken.
- The old step 1's draft (commit e955433, branch `concurrent-actions`)
  is not built on: today's plan format stays as on `main`.
- **Step 1 done 2026-11-24.** Checked:
  `npm test` and `npm run typecheck` here and in `cartoons/`; RayCraft's
  media typecheck and `test:libs`, no file of RayCraft changed;
  `make --fit` of the ten gives requests equal to the baseline, byte for
  byte; `make cartoons/videos/hello-script.yaml --fit` writes
  `.cache/hello-script/compiled.json`; `check`, on a broken copy of it
  with an empty `AI_VIDEOS_CACHE`, refuses an unknown action, a wrong
  value and an unknown name, each with its line and a hint.
- **Step 2 done 2026-11-25**, watched by the user beside `hello`. The
  narrator begins after the walk (4.77 s, `hello`'s at 0.6 s), as lines
  only follow each other so far: the user's pick was to pin that in step
  4's "Done when". Other picks: the tool works out what a frame shows and
  the plugin draws that; a said line holds its mouth and its captions.
  Checked: `npm test` and `npm run typecheck` here and in `cartoons/`;
  RayCraft's media typecheck and `test:libs`, no file of it changed;
  `make --fit` of the ten gives requests equal to the baseline, byte for
  byte, and the seven cartoons, made whole, draw the same `.svgs`;
  `make cartoons/videos/hello-script.yaml` gives the video, 289 frames
  as compiled, and the page, whose own drawing gives the video's `.svgs`;
  so did a longer script (two scenes, four speakers, 25 fps).
- **Step 3 done 2026-11-25**, its laws accepted by the user that day:
  `AGENTS.md`, "What happens at once". The user's picks: in order, a line
  comes after everything above it, the anchored too; what is cut or open
  at a scene's own level goes on through its `tail`; a voice that waits for
  the end of its block's fitted move is refused. Checked: `npm test` and
  `npm run typecheck` here and in `cartoons/`; RayCraft's media typecheck
  and `test:libs`, no file of it changed; `make --fit` of the ten gives
  requests equal to the baseline, byte for byte (the seven made anew, in a
  copy of `cartoons/`; RayCraft's three from the cache); 5,000 random
  scripts compile to the same bytes as before, and `hello-script`, made
  whole, has every stage from the cache; each of thirty laws broken on
  purpose fails a test.
- Left by step 3: for step 5, a length worked out from a measured one must
  grow with it (`5s - a.length` breaks the laws); for step 8, a second
  look in one block is refused so far, as the first holds its channel.
- **Step 4 done 2026-11-25.** The user's picks: the words `in order:`,
  `together:` and `under:`, not Flexbox's; a moment is `a.50%`, and a word
  is named, `a.word(mole)`; Flexbox's sharing of spare time is a step of
  its own, 5b; the walk joined to a line in `hello-script` stays at 1.69
  times its own speed (`hello`'s 1.17). Checked: `npm test` and `npm run typecheck` here and in
  `cartoons/`; RayCraft's media typecheck and `test:libs`, no file of it
  changed; `make --fit` of the ten gives requests equal to the baseline,
  byte for byte; `all-at-once` and `hello-script` made whole: each video has
  the frames compiled, its voices are in its sound at their compiled times
  (within 0.2 ms), the cut one's rest is not, and the page's own drawing
  gives the video's `.svgs`; `hello-script` has `hello`'s frames (164, the
  narrator at 0.6 s); two fresh `claude -p`, the default model's and
  Sonnet's, given only the guide, each wrote a cartoon with all of it that
  passed `check` as written; 40,000 random scripts neither throw nor break a
  compiled scenario; each of sixty rules broken on purpose fails a test.
- Left by step 4: for step 7, each character's actions are one channel so
  far, and places are checked in the order written; for step 9, voices at
  once can clip (`all-at-once`'s mix peaks at 1.21, 19 samples); for step
  11, one caption shows at a time, and in `all-at-once` six are up too
  short to read.
- **Next: step 5, name values and inherit them.**


## Goal

An AI writes a cartoon as a **scenario**: scenes, blocks and lines
(`pip say: Hello!`, `tuk walk to=left-of(pip, near)`), with names and
relations in place of seconds and coordinates. The tool **compiles** it:
checks it, speaks and measures the voices, fits everything to them, and
writes the **compiled scenario**: every action, voice, sound and caption
with its frames and plain numbers. The picture, the sound, the captions
and the web page are made from the compiled scenario alone.

A script can say all the old plan promised, and more: voices at once
(together, one beginning part-way into another or at a word of it, one
going on under several lines), each at its volume; of anything long (a
**radio**: speech or a sound) what sets the time, the radio or the talk
over it; several characters acting at once, and one doing two things;
one looking at another who moves; a place worked out from others; music
and sound effects; captions for everyone who speaks. A value or a
relation set on the cartoon, a scene or a block holds for all inside it,
and the guide teaches a writing AI each of these as it is built.

**Out of scope:** RayCraft's tutorials (its repo is not touched: its
plugin keeps today's plan, fit and request, which stay as they are);
reusable pieces of script; camera moves; a beat grid and singing; exact
word times (a word's is estimated); lengths that depend on each other
both ways (a solver); left and right in the sound; music that lowers
itself under a voice; a voice that whispers rather than only sounds
quieter; finding or composing music; the types of parametrization
marked out in The approach.


## Terms

```yaml
scenes:
  - background: meadow                  # a scene
    script: |                           # its script
      together:                         # a block
        radio say: And now the news.    # a line
        in order:                       # a block in a block
          [a] pip say: Did you hear?    # a label
          mo say @ a.50%: Hear what?    # an anchor
      tuk walk to=left                  # an action, a value
      & narrator say: Tuk comes closer. # joined to the line before
```

The structure, from the outside in:

- **Scenario:** one cartoon as an AI writes it, in its YAML video file.
- **Scene:** a part of it with its own background, points and starting
  places. Scenes follow each other.
- **Script:** a scene's text: its lines and blocks.
- **Line:** one thing one character does or says: who, the action, its
  values, and after the colon its text (`pip say: Hello!`).
- **Block:** lines grouped under a header that says how they relate:
  *in order* (each after the one before) or *together* (all begin at
  once). A block is used as a line is: it has a start and an end, and
  may hold blocks. A scene's script is a block in order; a line joined
  to the one before (`&`) is together with it.
- **Level:** the cartoon, a scene, a block, a line. A value set on one
  holds for the levels inside it.

Who and what:

- **Character:** who acts or speaks: one of the library's, or the
  narrator.
- **Action:** what a line does: the tool's own (`say`, `play`) or one
  the plugin names (`walk`, `jump`).
- **Channel:** a part of a character that does one thing at a time: its
  voice, its place, its arm.
- **Value:** what a line, a block, a scene or the cartoon sets: a
  number, a place, a volume. A **named value** has a name of the
  writer's; a **default** is what is taken when none is written.
- **Point:** a place on the stage, named by the plugin or by the scene.

Time:

- **Interval:** a line's time, from its start to its end.
- **Moment:** a start, an end, a share or a word of a line.
- **Anchor:** what a line says about its own start, in place of its
  block's rule: a moment of a line above, plus or minus seconds
  (`@ a.end - 0.5s`).
- **Label:** a name given to a line, so that lines below can anchor to
  it (`[a]`). `prev` and `block` need none.
- **Fixed, fitted, open, cut:** how a line gets its length. Fixed:
  measured (a voice) or given. Fitted: a move sped up or slowed to the
  voices of its block, within limits. Open: to the end of its block.
  Cut: stopped at the end of its block, if not ended before.
- **Waits:** a block ends only when what is in it has ended, the open
  and the cut left out.

Compiling:

- **Check:** the pass before the voices, and the only one that refuses.
- **Fit:** every start and end worked out from the measured voices.
- **Compiled scenario:** the result: every line with its frames and
  plain numbers. The picture, the sound, the captions and the page are
  made from it.

The words a script uses for these (`together:`, `under:`, `&`, `@`) are
settled in `AGENTS.md`, "A script".


## The approach

Proposed in the chat of 2026-11-24. Step 3 has settled the part on time;
step 5 accepts or changes the part on values.

**One graph, worked out in order, as a spreadsheet is.** Every value of
a scenario is a cell: a named value, a place, a start, an end, a length,
a speed, a volume. Each cell has exactly one formula, and a formula
reads other cells. `check` builds the graph from the script alone:

- a cell with no formula takes its default, and `check` says so;
- a cell with two (a walk given both a speed and a length) is refused;
- a loop is refused, with its whole chain.

The cells are then worked out in the graph's order. No equations are
solved together: a relation such as `length = distance / speed` is used
in one direction, the one the writer left open.

**Two passes, with the voices between.**

- Before them, `check` works out every cell that needs no voice: named
  values, places, a move's own length, volumes. So it sees numbers, and
  can refuse a place off the stage or two characters on one spot.
- After them, the cells that need the voices (starts, ends, a fitted
  move's length and speed) are worked out by formulas that cannot fail:
  the latest of, plus, kept within limits, the earliest of. So nothing
  is refused once the voices are measured, and a longer voice never
  makes anything begin earlier.

**Time: every line is an interval on a channel** (a character's voice,
its place, its arm). Its laws are in `AGENTS.md`, "What happens at once".
At their core they are the critical-path method: each start is the longest
path to it through a graph with no loops, so there is one earliest timing.
The cut and the fit read finished values on top.

**The types of parametrization.** The examples only show the kind: the
script's words for each are settled in its step.

| When a line begins | Example | |
| --- | --- | --- |
| In order: after the line before, plus `pause` | the default | in |
| Together: with the line before, or all of a block | `&`, `together:` | in |
| At a moment of a line above, plus or minus seconds | `@ a.end - 0.5s` | in |
| At a share of a line above | `@ a.50%` | in |
| At a word of a line above | `@ a.word(mole)` | in, estimated |
| At a moment of a line below | | out: a loop could be written |
| By a share of its block's spare time | `justify=end` | step 5b |
| On a grid of beats | `every=beat` | out |

| How long it lasts | Example | |
| --- | --- | --- |
| Measured: a voice, a sound file | `say`, `play` | in |
| Given | `takes=2s` | in |
| From a speed and a distance | `walk speed=slow` | in |
| Fitted to the voices of its block, within limits | a walk joined to lines | in |
| To arrive at a moment of a line above, within limits | `walk arrive=a.end` | in |
| From the length of a line above | `takes=a.length / 2` | in |
| Open: to the end of its block | `look-at`, a loop | in |
| Cut: to the end of its block, if not ended before | a radio under the talk | in |
| Repeated | `jump times=3`, `loop` | in |
| A voice placed so that it ends at a moment | `say ends=a.end` | out: a longer line would begin earlier |

| Where | Example | |
| --- | --- | --- |
| A named point: the plugin's marks, a scene's own | `to=left`, `door: [300, 880]` | in |
| Offset from a point | `offset(door, 100, 0)` | in |
| Beside a point or a character | `left-of(pip, near)` | in |
| Between two | `midpoint(door, tree)` | in |
| Where a character is, read from the lines above | `pip` in a formula | in |
| Where a character is at a moment of the clock | `anna@go.end` | out: it needs the voices |
| Followed frame by frame | `look-at target=pip` | in |
| Along a path, where paths cross | `along(road, 30%)` | out: a cartoon has one ground line |

| What a value is | Example | |
| --- | --- | --- |
| A number with its unit | `0.4s`, `150`, `-12dB`, `50%` | in |
| A named value | `near: 150` | in |
| The plugin's name for a number | `slow`, `loud` | in |
| Arithmetic over these | `near * 2 + 20` | in |
| A state that stays until changed | `pose wave` | in, as today |
| A value that changes during an action | a fade, a zoom | out |
| Manner | `say (angry)` | out: no voice or face here can do it |
| Conditions, loops, reusable pieces | | out |

**Where it is set.** On the cartoon, a scene, a block or a line, for
everything or for one character or one action (`radio.volume`,
`walk.speed`); the nearest wins. The project's settings and a profile
are the layers above, as today. The defaults do the common thing, so a
writer writes only the exceptions: lines run in order, a move joined to
lines is fitted to them, a character stands where the lines above left
it.

**What the compiled scenario keeps:** each cell's number, and which
were worked out rather than written.


## Steps (one session each)

Every step: `npm test` and `npm run typecheck` pass here and in
`cartoons/`; `npm --prefix ../RayCraft/media run typecheck` and
`npm --prefix ../RayCraft run test:libs` pass, no file of RayCraft
changed; `make --fit` gives today's ten requests **as before** (equal to
the baseline in `.review/concurrent-actions/before/`; the seven
cartoons' until step 13); what a step adds to the script, the guide
teaches, with an example a test compiles; the step's notes (`AGENTS.md`
or `cartoons/CLAUDE.md`) say what it added.

### 1. Compile the smallest script (the tool, cartoons)

A cartoon written as a script, its lines in order, is checked, spoken
and compiled: `make <file> --fit` prints its timing and writes the
compiled scenario. The plugin names its actions; today's plugins and
formats stay as they are. **Done when:**
`cartoons/videos/hello-script.yaml`, with `hello`'s lines and actions in
order, compiles; a test finds each line and action in its compiled
scenario with its frames, and nothing there but numbers, texts and file
names; a new `check <file>` refuses an unknown action, a wrong value and
an unknown name, each with its line and a hint, with no voice model on
the disk.

### 2. Play it (the tool, cartoons)

The picture, the sound, the captions and the web page are made from the
compiled scenario and nothing else. `Effort: xhigh`. **Done when:**
`make videos/hello-script.yaml` gives a video and a page; a test draws
the frames from the compiled scenario and the library with no video
file, and finds the page's frames the same (`.svgs`); the user has
watched it beside `hello`.

### 3. Fit what happens at once (the tool)

The laws that place voices, actions and sounds that overlap, on plans
written as data: what begins together, part-way into or after another;
what a block waits for and what is cut where it ends; one channel, one
thing at a time; a move fitted to its lines. `Effort: xhigh`. **Done
when:** the user has accepted the laws in `AGENTS.md`; a note beside the
tests proves each property (one timing for any lengths; nothing before
what it comes after; a block ends after all it waits for; what is cut
ends with its block and moves nothing else; a longer voice begins
nothing earlier; a channel never does two things); the tests show two
lines begun together, one begun half-way into another, one going on
under three others and another of its voice after it, the same two cut
where the third ends, a block that waits for its long voice, and a clip
that ends after its last voice not cut; seeded random plans keep every
property; small plans get the times a plain solver gives that repeats
the rules until nothing changes.

### 4. Say it in a script (the tool, cartoons)

The script's words for step 3: blocks in order or together, a line
joined to the one before, a start part-way into a line above (a share, a
word, seconds before its end), and what goes on under the rest, cut or
waited for. **Done when:** a new `videos/all-at-once.yaml` with a
chorus, an interruption at a word, a murmur of two lines under three
others, cut where they end, and a radio the talk waits for makes as a
video and a page; `hello-script`, its narrator joined to the walk,
begins to speak when `hello` does; a test finds each voice in the sound
at its compiled time, and the cut ones silent after the cut; `check`
refuses a name from below, a loop, and a voice that follows a cut one in
its block, each with both lines and a hint; a fresh `claude -p` with no
tools, given only the guide, writes such a scene that passes `check`.

### 5. Name values and inherit them (the tool)

A script writes names and arithmetic in place of numbers (`pause`,
`near * 2`, `slow`), and a value, a default or a relation set on the
cartoon, a scene or a block, for everything or for one character or
action, holds for all inside it. **Done when:** tests show each level
over the one above it, a block's setting reaching its lines, and one
character's setting reaching only its own; a move given both a speed
and a length is refused, a loop of values is refused with its chain,
and a default taken is said; a compiled scenario holds numbers only;
`all-at-once`, made again with one value changed, has another timing
and no other edit; a fresh `claude -p`, given only the guide, writes a
scene with a block's settings that passes `check`.

### 5b. Share spare time (the tool)

What CSS Flexbox's `justify-content` and `align-items` say, in time: a
block in order beside a longer one lies at its start, in its middle, at its
end, or spread over it, and a block together begins or ends its lines at
once. It gives up "a longer voice begins nothing earlier" inside such a
block, so its laws come first. `Effort: xhigh`. **Done when:** the user
has accepted the laws in `AGENTS.md`, or dropped the step; the note beside
the tests proves what is still promised; tests show a short talk at the
end, in the middle of and spread over a long voice, and two voices that end
together; random plans keep every property, and the plain solver gives the
same times; `all-at-once` has one, and the user accepts it.

### 6. Work out places (cartoons)

A scene names its own points, and a place is worked out from points and
characters: `midpoint(door, tree)`, `left-of(pip, near)`. A character's
place is where the lines above leave it. **Done when:** a test shows
each construction; two characters on one spot, and a place that cannot
be worked out, are refused by `check`; the compiled scenario holds
coordinates only; a scene of `all-at-once` uses them, and the user
accepts it.

### 7. Act on channels (cartoons)

A character's place, hop, facing, arm and voice are channels: several
characters act at once, and one does two things on different channels
(walks while it waves), each action with its own start and length.
`Effort: xhigh`. **Done when:** `src/picture.test.ts` shows one walking
from a block's start while another hops and a third turns a second
later, one walking while it waves, and their order kept in a block
stretched by its lines; two actions for one channel in one block, and
two who walk to one spot, are refused by `check`; `all-at-once` has such
a block and the user accepts it.

### 8. Look at someone who moves (the tool, cartoons)

`look-at` and `follow` hold for as long as their block: the value is
worked out in each frame from the other character's place, in an order
the compiled scenario fixes. **Done when:** a test shows one character
facing another all through her walk past it, the same in the page's
frames; two who follow each other are refused by `check`; `all-at-once`
has it and the user accepts it.

### 9. Mix voices at their volumes (the tool)

A character's volume in the library, and a line's, a block's or a
scene's own over it, set how loud each voice is; the mix comes to the
video's loudness by one gain, its peaks limited, so the differences
stay. **Done when:** a test finds two lines written 12 dB apart 12 dB
apart (to 1 dB) in a `sound.m4a` at -14 LUFS, their peaks as far over
their loudness as Kokoro's, and two full voices at once unclipped;
today's ten keep their `sound.m4a`; the user has listened to
`all-at-once`.

### 10. Play music and sound effects (the tool, cartoons)

The library names the project's audio files, and a script plays one once
or looped under a block, a scene or the whole cartoon, at its volume:
cut where that ends, or waited for. A sound keeps its own quality.
**Done when:** `src/sound.test.ts` finds each sound at its time and
level, a tone above 12 kHz among them; `check` refuses a missing file by
name; a file whose bytes changed redoes the sound and no drawing;
`import` refuses a reply that adds a sound; `all-at-once` has music that
goes on from one scene into the next, an effect, and a sound the talk
waits for; the files, in git, are plain ones made with ffmpeg or the
user's own, licensed for a public repo.

### 11. Caption everyone who speaks (the tool)

Lines that sound at once show one above the other, in the video and on
the page, each as long as its own words, or to its cut: two rows at
most, smaller, a third speaker with none. Where they sit, clear of the
mouths, is agreed with the user first. **Done when:** `all-at-once`
passes HyperFrames' check, and a frame of it and of its page shows both
lines, neither over the other; the user accepts two at once over a
frame with Tuk, whose mouth is the lowest; a video with no two lines at
once keeps its captions.

### 12. Teach it to a web chat (the tool's prompt, cartoons)

The prompt teaches the whole script: the tool's part (lines, blocks,
names and relations, with the patterns worth knowing: a chorus, an
interruption, talk over a radio, walk and talk, arriving together) and
the plugin's actions. `import` takes script episodes, and answers a
wrong one with `check`'s messages. **Done when:** a fresh `claude -p`
with no tools, given only the prompt for a story written for it (people
talking over each other, two who run off together, a sound the library
has), gives episodes that import and make with no edit by hand, with
lines at once, actions at once, a sound and a named value; the READMEs
and `docs/workflow.html` say what a cartoon can now do; the user accepts
it.

### 13. Rewrite the seven cartoons (cartoons)

The seven are rewritten as scripts, and the beats format and its code
go. **Done when:** the user has watched each beside its old video and
accepted it; `git grep -n "beats:" cartoons/` finds nothing; RayCraft's
three make as before.
