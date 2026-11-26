# Plan: Ukrainian and Russian

## Now

- Step 1 done 2026-11-26: **Supertonic 3, fp32** (Hugging Face
  `Supertone/supertonic-3`), the user's pick by ear.
  - Voices: the same ten, F1–F5 and M1–M5, in Ukrainian (`uk`) and in
    Russian (`ru`), and in its 29 other languages, English among them.
  - Licence: the weights BigScience OpenRAIL-M, whose use rules include
    that a published video says its voices are machine-made; the code
    MIT. Upstream (GitHub) archived 2026-09-09.
  - Download: 398 MB (four ONNX models), and 0.3 MB a voice.
  - 44,100 Hz, mono.
  - Speed: saying a line takes 0.10–0.13 of its length, on this machine's
    CPU, through the repo's onnxruntime-node, at the official example's
    8 steps and speed 1.05.
  - Two runs of a line: different bytes as shipped, its noise being
    `Math.random()`; the same bytes, in one process and in two, with the
    noise seeded.
  - Checked: each voice said five cartoon lines in each language, from
    Node with nothing fetched, beside Piper's eleven voices and MMS; the
    user listened. Whisper large-v3-turbo heard them back, with 0.5–3.3 %
    of the characters wrong in Ukrainian and 0–0.5 % in Russian; F1's
    lines hashed in two runs, seeded and not.
- **Next: step 2.**


## Goal

A cartoons video may be in Ukrainian or Russian. Its file names its
language once; its lines are spoken in it by a local voice that runs
offline after `setup`; its captions and page show them. A story's prompt
for a web chat is written in that language, so the episodes come back in
it and import and make as English ones do. English stays the default, and
every video made today makes the same.

**Out of scope:** RayCraft's `media/` (its videos stay English; the tool's
changes keep its make working); more than one language in a video; the
tool's own messages (`check`, `import`'s refusals, the log, the page's
buttons), which stay English; names (characters, actions, labels), which
stay ASCII; translating the existing cartoons and stories; re-tuning the
word-time estimate or the caption widths for the new voices; a cloud voice.


## Steps (one session each)

### 1. Choose the voice by ear

Try the local engines that speak Ukrainian and Russian from Node on this
machine, with nothing fetched after their download. Each says the same
few cartoon lines in each of its voices, and the user picks one engine.
`Effort: xhigh`. **Done when:** the user has picked, and `## Now` names
the engine and its voices in each language, with their licence, download
size, sample rate and speed, and whether two runs of a line give the same
bytes. No other file of the repo has changed.

### 2. Speak Ukrainian and Russian (the tool)

A second local voice engine behind the existing `TtsProvider`, the one
step 1 picked; `setup` fetches its models, `ready` checks them, and its
voices join the voice table with their language. Voices at different
sample rates mix in one track, and the prompt offers English voices alone
until step 5. `Effort: xhigh`. **Done when:** after `npm run video --
setup`, `npm run video -- voices` with the network off writes a sample of
each new voice into `out/voice-samples/`, which the user hears speak its
language; `make cartoons/videos/hello.yaml` takes its voices from the
cache; `npm test`, with a mix of two voices at different sample rates, and
`npm run typecheck` pass.

### 3. Make a video in its language (the tool, cartoons)

A video file names its language as a setting, the library gives each
character a voice in each language it speaks (and the project its
narrator), and `check`, `make` and `import` take only voices of the
video's language; the build and page carry its `lang`. cartoons gets the
voices and one short video in each language. **Done when:** `npm run -s
video -- check` refuses a Ukrainian video with an English voice, its hint
naming the Ukrainian ones; `make` of the two new videos writes `out/*.mp4`
and `.html` where the user hears and reads the lines in their language;
`make cartoons/videos/hello.yaml` takes every stage from the cache; both
projects' `npm test` and `npm run typecheck` pass.

### 4. Give a script plugin's guide in each language (the plugin contract, cartoons)

A script plugin may give its guide, and its actions' and constructions'
descriptions, in each language it writes; one with a single guide loads
as now. cartoons gives its guide in Ukrainian and Russian. **Done when:**
cartoons' tests compile each language's example against `library.yaml`;
`src/host.test.ts` shows the ready message with each language's guide;
RayCraft's `make videos/water-switch.yaml --fit` runs as before; both
projects' checks pass.

### 5. Write the prompt in the episodes' language (the tool)

`prompt` and `story` take the language the episodes are to be in, and the
prompt is written in it: the tool's part, the tool's guide, the plugin's,
and that language's voices alone, one of which a new character gets even
when every one is taken; `import` takes the episodes with it. The words
the tool reads back (`All episodes written.`, `continue`, `done`) are
settled in this step. `Effort: xhigh`. **Done when:** `npm run -s video --
prompt cartoons/stories/forest1.md`, for Ukrainian and for Russian, prints
a prompt in that language but for names, the script's syntax and
`library.yaml` as written; `src/prompt.test.ts` and `src/guide.test.ts`
compile each language's examples, and `src/prompt.test.ts` gives a new
character a voice in a language whose voices are all taken;
`src/story.test.ts` takes a Ukrainian reply to its end; a fresh `claude -p`
given the Ukrainian prompt replies with episodes that `import` takes and
`make` speaks in Ukrainian.
