// This project's plugin for the video tool (its AGENTS.md, "Plugins"), named in package.json. A
// cartoon is a script alone: the tool reads a cartoon's file, videos/<name>.yaml, and its lines, has
// the script checked here against the library, compiles what the check works out, and has each frame
// of that drawn here.
import type { Plugin } from "ai-videos/plugin";
import { SCRIPT_GUIDE } from "./guide.ts";
import { SCRIPT_GUIDE_RU } from "./guide-ru.ts";
import { SCRIPT_GUIDE_UK } from "./guide-uk.ts";
import { STAGE } from "./library.ts";
import { drawScript } from "./picture.ts";
import { CONSTRUCTIONS } from "./places.ts";
import { ACTIONS, NAMES, TABLES, checkScript } from "./script.ts";

export default {
  scene: "cartoon",
  stage: STAGE,
  script: {
    actions: ACTIONS,
    names: NAMES,
    constructions: CONSTRUCTIONS,
    tables: TABLES,
    // Its guide in each language its cartoons are written in, as each action and construction is described.
    guide: { en: SCRIPT_GUIDE, uk: SCRIPT_GUIDE_UK, ru: SCRIPT_GUIDE_RU },
    check: checkScript,
    draw: drawScript,
  },
} satisfies Plugin;
