# Plan: animation server

## Now

- Plan written 2026-11-21, from the requirements agreed in chat that day.
  Three repos: this tool, `cartoons` (`d:\m\web\cartoons`) and RayCraft
  (`d:\m\web\RayCraft`).
- Step 1 done 2026-11-21. Checked: `make` of `sundown` and
  `the-shy-visitor` through the plugin gave the same `.frames` as the old
  maker drawing their requests (580 and 1277 frames); `npm test` and
  `npm run typecheck` pass in both repos; RayCraft's `water-switch` made
  with the same request and `.frames`.
- Step 2 done 2026-11-21. Checked: `make videos/the-shy-visitor.yaml`
  gave step 1's `.frames` (1277 frames), and so did `hello` and
  `sundown`; `meet`'s differ only in its blinks, step 1's clip of it
  having been drawn before blinking (anime step 5). With `--profile
  quiet` every stage came from the cache but the sound (measured -19.9
  LUFS), from shells that spell the drive `d:` and `D:`. `npm test` and
  `npm run typecheck` pass in both repos.
- Step 3 done 2026-11-22. Checked: the user watched `the-shy-visitor`,
  rewritten in names (no coordinates, no character inline, no `takes`),
  and accepted it; its fit gives step 2's 1277 frames and subtitles.
  `hello`, `meet` and `sundown` moved to names too, and all four make.
  `cartoons`' `src/repair.test.ts` shows each repair, and a make of a
  file with both mistakes listed them, from the cache too. `npm test` and
  `npm run typecheck` pass in both repos.
- Step 4 done 2026-11-22. Checked: the user's own chapter,
  `stories/forest1.md`, in a web chat of the user's, gave three episodes
  that imported (five characters and five backgrounds added to the
  library) and made with no edit by hand; the user watched `forest1-1`
  and accepted it. A fresh `claude -p` with no tools, given only the
  prompt for `stories/the-river-bank.md`, gave eight episodes that
  imported into a copy of the project and all made. `npm test` and
  `npm run typecheck` pass in both repos.
- Step 5 done 2026-11-22. Checked: `src/page.test.ts` finds the page's
  SVG the same as the video's `.svgs` in every frame. In HyperFrames'
  Chrome, offline, `the-shy-visitor`'s page drew all 1277 frames' SVG
  the same as its video, fetched nothing, and played to its last frame.
  Its video kept step 3's `.frames`, its check and render from the
  cache, its sound now the tool's mix at -14.0 LUFS; `--as web` after it
  took the plan, the voices, the fit and the sound from the cache. The
  user opened the page beside the mp4 and accepted it. `npm
  test` and `npm run typecheck` pass in both repos (cartoons' scenario
  test fixed: it expected the library's three characters of step 3).
- Step 6 done 2026-11-22. Checked: in a copy of `cartoons`, `story` ran
  with the chat played by a script through the real clipboard: an answer
  cut off and continued, an episode refused and mended, both episodes
  made, a frame of each looked at. Run again, it went on from the
  reply's file and took over the lock a killed run had left. A second
  make of a video being rendered was refused, naming the first; with the
  first killed half-way, the next make ran. The user accepted the step on
  these checks. `npm test` and `npm run typecheck` pass in both repos.
  **Next: step 7.**


## Goal

The video tool becomes a local animation server. Each project gives it a
plugin that draws its own scenes and adds its own commands to the
scenario: cartoons' walk, turn, jump, pose; RayCraft's tutorials and
their opening. A video is one file. A book chapter is wrapped in the
tool's prompt, pasted into any web AI chat, and the chat's reply is the
video's file, or several, one per episode. From that file, everything
runs offline with no AI, and gives a video or a web page that looks
exactly like it.

**Out of scope:** local LLMs, for later: Ollama, LM Studio or llama.cpp
on localhost in place of the web chat, the same prompt, the output held
to the commands' JSON Schema, a long chapter maybe in several calls the
server makes itself. Also out: videos that mix plugins, layers within
one frame (a cartoon character over the editor), a hosted service, a
page identical to the pixel (resvg in WebAssembly), music and sound
effects, and the tool calling any AI (the chat is the user's).


## Requirements

Agreed with the user in chat, 2026-11-21.

**The whole**
- One approach for cartoons and RayCraft, simpler than today's four
  files per video (`scenario.yaml`, `video.yaml` and the clip's two JSON
  files).
- One AI call, or one web chat session, writes the scenario. From there
  the video is made fully offline, with no AI (Kokoro speaks).
- Two runs draw the same frames (the frame hashes), as now.

**The server and its plugins**
- The tool is a local server.
- Each project gives it a plugin that draws its scenes and adds its own
  commands to the scenario.
- A plugin is a module written against a typed interface from the tool.
  The server runs each plugin in its own child process.
- Each command is described once, with a schema, a description and an
  example. The checks, the prompt and, later, a JSON Schema for local
  models all come from that description.
- A plugin's picture is pure (no Node APIs), so the same code draws in
  the server and in a web page.
- One plugin per scene; for now, one plugin per video.
- RayCraft's tutorials stay as they are: the plugin plays their steps as
  beats. Only the video's opening becomes commands written in the video.

**Files and settings**
- One file per video, `videos/<name>.yaml`: its settings on top, its
  plugin (`use: cartoon`), its scenes, each line written once. Nothing
  like a `scenario.yaml` beside a `video.yaml`.
- What is made in between goes in a hidden `.cache/`; the results in
  `out/<name>.mp4`, `.srt` and `.html`.
- `library.yaml` holds the characters, each with its voice, and the
  backgrounds. A video names them.
- A project's `package.json` tells the server where its plugin is.
- Settings come in layers, each over the one before: the server's, the
  project's, the video's. Named profiles (`youtube`, `quiet`, `draft`)
  are picked when making. Each setting belongs to one stage, so a
  profile redoes only the stages it touches.

**From a chapter to a scenario**
- The user's text (a book chapter) is wrapped in the tool's prompt and
  pasted into any web AI chat, which replies with the scenario.
- The chat casts from the library. A character the library lacks comes
  in the same reply, its shapes and its voice, and is added to the
  library on import.
- The chat may split a long chapter into episodes: all in one reply, a
  YAML block each. A reply cut off is told "continue" in the same chat,
  and each whole block counts.
- The format has few numbers: names from the library, places as marks
  (`left`, `middle`, `right`, `off-right`), a beat's length optional. On
  import the server repairs what it can do exactly, and says what it
  did; only what it cannot repair needs another message.
- The `episode` skill wraps the same prompt.
- RayCraft offers the prompt only scenes that exist: its tutorials.

**Rendering**
- Two modes: a video, and a web page that looks exactly like it. The
  page is one HTML file with everything in it, the sound too, and has a
  play button and a seek bar, nothing more.
- The mode changes nothing before it: the voices, the fit and the sound
  are made once, for both.
- One sound track, mixed and levelled once, for both modes.
- The page draws the video's own SVG for each frame, at its fps; a test
  compares the two frame by frame. Captions are the server's, the same
  in both.
- RayCraft's page embeds its recorded clip, its picture being the
  editor in Chrome.


## Steps (one session each)

### 1. A plugin draws a cartoon

The tool gets the plugin interface: a plugin names its scene and its
commands (schema, description, example), plans the beats as spans and
draws each frame, run by the tool in a child process. `cartoons`' maker
becomes the cartoon plugin; the old two-call maker stays for RayCraft.
**Done when:** `the-shy-visitor` and `sundown`, made through the plugin,
give the same `.frames` as now; both repos' `npm test` and `npm run
typecheck` pass; RayCraft's `water-switch` still makes.

### 2. One file per video, settings in layers

A plugin's video is `videos/<name>.yaml`, made into `.cache/` and
`out/`, with no folder per video and no `video.yaml` or `project.yaml`.
Settings layer the server's, the project's and the video's, and named
profiles are picked at make. `cartoons`' videos move over. **Done
when:** `make videos/the-shy-visitor.yaml` gives the same `.frames` as
step 1; with `--profile quiet` the log shows only the sound mixed again,
the voices and the fit taken from the cache.

### 3. A library, and a format of names

`library.yaml` holds the characters with their voices, and the
backgrounds. Places are marks, a beat's length is optional, and on
import the server repairs what it can do exactly, saying what it did.
**Done when:** `the-shy-visitor`, rewritten with names only (no
coordinates, no character drawn inline), makes a video the user
watches and accepts; a test shows each repair.

### 4. A prompt from a chapter

`prompt stories/<x>.md` writes the prompt: the tool's instructions, the
format from the plugin's descriptions, the library and the voices, the
chapter. `import` takes the chat's reply (several messages, if it was
told "continue"), adds new characters to the library, repairs and
checks each episode. The `episode` skill wraps the same prompt.
**Done when:** a chapter in `stories/`, in one session of a web chat
the user picks, gives episodes that import and make with no edit by
hand, and the user watches one; a fresh `claude -p` with no tools,
given only the prompt, does the same.

### 5. The web page

`make --as web` writes `out/<name>.html`: one file with the sound (the
one track, now mixed before either mode), the caption font, the
plugin's picture code and the timeline, drawing the video's SVG for
each frame. **Done when:** a test finds the page's SVG the same as the
video's in every frame; making the page after the video speaks and fits
nothing again (the log); the user opens the file offline beside the
mp4 and accepts it.

### 6. From a story to its videos, in one command

`story stories/<x>.md` takes a chapter through the web chat by the
clipboard: the prompt copied, each reply pasted into
`stories/<x>.reply.md` and imported, what was refused copied to paste
back. Then it makes each episode, what the settings turn on: its
video, and its page (off by default), made first and opened as the
preview. Nothing stays running when it ends. A make
holds a lock file in `.cache/<name>/`, so a second make of the same
video is refused, naming the first, and a lock left by a make that was
stopped is taken over. **Done when:** with one `story` command and the
chat, a chapter becomes finished videos with no other command typed; a second make of a video being made is refused, naming the
first; a make after one killed half-way runs.

### 7. RayCraft as a plugin

Effort: xhigh. RayCraft's tutorial maker becomes the raycraft plugin,
on the tool's shared code (this closes the `anime` line in RayCraft's
`docs/backlog.md`): a
scene names a tutorial whose steps play as beats; the opening is
commands with their lines in the video file; its web mode embeds the
clip; the prompt is offered only its tutorials. RayCraft's videos move
to one file each. **Done when:** `first-shadow` and `water-switch`, made
through the plugin, have the same requests and `.frames` as with the old
maker.

### 8. The old way goes

The two-call maker, `new`, `request`, `video.yaml` and `project.yaml`
leave the tool; its `AGENTS.md` and both projects' notes say only the new
way. The tool's own demo videos move over or go: the user's call at this
step. **Done when:** every video of both projects makes; the tool's
tests and typecheck pass; no file names the old contract.
