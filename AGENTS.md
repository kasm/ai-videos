# ai-videos

Videos made from web pages: a YAML script, a local voice (Kokoro), and HyperFrames rendering
HTML to MP4 frame by frame. Everything runs locally on Node; there is no Python in this project.

## Commands

```
npm run video -- setup                     once: fetch the voice model and HyperFrames' Chrome (see Offline)
npm run video -- new <video>               a first video.yaml, from its clip's texts (see Projects, new)
npm run video -- new <video> --make <name> the same, for a clip not named as the folder
npm run video -- make <video>              the whole video, inside its folder (see Projects, make)
npm run video -- make <video> --fit        only the made clips' data and the fit, in seconds
npm run video -- build <video>             narrate, render every format, write out/<name>/
npm run video -- build <video> --draft     fast low-quality render for iteration
npm run video -- build <video> --format portrait
npm run video -- build <video> --out <dir> write the finished files to <dir> instead
npm run video -- check <video>             lint, layout, contrast and pacing checks (run after every edit)
npm run video -- preview <video>           live preview in the browser
npm run video -- compose <video>           only generate build/<name>/<format>/
npm run video -- request <video>           fit each clip to the voice: <clip>.request.json (see Clips)
npm run video -- voices ["text"]           voice samples in out/voice-samples/
npm test                                   the tool's tests (src/*.test.ts)
npm run typecheck
```

A `<video>` is a folder holding a `video.yaml`. A bare name (`scroll-demo`) is a folder in this
tool's `videos/`; anything with a slash is a path to a folder anywhere on the disk, relative to
where the command is typed, so another project runs the tool on its own folder:

```
cd d:/some/project
npm --prefix d:/m/web/ai_videos run video -- build media/videos/intro --out media/out
```

The folder's name is the video's `<name>`: it names `build/<name>/` and the finished files
(`<name>-landscape.mp4`, `<name>.srt`), so it uses lowercase letters, digits and dashes. Pages,
styles and `assets/` are found relative to the folder; scene templates, voices and the TTS cache
always come from this tool. The single commands keep the build here, and only `build`'s `--out`
writes the finished files elsewhere; `make` writes the build and the finished files inside the
video's folder. The TTS cache always stays here.

## Layout

| Path | What it is |
| --- | --- |
| `videos/<name>/video.yaml` | The script: scenes, narration lines, cues. Source of truth for a video. |
| `videos/<name>/page.html`, `page.css` | The page a `page-scroll` scene shows. |
| `videos/<name>/assets/` | The page's pictures, copied into the build; the page refers to them as `assets/<file>`. |
| `videos/project.yaml`, `videos/make-clip.ts` | The folder's videos as a project (see Projects): its project file, and its maker, which draws clip-demo's square with ffmpeg. |
| `videos/clip-demo/` | The `clip` scene's demo: a made clip (`make: square`); `make clip-demo` writes its `clips/`, `build/` and `out/`. |
| `scenes/<name>/scene.html` | Reusable scene templates (HyperFrames sub-compositions with `{{placeholders}}`): `page-scroll`, `clip`. |
| `src/` | The pipeline: `script` → `clip` → `tts` → `timeline` (and `fit`, for `request`) → `compose` (with `bundle`) → `render` → `srt`; `setup`, what the commands need on the disk; `new`, a first script. |
| `build/` | Generated HyperFrames projects. Never edit; regenerated on every run. |
| `out/` | Finished videos and subtitles. |
| `.cache/tts/` | Narration audio, keyed by text, voice and speed. |
| `.cache/models/` | The voice model, fetched by `setup`. |
| `.cache/setup.json` | Where `setup` found HyperFrames' Chrome, and for which HyperFrames. |

`AI_VIDEOS_CACHE` moves the whole `.cache/` elsewhere (the tests give it an empty folder).

## Projects

A project (RayCraft, or this tool's `videos/`) keeps its videos in one folder, a video folder
each, and beside them one project file with what they share. This section is the contract between
the tool and a project.

### The project file

`project.yaml` in the folder that holds the video folders (`media/videos/project.yaml` for
`media/videos/intro`). The schema is `ProjectFile` in `src/script.ts`:

```yaml
maker: npm run -s tutorial:video --   # draws a project's clips (below); run in this folder
voice: af_heart
loudness: -22
formats: [landscape]
```

Beside `maker` it holds any of the settings a `video.yaml` has: `voice`, `speed`, `fps`, `formats`,
`loudness` and `timing`. Every command reads it when it loads a video, and a video keeps no copy:

- A setting its `video.yaml` writes overrides the project's, key by key: `timing: { moves:
  { fastest: 1 } }` keeps the project's `timing.gap`. A list (`formats`) is replaced whole.
- A setting neither writes takes the tool's default.
- A folder with no project file beside it stands alone, on its `video.yaml` and the defaults.
- A project file may set only these (`title` or `scenes` in it is refused), and is checked on its
  own, so an error names the file that holds the mistake. `src/script.test.ts` shows each rule.

### A video folder

The folder holds its script and everything made from it. The project's `.gitignore` keeps the
made parts out of git; nothing made is edited by hand.

| Path | What it is | Written by | In git |
| --- | --- | --- | --- |
| `video.yaml` | The script. | You or an AI; `new` writes a first one, a line per caption, each cued to its event. | yes |
| `page.html`, `page.css`, `assets/` | A `page-scroll` scene's page. | You or an AI. | yes |
| `clips/<scene>-<format>.json` | A made clip's data: its events and texts, at its own pace. | The maker, step one. | no |
| `clips/<scene>-<format>.request.json` | The clip fitted to the voice (see Fitting). | `make`, as `request` does. | no |
| `clips/<scene>-<format>.mp4` | The clip drawn to the request; its JSON is written again. | The maker, step two. | no |
| `build/<format>/` | The HyperFrames project. | `make`, as `compose` does. | no |
| `out/<name>-<format>.mp4`, `out/<name>.srt` | The finished video and its subtitles. | `make`, as `build` does. | no |

A made clip is a clip scene with `make: <name>` in place of `clip:`, the name of what the maker
draws (in RayCraft, a tutorial); its files are the `clips/` ones above, by the scene's id. A clip
scene with `clip:` paths plays a clip drawn elsewhere, as before.

### The maker

`make` runs the project file's `maker` in the project file's folder, through the shell, with a
call appended: the name, a format, and every file as an absolute path. A made clip takes two calls
per format:

```
<maker> <name> --format=landscape --data=<clip's JSON>
<maker> <name> --format=landscape --width=1920 --height=1080 --request=<request> --clip=<mp4> --data=<clip's JSON>
```

- Step one writes the clip's data (`ai-videos-clip`, see Clips) to `--data` without drawing it.
- Step two draws the clip to the request (see Fitting) at `--width` × `--height` into `--clip`,
  and writes its data again to `--data`, each event with its `natural`.
- The format names a layout. Its size comes in the call (`FORMATS` in `src/script.ts`: landscape
  1920×1080, portrait 1080×1920), so a maker keeps no table of its own.
- A maker writes the files it is given, plus caches of its own beside the clip, named after it
  (`<clip>.mp4.frames`). It exits 0 when they are written; otherwise it exits non-zero with the
  reason on stderr, and `make` stops there.
- The schema is `MakerCall` in `src/maker.ts`: `makerArgs` writes a call, and
  `readMakerCall(process.argv.slice(2))` reads one in a maker written in TypeScript and refuses
  anything the tool would not send. `src/maker.test.ts` shows both. `videos/make-clip.ts` is a
  small maker that follows it.

### `new`

`npm run video -- new <video>` begins a video with no AI (`src/new.ts`). The folder needs a
project file with a maker beside it; the folder itself may not exist yet.

1. It runs the maker's step one for the clip, in the project's first format (or `--format`'s),
   into the folder's `clips/`. The clip is the folder's name, or `--make <name>`'s.
2. It writes `video.yaml`: a title (the folder's name) and one made clip scene, its id the clip's
   name, with a line per text of the clip's data, in time order. Each line is cued to the event
   its text begins at: the last event at or before the text's `from`.

The script holds no setting: the voice, formats and the rest are read from the project file, as
for any video. `new` never writes over a `video.yaml`. A clip whose data holds no text gets no
script: write its lines by hand. `new` speaks and draws nothing, so it needs nothing from `setup`;
`make --fit` then tries the lines. `src/new.test.ts` shows each case.

### `make`

`npm run video -- make <video>` makes the whole video in five steps, in this order, and stops at
the first that fails (`src/cli.ts`, `make`; the calls are `src/make.ts`):

1. The data: the maker's step one for each made clip, in each format.
2. The fit: the voice spoken (from the cache when a line has not changed) and measured, and each
   made clip fitted to it, as `request` does: the table, and `clips/<scene>-<format>.request.json`.
   `--fit` stops here, in seconds, to try the lines and `timing` before anything is drawn.
3. The drawing: the maker's step two for each made clip, in each format.
4. The checks: `build/<format>/` composed and checked, as `check` does. A made clip not drawn to its
   request, or a check's error, stops it.
5. The video: each format rendered, at the script's loudness, into `out/`, with the subtitles.

It writes only inside the video's folder (`clips/`, `build/`, `out/`), but for the voice cache, which
stays in the tool. A clip scene with `clip:` paths plays as it was drawn: `make` writes it no request.
`--format` makes one format, and `--draft` renders fast. With no made clip, steps 1 and 3 do nothing.

### Offline

Only `setup` uses the network. It fetches once what no other command may fetch:

- the voice model (`onnx-community/Kokoro-82M-v1.0-ONNX`, about 325 MB), into `.cache/models/`;
- HyperFrames' Chrome (chrome-headless-shell), which HyperFrames keeps in its own cache
  (`~/.cache/hyperframes/`); `setup` records where, and for which HyperFrames, in `.cache/setup.json`.

The rest comes with `npm ci`: the voices (in kokoro-js), and GSAP and the fonts, which each build
carries in `assets/vendor/` (`src/bundle.ts`), so a build names no URL. Running `setup` again keeps
what is there and only checks it.

Every other command first checks that what it needs is on the disk (`src/setup.ts`): the voice
model's files, and for anything HyperFrames draws or checks, its Chrome. A piece missing stops the
command before it writes anything, naming the piece and where it should be, with "run setup":
nothing is fetched. HyperFrames gets its Chrome by path (`HYPERFRAMES_BROWSER_PATH`), so it never
downloads one, and runs with its update check off. A page that would make the render go online is
refused as well (see Writing a video). `src/setup.test.ts` and `src/bundle.test.ts` show each case.

A cloud service (a voice, an avatar) would be a command of its own, run before `make` and writing
files into the folder as a maker does, so that `make` stays offline.

### What an AI writes

An AI session writes sources: a `video.yaml` (its lines, cues and limits), a page and its assets,
or a project's own sources (a RayCraft tutorial). It never writes a made file, and it is never a
step of `make`: no command calls a model but the voice on this machine. The project file's
settings are the user's; an AI changes them only when asked. A video can begin without an AI:
`new` writes its first script from the clip's own texts.

## How loud

The build's last step brings the whole soundtrack to the script's `loudness` (LUFS, default -14,
the level YouTube and most platforms play at; -16 or -20 is quieter), its peaks 1.5 dB below full
scale. A line's own level doesn't matter: this step sets the whole.

## How timing works

The voice sets the clock. Each narration line is synthesized and measured, lines are laid end to
end with the pauses in `timing` (`lead`, `gap`, `tail`), and the scene animates against those
times. Changing a sentence re-times everything after it; nothing is timed by hand.

## Writing a video

A scene is a `page-scroll` (a page, below) or a `clip` (a video file, see Clips).

- One narration line is one or two sentences, about 19 words at most. Each line names a `cue`:
  `top`, `bottom`, or the `data-cue` name of an element in the page. Omit `cue` to stay put.
- `pause: <seconds>` on a line adds silence before it; the scroll to its cue happens in that time,
  so a new section is in place before the voice reaches it.
- `draw:` on a line lists hand-drawn marks (`circle`, `underline`, `arrow`, `box`, `check`), each
  `on` the `data-mark` name of a page element, optionally an `area` of it as fractions
  `[left, top, right, bottom]`, and `at`: a word or phrase of the line (drawn as it is said) or
  seconds after the line starts. Arrows take `from` (`left`, `top-right`, ...). Marks stay until a
  later line moves the page or draws again. Quote a YAML word such as `"true"` or `"no"`.
- A marked element must have one box: an inline phrase gets `white-space: nowrap`. Pictures need
  `width` and `height` attributes, so marks are placed before the images load.
- Page CSS may set the marker: `--mark` (colour), `--mark-width` (em), `--mark-shadow`.
- Page CSS: every rule starts with `.page`; portrait overrides start with
  `[data-format="portrait"] .page`. Size everything in `em` (the scene sets the base size).
- Nothing meant to be read goes below `0.84em` (28 px): video is watched on phones.
- Fonts available by name: Inter (400, 700, 900) and JetBrains Mono (400, 700), upright; every
  build carries them. Any other font needs an `@font-face` in the page, its `src` a file in the
  video's `assets/`. Nothing a page shows comes from the network: a page that names another font,
  or loads a URL (a picture, a stylesheet, a font file), stops every command before the narration,
  with the font or the URL named.
- A cue block must fit between the focus line and the bottom of the safe area: about 780 px tall
  in landscape and 950 px in portrait.

## Clips

A `clip` scene plays a video file, muted, with the narration as captions over it. The clip comes
from elsewhere: a project's maker draws it (`make:`, see Projects), or it was drawn by other means
(`clip:` paths). The tool reads the JSON beside it and never looks inside the picture.

```yaml
  - id: square
    scene: clip
    make: square                       # a made clip: clips/square-<format>.mp4, drawn by the maker
    # or a clip drawn elsewhere, in place of make:
    clip:                              # or one path for every format: clip: clips/demo.mp4
      landscape: clips/demo-16x9.mp4   # relative to the video folder; ../ is fine
      portrait: clips/demo-9x16.mp4
    limits:                            # optional: single events' own, over timing.moves (see Fitting)
      slide: { fastest: 3 }            # a move: slowest and fastest, multiples of its own speed
      start: { least: 2 }              # a hold: the shortest it may shrink to, seconds
    narration:
      - text: Here it slides, and a line can wait for it.
        cue: slide                     # an event's name; omit to follow on from the line before
```

Beside each clip lies its JSON: the same path with `.json` for the extension
(`clips/demo-16x9.mp4` → `clips/demo-16x9.json`). The schema is `ClipData` in `src/clip.ts`:

```json
{
  "format": "ai-videos-clip",
  "version": 1,
  "made": { "by": "the tool or script that drew it", "from": "what it drew: a file, a project" },
  "duration": 13,
  "events": [
    { "name": "start", "at": 0, "span": "hold" },
    { "name": "slide", "at": 5, "span": "move" },
    { "name": "across", "at": 6.5, "span": "hold" }
  ],
  "texts": [{ "text": "A square waits on the left.", "from": 0, "to": 5 }]
}
```

- `duration` is the clip's length in seconds; it must match the file's to a frame, which catches
  a JSON left from another run.
- `events` are named moments in order, the first at 0, each before the end. Names use lowercase
  letters, digits and dashes, once each. The span from an event to the next (from the last, to the
  end) is a `hold`, where nothing moves, or a `move`. Narration lines cue to events by name, in
  the clip's order (a line may cue the event the line before it cued).
- A clip drawn to a request (below) gives each event `natural`: its span's length at the clip's
  own pace, from the request. Fitting starts from it, so a move sped up once is not sped up again.
- `texts` are the clip's own words and when they apply (`from`, `to`, seconds). The tool reads
  and checks them; nothing speaks or shows them yet.
- With a clip per format, the clips must agree on length and events (names, spans, times within
  half a frame): the formats share one timeline. Each format's clip may have its own `texts`.
- The tool plays a clip as it was drawn. A cued line waits until the clip reaches its event, and
  the scene lasts until both the clip and the voice are done; past the clip's end, a still of its
  last frame holds. `compose` says whether the clip is drawn to the voice, and notes each line that
  waits for its event longer than a frame or starts later after it than the scene's `lead`.
- Captions are the narration lines, split as the subtitles are, in the area social apps leave
  clear. Each stays through the pause after its words, at most 1 s.
- Every check on a clip runs before any narration is made, so `check` fails in a second with the
  reason: a clip or its JSON missing, JSON the schema refuses, a length that does not match, the
  formats' clips disagreeing, a cue that names no event or goes back. `src/clip.test.ts` covers each.

### Fitting a clip to the voice

The voice sets the clock; the clip is drawn again to fit it. The tool never retimes video itself.
For a made clip, `make` runs the whole loop (`npm run video -- make clip-demo`). For a clip drawn
elsewhere it takes three commands:

```
npm run video -- request <video>     measure the voice, write <clip>.request.json beside each clip
(the clip's maker draws it again to the request, and writes its JSON)
npm run video -- build <video>       "Clip <id>: drawn to the voice"
```

`request` reads only the JSON, so it works before the clip is drawn at all.

How the fit (`src/fit.ts`) shares the time, in whole frames of the video's `fps`:

- Each line cued to an event fixes when the clip reaches it: when the voice gets to that line.
  The spans between two fixed events share the time between them.
- Short of time, holds shrink first (to one frame), then moves play faster, up to
  `timing.moves.fastest` times their own speed (default 2). Past that the voice waits.
- With time to spare, holds take it, in proportion to their own length, and moves keep their
  speed. With no hold to take it, moves slow down to `timing.moves.slowest` (default 0.5), and past
  that a hold follows the last of them.
- After the last cued event, the clip ends with the voice and `tail`: holds shrink or grow to get
  there, and moves keep their own speed.
- A clip scene's `limits` give single events their own: a move its `slowest` and `fastest` instead
  of `timing.moves`' (the fly-around faster than the rest), a hold the `least` it shrinks to
  instead of a frame (a picture shown 2 s before the next line, the voice waiting for it). A
  `least` longer than the hold makes it that long. `check` fails on a limit that names no event,
  or `least` on a move and `slowest` or `fastest` on a hold.
- Events land on whole frames, so a cued line starts up to a frame after the voice's own time.

The request (`ai-videos-request`, version 1) lists every span, in order, from the first event:

```json
{ "event": "slide", "span": "move", "natural": 1.5, "at": 5.033, "duration": 4.4, "move": 3 }
```

The clip drawn to it starts each span at `at` and lasts `duration` there. A hold shows its picture
that long; a move plays its motion over `move` seconds and holds its last frame for the rest. The
spans add up to the request's `duration` (`frames` at `fps`), which is the scene's length. The
drawn clip's JSON puts each event at its span's `at`, keeps its `natural`, and lasts `duration`.
The request also lists the lines (`at`, and `waits` where the voice waits for the clip), for
reading. `src/fit.test.ts` shows each rule.

## Writing a scene template

Scene files follow the HyperFrames contract (see the `hyperframes` skill, `references/format.md`):
everything inside `<template>`, root styled as `#root`, one paused GSAP timeline registered as
`window.__timelines[id]`, and every tween a `fromTo` with `immediateRender: false` so any frame
can be drawn on its own. No timers, no `Date.now()`, no unseeded randomness, no network calls.
Portrait scenes keep reading text inside x 120–888 and y 288–1248, the area social apps leave clear.

## Known quirks

- HyperFrames is pinned to an exact version in `package.json`; it releases several times a day.
  Upgrade deliberately, then run `setup` (the new version may pin another Chrome), `check` and a
  build. GSAP is pinned to the version HyperFrames pins (`gsap` in `package.json`).
- After `check`, HyperFrames keeps a helper process in the build folder for a few minutes, so that
  folder cannot be deleted on Windows until it exits. `compose` clears only its own subfolders.
- The portrait check runs with `--safe-zone off`: scrolled-off page text is outside the social safe
  areas by design, and the scene parks each cue inside them.
- HyperFrames' check writes its progress a line a step (`check: craft 1/599`, 634 lines for
  water-switch). `check` and `make` fold them into a line per phase, on its last count, written over
  in place on a terminal (`src/progress.ts`); its status, warnings, errors and verdict show as they
  come. A new HyperFrames that words its counts otherwise shows them all again, unfolded.
- HyperFrames telemetry is disabled on this machine (`npx hyperframes telemetry disable`). Its update
  check, which asks npm from a process that outlives the command, is off for every run of the tool
  (`HYPERFRAMES_NO_UPDATE_CHECK`, set in `src/cli.ts`).
- Subtitles come from the script text and line timings; long lines are split in proportion to
  their length, not by word timestamps.
- With the single commands, two videos with the same folder name share `build/<name>/` and,
  without `--out`, `out/<name>/`: build one at a time, or give the outside one its own `--out`.
  `make` writes into each video's own folder.
- A clip with long holds gets HyperFrames' "sparse keyframes" warning at render: few keyframes make
  preview seeking slow; rendering is unaffected.
- A clip scene with more than a few captions gets HyperFrames' `timeline_track_too_dense` warning
  (a caption is a timed element), as a long page gets `composition_file_too_large`. Both are size
  hints, not faults.
