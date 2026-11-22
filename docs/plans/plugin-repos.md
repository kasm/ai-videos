# Plan: cartoons in the tool's repo, the repo renamed and public

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
  repository. **Next: step 2.**


## Goal

A decision, with its reasons, on whether `cartoons` (`d:\m\web\cartoons`:
the cartoon plugin with its library, videos and stories) joins this repo.
If it joins, it lives in a folder of `ai_videos` with its commits, makes
the same videos as before, and the notes, skill and sessions that served it
work from here, with nothing left pointing at the old folder. If not,
steps 2 and 3 are dropped.

Then the tool takes a new name, everywhere a project or a plugin meets it,
and goes public: a repo anyone can clone and run.

RayCraft's plugin (`media/plugin/`) stays in RayCraft. It is RayCraft's
code: it imports RayCraft's tutorials and Chrome script, it takes Vite and
Playwright from RayCraft's packages, its inputs are RayCraft's `src/` and
`lib/`, and its tests run in RayCraft's CI. It also stays the one real
plugin from another repository, the kind other people's plugins will be.

**Out of scope:** the 3D plugin, emotions and poses (a reason in step 1,
nothing built for them); moving RayCraft's plugin; any change to the plugin
contract (`Plugin`, how a project names its plugin) but the name: if a move
needs one, the session stops and asks; publishing to npm.


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

### 4. Rename the tool

The name is chosen with the user. The tool and cartoons take it in one
commit: the package and its `/plugin` import, the settings key in a
project's `package.json`, the clip and request formats, `AI_VIDEOS_CACHE`.
Then the folder is renamed, and this project's Claude Code memory moved
with it. **Done when:** from the renamed folder, `npm test` and `npm run
typecheck` pass, the tool's and cartoons'; `make
videos/the-shy-visitor.yaml` draws again and gives the same `.frames`
(1277 frames); `git grep -n -i -E "ai[-_]videos" -- . ":!docs/plans"`
finds nothing; a fresh session in the renamed folder recalls this
project's memory.

### 5. Give RayCraft the new name and cartoons' new home

From a session in RayCraft: `media/`'s package, plugin and notes use the
tool's new name and folder, and `media/videos/workflow.html` and any other
live note that places cartoons beside RayCraft name its new home.
**Done when:** `make videos/first-shadow.yaml` from `media/` gives the
same `.frames` as before; a search of RayCraft for `d:\m\web\cartoons`,
`../cartoons` and the old name finds them only in `docs/plans/done/`; and
RayCraft's `npm run verify` passes.

### 6. Make the repo public

With the user: a license, the author name and email the history shows, and
the remote. The first push waits for the user's word. **Done when:** the
license is in the repo and in `package.json` (no longer `UNLICENSED` or
private); `git log --format="%an %ae" | sort -u` shows only what the user
picked; a fresh clone from the remote passes `npm ci`, `npm test` and
`npm run typecheck`.
