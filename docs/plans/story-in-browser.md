# Plan: a story to its videos, in a browser

## Now

- Plan written 2026-11-27 from the user's six steps, their yes that day.
- The user's pick that day: the page keeps what `story` keeps, in the
  project's files, not in a folder of its own.
- Step 1 done 2026-11-27. Checked by `src/serve.test.ts`, `npm test`
  (356 pass) and `npm run typecheck`; and in `cartoons/`, with
  `npm run video -- serve` running, by a headless Chrome on its page:
  `forest1.md`'s text under a new name, and a text in Ukrainian, each
  showed what `prompt` prints for its file, the clipboard holding it,
  and another site's page was refused. The user saved a story from
  the page in their own browser that day.
- Step 2 done 2026-11-27. Checked by `src/serve.test.ts` and
  `src/story.test.ts`, `npm test` (361 pass) and `npm run typecheck`;
  and by a headless Chrome on the page, served from a copy of
  `cartoons/`: `the-race`'s text saved, and its chat's reply given in
  three answers, one cut off, one with an episode refused, one mended,
  to the `videos/the-race-1.yaml` and `-2.yaml` that `cartoons/` has,
  which `check` takes. The user took a short text, `m2`, from the page
  through a web chat to `cartoons/videos/m2.yaml` that day, which
  `check` takes.
- Step 3 done 2026-11-27. The user's
  picks that day: each make a process of its own, and a second button,
  "Make what is taken", for a reply that is not whole. Checked by
  `src/serve.test.ts` (the makes by a fake make) and
  `src/story.test.ts`, unchanged, `npm test` (367 pass) and
  `npm run typecheck`; and by a headless Chrome on the page, served
  from a copy of `cartoons/`: Start for `m2` made `out/m2.mp4`, the
  makes' log shown as they went, and still in a page loaded again
  half-way; the video played and was sought in the page; Start again
  said "From the cache" for the sound, the clip, check and the render;
  a make refused by a held lock showed why, and Start then went on.
  The user made `m2`, the text they took through a web chat in step
  2, from the page that day: `cartoons/out/m2.mp4` played in it.
- **All three steps are done.** Nothing is next.


## Goal

`story` with a page in place of the terminal and the clipboard. A command
starts a small web server on this machine, in a project (`cartoons/`).
In its page the user pastes a text; the page shows it wrapped in the
tool's prompt, in the text's language, and copies it. The user takes it
to ChatGPT, or any web chat, and pastes the chat's answer into the page.
Start imports the answer and makes its videos; the page shows the make
as it goes, and then plays what it made.

The page keeps what `story` keeps, in the same files: the text as
`stories/<name>.md` (so the page asks for a name too), the answers as
`stories/<name>.reply.md`, the episodes in `videos/`, the videos in
`out/`. The terminal's `story`, `prompt`, `import` and `make` stay as
they are, and go on from what the page left.

**Out of scope:** a server other machines reach (it listens on this one
alone, with no login); calling a chat itself (the tool calls no model);
a text in another language than English, Ukrainian or Russian; editing a
scenario or the library in the page; a list of the stories made before;
settings and profiles in the page; trying it on RayCraft's `media/`.


## Steps (one session each)

### 1. Wrap a text in its prompt (the user's steps 1 to 3)

`npm run video -- serve`, typed in a project, starts the server and says
its address. Its page has a field for the text and one for the story's
name; a button saves the text as `stories/<name>.md`, shows its prompt in
a second field and copies it. The language is told from the text's
letters, shown, and the user may change it. A name another text has is
refused: nothing is written over. The server answers this machine alone,
and its own page alone. **Done when:** in `cartoons/`, the page given
`stories/forest1.md`'s text under a new name shows what `prompt` prints
for that file, and the clipboard holds it; given a text in Ukrainian, it
shows what `prompt --language uk` prints; a test starts the server on a
free port and finds both, and that a request from another site's page is
refused; `npm test` and `npm run typecheck` pass.

### 2. Take the chat's answer (the user's steps 4 and 5)

A third field for the chat's answer, and Start: the answer is added to
`stories/<name>.reply.md` and imported, as `story` does it. The page says
which episodes were taken. What was refused it shows, and copies, as the
message for the chat; an answer cut off it says to "continue"; with the
next answer pasted, Start goes on. **Done when:** a test takes a story
through the server, one episode refused and then mended, to the files
`src/story.test.ts` finds; the user takes a short text through ChatGPT to
`cartoons/videos/<name>*.yaml`, which `check` takes.

### 3. Make the videos (the user's step 6)

Start goes on from the import to each episode's make, as its outputs say.
The page shows the make's log as it goes, then plays each video and names
its file; a make that failed shows why, and Start again goes on from the
cache. A page loaded again while a make runs shows it still.
`Effort: xhigh`. **Done when:** the user takes a text from the page
through ChatGPT to a video that plays in the page,
`cartoons/out/<name>*.mp4`; Start pressed again says "From the cache" for
every stage; a test makes a story's episodes through the server with a
fake make; `story` in a terminal runs as before (`src/story.test.ts`);
`npm test` and `npm run typecheck` pass.
