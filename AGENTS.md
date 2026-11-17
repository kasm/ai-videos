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
npm run video -- voices ["text"]           voice samples in out/voice-samples/
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
| `scenes/<name>/scene.html` | Reusable scene templates (HyperFrames sub-compositions with `{{placeholders}}`). |
| `src/` | The pipeline: `script` → `tts` → `timeline` → `compose` → `render` → `srt`. |
| `build/` | Generated HyperFrames projects. Never edit; regenerated on every run. |
| `out/` | Finished videos and subtitles. |
| `.cache/tts/` | Narration audio, keyed by text, voice and speed. |

## How timing works

The voice sets the clock. Each narration line is synthesized and measured, lines are laid end to
end with the pauses in `timing` (`lead`, `gap`, `tail`), and the scene animates against those
times. Changing a sentence re-times everything after it; nothing is timed by hand.

## Writing a video

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
