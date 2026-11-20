# Cartoons: notes for AI assistants

Simple 2D cartoons with talking characters. Each cartoon is written as a
scenario; the video tool (`../ai_videos`, a repo of its own) turns it into
a video with a spoken voice, offline and with no AI. The plan is RayCraft's
`docs/plans/anime.md`.

## Where things are

- `videos/project.yaml`: what every cartoon shares, read by the tool (the
  maker's command, the narrator's voice, the cast's voices, the format).
- `videos/<name>/`: one cartoon.
  - `scenario.yaml`: its source, written by hand or by an AI session.
  - `video.yaml`: the tool's script (the spoken lines and their cues). The
    tool's `new` writes the first one from the scenario's lines; after that
    it is edited by hand.
  - `clips/`, `build/`, `out/`: made, not in git, never edited.
- `src/`: the maker, the command the tool runs to get a cartoon's clip.
  - `scenario.ts`: the scenario's schema and its checks.
  - `timeline.ts`: beats and lines as the clip's events and texts, and
    which moment each frame shows, with whose mouth is open and how wide.
  - `picture.ts`: one moment's picture, as an SVG.
  - `draw.ts`: the frames as pixels (resvg) and as the clip (ffmpeg).
  - `call.ts`, `request.ts`: the tool's call to the maker, and its request.
  - `make.ts`: the maker itself.

## Running

Node 24. From this folder:

- `npm test`: the tests (`node --test`); `npm run typecheck`.
- `npm run -s video -- new videos/<name>`: writes `video.yaml` from the
  scenario's lines, each character's with its `speaker`. It never writes
  over one, and names a speaker the cast gives no voice yet.
- `npm run -s video -- make videos/<name> --fit`: speaks the lines and
  prints how the clip fits them, before anything is drawn.
- `npm run -s video -- make videos/<name>`: the whole video, into
  `videos/<name>/out/<name>-landscape.mp4`, with its subtitles beside it.

`video` is the tool's command line, found at `../ai_videos`. The contract
between the tool and this project is the tool's `AGENTS.md`, "Projects".
Drawing needs `ffmpeg` on the PATH.

## How a cartoon is drawn

The tool measures the voice and asks for the clip in whole frames: when
each beat begins, how long it lasts, and how long a move's motion takes
(the request, `clips/<name>-landscape.request.json`). With each spoken
line it gives the line's speaker and a mouth track, taken from the voice's
loudness: how open the mouth is in each frame the line sounds in, 0 closed
to 1 wide. The maker then:

1. finds each frame's moment: which beat, how far through its move, and
   whose mouth is open, how wide (`moments`, `timeline.ts`);
2. writes that moment's picture as an SVG (`frameSvg`, `picture.ts`);
3. turns the SVG into pixels with resvg, and pipes them to ffmpeg
   (`draw.ts`). A frame whose SVG is the one before it is not drawn again.

A walk goes from the character's place to its end, slow at both ends, in
a whole number of steps: the character rises a little in the middle of
each. Its look is the maker's (`STEP`, `BOUNCE` in `picture.ts`), not the
scenario's.

A mouth moves with its character's voice: the shapes of the part named
`mouth` grow downwards as the track says (the top edge stays, the jaw
drops), until wide open they are nearly as tall as wide (`MOUTH_OPEN`,
`picture.ts`). Closed, in a line's pauses and between lines, the mouth is
as the scenario writes it. Only the speaker's mouth moves: a line's track
opens the mouth of the character the request names as its `speaker`, and
the narrator's line, which names nobody, opens none.

## Voices

Each speaker has a voice of its own, set in `videos/project.yaml` (the
tool's `AGENTS.md`, "The cast"):

```yaml
voice: af_heart   # the narrator's, and any line that names no speaker
cast:             # each character's voice, by its name in the scenarios
  pip: am_puck
  mo: bf_emma
```

- A scenario line's `who` goes through the tool and comes back: the
  maker's step one writes a character's text with `speaker: <who>` (the
  narrator's with none), `new` writes that into the line of `video.yaml`,
  the tool says the line in the cast's voice for that speaker, and the
  request names the speaker with the line's mouth track.
- A character new to the project needs a voice in `cast` before `make`:
  the tool refuses a speaker the cast does not name. A cartoon's own
  `video.yaml` may give `cast:` too, over the project's, for a voice only
  it uses.
- `video.yaml` is the one the tool reads: change who says a line there
  (`speaker:`), as well as in the scenario. A speaker the scenario does
  not draw is a voice off stage: it is heard, and no mouth moves.
- A voice is one of the tool's (Kokoro): `npm run -s video -- voices`
  writes samples of several into the tool's `out/voice-samples/` and lists
  every name. `make` prints the speaker and voice of each character's line.
- `videos/meet` has two characters and the narrator, three voices.

The picture depends only on the scenario and the request, so two runs
draw the same frames. `clips/<name>-landscape.mp4.frames` holds a hash of
each frame's pixels, a line a frame: compare two runs' files to see it,
or to find the frame where they part.

## The scenario

`videos/<name>/scenario.yaml`; `videos/hello/scenario.yaml` is the smallest
whole one. A key the format does not have is refused, and an error names
the file and the place.

```yaml
characters:
  pip:
    parts:
      body:
        - { shape: rect, at: [0, -170], size: [220, 340], round: 110, fill: "#f2a33a" }
      mouth:
        - { shape: ellipse, at: [0, -170], size: [70, 18], fill: "#5b2333" }

backgrounds:
  meadow:
    fill: "#bfe3ff"
    shapes:
      - { shape: rect, at: [960, 950], size: [1920, 260], fill: "#7cc36a" }

scenes:
  - background: meadow
    places:
      pip: [-200, 880]
    beats:
      - name: walks-in
        takes: 4
        walk: { who: pip, to: [960, 880] }
        says:
          - { who: narrator, text: "This is Pip. Pip walks into the meadow." }
      - name: stops
        takes: 3
```

- **The stage** is 1920 by 1080 pixels: x goes right and y goes down from
  the top-left corner. A point is `[x, y]`. The tool shows the spoken line
  as a caption over the bottom of the picture (a one-line caption, as
  measured in `hello`, covers about y 890 to 990): keep feet and faces
  above it.
- **A shape** is a `rect` or an `ellipse`: `at` is its centre, `size` its
  width and height, `fill` its colour as `#rrggbb`. A `rect` may have
  `round`, its corners' radius.
- **A character** is its named `parts` (body, eyes, mouth), each a list of
  shapes. Parts are drawn in the order written. Their shapes are measured
  from the point between the character's feet, so `[0, -170]` is 170
  pixels above the ground. The part named `mouth` is the one that talks:
  write it closed, as a flat shape, with room under it for the jaw to
  drop (about 0.9 of its width). On a character with no `mouth` part
  nothing opens.
- **A background** fills the stage with `fill`, then draws its `shapes` in
  stage coordinates.
- **A scene** has one `background`, the `places` where its characters stand
  as it begins (the point between the feet; a place outside the stage
  keeps a character out of sight), and its `beats`. Scenes follow each
  other in one clip.
- **A beat** is one moment, and one event of the clip for the tool. Its
  `name` (lowercase letters, digits and dashes) is unique in the scenario.
  `takes` is its length in seconds at the scenario's own pace: the tool
  stretches a beat when its lines take longer to say.
  - With `walk: { who, to }` the beat is a move: the character goes from
    where it stands to `to`. Without it nothing moves, and the beat is a
    hold.
  - `says` lists the lines said during the beat, each with `who` (a
    character's name, or `narrator`, whom nobody draws) and `text`. Several
    lines share the beat's time equally, in the order written. A
    character's line is said in its voice and moves its mouth (Voices,
    above).

## Rules

- **Names** are lowercase letters, digits and dashes, a letter first.
- **The scenario is the only source.** The maker keeps no settings of its
  own, and nothing made is edited by hand.
- **The maker's step one draws nothing** and gives the same data for the
  same scenario: the tool runs it on every `make`.
- **The tool's sources are not imported.** `call.ts` reads the tool's call
  itself, so this repo's tests run without the tool.
- **A frame's picture is a pure function** of the scenario and the moment:
  no clock, no random number, no font of the machine (a picture holds no
  text; captions are the tool's).
