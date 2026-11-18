# ai-videos

Videos made from web pages: a YAML script, a local voice (Kokoro), and HyperFrames rendering
HTML to MP4 frame by frame. Everything runs locally on Node; there is no Python in this project.

## Commands

```
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
always come from this tool. The build and the cache stay here; only `--out` writes elsewhere.

## Layout

| Path | What it is |
| --- | --- |
| `videos/<name>/video.yaml` | The script: scenes, narration lines, cues. Source of truth for a video. |
| `videos/<name>/page.html`, `page.css` | The page a `page-scroll` scene shows. |
| `videos/<name>/assets/` | The page's pictures, copied into the build; the page refers to them as `assets/<file>`. |
| `videos/clip-demo/` | The `clip` scene's demo: two small clips, their JSON and requests, and `make-clip.ts`, which draws them. |
| `scenes/<name>/scene.html` | Reusable scene templates (HyperFrames sub-compositions with `{{placeholders}}`): `page-scroll`, `clip`. |
| `src/` | The pipeline: `script` → `clip` → `tts` → `timeline` (and `fit`, for `request`) → `compose` → `render` → `srt`. |
| `build/` | Generated HyperFrames projects. Never edit; regenerated on every run. |
| `out/` | Finished videos and subtitles. |
| `.cache/tts/` | Narration audio, keyed by text, voice and speed. |

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
- Fonts available by name: Inter (400, 700, 900) and JetBrains Mono, plus the rest of the
  HyperFrames bundle. Any other font needs an `@font-face` to a file in the project.
- A cue block must fit between the focus line and the bottom of the safe area: about 780 px tall
  in landscape and 950 px in portrait.

## Clips

A `clip` scene plays a video file, muted, with the narration as captions over it. The clip comes
from elsewhere (another project draws it); the tool reads the JSON beside it and never looks
inside the picture.

```yaml
  - id: square
    scene: clip
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

The voice sets the clock; the clip is drawn again to fit it. The tool never retimes video itself:

```
npm run video -- request <video>     measure the voice, write <clip>.request.json beside each clip
(the clip's maker draws it again to the request, and writes its JSON)
npm run video -- build <video>       "Clip <id>: drawn to the voice"
```

`request` reads only the JSON, so it works before the clip is drawn at all. `videos/clip-demo`
runs the whole loop: `node videos/clip-demo/make-clip.ts --request` plays the clip's maker.

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
  Upgrade deliberately and re-run `check` and a build afterwards.
- After `check`, HyperFrames keeps a helper process in the build folder for a few minutes, so that
  folder cannot be deleted on Windows until it exits. `compose` clears only its own subfolders.
- The portrait check runs with `--safe-zone off`: scrolled-off page text is outside the social safe
  areas by design, and the scene parks each cue inside them.
- HyperFrames telemetry is disabled on this machine (`npx hyperframes telemetry disable`).
- Subtitles come from the script text and line timings; long lines are split in proportion to
  their length, not by word timestamps.
- Two videos with the same folder name share `build/<name>/` and, without `--out`, `out/<name>/`:
  build one at a time, or give the outside one its own `--out`.
- A clip with long holds gets HyperFrames' "sparse keyframes" warning at render: few keyframes make
  preview seeking slow; rendering is unaffected.
- A clip scene with more than a few captions gets HyperFrames' `timeline_track_too_dense` warning
  (a caption is a timed element), as a long page gets `composition_file_too_large`. Both are size
  hints, not faults.
