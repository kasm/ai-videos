# ai-videos

ai-videos turns a text file into a narrated video, on your own computer. You write what happens and
what is said in one YAML file. A voice on your machine says the lines, the picture is drawn to fit
them, and you get an MP4 with captions and a subtitle file, or a web page that plays the same
offline.

The picture comes from a plugin. The one in this repository, [cartoons](cartoons/README.md), draws
simple 2D cartoons with talking characters.

There is no account, no API key and no cloud service: the network is used only to install.

## A video is one file

This is a whole video, [cartoons/videos/hello.yaml](cartoons/videos/hello.yaml):

```yaml
use: cartoon

scenes:
  - background: meadow
    places: { pip: off-left }
    beats:
      - name: walks-in
        walk: { who: pip, to: middle }
        says:
          - { who: narrator, text: "This is Pip. Pip walks into the meadow." }
      - name: stops
        says:
          - { who: narrator, text: "And here, Pip stops." }
```

You time nothing by hand. Each line is spoken and measured, and the walk is drawn to fit its words.
Change a sentence, and everything after it moves.

## What you need

- [Node.js](https://nodejs.org) 24 or newer (it is developed on 24).
- [ffmpeg](https://ffmpeg.org) on the PATH, with ffprobe, which comes with it.
- About 1.5 GB of disk, for the packages, the voice model and a headless Chrome.

The tool is developed on Windows, and one command, `story`, works only there.

## Set up

In this folder, once:

```
npm ci
npm run -s video -- setup
```

`setup` fetches the voice model (about 325 MB) and the Chrome that
[HyperFrames](https://hyperframes.heygen.com) renders with. After it, every command runs
with the network off. npm may warn about install scripts "not yet covered by allowScripts"; you can
ignore that.

## Make your first video

```
npm run -s video -- make cartoons/videos/hello.yaml
```

The first time takes about half a minute on a desktop PC. Then you have:

- `cartoons/out/hello.mp4`, the video with its captions
- `cartoons/out/hello.srt`, its subtitles

Make it again after a change, and only what the change touches is redone. To get the web page
instead, `cartoons/out/hello.html`, one file that plays in any browser:

```
npm run -s video -- make cartoons/videos/hello.yaml --as web
```

Next: [make a cartoon of your own](cartoons/README.md), from a story or by hand.

## Commands

Each is typed after `npm run -s video --`. Paths are relative to the folder you type in.

| Command | What it does |
| --- | --- |
| `setup` | Fetches what the other commands need, once. |
| `make <file>.yaml` | Makes the video. |
| `make <file>.yaml --fit` | Only checks the file, speaks the lines and shows the timing. Takes seconds. |
| `make <file>.yaml --as web` | Makes the web page instead. |
| `make <file>.yaml --profile quiet` | Makes it with a profile's settings: `youtube`, `quiet` or `draft` (a faster render). The files are `<name>-quiet.mp4` and so on. |
| `story <story>.md` | Takes a story to its videos, through a web chat and the clipboard. Windows only. |
| `prompt <story>.md` | Writes the prompt for the web chat, for doing the same by hand. |
| `import <reply>.md` | Takes the chat's reply in as video files. |
| `voices ["text"]` | Writes samples of several voices into `out/voice-samples/`, and lists every voice. |
| `--help` | Lists all of these. |

## What `make` does

1. **The plan:** the plugin checks the file and lists its moments and lines.
2. **The voices and the fit:** each line is spoken
   ([Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), in English)
   and measured, and the moments are stretched or shortened to match.
3. **The sound:** the lines are mixed into one track at the video's loudness.
4. **The drawing:** the plugin draws each frame, and ffmpeg encodes them into a clip.
5. **The check:** HyperFrames checks the clip with its captions.
6. **The video:** HyperFrames renders it, and the sound is added.

With `--as web`, the page is written after the sound instead. It draws the same frames in the
browser; a plugin that records has its clip in the page.

## Where things are

| Path | What it is |
| --- | --- |
| `cartoons/` | The cartoon project: its plugin, characters, stories and videos. |
| `src/`, `scenes/` | The tool. |
| `<project>/out/` | Finished videos. Made, and not in git. |
| `.cache/`, `<project>/.cache/` | The voice model, spoken lines and everything in between. Made, and not in git. |
| `AGENTS.md` | The full reference, for people and AI assistants. |
| `docs/plans/done/` | How the tool came to be, in finished plans. |

## Your own project or plugin

A project is a folder, here or in another repository, with:

- a `package.json` whose `"ai-videos"` names the project's plugin and the settings its videos share
- `videos/<name>.yaml`, one file per video
- `library.yaml`, optional: characters, with their voices, and whatever else the videos name

A plugin is one TypeScript module. It either draws each frame as an SVG, as
[cartoons/src/plugin.ts](cartoons/src/plugin.ts) does, or records something, such as a page in a
browser. The contract is in [AGENTS.md](AGENTS.md#plugins).

## Working on the tool

```
npm test
npm run typecheck
```

[AGENTS.md](AGENTS.md) says how each part works, and its "Known quirks" list what to expect from
HyperFrames.

## License

[MIT](LICENSE), the characters and backgrounds in `cartoons/library.yaml` included.

One story is not under it: `cartoons/stories/forest1.md`, its `forest1-reply.md`, and its episodes,
`cartoons/videos/forest1-1.yaml` to `forest1-3.yaml`. They adapt the first chapter of *The Wind in
the Willows* (Kenneth Grahame, 1908, public domain). The adaptation is © 2026 Dmytro.R, all rights
reserved.
