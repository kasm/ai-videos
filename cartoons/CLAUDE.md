# Cartoons: notes for AI assistants

Simple 2D cartoons with talking characters. Each cartoon is written as a
scenario; the video tool (`../ai_videos`, a repo of its own) turns it into
a video with a spoken voice, offline and with no AI. The plan is the tool's
`docs/plans/animation-server.md`.

## Where things are

- `package.json`: its `"ai-videos"` names this project's plugin for the
  tool (`"plugin": "./src/plugin.ts"`), and holds the settings every
  cartoon shares: the narrator's `voice`, the `fps`.
- `library.yaml`: what the cartoons name: each character, drawn once,
  with its voice, and the backgrounds (The library, below).
- `videos/<name>.yaml`: one cartoon, written by hand or by an AI session:
  `use: cartoon` on top, then its scenario, in names: the library's
  characters and backgrounds, places as marks, each line written once, in
  its beat (the tool's `AGENTS.md`, "A video file").
- `.cache/<name>/`: what the tool makes on the way (the plan, the request,
  the clip, the build); `out/<name>.mp4` and `out/<name>.srt`: the
  finished video and its subtitles, and `out/<name>.html`, its web page.
  Made, not in git, never edited.
- `stories/<name>.md`: a story in prose (a book's chapter), the source of
  its episodes, `videos/<name>-1.yaml` and on. The tool wraps it in its
  prompt for a web chat, and imports the chat's reply, pasted into
  `stories/<name>.reply.md` (Running, below). The `episode` skill
  (`.claude/skills/episode/`) answers the same prompt itself. Either way a
  new character, with its voice, or a new background goes into
  `library.yaml` without asking (the user's standing yes), and nothing
  already there changes.
- `src/`: the cartoon plugin, the module the tool runs to get a cartoon's
  clip (the tool's `AGENTS.md`, "Plugins"). Its code is part of what the
  tool's cache keys on: a change to a file here draws the clips again.
  - `plugin.ts`: the plugin itself: the scene `cartoon`, its stage, its
    commands, its guide, and the four functions below.
  - `guide.ts`: the plugin's part of the tool's prompt (`GUIDE`): what a
    cartoon can show, the format with an example, how to turn a story into
    beats and lines, and how to draw a new character or background. A web
    chat reads it with no other file of this project, so it says all it
    needs; the tool adds the commands, `library.yaml` and the voices.
  - `repair.ts`: what the plugin mends in a scenario before the check
    (Mending, below).
  - `scenario.ts`: the scenario's schema and the library's, their checks,
    the marks and a beat's own length (`MARKS`, `PACE`), and the commands
    a beat may do (`COMMANDS`), each with a description and an example.
    Checked, a scenario is read as the picture reads it: the library's
    drawings, each mark a point, each beat's length known.
  - `timeline.ts`: beats and lines as the clip's events and texts, at the
    scenario's own pace (the plan).
  - `picture.ts`: one moment's picture, as an SVG: who stands where, facing
    which way, with the arm, the eyes and the mouth how.
  - The rest is the tool's, the same for every plugin: reading the file,
    which moment each frame shows, the SVG turned into pixels, the encoder,
    and the clip's data written.

## Running

Node 24. From this folder:

- `npm test`: the tests (`node --test`); `npm run typecheck`.
- `npm run -s video -- prompt stories/<name>.md > <file>`: the prompt for
  a web chat, the story in it: copy the file's whole text into the chat.
  Paste its reply into `stories/<name>.reply.md`; told "continue", add the
  next message after it.
- `npm run -s video -- import stories/<name>.reply.md`: writes each
  episode the tool and the plugin take as `videos/<episode>.yaml`, and
  what the reply adds to `library.yaml`, and writes nothing over. What it
  refused comes out as a message to paste back into the chat; add the
  chat's answer to the reply's file, and import again (the tool's
  `AGENTS.md`, "import").
- `npm run -s video -- make videos/<name>.yaml --fit`: checks the file
  (the plugin's checks against the library, and a voice for each
  speaker), says what the plugin mended in it (Mending, below), speaks the
  lines and prints how the clip fits them, before anything is drawn.
- `npm run -s video -- make videos/<name>.yaml`: the whole video, into
  `out/<name>.mp4`, with its subtitles beside it. A stage made from what
  has not changed since is taken from `.cache/<name>/`, and the log says
  "From the cache".
- `--profile quiet` (or `youtube`, `draft`): the tool's settings of that
  name over the rest, into `out/<name>-quiet.mp4` (the tool's `AGENTS.md`,
  "Settings in layers").
- `--as web`: the cartoon's web page instead, `out/<name>.html`: one file
  that plays offline, with a play button and a seek bar. It draws each
  frame with this plugin's code, the same SVG as the video's, and plays
  the video's sound; after the video, it speaks and fits nothing again
  (the tool's `AGENTS.md`, "The web page").

`video` is the tool's command line, found at `../ai_videos`. The contract
between the tool and this project is the tool's `AGENTS.md`, "Projects".
The tool is also a package here, a link to that folder (`"ai-videos":
"file:../ai_videos"`; `npm install` makes it), so the tests need the
folder too. Drawing needs `ffmpeg` on the PATH.

## How a cartoon is drawn

The tool measures the voice and asks for the clip in whole frames: when
each beat begins, how long it lasts, and how long a move's motion takes
(the request, `.cache/<name>/clips/<name>-landscape.request.json`). With each spoken
line it gives the line's speaker and a mouth track, taken from the voice's
loudness: how open the mouth is in each frame the line sounds in, 0 closed
to 1 wide. The tool then:

1. finds each frame's moment: which beat, how far through its move, the
   time in the clip and in the beat, and whose mouth is open, how wide
   (its `moments`, a span being a beat);
2. asks the plugin for that moment's picture as an SVG (`frameSvg`,
   `picture.ts`);
3. turns the SVG into pixels with resvg, and pipes them to ffmpeg. A frame
   whose SVG is the one before it is not drawn again.

A walk goes from the character's place to its end, slow at both ends, in
a whole number of steps: the character rises a little in the middle of
each. Its look is the plugin's (`STEP`, `BOUNCE` in `picture.ts`), not the
scenario's. So is the look of everything below: the scenario names a
move or a pose, and `picture.ts` holds its numbers.

A turn mirrors the character, left to right, like a paper cut-out turned
round: it gets narrow, is seen edge-on halfway, and widens again facing
the other way (`THIN`). A jump is hops in place, each up and down as a
thrown ball goes (`JUMP`), and ends on the ground.

A pose is where the arm is: the part named `arm` turns around the
character's `shoulder`. It hangs as drawn (`stand`), is held straight
forward (`point`), or is raised and swings (`wave`): `ARM`, `SWING`,
`WAVES`. In the beat that changes the pose, the arm takes `REACH` seconds
to get there; a wave goes on swinging through the beats after it, by the
clip's time.

Eyes blink: the shapes of the part named `eyes` close towards the part's
middle line for a moment (`BLINK`), every few seconds. When is fixed by
the character's name and the clip's time, so each character blinks at its
own times, the same in every run.

A mouth moves with its character's voice: the shapes of the part named
`mouth` grow downwards as the track says (the top edge stays, the jaw
drops), until wide open they are nearly as tall as wide (`MOUTH_OPEN`,
`picture.ts`). Closed, in a line's pauses and between lines, the mouth is
as the library draws it. Only the speaker's mouth moves: a line's track
opens the mouth of the character the request names as its `speaker`, and
the narrator's line, which names nobody, opens none.

## Voices

Each speaker has a voice of its own. The narrator's is `package.json`'s
`"ai-videos"` `voice`, and so is any line's that names no speaker; each
character's is its `voice` in `library.yaml`, which the tool reads as the
cast (the tool's `AGENTS.md`, "The cast"):

```yaml
characters:
  pip:
    voice: am_puck
    parts: …
```

- A line's `who` goes through the tool and comes back: the plugin's plan
  gives a character's text with `speaker: <who>` (the narrator's with
  none), the tool makes each text a line, cued to its beat, says it in
  the character's voice, and the request names the speaker with the
  line's mouth track.
- Every character in the library has a voice: the tool refuses one
  without. A `cast` in `package.json` is refused: a voice has one home. A
  cartoon's own file may give `cast:`, on top beside `use:`, over the
  library's, for a voice only it uses.
- A character the scene does not place is a voice off stage: it is heard,
  and no mouth moves.
- A voice is one of the tool's (Kokoro): `npm run -s video -- voices`
  writes samples of several into the tool's `out/voice-samples/` and lists
  every name. `make` prints the speaker and voice of each character's line.
- `videos/meet.yaml` has two characters and the narrator, three voices.

The picture depends only on the scenario, the library and the request, so two runs
draw the same frames. `.cache/<name>/clips/<name>-landscape.mp4.frames`
holds a hash of each frame's pixels, a line a frame: compare two runs'
files to see it, or to find the frame where they part.

## The scenario

A cartoon is `videos/<name>.yaml`: `use: cartoon` on top, then its
scenario, in names. `videos/hello.yaml` is the smallest whole one, and
`videos/the-shy-visitor.yaml` uses everything: each pose, each move, and
backgrounds that change. The tool keeps its own keys (`use`, and the
settings a cartoon may give over the project's: `voice`, `cast`, `speed`,
`fps`, `loudness`, `timing`, `quality`) and gives the plugin the rest. A
key the format does not have is refused, and an error names the file and
the place.

```yaml
use: cartoon

scenes:
  - background: meadow
    places: { pip: off-right }
    faces: { pip: left }
    beats:
      - name: walks-in
        walk: { who: pip, to: middle }
        says:
          - { who: narrator, text: "This is Pip. Pip walks into the meadow." }
      - name: waves
        pose: { pip: wave }
        says:
          - { who: pip, text: "Hello!" }
      - name: night-falls
        takes: 2
        background: night
        pose: { pip: stand }
      - name: jumps
        jump: { who: pip, times: 2 }
```

- **A name** is the library's: a scene's `background`, a character in
  its `places`, the `who` of a move or a line. A name the library lacks is
  refused, with the names it has. A video draws nothing of its own:
  `characters:` or `backgrounds:` in it is refused.
- **A mark** is where a character stands, on the ground (y 880): `left`,
  `middle` and `right` on the stage (x 480, 960 and 1440), and `off-left`
  and `off-right` out of sight (x -250 and 2170); `MARKS` in
  `scenario.ts`. The ground is above the caption (a one-line caption, as
  measured in `hello`, covers about y 890 to 990). Two characters never
  stand on one mark of the stage, as a scene begins or after a walk; off
  it, any number wait.
- **A scene** has the `background` it begins with, the mark each of its
  characters stands on as it begins (`places`), and its `beats`.
  `faces: { mo: left }` begins it with Mo mirrored; the others face
  right, as drawn. Every character begins in the pose `stand`. Scenes
  follow each other in one clip, and each begins anew: its own places,
  everyone facing as it says, standing.
- **A beat** is one moment, and one event of the clip for the tool. Its
  `name` (lowercase letters, digits and dashes) is unique in the scenario.
  `takes` is its length in seconds at the scenario's own pace, and may be
  left out: a move then takes its own time, and a hold its words' (`PACE`
  in `scenario.ts`: a walk at 320 px a second, a turn 0.5 s, a hop 0.6 s,
  a word 0.3 s, a hold at least 1 s). The tool stretches a beat when its
  lines take longer to say, so `takes` is worth writing for a pause with
  nothing said, or a move slower than its own.
  - A beat has at most one **move**, by a character the scene places.
    With one, the beat is a move for the tool; without, a hold.
    - `walk: { who, to }`: the character goes from where it stands to the
      mark `to`. A walk turns nobody: to walk back, turn first.
    - `turn: { who }`: the character turns to face the other way, and
      stays so.
    - `jump: { who, times }`: the character hops in place `times` times
      (1 when left out).
  - `pose: { pip: wave, mo: stand }` changes poses as the beat begins:
    `stand`, `wave` or `point`. A pose stays until a later beat of the
    scene changes it. `wave` and `point` need the character's `arm`.
    A pose is not a move: a beat with only a pose is a hold, as long as
    its lines.
  - `background: night` changes the background as the beat begins, for
    the rest of the scene or until another beat changes it. Everyone
    stays where they are.
  - `says` lists the lines said during the beat, each with `who` (a
    character's name, or `narrator`, whom nobody draws) and `text`. Several
    lines share the beat's time equally, in the order written. A
    character's line is said in its voice and moves its mouth (Voices,
    above).

## The library

`library.yaml`, beside `package.json`, draws what the cartoons name, each
once: the characters and the backgrounds. The tool reads it, takes each
character's `voice` (Voices, above), and gives the plugin the rest. A
mistake in it is reported against `library.yaml`.

```yaml
characters:
  pip:
    voice: am_puck
    shoulder: [100, -203]
    parts:
      body:
        - { shape: rect, at: [0, -170], size: [220, 340], round: 110, fill: "#f2a33a" }
      arm:
        - { shape: rect, at: [100, -150], size: [44, 150], round: 22, fill: "#d9861f" }
      mouth:
        - { shape: ellipse, at: [0, -170], size: [70, 18], fill: "#5b2333" }

backgrounds:
  meadow:
    fill: "#bfe3ff"
    shapes:
      - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#7cc36a" }
```

- **The stage** is 1920 by 1080 pixels: x goes right and y goes down from
  the top-left corner. A point is `[x, y]`. The library draws in points;
  a video places with marks.
- **A shape** is a `rect` or an `ellipse`: `at` is its centre, `size` its
  width and height, `fill` its colour as `#rrggbb`. A `rect` may have
  `round`, its corners' radius.
- **A character** is its `voice` and its named `parts` (body, arm, eyes,
  mouth), each a list of shapes. Parts are drawn in the order written.
  Their shapes are measured from the point between the character's feet,
  so `[0, -170]` is 170 pixels above the ground. Draw a character
  **facing right**: a turn mirrors it. Three names mean something to the
  plugin:
  - `mouth` is the part that talks: draw it closed, as a flat shape, with
    room under it for the jaw to drop (about 0.9 of its width). On a
    character with no `mouth` part nothing opens.
  - `eyes` is the part that blinks, by itself. With no `eyes` part
    nothing blinks.
  - `arm` is the part that waves and points: draw it hanging straight
    down, on the character's front side (its right, as drawn), after the
    body so it is drawn over it. A character with an `arm` has a
    `shoulder: [x, y]` beside `parts`, the point the arm turns around:
    the middle of the arm's upper end.
- **A background** fills the stage with `fill`, then draws its `shapes` in
  stage coordinates.

## Mending

Before it checks a scenario, the plugin mends what has one right answer
(`repair.ts`). The file stays as written; `make` lists what was mended
every time, from the cache too:

- A beat with two or three moves becomes a beat for each, in the order
  written. The first keeps the beat's name, its lines, poses, background
  and `takes`; each move after it is a beat of its own,
  `<beat>-<move>`.
- A walk away from where the walker faces (it would go backwards) gets a
  beat before it, `<beat>-turn`, that turns the walker round.

A name a beat put in would take, if another beat has it, gets a number
(`-2`). What can't be mended exactly, a name the library lacks or two
characters on one mark, is refused, with the place and the reason.

## Rules

- **Names** are lowercase letters, digits and dashes, a letter first.
- **The video file and the library are the only sources.** The plugin
  keeps no settings of its own, and nothing made is edited by hand.
- **The plan draws nothing** and gives the same data for the same
  scenario: the tool asks for it again whenever the file, the library or a
  file in `src/` has changed.
- **Of the tool's sources, only the modules its `package.json` exports
  are imported**: `ai-videos/plugin` for the plugin's types, and in the
  tests `ai-videos/frames`. Both need none of the tool's packages.
- **The plugin's code is pure**: no Node API (the tool reads the files),
  and a frame's picture is a function of the scenario, the library and the moment alone:
  no clock, no random number, no font of the machine (a picture holds no
  text; captions are the tool's). So the same code draws the web page: the
  tool bundles `src/plugin.ts` and what it imports for a browser.
