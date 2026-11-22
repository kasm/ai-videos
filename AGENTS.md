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
npm run video -- make <dir>/<name>.yaml    a plugin's video, from its one file (see Projects, A video file)
npm run video -- make <file> --profile quiet  the same, a profile's settings over the rest
npm run video -- make <file> --as web      its web page: one HTML file that plays offline (see The web page)
npm run video -- story <story>.md          a story to its videos, by a web chat and the clipboard (see Projects, story)
npm run -s video -- prompt <story>.md      the prompt for a web chat, on stdout (see Projects, prompt)
npm run video -- import <reply file>       the chat's reply: its episodes as video files (see Projects, import)
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

A `<video>` is a folder holding a `video.yaml`; a plugin's video is one file instead, and only
`make` takes it (see A video file). A bare name (`scroll-demo`) is a folder in this
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
| `videos/project.yaml`, `videos/make-clip.ts` | The folder's videos as a project (see Projects): its project file, and its maker, which draws clip-demo's square. |
| `videos/clip-demo/` | The `clip` scene's demo: a made clip (`make: square`); `make clip-demo` writes its `clips/`, `build/` and `out/`. |
| `scenes/<name>/scene.html` | Reusable scene templates (HyperFrames sub-compositions with `{{placeholders}}`): `page-scroll`, `clip`. |
| `src/` | The pipeline: `script` → `clip` → `tts` → `timeline` (and `fit` with `mouth`, for `request`) → `compose` (with `bundle`) → `render` → `srt`; `setup`, what the commands need on the disk; `new`, a first script; `frames` and `moments`, what a maker draws with (see The maker's shared code); `plugin` and `host`, a project's plugin and the process it runs in (see Plugins); `video-file`, `stages` and `lock`, a plugin's video as one file, its settings in layers, the cache of its stages and a make's lock on it (see A video file); `sound` and `page`, a video file's one sound track and its web page (see How loud, The web page); `prompt` and `import`, a story's prompt for a web chat and its reply taken in, and `story`, the two by the clipboard and the episodes made (see prompt, import, story). |
| `build/` | Generated HyperFrames projects. Never edit; regenerated on every run. |
| `out/` | Finished videos and subtitles. |
| `.cache/tts/` | Narration audio, keyed by text, voice and speed. |
| `.cache/models/` | The voice model, fetched by `setup`. |
| `.cache/setup.json` | Where `setup` found HyperFrames' Chrome, and for which HyperFrames. |

`AI_VIDEOS_CACHE` moves the whole `.cache/` elsewhere (the tests give it an empty folder).

## Projects

A project with a maker (this tool's `videos/`) keeps its videos in one folder, a video folder
each, and beside them one project file with what they share. A project with a plugin (`cartoons`,
RayCraft's `media/`) keeps each video as one file instead; its package.json holds the settings they share, and its
`library.yaml` what they name (see A video file, The library). This section is the contract
between the tool and a project.

### The project file

`project.yaml` in the folder that holds the video folders (`videos/project.yaml` for
`videos/clip-demo`). The schema is `ProjectFile` in `src/script.ts`:

```yaml
maker: node make-clip.ts              # draws a project's clips (below); run in this folder
voice: af_heart                       # every line that names no speaker
cast: { pip: am_puck, mo: bf_emma }   # optional: each speaker's voice (The cast, below)
loudness: -22
formats: [landscape]
```

Beside `maker` it holds any of the settings a `video.yaml` has: `voice`, `cast`, `speed`, `fps`,
`formats`, `loudness` and `timing`. Every command reads it when it loads a video, and a video keeps
no copy:

- A setting its `video.yaml` writes overrides the project's, key by key: `timing: { moves:
  { fastest: 1 } }` keeps the project's `timing.gap`. A list (`formats`) is replaced whole.
- A setting neither writes takes the tool's default.
- A folder with no project file beside it stands alone, on its `video.yaml` and the defaults.
- A project file may set only these (`title` or `scenes` in it is refused), and is checked on its
  own, so an error names the file that holds the mistake. `src/script.test.ts` shows each rule.

### The cast

A video with several speakers gives each a voice in `cast`, by name (lowercase letters, digits and
dashes), and a line says who speaks it:

```yaml
narration:
  - text: Two friends meet.    # no speaker: the video's voice
    cue: meets
  - speaker: pip               # the cast's voice for pip
    text: Hello!
```

- A line's voice is its own `voice` if it writes one, else its `speaker`'s in the cast, else the
  video's `voice` (`voiceOf`, `src/script.ts`). A video with no speakers needs no cast.
- The cast is a setting like the others: a `video.yaml`'s `cast` overrides the project's speaker by
  speaker, and may add its own. A project with a plugin keeps its cast in its library, a voice
  under each character (see The library).
- A speaker the cast does not name is refused when the video loads, with the line and the cast: it
  is never said in the video's voice.
- A clip's text may name its speaker (see Clips), `new` writes it into the line (a video file's
  line has it from the plan), and the request passes it to the maker or the plugin, which moves
  that character's mouth (see Fitting).
- The narration's log names the speaker and voice of each line said in another voice than the
  video's: `line 2 (pip, am_puck): 0.93s`.

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
draws (clip-demo's `square`); its files are the `clips/` ones above, by the scene's id. A clip
scene with `clip:` paths plays a clip drawn elsewhere, as before.

### Plugins

A project's plugin draws its videos: a module the tool runs in a child process of its own
(`src/host.ts`), in place of a maker's command line. `cartoons` has one that draws (its
`src/plugin.ts`), RayCraft one that records (its `media/plugin/plugin.ts`: a tutorial played by
the editor in Chrome).

- **Where:** the nearest `package.json` above the video file names it, as a path from that
  folder: `"ai-videos": { "plugin": "./src/plugin.ts" }` (`pluginOf`, `src/make.ts`). The same
  `"ai-videos"` holds the project's settings (see Settings in layers). The project's videos are
  files (see A video file): a video folder there with a made clip is refused, and so is `new`. A
  `package.json` with no `"ai-videos"` key (the tool's own) leaves the clips to the maker.
- **What it is:** the module's default export, `Plugin` in `src/plugin.ts`, which a project
  imports for its types alone (`import type { Plugin } from "ai-videos/plugin"`):
  - `scene`: the scene it draws (`cartoon`): a video file's `use:` names it.
  - `stage`: the size its picture is drawn at. The video's format is the one of its shape; a stage
    no format has the shape of is refused.
  - `commands`: what its source's beats may do, by name, each described once: a `description`,
    an `example` and a `schema`. A schema is any library's with the Standard Schema and Standard
    JSON Schema interfaces (`~standard.validate`, `~standard.jsonSchema`; standardschema.dev), as
    zod 4's have. A plugin whose example fails its schema, or whose schema writes no JSON Schema,
    is refused when it loads. The prompt writes each command's description and example.
  - `guide`: its part of the prompt, in Markdown (see `prompt`): what its videos can show, the
    format of its source with an example, how to turn a story into it, and how to draw what its
    library holds. The tool adds the commands, the library and the voices.
  - `check(raw, file, library)`: the source, checked into the plugin's own type: the video file,
    read and parsed from YAML by the tool, without the tool's keys, and what it names found in the
    library (`{ file, raw }`, undefined without a `library.yaml`; see The library). An error names
    the file that holds the mistake, and every reason.
  - `repair(raw, library)`, optional: what it mends in the source before `check`, only where there
    is one right answer. It gives the source mended, in the same format, so it could be written
    back, and `did`, a sentence for each thing it mended.
  - `plan(source)`: its events and texts at its own pace, as step one writes them; and, optional,
    `limits`: single events' own limits on the fit, by the event's name, as a clip scene's (see
    Fitting): a move's `slowest` and `fastest`, a hold's `least`. One that names no event, or
    the wrong kind, is refused.
  - `inputs(source)`, optional: the project's files its plan and picture are made from, beyond the
    video file, the library and its own folder (a tutorial the source names, the app that draws
    it), each a file or a folder, as a path from the project's folder (see The cache).
  - Its picture, one of the two (a plugin with both, or neither, is refused):
    - `frame(source, moment, size)`, a plugin that draws: a moment (`moments`, The maker's shared
      code) as an SVG of the whole stage, `width` × `height` pixels.
    - `camera(source, request, size)`, a plugin that records: what takes its pictures (a page in a
      browser) opened for the clip drawn to `request`, as `{ shot(moment), close() }`. `shot`
      gives each moment's picture, in order, as a PNG of `width` × `height` pixels, sRGB and
      opaque, the same buffer again for a picture held; `close` is called when the clip is drawn,
      or failed.

  A drawing plugin's functions are pure: no Node APIs, no clock, no unseeded randomness. So a frame
  is the same in every run, and the same code draws in the video's web page (see The web page), the
  module and what it imports bundled for a browser. A recording plugin runs with Node, in the
  host's process: its `check` and `plan` may read the files `inputs` names, and its camera must
  give the same pictures in every run all the same (`.frames` compares two runs). Its web page
  plays the clip it recorded.
- **What the host does** is the rest of both steps, the same for every plugin. Step one: the
  source mended, checked and planned, the plan written as the clip's data, and what was mended
  said (`make` lists it, every time, and the file stays as written), with the plan's limits and
  inputs. Step two: the request's spans checked against the plan's events, each moment's picture
  encoded (`encoder`, crf 17), and the data written again: each event at its span, the texts
  moved with their beats. A drawing plugin's SVG is turned into pixels by resvg (no fonts: a
  picture holds no text), and a frame whose SVG is the one before is not drawn again; beside the
  clip's `.frames`, `<clip>.svgs` holds a hash of each frame's SVG (its md5), a line a frame: what
  the web page draws is compared with it. A recording plugin's PNGs are encoded as they come
  (`input: "png"`), `.frames` holding the md5 of each, and it has no `.svgs`.
- **The process:** `make` starts the host at the first stage it makes (none when each is in the
  cache), in the `package.json`'s folder, and closes it when it is done. Ready, the host says the
  plugin's scene, stage, picture (`drawn` or `recorded`), guide and commands (their descriptions
  and examples). Each call is a message, with the video file's source and the library, answered
  before the next; one that fails says why, and `make` stops there. `import`'s call mends, checks
  and plans a source and writes nothing. `src/host.test.ts` shows each case.

### A video file

A plugin's video is one file, `videos/<name>.yaml`: no folder, no `video.yaml`, no project file.
`make` alone takes it (`src/video-file.ts`):

```yaml
use: cartoon        # the scene its plugin draws: the plugin's `scene`
loudness: -16       # optional: any of the settings, over the project's
characters: { … }   # every other key is the plugin's source, checked by the plugin
scenes: [ … ]
```

- **Its keys:** `use` and the settings are the tool's; the plugin checks the rest. The settings
  are a `video.yaml`'s but `formats`, and two more: `voice`, `cast`, `speed`, `fps`,
  `loudness`, `timing`, `quality` (`high` or `draft`, the render), and `outputs`.
- **Its outputs** are what `make` writes, each on or off: `outputs: { video: true, web: false }`,
  the server's. `video` is the video (see make), `web` its page (see The web page), made first
  when both are on. A project turns the pages on for all its videos with `"outputs": { "web":
  true }`, and a file `outputs: { video: false }` for its own. `--as video` or `--as web` makes
  that one, whatever they say; with both off and no `--as`, `make` is refused. They go into no
  stage's key: turned on or off, they redo nothing made.
- **Its lines** are written once, in the source: each of the plan's texts is a line, cued to the
  event it begins at, with the text's speaker (`linesOf`, as `new` writes them). So a video file
  has no `pause`, no line's own `voice` and no `limits`. A speaker the cast gives no voice is
  refused, with the line.
- **Its format** is the one of its plugin's stage (1920 by 1080: landscape), and it has that
  one alone.
- **Its name** is the file's: what is made goes into `.cache/<name>/`, and the finished files are
  `out/<name>.mp4` and `out/<name>.srt`, and the page `out/<name>.html`, all in the project's
  folder, the `package.json`'s.

`src/video-file.test.ts` shows each rule.

### The library

`library.yaml`, beside the `package.json`, holds what a project's videos name, each drawn once:
`cartoons`' characters and backgrounds. A video file names them, and draws none of its own.

```yaml
characters:
  pip:
    voice: am_puck   # the tool's: Pip's voice, the cast's
    parts: { … }     # the rest is the plugin's
backgrounds: { … }
```

- **Its keys:** each character's `voice` is the tool's, and every character has one. The tool takes
  them as the project's cast (see Settings in layers), and gives the plugin the rest, with the
  file's path, for `check` (see Plugins). A mistake is reported against `library.yaml`: a voice
  missing or a name the tool refuses by the tool, the rest by the plugin.
- **A voice has one home:** a `cast` in the `package.json`'s `"ai-videos"` is refused, pointing
  here. A video file's own `cast:` still goes over the library's, speaker by speaker.
- A project with no `library.yaml` has no library: its plugin gets none, and its cast is empty.

### Settings in layers

A video file's settings come in layers, each over the one before, key by key as over a project
file (a table merges, a list is replaced):

1. the server's: the tool's defaults;
2. the project's: its `package.json`'s `"ai-videos"`, beside `plugin`, and its library's voices
   as its `cast` (see The library);
3. the file's;
4. a profile's, picked when making: `make <file> --profile quiet`.

The profiles are the tool's (`PROFILES`, `src/video-file.ts`): `youtube` (-14 LUFS), `quiet`
(-20 LUFS) and `draft` (the fast render). With a profile, the finished files take its name:
`out/<name>-quiet.mp4`, `.srt`, `.html`. A mistake is reported against the file that holds it: the
`package.json` or the video file.

### The cache

`make <file>` keeps each stage's key in `.cache/<name>/stages.json`: a hash of what the stage is
made from (`src/stages.ts`). A stage whose key is the one recorded, its files all there, is taken
from the cache, and the log says "From the cache". So a setting redoes only the stages it goes
into, and the ones made from them. The first four are both modes'; then the page and the video's,
as the outputs say (see A video file). A recording plugin's page plays its clip, so its drawing
comes before the page: a step of its own when the video is made too, else the page's.

| Stage | Made from | What it makes, in `.cache/<name>/` |
| --- | --- | --- |
| The plan | the source, `use`, the library (but its voices), the plugin's code, its inputs | `plan.json`, and in `stages.json` the format, the picture, what was mended, the limits and the inputs |
| The voices | each line's text, voice and `speed` (the tool's voice cache) | |
| The fit | the plan, the voices, `fps`, `timing` | `clips/<name>-<format>.request.json` |
| The sound | each line's voice and when it starts (the fit's timeline), the video's length, `loudness` | `sound.m4a` |
| The drawing | the request, the source, the library (but its voices), the plugin's code, its inputs | `clips/<name>-<format>.mp4`, its `.json`, `.frames` and (drawn) `.svgs` |
| Check | the build (`build/<format>/`, but HyperFrames' own `.hyperframes/` and `renders/`), HyperFrames' version | |
| The render | the build, `quality`, `fps` | `render.mp4` |
| The video | the render's picture, the sound | `out/<name>.mp4` and `.srt`, written every time |
| The page | the sound, the source, the library, the request, the plugin's code, or a recording plugin's clip | `out/<name>.html`, written every time |

- The plugin's code is every file in the plugin's folder (but `node_modules` and dot folders)
  and the tool's files it runs through (`DRAWING`, `src/stages.ts`): keep the plugin in a folder
  of its own, as `cartoons`' `src/`.
- Its inputs are the files its plan named (`inputs`, see Plugins), as they are now: a file's
  bytes, a folder's files as the code's (`inputsKey`). The list is the one the plan named when it
  was last made, kept with it: one changed, or come or gone, makes the plan again, which names
  them anew, and the drawing with it. So a make with every stage in the cache starts no plugin.
- The build names no absolute path, so it is the same however the drive is spelled (`d:` or
  `D:`).
- A stage is forgotten before it is made again: one stopped half-way is made in full next time.
- `--fit` shows the fit even when it is in the cache.

`src/stages.test.ts` shows each rule.

**The lock.** A make of a video file holds `.cache/<name>/make.lock` from when it has read the file
to its end, the stages and the finished files between (`src/lock.ts`). It names the process: its
id, since when, and its command. A second make of the video while one runs, by any profile, from
anything that runs `make` (a terminal, `story`, a session), is refused before it writes anything:
"meet is being made by process 12345 (make videos/meet.yaml --as web), since …: wait for it to end,
or stop it. If no make is running, delete …/make.lock". A lock whose process is gone (a make killed
half-way) is taken over. Two different videos make at once, each with its own. `src/lock.test.ts`
shows each case.

### The maker

A project with no plugin draws its made clips with a maker.
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

### The maker's shared code

What a maker has of its own is the picture: what a moment looks like. The rest of step two is the
same in every maker, and `src/frames.ts` holds it: which moment each frame of the request shows,
the frames encoded into the clip, and the clip's data written back. A maker in TypeScript uses it
instead of repeating it; the contract stays the files above, so a maker in another language, or
one that draws by other means, follows those alone.

- **From another repository** the tool is a folder package: `"ai-videos": "file:<path to this
  folder>"` in the project's `package.json`, then `import { moments, encoder, writeClipData }
  from "ai-videos/frames"`. It and `ai-videos/plugin` (types alone, see Plugins) are the modules
  `package.json` exports, and they import nothing but Node's own modules (and `src/moments.ts`,
  which imports nothing), so the project needs none of the tool's packages. Node 24 runs them as
  they are written. The tool's own maker imports the file (`../src/frames.ts`).
- **`moments(request)`** gives one moment for each of the request's `frames`, in order. It is pure
  (`src/moments.ts`, which `frames.ts` exports), so the web page draws its frames with it too:
  - `span`: which of the request's spans the frame is in, counted from 0. Each span begins on
    the frame its `at` names; a request whose spans do not follow each other on whole frames is
    refused.
  - `progress`: how far through the span's motion, 0 to 1. A move goes evenly from 0 over its
    `move` seconds (its `duration`, when the request gives no `move`) and stays at 1 for the
    rest; a hold is at 0. Easing is the maker's, and so is what the spans before it left behind.
  - `time` and `into`: the seconds since the clip began, and since the span did.
  - `mouths`: how open each speaker's mouth is, by name, above 0 to 1, from the lines' tracks. A
    speaker it does not name has a closed mouth; a line with no speaker opens none. Where two of
    one speaker's lines meet in a frame, the wider mouth shows.
- **`encoder(clip, { width, height, fps, crf })`** starts ffmpeg (on the PATH) writing `clip`,
  its folder made first:
  - `await frame(pixels)` adds a frame: `width` × `height` pixels in rows from the top, four
    bytes each (red, green, blue, alpha), sRGB and opaque; with `input: "png"`, a PNG of that size
    (a screenshot). A frame of another size is refused. A hold gives the same buffer again, and is
    not hashed again.
  - `await end()` waits for ffmpeg, fails if it failed, and returns the number of frames. It
    writes `<clip>.frames` beside the clip: a hash of each frame as given (its pixels, or its
    PNG's bytes), a line a frame. Two runs that drew the same pictures have the same file; where
    they differ, the line is the frame. `abort()` stops ffmpeg for a clip given up (a frame
    failed), and writes none.
  - The clip is H.264, 4:2:0, marked BT.709, with nothing in it that differs by run (dates, the
    encoder's name). `crf` is the quality, lower is closer to the pixels: a maker chooses it
    (`videos/make-clip.ts` 24; a drawing with fine lines, 17).
- **`writeClipData(file, { by, from, request, duration, events, texts })`** writes the clip's
  JSON (see Clips) for either step, its keys in the schema's order. With `request`, the
  request's file, `made.from` ends with `, drawn to <its name>`. The times are the maker's:
  for step two, each event at its span's `at` with the span's `natural`, and the request's
  `duration`.
- Reading the call and the request stays the maker's (`readMakerCall` for the tool's own; a
  project checks the request as far as it draws from it). `src/frames.test.ts` shows each of
  the three, and that their types are the ones `fit` writes and `clip` reads.

### `new`

`npm run video -- new <video>` begins a video folder with no AI (`src/new.ts`). The folder needs
a project file with a maker beside it; the folder itself may not exist yet. A plugin's video needs
no `new`: it is one file, its lines written once in it (see A video file).

1. It runs the maker's step one for the clip, in the project's first format (or `--format`'s),
   into the folder's `clips/`. The clip is the folder's name, or `--make <name>`'s.
2. It writes `video.yaml`: a title (the folder's name) and one made clip scene, its id the clip's
   name, with a line per text of the clip's data, in time order. Each line is cued to the event
   its text begins at: the last event at or before the text's `from`. A text's `speaker` is its
   line's.

The script holds no setting: the voice, formats and the rest are read from the project file, as
for any video. So the speakers' voices go in the project's `cast`: `new` names each speaker it
wrote that has no voice there yet, and `make` refuses the script until each has one.
`new` never writes over a `video.yaml`. A clip whose data holds no text gets no
script: write its lines by hand. `new` speaks and draws nothing, so it needs nothing from `setup`;
`make --fit` then tries the lines. `src/new.test.ts` shows each case.

### `make`

`npm run video -- make <video>` makes the whole video in five steps, in this order, and stops at
the first that fails (`src/cli.ts`, `make`; the calls are `src/make.ts`). A video file is made in
the same steps, by its plugin, each taken from the cache when it is unchanged (`makeFile`; see The
cache), with the sound mixed by the tool before the drawing (see How loud), and its lock held (see
The cache). Its outputs say what follows the sound: its page (see The web page), then the drawing,
check and video; `--as` makes one of them (see A video file).

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

### The web page

`make <file> --as web`, or `make <file>` with `outputs: { web: true }` (off by default, see A video
file), writes `out/<name>.html` (`src/page.ts`): one file that plays as the video does, offline. It needs the voices but not HyperFrames' Chrome, and it is made from the stages both
modes share (and a recording plugin's drawing), so a page made after the video speaks, fits,
mixes and draws nothing again.

- **The picture:** the plugin's module and the tool's `moments`, bundled for a browser by esbuild,
  with the video file's source, the library and the request. The page mends and checks the source
  as the host does, then draws each frame's SVG with the plugin's `frame`: the SVG the video's
  frame was drawn from. `src/page.test.ts` runs the page's drawing with no Node and no page, and
  finds each frame's SVG the same as the video's `.svgs`. A plugin that does not bundle (it
  imports a Node module) is refused, with esbuild's reason. A recording plugin's picture is its
  clip instead, the drawing's `.mp4` in the file as it is, played muted with the sound: set on the
  sound's time when the two are more than two frames apart, and on the frame itself while paused.
  Its code is not bundled.
- **The rest:** the sound (`sound.m4a`, the same track the video plays), the captions (the clip
  scene's, split, timed and styled as the video's: `sceneCaptions`, `clipStyle`) and their font
  (Inter 700, each subset), all inside the file. It names no URL.
- **The player:** a play button and a seek bar, nothing more. The sound's clock picks the frame, and
  the page draws it when it changes; the stage is scaled to the window.

### `prompt`

`npm run -s video -- prompt stories/<name>.md` writes the prompt for a story (a book's chapter) to
stdout, for any web chat to answer with no tools and no files of its own (`src/prompt.ts`). The
story's project is the nearest `package.json` above it with a plugin, which is started for its
guide and commands, then closed. What it reads goes to stderr. In order:

1. The tool's part: the task, and what a reply is: one YAML block per episode, its name on top
   (`episode: <name>-1`, `<name>-2`…, or `<name>` for a story of one episode), then `library:` with
   only what the library lacks (each new character with its `voice`), then the video file. A reply
   ends with the line `All episodes written.`; one cut off is told "continue", and begins the
   block that was cut off again, whole.
2. The plugin's `guide`, then its commands, each with its description and its example as written.
3. `library.yaml` as written, when the project has one.
4. The voices: the narrator's (the project's `voice`), the library's characters', and the rest of
   kokoro-js's, which nobody has, grouped by English and gender, best first (Kokoro's grades).
5. The story, as written.

It speaks and draws nothing, so it needs nothing from `setup`. `src/prompt.test.ts` shows each part.

### `import`

`npm run video -- import <reply file>` takes a chat's reply, pasted into a file (its messages one
after another when the chat was told "continue"), and writes what is in it into the project: the
nearest `package.json` above the file with a plugin (`src/import.ts`).

- **The blocks:** each whole YAML block (`` ```yaml `` to its fence) is an episode; blocks of
  another language are passed over. A block with no end, or one a new YAML block begins inside,
  was cut off and is not counted. When two blocks name one episode, the later counts. The log says
  each, and whether the reply says `All episodes written.` after a block: said once, it stays
  said, as the blocks the chat mends come after it.
- **An episode** is its name (`episode:`), what it adds to the library (`library:`, by section, as
  `library.yaml` has them), and its video file: the block without those two keys, as written, its
  comments kept.
- **The checks:** each episode is checked as `make` checks it, against the library with what the
  reply adds, before anything is written: a new character's voice is one of the tool's, the file's
  `use:` and settings are valid, the plugin mends and checks its source and plans it, and each line
  has a voice the tool speaks in. The plugin runs in its host, for this one call (see Plugins).
- **What it writes:** `videos/<name>.yaml` for each episode it takes, and the entries the library
  lacks into `library.yaml`, each at the end of its section as the block wrote it, the rest of the
  file as it was (a section it lacks goes at the end). The library is written only when an episode
  is taken. Nothing is written over: a video file already there is said to be the same, or kept,
  and a character or background the library has is kept as it is.
- **What it refused** comes out as a message to paste back into the chat, each episode with why,
  and the command exits with 1. Pasted, the chat answers with those blocks mended: added to the
  reply's file, they are imported with the rest, and the episodes already written are the same.

Like `prompt`, it needs nothing from `setup`. `src/import.test.ts` shows each case.

### `story`

`npm run video -- story stories/<name>.md` takes a story to its videos in one command, through a
web chat of the user's (`src/story.ts`). The tool and the chat meet on the clipboard, and the user
presses Enter in the terminal when the chat's answer is copied. Windows only.

| # | Who | What | Reads | Writes |
| --- | --- | --- | --- | --- |
| 1 | the tool | the prompt, on the clipboard (see prompt) | `stories/<name>.md`, `library.yaml`, the plugin | the clipboard |
| 2 | the user | pastes it into a new chat; copies the chat's whole answer (its copy button keeps the blocks); presses Enter | | |
| 3 | the tool | the answer added to the reply's file, which is then imported (see import) | the clipboard | `stories/<name>.reply.md`, `videos/<episode>.yaml`, `library.yaml` |
| 3a | | cut off (no `All episodes written.`): the user types "continue" in the chat, copies its answer, presses Enter: 3 again | | |
| 3b | the tool | refused: the message for the chat, on the clipboard; the user pastes it, copies the answer, presses Enter: 3 again | | the clipboard |
| 4 | the tool | each episode taken, made as its outputs say: the pages first, each opened in the browser, then the videos (see make) | `videos/<episode>.yaml` | `.cache/<episode>/`, `out/<episode>.*` |

- **What it refuses to add:** a clipboard with no text, one that still holds what was put there for
  the chat (Enter pressed too soon), the answer added last, or one with no YAML block (the answer
  copied without its blocks) and no `All episodes written.` Each is said, and Enter is waited for
  again.
- **`done`,** typed in place of Enter once the chat has answered, goes on with what there is: for a
  chat that never says `All episodes written.`, or an episode it cannot mend. Only the episodes
  taken are made; none taken stops it.
- **The reply's file is all it keeps.** With `stories/<name>.reply.md` there, `story` copies no
  prompt: it imports the file, and goes on from there. So a run stopped (Ctrl+C, a make that
  failed) goes on when typed again, and one made already makes again from the cache. To begin
  anew, in a new chat, delete the file.
- **What it needs** is checked before the prompt: the voice, and HyperFrames' Chrome when the
  project's outputs make a video (see Offline). Each make holds its video's lock (see The cache).
- The clipboard is PowerShell's (`Set-Clipboard`, `Get-Clipboard`), its text through a file in
  UTF-8; the browser is Explorer's, which opens a page in the default one. `src/story.test.ts`
  runs the whole with a fake clipboard, keyboard, browser and make.

### Offline

Only `setup` uses the network. It fetches once what no other command may fetch:

- the voice model (`onnx-community/Kokoro-82M-v1.0-ONNX`, about 325 MB), into `.cache/models/`;
- HyperFrames' Chrome (chrome-headless-shell), which HyperFrames keeps in its own cache
  (`~/.cache/hyperframes/`); `setup` records where, and for which HyperFrames, in `.cache/setup.json`.

The rest comes with `npm ci`: the voices (in kokoro-js), GSAP and the fonts, which each build
carries in `assets/vendor/` (`src/bundle.ts`), so a build names no URL, and esbuild, which bundles
a web page's drawing (see The web page). Running `setup` again keeps
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

An AI session writes sources: a `video.yaml` (its lines, cues and limits), a video file, a page
and its assets, or a project's own sources (a RayCraft tutorial). It never writes a made file, and
it is never a step of `make`: no command calls a model but the voice on this machine. The project
file's settings, and a `package.json`'s, are the user's; an AI changes them only when asked. A video can begin without an AI:
`new` writes its first script from the clip's own texts. A web chat writes no file at all: its
reply to the prompt is imported (see `prompt`, `import`).

## How loud

The build's last step brings the whole soundtrack to the script's `loudness` (LUFS, default -14,
the level YouTube and most platforms play at; -16 or -20 is quieter), its peaks 1.5 dB below full
scale. A line's own level doesn't matter: this step sets the whole.

A video file's soundtrack is the tool's own (`src/sound.ts`): each line's voice laid where the
timeline starts it, on a track as long as the video, and brought to `loudness` once, as a
render's track is (stereo, the voice in both channels). The video puts it with the render's
picture, and the web page plays the same file.

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
  "texts": [
    { "text": "A square waits on the left.", "from": 0, "to": 5 },
    { "text": "Here I go!", "speaker": "square", "from": 5, "to": 6.5 }
  ]
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
- `texts` are the clip's own words and when they apply (`from`, `to`, seconds). A text one of the
  clip's characters says names it as `speaker`; a text with none is a narrator's. The tool reads
  and checks them, and `new` writes them as a video's first lines; `make` speaks the script's
  lines, not these.
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
`src/fit.test.ts` shows each rule.

The request also lists the lines, in the script's order, each with its voice as measured:

```json
{ "text": "Here I go!", "speaker": "square", "cue": "slide", "at": 5.033, "waits": 0, "duration": 1.544,
  "mouth": { "frame": 151, "open": [0.31, 1, 0.82, 0, 0, 0.64, 0.9, 0.12] } }
```

- `speaker` is who says the line, as the script names it: the track is that character's mouth. A
  line with no speaker has no such key: nobody on screen says it, so its track moves no mouth.
- `at` is when the voice begins the line, from the clip's start, and `waits` how long it waits
  there for the clip. `duration` is the voice's length: the line sounds from `at` for `duration`.
- `mouth` is how open a mouth is while the line sounds, a number for each frame of the clip (the
  request's `fps`): `open[k]` is for frame `frame + k`, and `frame` is the frame the line begins in.
  0 is closed and 1 is the line's loudest frame. A maker with a talking character draws its mouth
  from it; in a frame no line's track covers, nobody speaks.
- The track follows the voice's loudness, not its phonemes (`src/mouth.ts`): a frame's loudness is
  compared with the line's loudest, on the decibel scale, and 30 dB under it is closed. So the
  mouth is closed in the pauses between a line's sentences. `src/mouth.test.ts` shows it.
- `speaker`, `duration` and `mouth` are optional, and the version stays 1: a maker that draws no
  mouth (`videos/make-clip.ts`) reads the request as before, and a request written by other means may leave
  them out.

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
