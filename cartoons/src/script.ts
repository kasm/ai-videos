// A cartoon written as a script (CLAUDE.md, "The script"; the tool's AGENTS.md, "A script"): the
// actions a line may name, its names for numbers, and the script's check: each scene's setting and
// each action found in the library and worked out in plain numbers, a place as a point (places.ts), an
// action with its own length. The tool reads the lines, works out their values and checks what each
// action takes; picture.ts draws what the check gives.
import { NARRATOR, listed, nearest, type Action, type Issue, type Library as LibraryFile, type SceneActions, type SceneChecked } from "ai-videos/plugin";
import { z } from "zod";
import { NEAR, place, stageOf } from "./places.ts";
import { GROUND, MARKS, PACE, name, readLibrary } from "./scenario.ts";

/**
 * What a line of a script may do, besides the tool's `say`, each described once: what it does, a
 * line that uses it, and the values it takes. The tool's check and the guide come from these.
 */
export const ACTIONS = {
  walk: {
    description: `The character goes from where it stands to the place \`to\`: a mark (${Object.keys(MARKS).join(", ")}), a point, or one worked out from where others stand (\`to=left-of(mo, near)\`). It takes a whole number of steps, at about ${PACE.walk} px a second. A walk turns nobody: it goes the way the character faces.`,
    example: "pip walk to=middle",
    values: z.strictObject({ to: place }),
  },
} satisfies Record<string, Action>;

/** Names for numbers, which any value of a script may use: how fast an action goes, as times its own speed, and how far beside somebody. */
export const NAMES = { slow: 0.6, fast: 1.6, near: NEAR };

type Point = [number, number];

/** How a scene begins, as the check gives it and the picture draws it: each character it places, at its point, facing 1 (right, as drawn) or -1. */
export interface Setting {
  background: string;
  characters: Record<string, { at: Point; facing: 1 | -1 }>;
}

/** A walk as the check gives it and the picture draws it: its way, from point to point. */
export interface Walk {
  from: Point;
  to: Point;
}

/** A scene's own keys, beside its script: what it begins with. */
const Keys = z.strictObject({
  /** The background the scene begins with. */
  background: name,
  /** The place where each character of the scene begins. */
  places: z.record(name, place).default({}),
  /** Which way a character faces as the scene begins: right, as drawn, when it is not named. */
  faces: z.record(name, z.enum(["left", "right"], { error: "it is left or right" })).default({}),
});
const KEYS = "a scene has background (one of the library's), places (where each of its characters begins), faces (who begins facing left) and script";
/** Those of them that are formulas, by whose they are: the tool works out the numbers in them. */
export const TABLES = ["places"];

/** Whole milliseconds, so lengths added up stay equal where they should. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** `the library has the characters pip and mo: did you mean pip?` */
const has = (what: string, names: string[], meant: string) => {
  const near = nearest(meant, names);
  return `${names.length > 0 ? `the library has the ${what} ${listed(names)}` : `the library has no ${what}`}${near ? `: did you mean ${near}?` : ""}`;
};

/**
 * The script's check: every name found in the library, and the scenes worked out. A scene's setting
 * is its background and each character it places, at its point and facing 1 (right, as drawn) or -1;
 * a walk is its way, from the point the lines above left the walker at to its place's, and its own
 * length is that way at the scenario's pace (PACE). Every mistake comes with its line and a hint.
 */
export function checkScript(scenes: SceneActions[], library: LibraryFile | undefined): { scenes: SceneChecked[] } | { issues: Issue[] } {
  const { characters, backgrounds } = readLibrary(library);
  const issues: Issue[] = [];
  const checked = scenes.map((scene): SceneChecked => {
    const issue = (line: number, message: string, hint: string) => void issues.push({ line, message, hint });
    const keys = Keys.safeParse(scene.setting);
    if (!keys.success) {
      for (const found of keys.error.issues) issue(scene.line, `${found.path.length > 0 ? `${found.path.join(".")}: ` : ""}${found.message}`, KEYS);
      return { setting: {}, actions: [] };
    }
    const { background, places, faces } = keys.data;
    if (!(background in backgrounds)) issue(scene.line, `no background is named "${background}"`, has("backgrounds", Object.keys(backgrounds), background));
    const placed = Object.keys(places);
    const give = (who: string) => `give it one, in the scene's places: places: { ${who}: off-left }`;
    for (const who of placed) {
      if (!(who in characters)) issue(scene.line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
    }
    for (const who of Object.keys(faces)) {
      if (!(who in places)) issue(scene.line, `"${who}" faces ${faces[who]}, and has no place in this scene`, give(who));
    }
    const stage = stageOf(scene.line, places, { characters }, issue);
    const actions = scene.actions.map(({ line, who, values }): SceneChecked["actions"][number] => {
      const { to } = values as z.infer<typeof ACTIONS.walk.values>;
      if (who === NARRATOR) issue(line, `the ${NARRATOR} is nobody on the stage: only a character walks`, `name a character${placed.length > 0 ? ` the scene places: ${listed(placed)}` : ", and give it a place in the scene"}`);
      else if (!(who in characters)) issue(line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
      else if (!placed.includes(who)) issue(line, `"${who}" has no place in this scene`, give(who));
      const way = stage.walk(line, who, to);
      if (!way) return { values: {}, length: PACE.hold };
      const walk = { from: [way.from, GROUND], to: [way.to, GROUND] } satisfies Walk;
      return { values: walk, length: Math.max(ms(Math.abs(way.to - way.from) / PACE.walk), 0.001) };
    });
    const begins = Object.fromEntries([...stage.begins].map(([who, x]) => [who, { at: [x, GROUND] as Point, facing: faces[who] === "left" ? -1 : 1 } as const]));
    return { setting: { background, characters: begins } satisfies Setting, actions };
  });
  return issues.length > 0 ? { issues } : { scenes: checked };
}
