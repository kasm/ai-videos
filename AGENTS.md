# ai-videos

A local animation server. A project gives it a plugin that draws (or records) its scenes, and
keeps each video as one YAML file; a local voice (Kokoro) says its lines, the plugin's clip is
drawn to fit them, and HyperFrames renders the clip with its captions to MP4, or the tool writes a
web page that plays the same. Everything runs locally on Node; there is no Python in this project.

## Commands

```
npm run video -- setup                        once: fetch the voice model and HyperFrames' Chrome (see Offline)
npm run video -- make <dir>/<name>.yaml       a video, from its one file (see Projects, make)
npm run video -- make <file> --fit            only the plan and the fit, in seconds
npm run video -- make <file> --profile quiet  the same, a profile's settings over the rest
npm run video -- make <file> --as web         its web page: one HTML file that plays offline (see The web page)
npm run video -- story <story>.md             a story to its videos, by a web chat and the clipboard (see Projects, story)
npm run -s video -- prompt <story>.md         the prompt for a web chat, on stdout (see Projects, prompt)
npm run video -- import <reply file>          the chat's reply: its episodes as video files (see Projects, import)
npm run -s video -- check <dir>/<name>.yaml   a video file checked, with nothing spoken or written (see A script)
npm run video -- voices ["text"]              voice samples in out/voice-samples/
npm test                                      the tool's tests (src/*.test.ts)
npm run typecheck
```

A video is a file of a project (see A video file), anywhere on the disk; a path is relative to
where the command is typed, so a project runs the tool on its own files. Each project's
`package.json` has a script for it, `"video": "npm --prefix <path to this folder> run -s video --"`
(`cartoons/`' is `--prefix ..`):

```
cd cartoons
npm run -s video -- make videos/hello.yaml
```

From this folder, `npm run -s video -- make cartoons/videos/hello.yaml` makes the same.

What `make` writes goes into the project's folder (`.cache/<name>/`, `out/`); the voice cache and
the voice model always stay in this tool.

## Layout

| Path | What it is |
| --- | --- |
| `scenes/clip/scene.html` | The scene template (a HyperFrames sub-composition with `{{placeholders}}`): the plugin's clip, muted, with the captions over it. |
| `src/` | The pipeline: `video-file` (the file, its settings in layers, and the `script` the pipeline reads) → the plugin in its process (`plugin`, `make`, `host`): its plan → `tts` → `timeline` (and `fit` with `mouth`) → `sound` → the drawing (`moments`, `frames`, `clip`) → `compose` (with `bundle` and `captions`) → `render`; `page`, the web page; `stages` and `lock`, a make's cache and its lock (see The cache); `setup`, what the commands need on the disk; `prompt` and `import`, a story's prompt for a web chat and its reply taken in, and `story`, the two by the clipboard and the episodes made (see prompt, import, story); `scenario`, `compile` with `times`, `shown` and `guide`, a video written as a script: its lines read and checked, compiled, when each begins and ends, what each frame of it shows, and how it is taught (see A script, What happens at once). |
| `cartoons/` | A project of the tool's, in this repo: the cartoon plugin (`cartoons/src/plugin.ts`), its library, videos and stories, and its notes, `cartoons/CLAUDE.md`. Its `episode` skill is the repo's, `.claude/skills/episode/`. |
| `out/voice-samples/` | What `voices` writes. |
| `.cache/tts/` | Narration audio, keyed by text, voice and speed. |
| `.cache/models/` | The voice model, fetched by `setup`. |
| `.cache/setup.json` | Where `setup` found HyperFrames' Chrome, and for which HyperFrames. |

`AI_VIDEOS_CACHE` moves the whole `.cache/` elsewhere (the tests give it an empty folder).

## Projects

A project (`cartoons/` in this repo, RayCraft's `media/`) keeps each video as one file, `videos/<name>.yaml`.
Its `package.json` names its plugin and holds the settings its videos share, and its
`library.yaml` what they name (see A video file, The library). This section is the contract
between the tool and a project.

### Plugins

A project's plugin draws its videos: a module the tool runs in a child process of its own
(`src/host.ts`). `cartoons/` has one that draws (its `src/plugin.ts`), RayCraft one that records
(its `media/plugin/plugin.ts`: a tutorial played by the editor in Chrome).

- **Where:** the nearest `package.json` above the video file names it, as a path from that
  folder: `"ai-videos": { "plugin": "./src/plugin.ts" }` (`pluginOf`, `src/make.ts`). The same
  `"ai-videos"` holds the project's settings (see Settings in layers). A video file with no
  `package.json` above it that names a plugin is refused.
- **From another repository** the tool is a folder package: `"ai-videos": "file:<path to this
  folder>"` in the project's `package.json` (`cartoons/`, in this repo, the same: `"file:.."`). It
  exports one module, `ai-videos/plugin`, which a plugin imports for its types (`import type {
  Plugin } from "ai-videos/plugin"`), its tests for `moments` (see Moments), and both for a
  script's reading, check, compiling and what a frame of it shows (see A script). It runs nothing
  else, so the project needs none of the tool's packages, and Node 24 runs it as it is written.
- **What it is:** the module's default export, `Plugin` in `src/plugin.ts`:
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
  - `plan(source)`: its events and texts at its own pace, as step one writes them (see The clip
    and its JSON); and, optional, `limits`: single events' own limits on the fit, by the event's
    name (see Fitting a clip to the voice): a move's `slowest` and `fastest`, a hold's `least`.
    One that names no event, or the wrong kind, is refused.
  - `inputs(source)`, optional: the project's files its plan and picture are made from, beyond the
    video file, the library and its own folder (a tutorial the source names, the app that draws
    it), each a file or a folder, as a path from the project's folder (see The cache).
  - Its picture, one of the two (a plugin with both, or neither, is refused):
    - `frame(source, moment, size)`, a plugin that draws: a moment (see Moments) as an SVG of the
      whole stage, `width` × `height` pixels.
    - `camera(source, request, size)`, a plugin that records: what takes its pictures (a page in a
      browser) opened for the clip drawn to `request`, as `{ shot(moment), close() }`. `shot`
      gives each moment's picture, in order, as a PNG of `width` × `height` pixels, sRGB and
      opaque, the same buffer again for a picture held; `close` is called when the clip is drawn,
      or failed.
  - `script`, optional: its part of a video written as a script (see A script). A plugin without
    it has no such videos; for a video that is one, none of the functions above is called.
    - `actions`: what a line may do besides the tool's `say`, by name, each described once: a
      `description`, an `example` (one line of a script that names it: `pip walk to=middle`) and
      `values`, a schema of the values a line gives it. An example that is no such line, or fails
      its schema, is refused when the plugin loads.
    - `guide`: its part of the guide to writing a script, in Markdown: what its videos can show, a
      scene's own keys, and a whole video file as an example.
    - `check(scenes, library)`: the script checked against the library, and worked out. It gets
      each scene's line in the file, its own keys as written, and its lines that name one of the
      plugin's actions, in order, each with its line and its values as the action's schema gave
      them. It gives each scene's `setting` (how it begins) and each action's `values` and own
      `length`, seconds, all in plain numbers: numbers and names, in lists and tables. Or it gives
      `issues`, each `{ line, message, hint }`.
    - `draw(library)`: its picture. It gives a function, `(shown, size)` to SVG, that draws what a
      frame shows (see A script) as `frame` draws a moment: the whole stage, `width` × `height`
      pixels. A script's picture is drawn, never recorded.

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
  encoded (see Moments), and the data written again: each event at its span, the texts moved
  with their beats. A drawing plugin's SVG is turned into pixels by resvg (no fonts: a picture
  holds no text), and a frame whose SVG is the one before is not drawn again; beside the clip's
  `.frames`, `<clip>.svgs` holds a hash of each frame's SVG (its md5), a line a frame: what the web
  page draws is compared with it. A recording plugin's PNGs are encoded as they come, `.frames`
  holding the md5 of each, and it has no `.svgs`. A script has neither step: its check, and its
  clip drawn from the compiled scenario, as a drawing plugin's is.
- **The process:** `make` starts the host at the first stage it makes (none when each is in the
  cache), in the `package.json`'s folder, and closes it when it is done. Ready, the host says the
  plugin's scene, stage, picture (`drawn` or `recorded`), guide and commands (their descriptions
  and examples), and its script's guide and actions. Each call is a message (`Call`,
  `src/make.ts`), with the video file's source and the library, answered before the next; one that
  fails says why, and `make` stops there. `import`'s call mends, checks and plans a source and
  writes nothing. A script's two are its check, which writes nothing either, and its drawing, with
  the compiled scenario and the library and no video file. `src/host.test.ts` shows each case.

### A video file

A video is one file, `videos/<name>.yaml` (`src/video-file.ts`):

```yaml
use: cartoon        # the scene its plugin draws: the plugin's `scene`
loudness: -16       # optional: any of the settings, over the project's
characters: { … }   # every other key is the plugin's source, checked by the plugin
scenes: [ … ]
```

- **Its keys:** `use` and the settings are the tool's; the plugin checks the rest. The settings
  are `voice`, `cast`, `speed`, `fps`, `loudness`, `timing`, `quality` (`high` or `draft`, the
  render), and `outputs`.
- **Its outputs** are what `make` writes, each on or off: `outputs: { video: true, web: false }`,
  the server's. `video` is the video (see make), `web` its page (see The web page), made first
  when both are on. A project turns the pages on for all its videos with `"outputs": { "web":
  true }`, and a file `outputs: { video: false }` for its own. `--as video` or `--as web` makes
  that one, whatever they say; with both off and no `--as`, `make` is refused. They go into no
  stage's key: turned on or off, they redo nothing made.
- **Its lines** are written once, in the source: each of the plan's texts is a line, cued to the
  event it begins at, with the text's speaker (`linesOf`). A line's voice is its speaker's (see
  The cast), and single events' limits are the plan's (see Plugins). A speaker the cast gives no
  voice is refused, with the line.
- **Its format** is the one of its plugin's stage (1920 by 1080: landscape), and it has that
  one alone.
- **Its name** is the file's: what is made goes into `.cache/<name>/`, and the finished files are
  `out/<name>.mp4` and the page `out/<name>.html`, both in the project's folder, the
  `package.json`'s.

`src/video-file.test.ts` shows each rule.

### A script

A video may be written as a script: each of its scenes has a `script:`, a block of lines. The tool
reads and compiles them, and makes the sound, the picture, the captions and the web page from the
compiled scenario alone. `docs/plans/compiled-scenario.md` builds this step by step. The beats of
a cartoon and RayCraft's events go the way the rest of this file describes, as before.

```yaml
use: cartoon
scenes:
  - background: meadow            # a scene's own keys are the plugin's
    places: { pip: off-left }
    script: |                     # the tool's: a line for each thing that happens
      pip walk to=middle
      narrator say: This is Pip. Pip walks into the meadow.
```

- **A file is a script** when `scenes:` is a list and one of its scenes has a `script:`. Then every
  scene has one, written as a block (`script: |`), so that a line of the script is a line of the
  file (`writtenScript`, `src/video-file.ts`).
- **A line** is `who action name=value ...: text` (`readScript`, `src/scenario.ts`): who does it,
  the action, its values, each a number or a name, and after the first colon its text, as written
  to the end of the line. Names are lowercase letters, digits and dashes. An empty line, or one
  that begins with `#`, is passed over; a line is not indented.
- **`say`** is the tool's own action: the line's text, said in its speaker's voice (see The cast).
  `narrator` is the speaker nobody draws, and its lines are said in the video's `voice`. Every
  other action is the plugin's (see Plugins, `script`).
- **The check** (`checkScenario`) is the pass before the voices, and the only one that refuses:
  1. a line that is not one, an action nobody names, values the action's schema refuses, a `say`
     with no words or by someone with no voice;
  2. what the plugin's `script.check` refuses (a name the library lacks), run only on a script
     with no mistake so far, as it follows the lines in order;
  3. a speaker's voice that is not one of the tool's.

  Every mistake of a pass is shown, each with the file and its line, the line as written, what is
  wrong, and a hint: the names there are, the nearest one, the action's example.
- **`check <file>`** runs the check alone: it speaks and writes nothing, needs nothing from
  `setup`, and exits with 1 when it refuses. A video file that is not a script it takes as
  `import` takes an episode: mended, checked and planned by its plugin, every speaker with a voice
  the tool speaks in.
- **`make <file>`** runs the check, speaks and measures each said line (the voice cache), and
  writes the compiled scenario, `.cache/<name>/compiled.json`, with its timing shown; `--fit` stops
  there. Then it makes what any video's outputs say, as any video's (see make), from that file, read
  back. The check and the compiling run every time, in a second or so, so the plugin always starts.
- **The compiled scenario** (`compile`, `src/compile.ts`) has every line on whole frames of the
  video's `fps`: `from`, the frame of the video it begins on, and `frames`, how many it lasts.
  They are laid by the laws of What happens at once, for now each scene in order, its `lead`,
  `pause` and `tail` the video's `timing.lead`, `timing.gap` and `timing.tail`. A voice lasts the
  frames it sounds in, and an action its own length (the plugin's), to the nearest frame.
- **A said line** holds all of itself: its `text`, its voice's `file`, its `mouth` (how open, a
  number for each of its frames, as in Fitting a clip to the voice; the example shows three) and
  its `captions`. A caption stays up until the next one, a second after its words, or the scene's
  end. `loudness` is the video's (see How loud).
- **It holds plain values:** numbers, the lines' texts, file names (a voice's, in the tool's voice
  cache), and the names of the library and of actions. A mark is compiled to its point.

```json
{
  "format": "ai-videos-compiled",
  "version": 1,
  "made": { "by": "ai-videos compile", "from": "../../videos/hello-script.yaml" },
  "fps": 30,
  "frames": 289,
  "loudness": -14,
  "scenes": [
    {
      "from": 0,
      "frames": 289,
      "setting": { "background": "meadow", "characters": { "pip": { "at": [-250, 880], "facing": 1 } } },
      "lines": [
        { "line": 11, "who": "pip", "action": "walk", "from": 18, "frames": 113, "values": { "from": [-250, 880], "to": [960, 880] } },
        { "line": 12, "who": "narrator", "action": "say", "from": 143, "frames": 67, "text": "This is Pip. Pip walks into the meadow.", "file": "88d4ac005a4a53dca76a.wav",
          "mouth": [0, 0.56, 0.96], "captions": [{ "text": "This is Pip. Pip walks into the meadow.", "from": 143, "frames": 79 }] }
      ]
    }
  ]
}
```

- **What a frame shows** (`shownAt`, `src/shown.ts`) is worked out by the tool, for the host and for
  the web page: the scene's `setting`, its `actions` that have begun by the frame, in the order
  written, the `mouths` (as a moment's, but with the narrator's too) and the `time` since the video
  began, seconds. An action has its `who`, `action` and `values`, its `progress`, evenly from 0 on
  its first frame to 1 on the frame after its last, where it stays, and `into`, the seconds since it
  began. A plugin's `script.draw` draws that, and counts no frames of its own.
- **The build** (see make) has the clip and the captions, each on its own frames, and no voices: the
  video's sound is the tool's one track (see How loud), silent when nobody speaks.
- **The guide** to writing a script (`guideOf`, `src/guide.ts`) is the tool's part (a line's form,
  `say`, the order of lines), the plugin's `script.guide`, and the actions, each with its
  description and example. Each part's example is compiled by a test. The prompt for a web chat
  does not teach scripts yet.

`src/scenario.test.ts`, `src/compile.test.ts`, `src/shown.test.ts`, `src/guide.test.ts` and
`src/check.test.ts` show each rule; `src/page.test.ts` draws the clip and the page from a compiled
scenario and a library, with no video file, and finds their frames the same.

### What happens at once

When each line of a scenario begins and ends is worked out from the measured lengths by these laws
(`src/times.ts`), from a plan of lines and blocks written as data. `compile` lays a script's lines
with it. A script has no words yet for a block, an anchor or a cut, so its scenes are in order.
`src/times.md` proves what the laws promise, below, and `src/times.test.ts` tries it.

- **A line** is one thing that lasts: a voice, a sound, or a move (any of the plugin's actions). It
  keeps its **channels** busy: a character's voice, its place.
- **A block** holds lines and blocks, **in order** or **together**, and is used as a line is. A scene
  is a block in order, and so is the video, of its scenes.

The laws:

1. **Frames.** Every length and pause is in whole frames before anything is placed, so no rounding
   can break a law.
2. **A start** is the latest of three:
   - its block's rule, or its own anchor in place of it. In order: `pause` after everything above it
     that the block waits for has ended; the first begins with the block, a scene's `lead` later.
     Together: with the block;
   - its channels: everything written above on them has ended;
   - its block's start.
3. **An anchor** is the start, the end or a share of something above, or of its own block, plus or
   minus seconds. It is never before that thing begins. A cut thing's end is where it stops, and a
   share of it is of its whole length.
4. **An end** is the start plus the length.
   - Fixed: measured or given.
   - Fitted: a move given no length, directly in a block together. It ends with the last voice the
     block waits for, no faster than its `fastest` and no slower than its `slowest`. Told when to
     arrive, it is fitted to that moment instead. In order, with a start of its own, or with no voice
     to fit to, it takes its own length.
   - Open (a look, a loop): until its block ends.
5. **A block** ends with the last of what it waits for: all but the cut and the open. A scene ends
   its `tail` after that.
6. **Cut and open.**
   - A cut thing stops where its block ends, if it has not ended before. At a scene's own level that
     is the scene's last frame, after its `tail`.
   - Nothing waits for a cut or open thing: not its block, and not what follows it in order. But it
     holds its channels until the block ends.
   - A cut block cuts all that is in it. Inside it, everything is timed as if nothing cut it.
   - What has not begun when it is cut is not there.
   - Only voices and sounds are cut, never a move: where a move leaves its character must be known
     before the voices.
7. **Refused**, for any lengths, and so before the voices: an anchor to something that is not above;
   what follows a cut or open thing on its channel, in that thing's block; a cut move; and a loop,
   whole. A voice that waits for the end of its own block's fitted move is a loop: it goes after the
   block, or the move is given a length.

They promise:

- one timing for a plan, whatever the lengths;
- nothing begins before what it comes after;
- a block ends after all it waits for;
- what is cut ends with its block, and its length moves nothing but what is anchored to it;
- a longer voice begins nothing earlier;
- a channel never does two things, and keeps the written order.

### The cast

A video with several speakers gives each a voice. The library gives each character its `voice`
(see The library), which the tool takes as the cast, and a video file's own `cast:` goes over it,
speaker by speaker. A line's speaker comes from the plugin's plan: a text a character says names
it as `speaker` (lowercase letters, digits and dashes); the narrator's names none.

- A line's voice is its speaker's in the cast, else the video's `voice`, the narrator's
  (`voiceOf`, `src/script.ts`). A video with no speakers needs no cast.
- A speaker the cast does not name is refused when the video is made, with the line and the
  cast: it is never said in the video's voice.
- The request passes each line's speaker to the plugin, which moves that character's mouth (see
  Fitting a clip to the voice).
- The narration's log names the speaker and voice of each line said in another voice than the
  video's: `line 2 (pip, am_puck): 0.93s`.

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

A video file's settings come in layers, each over the one before, key by key (a table merges, so
`timing: { moves: { fastest: 1 } }` keeps `timing.gap`; a list is replaced):

1. the server's: the tool's defaults (`settings`, `src/script.ts`);
2. the project's: its `package.json`'s `"ai-videos"`, beside `plugin`, and its library's voices
   as its `cast` (see The library);
3. the file's;
4. a profile's, picked when making: `make <file> --profile quiet`.

The profiles are the tool's (`PROFILES`, `src/video-file.ts`): `youtube` (-14 LUFS), `quiet`
(-20 LUFS) and `draft` (the fast render). With a profile, the finished files take its name:
`out/<name>-quiet.mp4`, `.html`. A mistake is reported against the file that holds it: the
`package.json` or the video file. The project's settings are the user's; an AI changes them only
when asked.

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
| The video | the render's picture, the sound | `out/<name>.mp4`, written every time |
| The page | the sound, the source, the library, the request, the plugin's code, or a recording plugin's clip | `out/<name>.html`, written every time |

A script has no plan and no fit: its `compiled.json` is written every time (see A script). Its sound
is made from the voices' first frames, the video's frames and the loudness in it; its drawing from
the rest but the words and the captions (`pictureOf`, `src/shown.ts`), the library (but its voices)
and the plugin's code. The other stages are as any video's.

- The plugin's code is every file in the plugin's folder (but `node_modules` and dot folders)
  and the tool's files it runs through (`DRAWING`, or a script's `PLAYING`, `src/stages.ts`): keep
  the plugin in a folder of its own, as `cartoons`' `src/`.
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

### `make`

`npm run video -- make <file>` makes a video in these stages, in this order, each taken from the
cache when what it is made from is unchanged (see The cache), and stops at the first that fails
(`makeFile`, `src/cli.ts`). It holds the video's lock (see The cache) and writes only in the
project's `.cache/<name>/` and `out/`, but for the voice cache, which stays in the tool. A video
written as a script has its check in place of the plan, and is compiled in place of the fit (see A
script); its clip is checked against the frames compiled, and the rest is the same.

1. The plan: the plugin's step one (see Plugins), and what it mended, said.
2. The voices and the fit: each line spoken (from the voice cache when it has not changed) and
   measured, and the plan fitted to it (see Fitting a clip to the voice): the table, and the
   request. `--fit` stops here, in seconds, to try the lines and `timing` before anything is drawn.
3. The sound: the voices mixed at the video's loudness (see How loud).

Then what its outputs turn on (see A video file), or the one `--as` names:

4. The page (see The web page).
5. The drawing: the plugin's step two, the clip drawn to the request (a recording plugin's comes
   before the page, which plays it).
6. Check: the drawn clip read back (see The clip and its JSON), the build composed into
   `.cache/<name>/build/<format>/` and checked by HyperFrames. A clip not drawn to its request, or
   a check's error, stops it.
7. The video: the build rendered, its picture with the sound, into `out/<name>.mp4`.

### Moments

The host draws the clip a frame at a time, and gives the plugin the moment each frame shows:
`moments(request)` (`src/moments.ts`) gives one for each of the request's `frames`, in order. It is
pure, so the web page draws its frames with it too, and `ai-videos/plugin` exports it for a
plugin's tests (`cartoons`' `src/plugin.test.ts`).

- `span`: which of the request's spans the frame is in, counted from 0. Each span begins on the
  frame its `at` names; a request whose spans do not follow each other on whole frames is refused.
- `progress`: how far through the span's motion, 0 to 1. A move goes evenly from 0 over its
  `move` seconds (its `duration`, when the request gives no `move`) and stays at 1 for the rest; a
  hold is at 0. Easing is the plugin's, and so is what the spans before it left behind.
- `time` and `into`: the seconds since the clip began, and since the span did.
- `mouths`: how open each speaker's mouth is, by name, above 0 to 1, from the lines' tracks. A
  speaker it does not name has a closed mouth; a line with no speaker opens none. Where two of one
  speaker's lines meet in a frame, the wider mouth shows.

The rest of the drawing is the host's (`src/frames.ts`): each picture encoded by ffmpeg (on the
PATH) into H.264, 4:2:0, marked BT.709, crf 17, with nothing in it that differs by run (dates, the
encoder's name); `<clip>.frames` beside it, a hash of each frame as given (its pixels, or its PNG's
bytes), a line a frame, so two runs that drew the same pictures have the same file, and where they
differ the line is the frame; and the clip's JSON (see The clip and its JSON). A picture held is
the same buffer again, and is not hashed again. `src/frames.test.ts` shows each, and that their
types are the ones `fit` writes and `clip` reads.

### The web page

`make <file> --as web`, or `make <file>` with `outputs: { web: true }` (off by default, see A video
file), writes `out/<name>.html` (`src/page.ts`): one file that plays as the video does, offline. It
needs the voices but not HyperFrames' Chrome, and it is made from the stages both modes share (and
a recording plugin's drawing), so a page made after the video speaks, fits, mixes and draws nothing
again.

- **The picture:** the plugin's module and the tool's `moments`, bundled for a browser by esbuild,
  with the video file's source, the library and the request. The page mends and checks the source
  as the host does, then draws each frame's SVG with the plugin's `frame`: the SVG the video's
  frame was drawn from. `src/page.test.ts` runs the page's drawing with no Node and no page, and
  finds each frame's SVG the same as the video's `.svgs`. A plugin that does not bundle (it
  imports a Node module) is refused, with esbuild's reason. A recording plugin's picture is its
  clip instead, the drawing's `.mp4` in the file as it is, played muted with the sound: set on the
  sound's time when the two are more than two frames apart, and on the frame itself while paused.
  Its code is not bundled. A script's page has the compiled scenario's picture (`pictureOf`) and
  the library, in place of the source and the request: `shownAt` in place of `moments`, and the
  plugin's `script.draw` in place of its `frame`.
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

The rest comes with `npm ci`: the voices (in kokoro-js), GSAP and the captions' font, which each
build carries in `assets/vendor/` (`src/bundle.ts`), so a build names no URL, and esbuild, which
bundles a web page's drawing (see The web page). Running `setup` again keeps what is there and only
checks it.

Every other command first checks that what it needs is on the disk (`src/setup.ts`): the voice
model's files, and for anything HyperFrames draws or checks, its Chrome. A piece missing stops the
command before it writes anything, naming the piece and where it should be, with "run setup":
nothing is fetched. HyperFrames gets its Chrome by path (`HYPERFRAMES_BROWSER_PATH`), so it never
downloads one, and runs with its update check off. `src/setup.test.ts` and `src/bundle.test.ts`
show each case.

A cloud service (a voice, an avatar) would be a command of its own, run before `make` and writing
files into the project, so that `make` stays offline.

### What an AI writes

An AI session writes sources: a video file, a project's library, or a project's own sources (a
RayCraft tutorial). It never writes a made file, and it is never a step of `make`: no command calls
a model but the voice on this machine. A `package.json`'s settings are the user's; an AI changes
them only when asked. A web chat writes no file at all: its reply to the prompt is imported (see
`prompt`, `import`).

## How loud

A video's soundtrack is the tool's own (`src/sound.ts`): each line's voice laid where the timeline
starts it, on a track as long as the video, and brought once to the video's `loudness` (LUFS,
default -14, the level YouTube and most platforms play at; -16 or -20 is quieter), its peaks 1.5 dB
below full scale: stereo, the voice in both channels. A line's own level doesn't matter: this step
sets the whole. The video puts it with the render's picture, and the web page plays the same file.

## How timing works

The voice sets the clock. Each line is synthesized and measured, lines are laid end to end with
the pauses in `timing` (`lead`, `gap`, `tail`), and the plugin's clip is drawn again to fit those
times (see Fitting a clip to the voice). Changing a sentence re-times everything after it; nothing
is timed by hand.

## The clip and its JSON

A video's picture is its plugin's clip, played muted with the lines as captions over it
(`scenes/clip/`). The tool reads the JSON beside the clip and never looks inside the picture. The
host writes it twice (see Plugins): the plan, `.cache/<name>/plan.json`, the clip at its own pace;
then the drawn clip's, `clips/<name>-<format>.json` beside its `.mp4`, each event at its span. The
schema is `ClipData` in `src/clip.ts`:

```json
{
  "format": "ai-videos-clip",
  "version": 1,
  "made": { "by": "the cartoon plugin, src/plugin.ts", "from": "videos/meet.yaml, drawn to meet-landscape.request.json" },
  "duration": 13,
  "events": [
    { "name": "start", "at": 0, "span": "hold", "natural": 5 },
    { "name": "slide", "at": 5, "span": "move", "natural": 1.5 },
    { "name": "across", "at": 6.5, "span": "hold", "natural": 6.5 }
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
  end) is a `hold`, where nothing moves, or a `move`. Each line is cued to the event its text begins
  at, in the clip's order.
- A clip drawn to a request (below) gives each event `natural`: its span's length at the clip's
  own pace, from the request. Fitting starts from it, so a move sped up once is not sped up again.
- `texts` are the clip's own words and when they apply (`from`, `to`, seconds): each is a line of
  the video (see A video file). A text one of the clip's characters says names it as `speaker`; a
  text with none is the narrator's.
- The tool plays a clip as it was drawn. A cued line waits until the clip reaches its event, and
  the scene lasts until both the clip and the voice are done; past the clip's end, a still of its
  last frame holds. The log notes each line that waits for its event longer than a frame or
  starts later after it than the scene's `lead`.
- Captions are the lines, long ones split, in the area social apps leave clear. Each
  stays through the pause after its words, at most 1 s.
- The drawn clip is read back before the build (`loadClip`): a clip or its JSON missing, JSON the
  schema refuses, or a length that does not match stops `make` with the reason.
  `src/clip.test.ts` covers each.

### Fitting a clip to the voice

The voice sets the clock; the clip is drawn again to fit it. The tool never retimes video itself:
`make` fits the plan to the voice (`--fit` shows it, before anything is drawn), and the plugin
draws the clip to the request.

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
- The plan's `limits` (see Plugins) give single events their own: a move its `slowest` and
  `fastest` instead of `timing.moves`' (the fly-around faster than the rest), a hold the `least`
  it shrinks to instead of a frame (a picture shown 2 s before the next line, the voice waiting
  for it). A `least` longer than the hold makes it that long.
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

The request also lists the lines, in the video's order, each with its voice as measured:

```json
{ "text": "Here I go!", "speaker": "square", "cue": "slide", "at": 5.033, "waits": 0, "duration": 1.544,
  "mouth": { "frame": 151, "open": [0.31, 1, 0.82, 0, 0, 0.64, 0.9, 0.12] } }
```

- `speaker` is who says the line (see The cast): the track is that character's mouth. A line with
  no speaker has no such key: nobody on screen says it, so its track moves no mouth.
- `at` is when the voice begins the line, from the clip's start, and `waits` how long it waits
  there for the clip. `duration` is the voice's length: the line sounds from `at` for `duration`.
- `mouth` is how open a mouth is while the line sounds, a number for each frame of the clip (the
  request's `fps`): `open[k]` is for frame `frame + k`, and `frame` is the frame the line begins in.
  0 is closed and 1 is the line's loudest frame. A plugin with a talking character draws its mouth
  from it (`mouths`, see Moments); in a frame no line's track covers, nobody speaks.
- The track follows the voice's loudness, not its phonemes (`src/mouth.ts`): a frame's loudness is
  compared with the line's loudest, on the decibel scale, and 30 dB under it is closed. So the
  mouth is closed in the pauses between a line's sentences. `src/mouth.test.ts` shows it.

## The scene template

`scenes/clip/scene.html` follows the HyperFrames contract (see the `hyperframes` skill,
`references/format.md`): everything inside `<template>`, root styled as `#root`, one paused GSAP
timeline registered as `window.__timelines[id]`, and every tween a `fromTo` with
`immediateRender: false` so any frame can be drawn on its own. No timers, no `Date.now()`, no
unseeded randomness, no network calls. In portrait, the captions keep between x 120 and 888 and
end above y 1248, the area social apps leave clear.

## Known quirks

- HyperFrames is pinned to an exact version in `package.json`; it releases several times a day.
  Upgrade deliberately, then run `setup` (the new version may pin another Chrome) and a make. GSAP
  is pinned to the version HyperFrames pins (`gsap` in `package.json`).
- After a check, HyperFrames keeps a helper process in the build folder for a few minutes, so that
  folder cannot be deleted on Windows until it exits. `compose` clears only its own subfolders.
- HyperFrames' check writes its progress a line a step (`check: craft 1/599`, 634 lines for
  water-switch). `make` folds them into a line per phase, on its last count, written over in place
  on a terminal (`src/progress.ts`); its status, warnings, errors and verdict show as they come. A
  new HyperFrames that words its counts otherwise shows them all again, unfolded.
- HyperFrames telemetry is disabled on this machine (`npx hyperframes telemetry disable`). Its update
  check, which asks npm from a process that outlives the command, is off for every run of the tool
  (`HYPERFRAMES_NO_UPDATE_CHECK`, set in `src/cli.ts`).
- Captions come from the lines and their timings; long lines are split in proportion to their
  length, not by word timestamps.
- A clip with long holds gets HyperFrames' "sparse keyframes" warning at render: few keyframes make
  preview seeking slow; rendering is unaffected.
- A clip with more than a few captions gets HyperFrames' `timeline_track_too_dense` warning (a
  caption is a timed element): a size hint, not a fault.
- A script's build holds no voices, so its check says `audio_none`, "The film has no sound": the
  sound is put with the render (`muxSound`).
- HyperFrames counts a length's frames upwards, so a video whose length in milliseconds is rounded
  up renders a frame more than its request (`hello`: 165 for 164), held. A script's times are given a
  hair early (`frameTime`, `src/compose.ts`), and render the frames compiled.
