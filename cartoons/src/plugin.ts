// This project's plugin for the video tool (its AGENTS.md, "Plugins"), named in package.json. The
// tool runs it in a process of its own: it reads a cartoon's file, videos/<name>.yaml, and the
// library, has the scenario (the file but the tool's keys) mended and checked here, writes the plan
// as the clip's data, fits it to the voice, and asks for each frame's picture.
import type { Plugin } from "ai-videos/plugin";
import { GUIDE } from "./guide.ts";
import { frameSvg } from "./picture.ts";
import { repairScenario } from "./repair.ts";
import { COMMANDS, NARRATOR, STAGE, checkScenario, type Scenario } from "./scenario.ts";
import { timeline } from "./timeline.ts";

export default {
  scene: "cartoon",
  stage: STAGE,
  commands: COMMANDS,
  guide: GUIDE,
  check: checkScenario,
  repair: repairScenario,
  plan(scenario) {
    const { duration, events, lines } = timeline(scenario);
    // A character's text names it as the speaker, for its voice and its mouth; the narrator's names
    // nobody, and keeps the project's voice.
    const texts = lines.map(({ who, text, from, to }) => ({ text, ...(who === NARRATOR ? {} : { speaker: who }), from, to }));
    return { duration, events, texts };
  },
  // The tool's moment names its span: a span is a beat here.
  frame: (scenario, { span, ...moment }, size) => frameSvg(scenario, { beat: span, ...moment }, size),
} satisfies Plugin<Scenario>;
