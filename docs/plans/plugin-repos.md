# Plan: cartoons in the tool's repo

## Now

- Plan written 2026-11-22: the judge's final plan from
  `.review/plugin-repos/`, with the user's changes that day. The repo is
  public from its first push. cartoons moves in before the tool is
  renamed, and two steps were added: the name, and going public. The name
  is chosen in step 4.
- Step 1 done 2026-11-22: **cartoons joins**, the user's decision. For:
  the `file:` link already follows the tool's working tree, so a contract
  change becomes one commit with both test suites; the 3D plugin will
  likely change the contract, and goes beside it; the stories are public
  domain or the user's own, and a clone gets working videos. Against: a
  session in `cartoons/` loads the tool's notes and plan rules; cartoons
  can use the tool's packages undeclared; its link loops back to the root.
  Trial, on a clone in the scratchpad, cartoons in `cartoons/` with
  `file:..` and `--prefix ..`: `npm install` left the root untouched;
  cartoons' `npm test` (47) and `npm run typecheck` passed; `make
  videos/hello.yaml` gave the same `.frames`, `.svgs`, request and
  `out/hello.mp4` as the real cartoons', and `--as web` its page. The
  tool's tests (82) and typecheck passed too. With cartoons' `zod` hidden
  its checks passed on the root's; `git status --ignored` and `git clean
  -ndx` walk the loop (375 "Filename too long"), and skip it as a
  repository.
- Step 2 done 2026-11-23: cartoons is in `cartoons/` with its 14
  commits, rewritten into the folder by `git filter-repo` and merged; its
  tree is the old repo's HEAD's. Checked from `cartoons/`: `npm test`
  (47) and `npm run typecheck` pass, and the tool's (82); `make
  videos/the-shy-visitor.yaml` with no `.cache/` drew its 1277 frames,
  and its `.frames`, `.svgs`, request, `.mp4` and `.srt` are the old
  folder's, byte for byte (made there first, all from the cache); `git
  log -- cartoons` lists the 14; RayCraft's `make
  videos/water-switch.yaml --fit` runs. `d:\m\web\cartoons` is as it
  was.
- Step 3 done 2026-11-23: `d:\m\web\cartoons` deleted, the user's pick,
  after its `out/` (17 files) and `.cache/` (6 videos besides
  the-shy-visitor's) were copied into `cartoons/`, every `out/` file
  checked by md5. Checked: the step's `git grep` finds nothing; a fresh
  `claude -p` in `ai_videos` lists `episode` and names
  `cartoons/src/plugin.ts`; `prompt cartoons/stories/the-shy-visitor.md`
  and `make cartoons/videos/hello.yaml --fit` run from the root. The
  copied caches make their plan and drawing again: the plugin's code key
  hashes bytes, and the old checkout's line endings were mixed.
- Steps 4 and 6 dropped 2026-11-23, the user's correction: renaming the
  tool and making the repo public get a plan of their own. Until then the
  tool keeps `ai-videos` and its folder `d:\m\web\ai_videos`, so step 5
  is RayCraft's plugin working where it is. It runs with the tool today:
  `make videos/water-switch.yaml --fit` from `media/` exits 0. **Next:
  step 5**, the plan's last, from a session in RayCraft.


## Goal

A decision, with its reasons, on whether `cartoons` (`d:\m\web\cartoons`:
the cartoon plugin with its library, videos and stories) joins this repo.
If it joins, it lives in a folder of `ai_videos` with its commits, makes
the same videos as before, and the notes, skill and sessions that served it
work from here, with nothing left pointing at the old folder. If not,
steps 2 and 3 are dropped.

RayCraft's plugin (`media/plugin/`) stays in RayCraft. It is RayCraft's
code: it imports RayCraft's tutorials and Chrome script, it takes Vite and
Playwright from RayCraft's packages, its inputs are RayCraft's `src/` and
`lib/`, and its tests run in RayCraft's CI. It also stays the one real
plugin from another repository, the kind other people's plugins will be.

**Out of scope:** the 3D plugin, emotions and poses (a reason in step 1,
nothing built for them); moving RayCraft's plugin; any change to the plugin
contract (`Plugin`, how a project names its plugin): if a move needs one,
the session stops and asks; renaming the tool and making the repo public
(a plan of their own); publishing to npm.


## Steps (one session each)

### 1. Try cartoons inside the tool, then decide

On a throwaway copy, `cartoons` is put in a folder of the tool, and its
checks and a make are run from there. Then the reasons are weighed with
the user, who decides: a contract change in one commit, the 3D plugin to
come, stories and a library that are public from the repo's first push,
the tool's notes and plan rules that every cartoons session would load,
and the outside-repo path that others will use. Effort: xhigh. **Done
when:** the plan's `## Now` gives the decision, its reasons in a few
lines, and the trial's result (cartoons' `npm test` and `npm run
typecheck`, and `make videos/hello.yaml` with `--as web` too, run in the
copy, or where they failed). With "no", steps 2 and 3 are dropped.

### 2. Move cartoons in, with its history

`cartoons` goes into its folder in this repo with its 14 commits, and its
tests, typecheck and makes run from there. **Done when:** from the new
folder, `npm test` and `npm run typecheck` pass, and so do the tool's;
`make videos/the-shy-visitor.yaml`, its drawing not taken from the cache,
gives the same `.frames` as before the move (1277 frames); `git log` of the
folder lists cartoons' commits; and RayCraft's
`make videos/water-switch.yaml --fit` still runs.

### 3. Give cartoons' notes and sessions one home

The tool's `CLAUDE.md`, `AGENTS.md` and `.claude/settings.json` say where
cartoons lives now. Cartoons' `CLAUDE.md`, its `episode` skill and its
memory serve a session opened in `ai_videos`, and `d:\m\web\cartoons` is
retired in whatever way the user picks, its made files (`out/`, `.cache/`)
moved to the new folder first. **Done when:** a fresh session in
`ai_videos` lists the `episode` skill and, asked where the cartoon plugin
is, names the new folder;
`git grep -n -E "web.{1,2}cartoons|(^|[^/])\.\./ai_videos" -- . ":!docs/plans"`
finds nothing; the old folder is no longer a repo, and its `out/` files
are in the new folder's `out/`.

### 5. RayCraft's plugin stays in `RayCraft/media`, as a working solution

From a session in RayCraft. The folder of RayCraft's plugin for ai-videos
stays where it is, `d:\m\web\RayCraft\media`, with its videos and
settings, and makes its videos with the tool in `d:\m\web\ai_videos`. Its
notes say so, and where they speak of cartoons (`media/videos/workflow.html`)
they name the folder cartoons has now, `d:\m\web\ai_videos\cartoons`.
**Done when:** `make videos/first-shadow.yaml` from `media/`, its drawing
not taken from the cache, gives the same `.frames` as before; a search of
RayCraft for `d:\m\web\cartoons` and `../cartoons` finds them only in
`docs/plans/done/`; and RayCraft's `npm run verify` passes.
