# Plan: going public

## Now

- Plan written 2026-11-24, the user's yes. The name is settled: the repo
  is `ai-videos`, as the code and the folder are, so nothing is renamed.
  Done before the plan: `videos/examples3` and a line with a time zone
  taken out of the history (a backup is in `.review/history-backup/`);
  the folder renamed, RayCraft's paths with it (its `1def299`).
- For the scan, the user's picks: the commits' email, the mentions of
  RayCraft and the rest of the history stay.
- Step 1 done 2026-11-24: MIT, and the README keeps the rights to
  `forest1`. Checked: `LICENSE` is the MIT text (compared with zod's); no
  file says `UNLICENSED`; the tool's tests (82) and cartoons' (47) and
  both typechecks pass.
- Step 2 done 2026-11-24: `main` is on GitHub, private,
  https://github.com/kasm/ai-videos. Checked: the scan finds its 47
  planted examples, and in `main`'s history only the user's picks; a
  clone from GitHub passes `npm ci`, the tests (82, cartoons' 47) and
  both typechecks. **Next: the user looks at it there and makes it
  public.**


## Goal

The repo is on GitHub as `ai-videos`, under the user's account, with a
license and nothing sensitive in it. **Out of scope:** npm, a domain, a
logo, demo videos.


## Steps (one session each)

### 1. License

**Done when:** `LICENSE` is in the repo, and both `package.json` files
name it.

### 2. Scan, then the first push, `main` only

The user creates the repo on GitHub, empty and private, and makes it
public after a look at it there. Nothing is pushed before the user's word.
**Done when:** the scan finds its planted examples and only what the user
chose to keep; a fresh clone passes `npm ci`, `npm test` and `npm run
typecheck`.
