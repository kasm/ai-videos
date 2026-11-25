// A cartoon written as a script (CLAUDE.md, "The script"; the tool's AGENTS.md, "A script"): the
// actions a line may name, its names for numbers, and the script's check: each scene's setting and
// each action found in the library and worked out in plain numbers, a mark as a point, an action with
// its own length. The tool reads the lines, works out their values and checks what each action takes;
// picture.ts draws what the check gives.
import { NARRATOR, listed, nearest, type Action, type Issue, type Library as LibraryFile, type SceneActions, type SceneChecked } from "ai-videos/plugin";
import { z } from "zod";
import { GROUND, MARKS, PACE, name, onStage, readLibrary, type Mark } from "./scenario.ts";

const MARK_NAMES = Object.keys(MARKS) as [Mark, ...Mark[]];
const mark = z.enum(MARK_NAMES, { error: `it is one of the marks: ${MARK_NAMES.join(", ")}` });

/**
 * What a line of a script may do, besides the tool's `say`, each described once: what it does, a
 * line that uses it, and the values it takes. The tool's check and the guide come from these.
 */
export const ACTIONS = {
  walk: {
    description: `The character goes from where it stands to \`to\`, a mark (${MARK_NAMES.join(", ")}), in a whole number of steps, at about ${PACE.walk} px a second. A walk turns nobody: it goes the way the character faces.`,
    example: "pip walk to=middle",
    values: z.strictObject({ to: mark }),
  },
} satisfies Record<string, Action>;

/** Names for numbers, which any value of a script may use: how fast an action goes, as times its own speed. */
export const NAMES = { slow: 0.6, fast: 1.6 };

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
  /** The mark each character of the scene stands on as it begins. */
  places: z.record(name, mark).default({}),
  /** Which way a character faces as the scene begins: right, as drawn, when it is not named. */
  faces: z.record(name, z.enum(["left", "right"], { error: "it is left or right" })).default({}),
});
const KEYS = "a scene has background (one of the library's), places (the mark each of its characters begins on), faces (who begins facing left) and script";

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
 * a walk is its way, from the point the lines above left the walker at to its mark's, and its own
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
    const place = (who: string) => `give it the mark it begins on, in the scene's places: places: { ${who}: off-left }`;
    for (const who of placed) {
      if (!(who in characters)) issue(scene.line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
    }
    for (const who of Object.keys(faces)) {
      if (!(who in places)) issue(scene.line, `"${who}" faces ${faces[who]}, and has no place in this scene`, place(who));
    }
    // Where each character stands, line by line: a walk's way begins there, and two never stand on one mark of the stage.
    const stands = new Map(Object.entries(places));
    const apart = "two never stand on one mark of the stage (left, middle, right): give each its own, or one a mark off it";
    for (const [who, it] of stands) {
      const other = placed.find((one) => one !== who && places[one] === it);
      if (onStage(it) && other !== undefined && placed.indexOf(other) < placed.indexOf(who)) issue(scene.line, `"${other}" and "${who}" both begin at ${it}`, apart);
    }
    const actions = scene.actions.map(({ line, who, values }): SceneChecked["actions"][number] => {
      const { to } = values as z.infer<typeof ACTIONS.walk.values>;
      const from = stands.get(who);
      if (who === NARRATOR) issue(line, `the ${NARRATOR} is nobody on the stage: only a character walks`, `name a character${placed.length > 0 ? ` the scene places: ${listed(placed)}` : ", and give it a place in the scene"}`);
      else if (!(who in characters)) issue(line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
      else if (from === undefined) issue(line, `"${who}" has no place in this scene`, place(who));
      else if (from === to) issue(line, `"${who}" stands at ${to} already`, "walk to another mark, or leave the line out");
      else {
        const there = onStage(to) ? [...stands].find(([other, it]) => other !== who && it === to)?.[0] : undefined;
        if (there !== undefined) issue(line, `"${who}" walks to ${to}, where "${there}" stands`, apart);
      }
      if (from === undefined) return { values: {}, length: PACE.hold };
      stands.set(who, to);
      const walk = { from: [MARKS[from], GROUND], to: [MARKS[to], GROUND] } satisfies Walk;
      return { values: walk, length: Math.max(ms(Math.abs(MARKS[to] - MARKS[from]) / PACE.walk), 0.001) };
    });
    const begins = Object.fromEntries(placed.map((who) => [who, { at: [MARKS[places[who]!], GROUND] as Point, facing: faces[who] === "left" ? -1 : 1 } as const]));
    return { setting: { background, characters: begins } satisfies Setting, actions };
  });
  return issues.length > 0 ? { issues } : { scenes: checked };
}
