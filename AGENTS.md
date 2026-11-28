# ai-videos

A local animation server. A project gives it a plugin that draws (or records) its scenes, and
keeps each video as one YAML file; a local voice (Kokoro, or Supertonic in Ukrainian and Russian)
says its lines, the plugin's clip is drawn to fit them, and HyperFrames renders the clip with its
captions to MP4, or the tool writes a web page that plays the same. Everything runs locally on
Node; there is no Python in this project.

## Commands

```
npm run video -- setup                        once: fetch the voice models, what marks a word's stress, and HyperFrames' Chrome (see Offline)
npm run video -- make <dir>/<name>.yaml       a video, from its one file (see Projects, make)
npm run video -- make <file> --fit            only the plan and the fit, in seconds
npm run video -- make <file> --profile quiet  the same, a profile's settings over the rest
npm run video -- make <file> --as web         its web page: one HTML file that plays offline (see The web page)
npm run video -- story <story>.md             a story to its videos, by a web chat and the clipboard (see Projects, story)
npm run video -- serve                        in a project: a page in a browser that wraps a story's text in its prompt, imports the chat's answers, and makes and plays its videos (see Projects, serve)
npm run -s video -- prompt <story>.md         the prompt for a web chat, on stdout (see Projects, prompt)
npm run -s video -- prompt <story>.md --language uk   the same for episodes in Ukrainian (or ru), and story too
npm run video -- import <reply file>          the chat's reply: its episodes as video files (see Projects, import)
npm run -s video -- check <dir>/<name>.yaml   a video file checked, with nothing spoken or written (see A script)
npm run video -- voices ["text"]              the voices, and samples in out/voice-samples/ (see The voices)
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
the voice models always stay in this tool.

## Layout

| Path | What it is |
| --- | --- |
| `scenes/clip/scene.html` | The scene template (a HyperFrames sub-composition with `{{placeholders}}`): the plugin's clip, muted, with the captions over it. |
| `src/` | The pipeline: `video-file` (the file, its settings in layers, and the `script` the pipeline reads) → the plugin in its process (`plugin`, `make`, `host`): its plan → `tts` (with `supertonic`) → `timeline` (and `fit` with `mouth`) → `sound` → the drawing (`moments`, `frames`, `clip`) → `compose` (with `bundle` and `captions`) → `render`; `page`, the web page; `stages` and `lock`, a make's cache and its lock (see The cache); `setup`, what the commands need on the disk; `prompt` and `import`, a story's prompt for a web chat and its reply taken in, and `story`, the two by the clipboard and the episodes made (see prompt, import, story); `serve`, a story's text taken, its prompt given, the chat's answers imported and its episodes made by a page in a browser, the page being `serve.html` (see serve); `loudness`, how loud a voice or a sound is (see How loud); `stress`, a word's stress marked in a line, and `marks` (with `stress-uk` and `marisa`, `stress-ru`, and `pinned`), the tool's own marks (see A word's stress); `read`, `scenario` with `names` and `labels`, `values` with `formula`, `plan` with `times` and `words`, `compile`, `shown` and `guide` (with `guide-uk` and `guide-ru`), a video written as a script: its lines and blocks read and checked, what its values come to, when each begins and ends, compiled, what each frame of it shows, and how it is taught, in each language (see A script, Values, What happens at once), and `check`, the check of a script as `check`, `make` and `import` run it; `random`, what every random test draws from, to say how many different scripts or plans it tried. |
| `cartoons/` | A project of the tool's, in this repo: the cartoon plugin (`cartoons/src/plugin.ts`), its library, videos and stories, and its notes, `cartoons/CLAUDE.md`. Its `episode` skill is the repo's, `.claude/skills/episode/`. |
| `out/voice-samples/` | What `voices` writes. |
| `.cache/tts/` | Narration audio, keyed by text, voice and speed. |
| `.cache/models/` | The voice models, each under its name, fetched by `setup`. |
| `.cache/setup.json` | Where `setup` found HyperFrames' Chrome, and for which HyperFrames. |

`AI_VIDEOS_CACHE` moves the whole `.cache/` elsewhere (the tests give it an empty folder).

## Projects

A project (`cartoons/` in this repo, RayCraft's `media/`) keeps each video as one file, `videos/<name>.yaml`.
Its `package.json` names its plugin and holds the settings its videos share, and its
`library.yaml` what they name (see A video file, The library). This section is the contract
between the tool and a project.

### Plugins

A project's plugin draws its videos: a module the tool runs in a child process of its own
(`src/host.ts`). `cartoons/` has one whose videos are scripts alone (its `src/plugin.ts`), RayCraft
one that plans and records (its `media/plugin/plugin.ts`: a tutorial played by the editor in Chrome).

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
- **What it is:** the module's default export, `Plugin` in `src/plugin.ts`: its `scene` and its
  `stage`, and the plan's part (from `commands` to its picture, below), its `script`, or both. A
  plugin with neither, or with some of the plan's part and not all, is refused when it loads.
  - `scene`: the scene it draws (`cartoon`): a video file's `use:` names it.
  - `stage`: the size its picture is drawn at. The video's format is the one of its shape; a stage
    no format has the shape of is refused.
  - `commands`: what its source's events may do, by name, each described once: a `description`,
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
    it has no such videos; for a video that is one, none of the functions above is called. A plugin
    with it and none of the plan's part has scripts alone: a video file that is not one is refused,
    by `make`, `check` and `import` alike.
    - `actions`: what a line may do besides the tool's `say`, `play` and `loop`, by name, each described once: a
      `description`, an `example` (one line of a script that names it: `pip walk to=middle`) and
      `values`, a schema of the values a line gives it. An example that is no such line, or fails
      its schema, is refused when the plugin loads. A value its JSON Schema names may be set on any
      level (see Values); one with a name of the tool's own is refused. It names its `channels`, one
      at least: what of its character it keeps busy (`["place"]`; `voice` is what is said with), each
      of which does one thing at a time (see What happens at once). With `fits: true` it is fitted
      to the words it is together with, when it is given no length; with `open: true` it goes on to
      the end of its block; any other takes its own.
    - `names`, optional: its names for numbers (`slow: 0.6`), which any value may use. One that is a
      value's name is refused.
    - `constructions`, optional: the values it works out from others (`left-of(pip, near)`), by name,
      each described once: a `description` and an `example`, refused when it is none of it. The tool
      reads one and works out what is in its parentheses (see Values); what it comes to, or that it
      has no answer, is the check's to say.
    - `tables`, optional: the scene's own keys that are tables of formulas, each by whose it is
      (`places: { mo: left }`).
    - `guide`: its part of the guide to writing a script, in Markdown: what its videos can show, a
      scene's own keys, and a whole video file as an example.
    - **In each language:** its `guide`, and each action's and construction's `description`, is one
      text, in English, or one in each language it writes, by its code, as a voice is (see A
      video's language): `guide: { en: …, uk: …, ru: … }`. All are in the same languages, each one
      of the tool's, else the plugin is refused when it loads. The guide's example in a language is
      a video in it.
    - `check(scenes, library)`: the script checked against the library, and worked out. It gets
      each scene's line in the file, its own keys (what is in its `tables` worked out, the rest as
      written), and its lines that name one of the
      plugin's actions, in order, each with its line, its values, worked out, as the action's
      schema gave them, and `begun`, the lines of the scene's other actions that have surely begun before
      its end (see What happens at once). It gives each scene's `setting` (how it begins) and each action's `values` and own
      `length`, seconds, which an open one has not, all in plain numbers: numbers and names, in lists
      and tables. Or it gives `issues`, each `{ line, message, hint }`.
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
  with their events. A drawing plugin's SVG is turned into pixels by resvg (no fonts: a picture
  holds no text), and a frame whose SVG is the one before is not drawn again; beside the clip's
  `.frames`, `<clip>.svgs` holds a hash of each frame's SVG (its md5), a line a frame: what the web
  page draws is compared with it. A recording plugin's PNGs are encoded as they come, `.frames`
  holding the md5 of each, and it has no `.svgs`. A script has neither step: its check, and its
  clip drawn from the compiled scenario, as a drawing plugin's is.
- **The process:** `make` starts the host at the first stage it makes (none when each is in the
  cache), in the `package.json`'s folder, and closes it when it is done. Ready, the host says the
  plugin's scene, stage, picture (`drawn` or `recorded`), guide and commands (their descriptions
  and examples), and its script's guide, actions and constructions, the guide and each description
  by language (one written once as `en`). Each call is a message (`Call`,
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
  are `language` (see A video's language), `voice`, `cast`, `speed`, `fps`, `loudness`, `timing`,
  `quality` (`high` or `draft`, the render), and `outputs`.
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
compiled scenario (and the library's drawings and sound files) alone. `docs/plans/done/compiled-scenario.md` built it step by step.
RayCraft's events go the way the rest of this file describes, as before.

```yaml
use: cartoon
scenes:
  - background: meadow            # a scene's own keys are the plugin's
    places: { pip: off-left }
    script: |                     # the tool's: a row for each thing that happens
      pip walk to=middle
      & narrator say: This is Pip. Pip walks into the meadow.
      [a] pip say: Good morning, everybody!
      mo say @ a.word(everybody): Everybody?
```

- **A file is a script** when `scenes:` is a list and one of its scenes has a `script:`. Then every
  scene has one, written as a block (`script: |`), so that a line of the script is a line of the
  file (`writtenScript`, `src/video-file.ts`). Beside its scenes it has the tool's keys, `values:`
  (see Values) and a `script:` of its own (below), and any other key is refused: nothing reads it.
- **A line** is `who action name=value ... @ moment: text` (`readScript`, `src/read.ts`): who does
  it, the action, its values, each a formula (see Values), its anchor, and after the first colon its
  text, as written to the end of the line. Names are lowercase letters, digits and dashes. An empty
  row, or one that begins with `#`, is passed over. Lines happen in order, if nothing says otherwise.
- **A block** is a header on a row of its own, and the rows indented under it, all by the same
  spaces; they may be blocks too. Values set on it go before its anchor and its colon:
  `in order pause=0.2s @ a.50%:`. It is `in order:`, `together:`, `ending together:`, whose lines end at
  once, the shorter ones begun later, or `under:`, which is in order and cut (What happens at once): it
  goes on under the rest of the block it is in, and stops where that ends. What is waited for needs no
  word: a radio in a `together:` holds up what comes after it.
- **`&`** before a row joins it to the one above it, a line or a block: the two are a block together
  with no header, and a third one joined is in the same. It begins where its first does, so it takes
  that one's anchor.
- **A label**, `[a]` before a line or a header (after the `&`), is what an anchor calls it, given once
  in a scene. `prev` is the line or the whole block just above, and `block` the block a row is
  written in: joined rows have no header, so they are no block here.
- **An anchor**, an `@` and a moment, is the last thing before the colon, and begins a line or a block
  at that moment in place of its block's rule: `a.start`, `a.end`, `a.50%` or `a.word(mole)`, then
  seconds more or less, a formula: `+ 0.5s`, `- beat / 2`. A word is as the line says it, with its stress mark or without (see A word's stress), and one place of it: several in a row
  (`a.word(the mole)`) where one is said twice. When it is said is estimated from the text alone
  (`sharesOf`, `src/words.ts`): a letter weighs 1, a comma 4 and a sentence's end 6, which is off by
  0.08 s on average, and at most 0.21, where the cached voices make a pause.
- **`say`** is the tool's own action: the line's text, said in its speaker's voice (see The cast).
  `narrator` is the speaker nobody draws, and its lines are said in the video's `voice`. Every
  other action, but the two below, is the plugin's (see Plugins, `script`), and whose line it may be is for its
  check to say. One that nobody does has a name of the plugin's for its who (a cartoon's
  `scene background to=night`), with channels of its own, as a character's.
- **`play` and `loop`** are the tool's own too, and a sound's: `bell play`, whose who is one of the library's
  sounds (see The library), plays its file once, and `rain loop` again and again. It takes a `volume` and nothing
  else. Played once, it is a line as a voice is, as long as its file: waited for, cut, anchored, named and read the
  length of. Looped, it is open. Each sound is a channel of its own, `sound`, of its name. It has no mouth
  and no caption, and no action is fitted to it.
- **The cartoon's own script**, a `script:` on top of the file, beside its scenes, has sounds alone, which go on
  over all of them: each of its rows, a line or a block, begins with the cartoon, if it has no anchor, and is
  under the scenes, which wait for none of it; what has not ended is cut where the last one ends. In it, `block` is the
  cartoon (`@ block.end - 10s`), and its labels are its own. Music that goes on from one scene into the next is
  in it.
- **The check** (`checkScenario`) is the pass before the voices, and the only one that refuses:
  1. a row that does not read, a value that a comma cuts (see Values), an action nobody names, values
     the action's schema refuses, a `say`
     with no words or by someone with no voice, a sound the library lacks, what is no sound in the cartoon's own
     script; and, when every row reads, a value with no answer (see
     Values), and what has no time (`timeIssues`, `src/plan.ts`): an anchor to something below it, in another scene or not there, or
     to a word that is not one place of its line; what the laws refuse (What happens at once); and an
     `under:` that would never be heard, or an open action never seen, last in a block in order with no
     anchor, or with nothing else in its block;
  2. what the plugin's `script.check` refuses (a name the library lacks), run only on a script
     with no mistake so far, as it follows the lines in order;
  3. a speaker's voice that is not one of the tool's in the video's language (see A video's language), a stress mark that is
     not right after a vowel (see A word's stress), and a sound that is played whose file is missing, or holds no
     sound that ffmpeg reads (`measureSound`, `src/sound.ts`): how long each lasts is known from here on.

  Every mistake of a pass is shown, each with the file and its line, the line as written, what is
  wrong, the other lines it is between, as written too, and a hint: the names there are, the nearest
  one, the action's example.
- **`check <file>`** runs the check alone: it speaks and writes nothing, needs nothing from
  `setup` (for a script that plays sounds, ffmpeg), says the defaults taken (see Values), and exits with 1 when it refuses. A video file that is not a script it takes as
  `import` takes an episode: mended, checked and planned by its plugin, every speaker with a voice
  the tool speaks in, in the video's language. Of a video in Ukrainian or Russian it then lists the
  words whose stress the tool is not sure of (see A word's stress), when what marks them is on the
  disk; with none, it says that it did not look.
- **`make <file>`** runs the check, speaks and measures each said line (the voice cache), and
  writes the compiled scenario, `.cache/<name>/compiled.json`, with its timing shown; `--fit` stops
  there. Then it makes what any video's outputs say, as any video's (see make), from that file, read
  back. The check and the compiling run every time, in a second or so, so the plugin always starts.
- **The compiled scenario** (`compile`, `src/compile.ts`) has every line on whole frames of the
  video's `fps`: `from`, the frame of the video it begins on, and `frames`, how many it lasts.
  They are laid by the laws of What happens at once, each scene in order, with the `lead`, `pause` and
  `tail` that Values gives it, and each block's `pause`. A voice lasts the frames it sounds in, as a sound does, and an
  action the length it is given, its own (the plugin's) when it is given none, to the nearest frame, or,
  one that is fitted, what it is fitted to takes, within `timing.moves`; an open one, or a looped sound, goes on to its
  block's end. A cut voice has the frames it
  sounds in, and so its mouth, its captions and the voice itself stop there; a line whose block ends
  before it begins is not there (`make` says so).
- **A said line** holds all of itself: its `text`, its `volume` (decibels, see Values), its voice's
  `file`, its `mouth` (how open, a number for each of its frames, as in Fitting a clip to the voice;
  the example shows three) and its `captions`. `loudness` is the video's (see How loud).
- **Its captions** (`rowsOf`, `src/captions.ts`): each is up through its words, whatever else is said,
  and then until another begins, a second after them (a cut line's, to the cut), or the scene's end. A
  line that sounds alone has its captions as any video's line. One that sounds at once with another has
  them, all through, in a small `row` of its own, each piece one row long: the upper, 1, when it is
  free as the line begins, else the lower, 2. So of two the one begun first is above, or of two begun
  together the one written first, and a row is kept while its line sounds. Two at most have captions at
  once: of three, the quietest has none, and of equally loud ones the one begun last, or written last.
- **A played line** holds its `sound`, the file, a path from the project's folder, and its `volume`; one that is
  looped is played again and again in its frames. The cartoon's own are the compiled scenario's `lines`, beside
  its `scenes`; with no script of its own it has none.
- **It holds plain values,** no name of a value, no formula and no construction: numbers, the lines' texts, file names (a voice's, in the tool's voice
  cache, a sound's, in the project), and the names of the library and of actions. A place is compiled to its point.

```json
{
  "format": "ai-videos-compiled",
  "version": 1,
  "made": { "by": "ai-videos compile", "from": "../../videos/hello.yaml" },
  "fps": 30,
  "frames": 164,
  "loudness": -14,
  "scenes": [
    {
      "from": 0,
      "frames": 164,
      "setting": { "background": "meadow", "characters": { "pip": { "at": [-250, 880], "facing": 1 } } },
      "lines": [
        { "line": 11, "who": "pip", "action": "walk", "from": 18, "frames": 67, "values": { "from": [-250, 880], "to": [960, 880] } },
        { "line": 12, "who": "narrator", "action": "say", "from": 18, "frames": 67, "text": "This is Pip. Pip walks into the meadow.", "volume": 0, "file": "88d4ac005a4a53dca76a.wav",
          "mouth": [0, 0.56, 0.96], "captions": [{ "text": "This is Pip. Pip walks into the meadow.", "from": 18, "frames": 79 }] }
      ]
    }
  ]
}
```

- **What a frame shows** (`shownAt`, `src/shown.ts`) is worked out by the tool, for the host and for
  the web page: the scene's `setting`, its `actions` that have begun by the frame, in the order
  written, the `mouths` (as a moment's, but with the narrator's too) and the `time` since the video
  began, seconds. An action has its `who`, `action` and `values`, its `progress`, evenly from 0 on
  its first frame to 1 on the frame after its last, where it stays, `into`, the seconds since it
  began, and `length`, the seconds it lasts. A plugin's `script.draw` draws that, and counts no frames of
  its own: `into` and `length` say how far through each was at any moment before, such as the end of
  another (what a cartoon's look leaves is how it was then).
- **The build** (see make) has the clip and the captions, each on its own frames (the lower row on a
  track of its own), and no voices: the
  video's sound is the tool's one track (see How loud), silent when nothing is said or played. A sound is no part of
  the picture either: what is played, when and how loud, draws nothing.
- **The guide** to writing a script (`guideOf`, `src/guide.ts`) is the tool's part (a line's form,
  `say`, a word's stress, blocks, joining, channels, anchors, values, sounds, what is refused), the plugin's `script.guide`, the actions
  and the constructions, each with its description and example, an action with its channels and whether it is fitted or open, and the plugin's names for numbers. Each part's examples are compiled by a test. It is
  made in a language, and all of it is in it but the code: the tool's part in English, Ukrainian or Russian
  (`src/guide-uk.ts`, `src/guide-ru.ts`, the same rows in its examples, only the words in their language), and
  the plugin's texts those in it; a plugin that writes none in it is refused. It is the format in the prompt for a
  web chat (see `prompt`), in the episodes' language.

`src/read.test.ts`, `src/formula.test.ts`, `src/values.test.ts`, `src/scenario.test.ts`,
`src/plan.test.ts`, `src/words.test.ts`,
`src/compile.test.ts`, `src/captions.test.ts`, `src/shown.test.ts`, `src/guide.test.ts` and
`src/check.test.ts` show each rule; `src/scripts.test.ts` writes random video files, values on every
level, and tries that none throws and that each with no mistake compiles to a whole scenario, its
captions as a plain re-telling of the rules has them (`RANDOM_SCRIPTS=40000` for more of them than
`npm test` tries); `src/sound.test.ts` finds each voice and each sound of a script in its sound; `src/page.test.ts` draws the clip and the page from a compiled
scenario and a library, with no video file, and finds their frames the same.

### Values

What a line, a block, a scene or the cartoon sets, by name (`workOut`, `src/values.ts`):

```yaml
values: { beat: 0.4s, pause: beat, walk.speed: slow }   # the cartoon
scenes:
  - background: meadow
    values: { beat: 0.8s }                              # a scene
    script: |
      in order pause=beat / 4 pip.speed=fast:           # a block
        [a] pip say: Good morning, everybody!
        mo walk to=left takes=a.length / 2              # a line
```

The laws:

1. **A value** is a number (`150`, `0.5s`, `-12dB`, `50%`), a name, or a formula of these, with `+ - * /` and
   parentheses (`src/formula.ts`). A name has dashes of its own, so a minus has a space on each side.
   A time is in seconds and a volume in decibels: each adds up with its own kind, and is multiplied and
   divided by numbers. What it comes to is in
   whole millionths, so `0.1 + 0.2 - 0.3` is 0. A name that nothing sets is itself (`middle`, a mark); a
   character's is the character, and no value has it.
2. **Levels.** A line's own values, its block's, the block's around that, its scene's, the cartoon's;
   above them the plugin's `names`, the library's volumes and the video's `timing` (its `gap` is the
   `pause`). The nearest wins.
3. **For whom.** `speed` is for everything, `walk.speed` for an action, `pip.speed` for a character. Of
   one level, the character's goes over the action's, and both over everything's; a nearer level goes
   over all three. A line's own has no dot.
4. **A formula is inherited as it is written,** and worked out for each line that reads it, by what its
   names are there. So above, the pauses of the scene are 0.8 s, as its `beat` is.
5. **A construction** is one of the plugin's (see Plugins), its name and in parentheses what it is worked
   out from, each a value: `left-of(midpoint(pip, door), near * 2)`. It is a value by itself, or in
   another's parentheses, and no number: nothing is added to it. In it is no time, no moment and no
   line's length. The plugin gets its name, the numbers worked out and the names that nothing sets.
   A value of an action's may be one, and what is in a plugin's `tables`, worked out at the scene's level,
   each for whose it is. Between `{` and `}` YAML ends a value at a comma: there it is in quotes, or the
   mapping has a row for each.
6. **One formula.** How long an action lasts is given once: by the nearest of `takes`, `speed` and
   `arrive`, whichever it is. Two equally near are refused. So are values that go round, with their
   chain.
7. **The tool's own** values:

   | Name | Set on | What it is |
   | --- | --- | --- |
   | `pause` | the cartoon, a scene, a block | seconds between what is in order |
   | `lead`, `tail` | the cartoon, a scene | seconds before a scene's first line, and after its last |
   | `takes` | any level | an action's seconds |
   | `speed` | any level | times the action's own speed (2 is twice as fast) |
   | `arrive` | any level | the moment above that it ends at, as an anchor's, within `timing.moves` |
   | `volume` | any level | how loud what is said or played is, decibels over any other voice's 0 (see How loud): from -60 to 12 |

   Given `takes` or `speed`, wherever they are set, an action keeps it and is fitted to nothing; one whose
   plugin says it is never fitted has its own speed, as if given `speed=1`. A voice, a sound and an open action
   take none of the three, and those set on a level are not for them; an action in an `ending together:`
   takes no `arrive`. A `volume` is for what is said or played alone: no action has one, `say.volume`, `play.volume`
   and `loop.volume` are for all that is so, and `radio.volume` and `rain.volume` for one. A value set for a sound is
   its volume and no other. Beside these, what an action
   takes (`to`) may be set on any level, and any name of the writer's that a formula reads.
8. **`a.length`** is how long a line above lasts: one that is said, or played once, or an action given `takes` or
   `speed`, or never fitted. How long a fitted action lasts, an open one or a block, is known only once everything has
   its place, and is not read. A length is read by a time alone (`takes`, `pause`, an anchor's), and what that comes to
   is kept in bounds: `5s - a.length` is a frame at least for an action, and none at least for a pause.
9. **Said:** the defaults taken, with their lines, by `check` and `make`. **Refused,** each at the line
   that sets it, with those that read it: a value of the wrong kind, a name nothing reads, that is a
   character's, whose nobody is, or that is another level's. What is wrong in a plugin's table is said at
   the scene's line.

### What happens at once

When each line of a scenario begins and ends is worked out from the measured lengths by these laws
(`src/times.ts`), from a plan of lines and blocks written as data. `planOf` (`src/plan.ts`) makes it
from a script (see A script for the words): what a character says is on its channel `voice`, and an
action on the channels the plugin names (see Plugins). `compile` lays it. `src/times.md` proves what the
laws promise, below; `src/times.test.ts` tries it on random plans, and `src/scripts.test.ts` on random scripts.

- **A line** is one thing that lasts: a voice, a sound, or a move (any of the plugin's actions). It
  keeps its **channels** busy: a character's voice, its place, its arm, a sound itself. Lines on other channels go on at
  once, one character's too.
- **A block** holds lines and blocks, **in order** or **together**, or lines alone, **ending
  together**; it is used as a line is. A scene is a block in order, and so is the video, of its scenes. With a script
  of the cartoon's own, the video is a block together: that script's rows, each open or cut, and the block of the scenes.

The laws:

1. **Frames.** Every length and pause is in whole frames before anything is placed, so no rounding
   can break a law.
2. **A start** is the latest of three:
   - its block's rule, or its own anchor in place of it. In order: `pause` after everything above it
     that the block waits for has ended; the first begins with the block, a scene's `lead` later.
     Together: with the block. Ending together: its own length before the block's end; what the block
     does not wait for begins with it;
   - its channels: everything written above on them has ended;
   - its block's start.
3. **An anchor** is the start, the end or a share of something above, or of its own block, plus or
   minus seconds. It is never before that thing begins. A cut thing's end is where it stops, and a
   share of it is of its whole length.
4. **An end** is the start plus the length.
   - Fixed: measured, given, or worked out from such lengths above.
   - Fitted: a move that may be (its action `fits`), given no length, directly in a block together. It ends
     with the last voice the block waits for, no faster than its `fastest` and no slower than its
     `slowest`. In order, ending together, with a start of its own, or with no voice to fit to, it takes
     its own length. Any other move given no length does, anywhere. Told when to arrive, either is fitted
     to that moment instead.
   - Open (a move whose action is `open`, as a look; a loop): until its block ends.
5. **A block** ends with the last of what it waits for: all but the cut and the open. One ending
   together ends when the last of these would, if each began as soon as the block has and its own
   channels are free: so they all end then. A scene ends its `tail` after that.
6. **Cut and open.**
   - A cut thing stops where its block ends, if it has not ended before. At a scene's own level that
     is the scene's last frame, after its `tail`.
   - Nothing waits for a cut or open thing: not its block, and not what follows it in order. But it
     holds its channels until the block ends.
   - A cut block cuts all that is in it. Inside it, everything is timed as if nothing cut it.
   - What has not begun when it is cut is not there.
   - Only voices and sounds are cut, never a move, an open one neither: where a move leaves its
     character must be known before the voices.
7. **Refused**, for any lengths, and so before the voices: an anchor to something that is not above;
   what follows a cut or open thing on its channel, in that thing's block; a cut move; two lines on one
   channel, directly in one block together, the later with no start of its own, or in one ending together;
   in a block ending together, what has its times in itself (a block, an anchored
   line, a move told when to arrive); and a loop, whole. A voice that waits for the end of its own
   block's fitted move is a loop: it goes after the block, or the move is given a length.

They promise:

- one timing for a plan, whatever the lengths;
- nothing begins before what it comes after;
- a block ends after all it waits for;
- what is cut ends with its block, and its length moves nothing but what names it;
- a channel never does two things, and keeps the written order.

**Surely begun.** Whether one thing has begun before another ends is known before the voices, where
the laws make it so whatever the lengths, the pauses and the seconds after a moment turn out to be
(`surelyBegun`): what is above in order, what begins or ends at once, what something is anchored to, and
what follows from these. A plugin's check is told it of its actions (`begun`), so what may depend on the
voices can be refused too: two who may meet on one spot. Where it is not sure, the lengths decide it, or
it is not seen: a walk anchored a second into another is not sure to have begun when that ends.

### The cast

A video with several speakers gives each a voice. The library gives each character its `voice`
(see The library), which the tool takes as the cast, and a video file's own `cast:` goes over it,
speaker by speaker. A line's speaker comes from the plugin's plan: a text a character says names
it as `speaker` (lowercase letters, digits and dashes); the narrator's names none.

- A line's voice is its speaker's in the cast, else the video's `voice`, the narrator's, in the
  video's language (`voiceOf`, `src/script.ts`; see A video's language). A video with no speakers
  needs no cast.
- A speaker the cast does not name is refused when the video is made, with the line and the
  cast: it is never said in the video's voice.
- The request passes each line's speaker to the plugin, which moves that character's mouth (see
  Fitting a clip to the voice).
- The narration's log names the speaker and voice of each line said in another voice than the
  video's: `line 2 (pip, am_puck): 0.93s`.

### A video's language

A video's `language` is `en` (the server's), `uk` or `ru`, a setting as any other (see Settings in
layers), and every line of it is said in a voice of that language (see The voices; Kokoro's
American and British English are both `en`).

- **A voice**, the video's `voice` or one of the cast's (a character's in the library, or the
  file's `cast:`), is one, which speaks its own language, or one in each language, by its code:
  `voice: { en: am_puck, uk: uk_m1, ru: ru_m1 }`. A table goes over a table language by language,
  and one voice over all of them; a language the tool has not is refused.
- **Refused** by `check`, `make` and `import`, at the line, each with a hint naming that language's
  voices and the speaker's others: a line whose speaker has no voice in the video's language, or one
  of another language, or one that is none of the tool's; and, in a video in English, a line in
  Cyrillic letters, which no English voice reads (`unreadable`): a video in Ukrainian or Russian that
  forgot its `language:` is refused, not said as gibberish. A plan's lines are refused alike, the first
  with its text (`unspoken`, `src/check.ts`).
- **The build and the page** carry it as their `lang`, and the captions' font has its letters
  (Inter's Cyrillic too).
- **A story's prompt** is in the language its episodes are to be in, with that language's voices
  alone (see prompt).

`src/video-file.test.ts`, `src/check.test.ts` and `src/import.test.ts` show each rule.

### The voices

The tool speaks in two local engines, behind one `TtsProvider` (`src/tts.ts`), and a voice's name
says whose it is (`enginesIn`). Each voice has its language (`toolVoices`):

- **Kokoro** (Kokoro-82M, through kokoro-js): 28 voices in American and British English, `am_puck`,
  `bf_emma`, each with Kokoro's grade; 24 kHz.
- **Supertonic 3** (`src/supertonic.ts`): ten voices, each in Ukrainian and in Russian, `uk_f1` to
  `uk_f5` and `uk_m1` to `uk_m5`, and the same with `ru_`; 44.1 kHz. It is run as its example runs
  it, in 8 steps, at 1.05 times the video's `speed`, and its noise is seeded from the line, so a line
  is the same in every run. A line longer than 300 characters is said in parts, split between
  sentences, 0.3 s apart. A letter it lacks stops `make`, naming it and the line; Ukrainian's
  apostrophe (ʼ) and low quote („) are read as `'` and `"`.

`voices` lists them by language and writes a sample of a few of Kokoro's and each of Supertonic's,
each in its own language, or the text given, said as a video's line is (see A word's stress).
`src/supertonic.test.ts` shows each rule.

### A word's stress

Supertonic picks each word's stress itself, and gets some wrong. So a word of a line in Ukrainian or
Russian, a script's or a plan's, has its stress marked before the voice says it: a combining acute
(U+0301) right after the stressed vowel, `за́мок` or `замо́к` (`src/stress.ts`). The writer marks a
word in the line, or the tool marks it (`src/marks.ts`).

- **The tool's marks:** a word of two vowels or more with no mark of the writer's is given one by its
  language's source, read from this disk alone (see Offline): in Ukrainian each word, in Russian a
  homograph alone. A word the writer marked is as written, and so is a line in English. How the
  sources were picked and tried is in `docs/plans/word-stress.md`.
  - **Ukrainian** (`src/stress-uk.ts`): lang-uk's dictionary (ukrainian-word-stress, MIT), a marisa
    trie of 2.9 million forms, read by `src/marisa.ts`. A form with one stress has it, and one with
    two, either of them right (за́вжди́), has one of the two. A form the dictionary has under two
    stresses by what it means (гні́зда, гнізда́: a word in seven of the stories tried), or lacks, is
    a guess: Silero's stress model (MIT, as TigreGotico exports it to ONNX) reads the word's letters
    and no line, and was right four times of five. A guess is said when it is one of the
    dictionary's own stresses for the word. A few pronouns are the tool's own: forms the dictionary
    lacks or has otherwise (його́, ньо́го), and those whose stress moves after a preposition (мене́,
    до ме́не; кому́, на ко́му).
  - **Russian** (`src/stress-ru.ts`): RUAccent (MIT). Only a homograph is marked (за́мок, замо́к;
    дела́, де́ла), one of the 19,700 words its list has under two stresses: it has the reading its
    network gives it from the sentence, and none is listed. Any other word has no mark, and the
    voice stresses it itself: a mark spoils some of the words it is put in (below), so the tool puts
    one only where the letters do not say the stress. A word the voice still stresses wrong
    (молодость) is the writer's to mark. A reading stressed on its ё has no mark, and a ё written
    as е is not put back.
- **What it was not sure of** is said by `check` and `make`: a row for each word as it is said, with
  the lines that say it. A guess has the dictionary's other stresses, `гнізда́ (or гні́зда): lines
  12, 40`; a word no dictionary has says so, `Ропухо́вих (not in the dictionary): line 33`; and one
  the model is no surer of is left to the voice. A mark in the line settles a word there. `check`
  says them when the sources' files are on the disk, and else that it did not look; `import` says
  none.
- **The voice** gets the line with its marks, the writer's and the tool's, and Supertonic reads a
  mark as the word's stress (measured: `docs/plans/word-stress.md`). So the compiled scenario's
  `text` and a request's are the line as it is said. A marked line is another line to the voice
  cache, and one marked all through lasts 4 to 6 % longer.
- **A mark is no sure thing.** The voice follows it mostly, not always, and a marked word may be read
  worse. Heard in a Russian video with a mark in every word: the wrong stresses mended, and of 150
  marked words eight spoiled, each rightly marked: a ё read as е (Серё́га), сего́дня and друго́го
  with their г, коне́чно with its чн, худо́й as «худай». So in Russian a word is marked where it is
  said wrong, or where its letters do not say its stress, and nowhere else. A Ukrainian video with
  a mark in every word was heard much better than with none, and so the tool marks each.
- **Nothing shows it:** the captions, the video's and the page's, are the text without its marks
  (`captionsOf`), split and timed by what they show. `ai-videos/plugin` exports `unstressed`, a
  text as it is shown, for a plugin's tests.
- **A word** has none (`src/words.ts`): an anchor names it with the mark or without,
  `a.word(замок)`, and where it is said is estimated from the text without them.
- **Refused** by `check`, `make` and `import`, at the line, with the word (`mismarked`): a mark that
  is not right after a vowel, so one after a consonant, or a second one after a vowel. A word may
  have two stresses, each after its own vowel. A mark on another alphabet's letter is that letter's
  own (a Latin é), and no stress.
- **The guide** says how a word is marked, in each language (see A script).

`src/stress.test.ts`, `src/marks.test.ts` and `src/check.test.ts` show each rule. The sources
themselves are tried on words whose stress is known when `setup` has fetched their files, and are
passed over when it has not.

### The library

`library.yaml`, beside the `package.json`, holds what a project's videos name, each drawn once:
`cartoons`' characters and backgrounds. A video file names them, and draws none of its own.

```yaml
characters:
  pip:
    voice: { en: am_puck, uk: uk_m1 }   # the tool's: Pip's voice in each language, the cast's (or one: am_puck)
    volume: -4dB     # the tool's, optional: how loud Pip is, in a script
    parts: { … }     # the rest is the plugin's
backgrounds: { … }
```

- **Its keys:** each character's `voice` is the tool's, and every character has one, or one in
  each language it speaks (see A video's language). The tool takes
  them as the project's cast (see Settings in layers), and gives the plugin the rest (but the sounds), with the
  file's path, for `check` (see Plugins). So is its `volume`, in decibels, which it need not have: the
  level a script's own volumes go over (see Values); a plan's sound has no volumes. A mistake is
  reported against `library.yaml`: a voice missing, or a name or a volume the tool refuses, by the
  tool, the rest by the plugin.
- **A voice has one home:** a `cast` in the `package.json`'s `"ai-videos"` is refused, pointing
  here. A video file's own `cast:` still goes over the library's, speaker by speaker.
- **Its sounds**, what a script plays, are the tool's alone: the plugin gets none of them. Each has its
  `file`, a path from the project's folder, of any format ffmpeg reads, and may have a `volume`, as a character may:

  ```yaml
  sounds:
    tune: { file: sounds/tune.flac, volume: -20dB }
    bell: { file: sounds/bell.wav }
  ```

  A sound has no name of a character's, nor `narrator`. A file that is missing is refused where a script plays it, and
  nowhere else.
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
| The plan | the source, `use`, the library (but its voices and volumes), the plugin's code, its inputs | `plan.json`, and in `stages.json` the format, the picture, what was mended, the limits and the inputs |
| The voices | each line's text as it is said (see A word's stress), voice and `speed` (the tool's voice cache) | |
| The fit | the plan, the voices, `fps`, `timing` | `clips/<name>-<format>.request.json` |
| The sound | each line's voice and when it starts (the fit's timeline), the video's length, `loudness` | `sound.m4a` |
| The drawing | the request, the source, the library (but its voices and volumes), the plugin's code, its inputs | `clips/<name>-<format>.mp4`, its `.json`, `.frames` and (drawn) `.svgs` |
| Check | the build (`build/<format>/`, but HyperFrames' own `.hyperframes/` and `renders/`), HyperFrames' version | |
| The render | the build, `quality`, `fps` | `render.mp4` |
| The video | the render's picture, the sound | `out/<name>.mp4`, written every time |
| The page | the sound, the source, the library, the request, the plugin's code, or a recording plugin's clip | `out/<name>.html`, written every time |

A script has no plan and no fit: its `compiled.json` is written every time (see A script). Its sound
is made from the voices' and the sounds' frames and volumes, the bytes of the sounds' files (`mixKey`), the video's
frames and the loudness in it; its drawing from
the rest but the words and the captions (`pictureOf`, `src/shown.ts`), the library (but its voices and
volumes) and the plugin's code. So a volume changed, or a sound's file, redoes the sound alone (and the rest, when a
sound that something waits for has another length). The other stages are as any video's.

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
3. The sound: the voices, and a script's sounds, mixed at the video's loudness (see How loud).

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
plugin's tests (RayCraft's `media/plugin/clip.test.ts`).

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
  (Inter 700, each subset), all inside the file. It names no URL. Its `lang` is the video's
  language, and its player's `en`.
- **The player:** a play button and a seek bar, nothing more. The sound's clock picks the frame, and
  the page draws it when it changes; the stage is scaled to the window.

### `prompt`

`npm run -s video -- prompt stories/<name>.md` writes the prompt for a story (a book's chapter) to
stdout, for any web chat to answer with no tools and no files of its own (`src/prompt.ts`). The
story's project is the nearest `package.json` above it with a plugin, which is started for its
guides and commands, then closed. What it reads goes to stderr.

`--language uk` (or `ru`; `en` when left out) is the language the episodes are to be in, whatever the
story's own: the prompt is written in it, all but names, code (a script's syntax, keys, actions) and
the library as written. The episodes are named after the story with the language's code,
`<name>-uk-1`, so beside the English ones (`<name>-1`), as `meet-uk` is beside `meet`. The tool's
words are in `src/prompt.ts` in English and in `src/guide-uk.ts` and `src/guide-ru.ts` in the
others; the tool's own messages, which a chat is sent back, stay English, and the prompt says so. A
plugin whose videos are no scripts writes its guide and commands in English alone: its prompt in
another language is refused. In order:

1. The tool's part: the task, and what a reply is: one YAML block per episode, its name on top
   (`episode: <name>-1`, `<name>-2`…, or `<name>` for a story of one episode), then `library:` with
   only what the library lacks (each new character with its `voice`), then the video file, with
   `language: uk` under `use:` in another language than English. A reply ends with a line in its
   language, `All episodes written.`, `Усі епізоди написано.` or `Все эпизоды написаны.`; one cut off
   is told so in a word of its language, "continue", «продовжуй» or «продолжай», and begins the block
   that was cut off again, whole.
2. The format. For a plugin with a `script`, the guide to writing a script (see A script), in the
   episodes' language, and nothing of its `guide` and commands: its videos are written as scripts.
   For any other, its `guide`, then its commands, each with its description and its example as
   written.
3. `library.yaml` as written, when the project has one.
4. The voices of the episodes' language, grouped by gender (and in English, American or British):
   in each, those nobody has, then those the narrator (the project's `voice`) or a character of the
   library has, each with who; Kokoro's best first (its grades). A new character gets one nobody has
   that suits it, and when none is free, one of a character who is in none of its episodes.
5. The story, as written.

It speaks and draws nothing, so it needs nothing from `setup`. `src/prompt.test.ts` shows each part,
in each language.

### `import`

`npm run video -- import <reply file>` takes a chat's reply, pasted into a file (its messages one
after another when the chat was told "continue"), and writes what is in it into the project: the
nearest `package.json` above the file with a plugin (`src/import.ts`).

- **The blocks:** each whole YAML block (`` ```yaml `` to its fence) is an episode; blocks of
  another language are passed over. A block with no end, or one a new YAML block begins inside,
  was cut off and is not counted. When two blocks name one episode, the later counts. The log says
  each, and whether the reply says `All episodes written.` after a block, in any of the tool's
  languages: said once, it stays said, as the blocks the chat mends come after it. It needs no
  language: an episode says its own, and is checked in it.
- **An episode** is its name (`episode:`), what it adds to the library (`library:`, by section, as
  `library.yaml` has them), and its video file: the block without those two keys, as written, its
  comments kept.
- **The checks:** each episode is checked as `make` checks it, against the library with what the
  reply adds, before anything is written: a new character's voice is one of the tool's, or each of
  its voices one of the language it is given for, no sound is new (a sound is a file, and
  no chat has one: an episode that adds one is refused), the file's
  `use:` and settings are valid, the plugin mends and checks its source and plans it, and each line
  has a voice the tool speaks in, in the episode's language. An episode written as a script has the check of A script in place
  of the plugin's mending, check and plan (`checkScript`, `src/check.ts`, which `check` and `make` run too): its sounds'
  files are measured, so ffmpeg is on the PATH. The plugin runs in its host, for this one call (see Plugins).
- **What it writes:** `videos/<name>.yaml` for each episode it takes, and the entries the library
  lacks into `library.yaml`, each at the end of its section as the block wrote it, the rest of the
  file as it was (a section it lacks goes at the end). The library is written only when an episode
  is taken. Nothing is written over: a video file already there is said to be the same, or kept,
  and a character or background the library has is kept as it is.
- **What it refused** comes out as a message to paste back into the chat, each episode with why,
  and the command exits with 1. A script's why is every mistake of the check's first pass that has
  one, as `check` says them, each at its line of the episode's block, the one after its fence being
  line 1. Pasted, the chat answers with those blocks mended: added to the
  reply's file, they are imported with the rest, and the episodes already written are the same.

Like `prompt`, it needs nothing from `setup`. `src/import.test.ts` shows each case.

### `story`

`npm run video -- story stories/<name>.md` takes a story to its videos in one command, through a
web chat of the user's (`src/story.ts`). The tool and the chat meet on the clipboard, and the user
presses Enter in the terminal when the chat's answer is copied. Windows only. With `--language uk`
(or `ru`) its episodes are in that language (see prompt), and its reply's file is
`stories/<name>-uk.reply.md`, beside the English one.

| # | Who | What | Reads | Writes |
| --- | --- | --- | --- | --- |
| 1 | the tool | the prompt, on the clipboard (see prompt) | `stories/<name>.md`, `library.yaml`, the plugin | the clipboard |
| 2 | the user | pastes it into a new chat; copies the chat's whole answer (its copy button keeps the blocks); presses Enter | | |
| 3 | the tool | the answer added to the reply's file, which is then imported (see import) | the clipboard | `stories/<name>.reply.md`, `videos/<episode>.yaml`, `library.yaml` |
| 3a | | cut off (no `All episodes written.`): the user types "continue" (the prompt's word, which the tool names) in the chat, copies its answer, presses Enter: 3 again | | |
| 3b | the tool | refused: the message for the chat, on the clipboard; the user pastes it, copies the answer, presses Enter: 3 again | | the clipboard |
| 4 | the tool | each episode taken, made as its outputs say: the pages first, each opened in the browser, then the videos (see make) | `videos/<episode>.yaml` | `.cache/<episode>/`, `out/<episode>.*` |

- **What it refuses to add:** a clipboard with no text, one that still holds what was put there for
  the chat (Enter pressed too soon), the answer added last, or one with no YAML block (the answer
  copied without its blocks) and no `All episodes written.` Each is said, and Enter is waited for
  again.
- **An episode with no `yaml` fence** is given one as its answer is added, and the log says so
  (`fenceEpisodes`, `src/import.ts`), in the two cases with one right answer. A block fenced with
  no language that begins with `episode:`, a chat's plain code block, gets `yaml` on its fence. An
  answer with no fence at all that begins with `episode:`, what a code block's own copy button
  gives, gets a fence around each episode: from an `episode:` at the start of a line to the next,
  the last one to the line `All episodes written.`, or to the answer's end. So the reply's file
  holds YAML blocks alone; `import` reads a file as written, and mends none of it.
- **`done`,** typed in place of Enter once the chat has answered, goes on with what there is: for a
  chat that never says `All episodes written.`, or an episode it cannot mend. Only the episodes
  taken are made; none taken stops it.
- **The reply's file is all it keeps.** With `stories/<name>.reply.md` there (of the language it is
  given), `story` copies no prompt: it imports the file, and goes on from there. So a run stopped (Ctrl+C, a make that
  failed) goes on when typed again, and one made already makes again from the cache. To begin
  anew, in a new chat, delete the file.
- **What it needs** is checked before the prompt: the voice, and HyperFrames' Chrome when the
  project's outputs make a video (see Offline). Each make holds its video's lock (see The cache).
- The clipboard is PowerShell's (`Set-Clipboard`, `Get-Clipboard`), its text through a file in
  UTF-8; the browser is Explorer's, which opens a page in the default one. `src/story.test.ts`
  runs the whole with a fake clipboard, keyboard, browser and make.

### `serve`

`npm run video -- serve`, typed in a project's folder (`cd cartoons`), starts a small web server on
this machine and says its page's address, `http://127.0.0.1:4747` (`--port` gives another); Ctrl+C
stops it (`src/serve.ts`, and its page, `src/serve.html`). The page is `story` with fields in place
of the terminal and the clipboard, built step by step by `docs/plans/done/story-in-browser.md`: it
wraps a text in its prompt, takes the chat's answers to the episodes' files, and makes and plays
their videos:

- **The story:** a field for its name and one for its text. A button saves the text as the
  project's `stories/<name>.md`, each line ended by a line feed, shows its prompt in a second field
  and copies it. The prompt is what `prompt` prints for that file (`promptFor`; see prompt), and
  the terminal's `story`, `prompt` and `import` go on from the file.
- **The chat's answer:** a third field, and Start. The answer is added to the reply's file of the
  story and the language the page's fields name, `stories/<name>.reply.md` (in Ukrainian,
  `<name>-uk.reply.md`), and the file is imported, as `story` does both (`answerOf`, `addAnswer`,
  `src/story.ts`; see story, import): an episode pasted with no `yaml` fence is given one. The
  page says what the answer brought, and what was mended in it, and which episodes are taken, each
  by its video file, shows what the import said, and empties the field for the next answer.
- **What the chat is told next:** after an answer cut off (no `All episodes written.`), the page
  says to type "continue" in the chat, the prompt's word in the episodes' language. What was
  refused, the message for the chat, it shows in a field of its own and copies; of an answer cut
  off as well, it shows it and leaves the copying to that field's Copy button, as the chat is to
  go on first.
- **With the field empty,** Start imports the reply's file as it is: so a page loaded again, or a
  story the terminal's `story` began, goes on from its file.
- **The makes:** with the reply whole (the chat has said `All episodes written.`, and nothing is
  refused), Start goes on to make each episode taken, as `story` makes them (`makeEpisodes`,
  `src/story.ts`): what its outputs say, the pages first, then the videos. Each make is a process
  of its own, `make <file> --as video` (`makeBy`), as a terminal's: it holds the video's lock, and
  a stage made before is taken from the cache (see The cache). Start pressed again makes them
  again, each stage from the cache.
- **Make what is taken,** a second button, there while episodes are taken and the reply is not
  whole, is `story`'s `done`: it imports the reply's file as it is, and makes the episodes taken so
  far.
- **What the makes say** shows in the page as they go, a line at a time, HyperFrames' too, and in
  the server's terminal. The server keeps the last run, going or ended, until another begins or it
  is stopped, and the page asks for the rest of it twice a second, and once as it loads: so a page
  loaded again shows the makes still, and names their story.
- **What was made:** each file is named as it is made, by its path in the project. A video plays in
  the page, from the server, `/out/<name>.mp4`, whole or the bytes its player asks for; a web page
  has a link that opens it in a new tab.
- **A make that failed** stops the rest, as it stops `story`, and the page shows why: the last the
  make said. With what was in its way mended, Start, the field empty, goes on from the cache.
- **One run at a time:** while episodes are made, no answer is taken and no other run begun, of any
  story, each refused with whose are being made: a make reads the library an import writes. A
  story is saved, and gets its prompt, all the same. The page has no button that stops a make.
- **No answer**, each said in the page, with nothing added: the prompt, or the message of what was
  refused, pasted in place of the chat's answer, or the answer added last, pasted again (the
  server keeps the three for each reply's file until it is stopped); a text with no YAML block
  that does not say `All episodes written.`; no text, with no reply's file to go on from; a story
  not saved under that name.
- **One at a time:** a story is saved, and an answer taken, each when the one before is done: two
  answers sent at once are added one after the other, the first imported before the second is
  added.
- **Its language** is told from the text's letters (`languageOf`): English, unless more of them are
  Cyrillic than Latin; then Russian when it has more of the letters Russian alone has (ы, э, ъ, ё)
  than of those Ukrainian alone has (і, ї, є, ґ), else Ukrainian. The page asks the server as the
  text changes, shows the language, and the user may pick another: it is picked anew only when the
  letters come to say another, and the page says what they say beside a pick that differs.
- **Nothing is written over.** A name whose file holds another text is refused. One whose file
  holds this text already writes nothing and gives its prompt again: so a story saved gets its
  prompt in another language.
- **Refused**, each said in the page: a name that is not lowercase letters, digits and dashes, a
  letter first; no text; a language the plugin writes no guide in, the story staying saved.
- **This machine alone:** it listens on 127.0.0.1, and has no login. A request is refused unless
  its `Host` is the server's own address, so a site whose name is made to mean this machine gets
  nothing.
- **Its own page alone:** a request that does something, a `POST`, is refused unless its `Origin`
  is the server's page, so another site's page saves nothing, and no answer says another site may
  read it. The page runs its own script and style alone, named by a nonce new for each load (its
  `Content-Security-Policy`), loads nothing but the videos it plays, from the server, and sits in
  no frame. Of the project's files it is given only what was made, `out/<name>.mp4` and `.html`,
  and no other site's page is: a request a browser says is another site's (`Sec-Fetch-Site`) is
  refused, and none may embed it (`Cross-Origin-Resource-Policy`). A video's web page is given shut
  in (`sandbox`): its script runs, and asks the server nothing.
- **The clipboard** is the browser's, written by the page when the prompt comes, or what was
  refused, a moment after the press. Chrome on Windows ends each line there with CRLF. Where the
  browser refuses, the page says so, and the field's Copy button copies again.

It speaks and draws nothing itself, so it starts with nothing from `setup`; its makes need what
`make` needs (see Offline), and one that lacks a piece says so in the page. `src/serve.test.ts`
starts it on a free port and shows each case, the makes by a fake make.

### Offline

Only `setup` uses the network. It fetches once what no other command may fetch:

- the voice models, into `.cache/models/`: Kokoro (`onnx-community/Kokoro-82M-v1.0-ONNX`, about
  325 MB), and Supertonic (`Supertone/supertonic-3`, about 400 MB), each file of a revision pinned
  and checked against its sha256 (`SUPERTONIC_FILES`, `src/supertonic.ts`). Supertonic's weights are
  under BigScience OpenRAIL-M, whose use rules have a published video say its voices are machine-made;
- what marks a word's stress in Ukrainian and Russian (see A word's stress), about 390 MB, beside
  the voice models and pinned and checked as Supertonic is (`STRESS_FILES`, `src/marks.ts`): the
  Ukrainian dictionary (`lang-uk/ukrainian-word-stress`, on GitHub, 13 MB), Silero's Ukrainian
  model as ONNX (`TigreGotico/stressonnx-models`, 10 MB), and RUAccent's list of homographs and
  the model that reads them (`ruaccent/accentuator`, 365 MB), each with its licence;
- HyperFrames' Chrome (chrome-headless-shell), which HyperFrames keeps in its own cache
  (`~/.cache/hyperframes/`); `setup` records where, and for which HyperFrames, in `.cache/setup.json`.

The rest comes with `npm ci`: the voices (in kokoro-js), GSAP and the captions' font, which each
build carries in `assets/vendor/` (`src/bundle.ts`), so a build names no URL, and esbuild, which
bundles a web page's drawing (see The web page). Running `setup` again keeps what is there and only
checks it.

Every other command first checks that what it needs is on the disk (`src/setup.ts`): both voice
models' files and what marks a word's stress, and for anything HyperFrames draws or checks, its
Chrome. A piece missing stops the
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

A video's soundtrack is the tool's own (`src/sound.ts`): each line's voice, and each sound a script plays, laid where it
begins, on a track as long as the video, and brought once to the video's `loudness` (LUFS, default -14, the level
YouTube and most platforms play at; -16 or -20 is quieter), its peaks 1.5 dB below full scale: stereo,
a voice in both channels. The video puts it with the render's picture, and the web page plays the
same file. How it is brought there differs:

- **A plan's voices** are mixed as they are, at their sample rate (48 kHz when they have two), and ffmpeg's
  `loudnorm` brings the mix to its loudness. A line's own level doesn't matter: at -14 LUFS, where a voice's peaks
  have no room for one gain, it is evened out with the rest.
- **A script's voices and sounds** (`writeMix`) are first made as loud as each other, as Kokoro's are not (-17 LUFS
  for `am_puck`, -23 for `am_michael`): each line, and each sound's file, whole, is measured as LUFS are (`loudnessOf`,
  `loudnessIn`, `src/loudness.ts`, which say what ffmpeg's `ebur128` does; `loudnorm` says up to 0.8 LU less of
  something short), so `volume` 0 is the same for any voice or sound. Then each is at its volume (see
  Values), and fades out in the 30 ms before its cut, when it is cut; a looped one always is. The mix is brought to its
  loudness by one gain for the whole (`levelMix`, `src/render.ts`), and a limiter, which lets go soon, takes only
  the peaks, of both channels alike; the gain makes up for what that takes, and is found in rounds. `make` says the
  gain, and how far the highest peak was lowered.
- **A sound keeps its own quality:** the mix of a script is at 48 kHz, in two channels, where a voice (Kokoro's 24 kHz
  or Supertonic's 44.1, one channel) is in both, the voices of each sample rate resampled together, and a sound is as
  ffmpeg reads its file: a stereo one keeps its two, one of another sample rate is resampled, and no treble of it is
  lost (but what AAC takes, over 19 kHz).
- So what is written quieter comes out as much quieter, and what is written louder a little less so: the
  loudness is kept, and the limiter takes more of what is loud. On Kokoro's voices at -14 LUFS, -12 dB
  comes out at -11.8, 6 at about 5, and 12 at about 10. Only differences are heard: a whole
  video at -10 dB is as one at 0.

`src/sound.test.ts` and `src/loudness.test.ts` show each.

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
  "made": { "by": "the square plugin, src/plugin.ts", "from": "videos/slide.yaml, drawn to slide-landscape.request.json" },
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
end above y 1248, the area social apps leave clear. Two at once, a script's (see A script), are
smaller, 44 px, in two rows from y 880, below the ground a cartoon's characters stand on, to 44 px
above the frame's edge; in portrait, 40 px, each with room for two rows, in the same area as one.

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
