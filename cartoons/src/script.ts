// A cartoon written as a script (CLAUDE.md, "The script"; the tool's AGENTS.md, "A script"): the
// actions a line may name, each on its channel, its names for numbers, and the script's check: each
// scene's setting and each action found in the library and worked out in plain numbers, a place as a
// point (places.ts), an action with its own length. The tool reads the lines, works out their values,
// checks what each action takes, and lays them in time; picture.ts draws what the check gives.
import { NARRATOR, listed, nearest, type Action, type ActionLine, type Issue, type Library as LibraryFile, type SceneActions, type SceneChecked } from "ai-videos/plugin";
import { z } from "zod";
import { NEAR, place, stageOf } from "./places.ts";
import { ARM, GROUND, MARKS, PACE, name, readLibrary, type Pose } from "./scenario.ts";

/** An action on the arm: it changes the pose, and takes as long as the arm does. */
const onArm = (pose: Pose, description: string) => ({ description: `${description} The arm gets there in ${PACE.arm} seconds.`, example: `pip ${pose}`, values: z.strictObject({}), channels: ["arm"] });

/**
 * What a line of a script may do, besides the tool's `say`, each described once: what it does, a
 * line that uses it, the values it takes, the channel of the character it keeps busy, and whether it
 * is fitted to words. The tool's check and the guide come from these.
 */
export const ACTIONS = {
  walk: {
    description: `The character goes from where it stands to the place \`to\`: a mark (${Object.keys(MARKS).join(", ")}), a point, or one worked out from where others stand (\`to=left-of(mo, near)\`). It takes a whole number of steps, at about ${PACE.walk} px a second. A walk turns nobody: it goes the way the character faces.`,
    example: "pip walk to=middle",
    values: z.strictObject({ to: place }),
    channels: ["place"],
    fits: true,
  },
  jump: {
    description: `The character hops \`times\` times (1 when left out), where it stands or as it walks, and ends on the ground. Each hop takes ${PACE.hop} seconds.`,
    example: "pip jump times=2",
    values: z.strictObject({ times: z.number({ error: "it is how many hops, 1 or more" }).int("it is a whole number of hops").positive("it is 1 hop or more").default(1) }),
    channels: ["hop"],
  },
  turn: {
    description: `The character turns to face the other way, where it stands or as it walks, and stays so. It takes ${PACE.turn} seconds.`,
    example: "pip turn",
    values: z.strictObject({}),
    channels: ["facing"],
  },
  wave: onArm("wave", "The character raises its arm and waves it, and goes on waving until it points or stands."),
  point: onArm("point", "The character holds its arm straight forward, the way it faces, until it waves or stands."),
  stand: onArm("stand", "The character lets its arm hang again, as everyone's does when a scene begins."),
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
export type Walk = { from: Point; to: Point };

/** An action as the check gives it and the picture draws it, with its values in plain numbers and names. */
export type Did =
  | { action: "walk"; values: Walk }
  /** So many hops. */
  | { action: "jump"; values: { times: number } }
  /** Which way it faces, before and after. */
  | { action: "turn"; values: { from: 1 | -1; to: 1 | -1 } }
  /** The pose its arm was in, and is in then. */
  | { action: Pose; values: { from: Pose; to: Pose } };

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
 * is its background and each character it places, at its point and facing 1 (right, as drawn) or -1.
 * An action is worked out from where, and how, the lines above on its channel left the character: a
 * walk is its way, from point to point, a turn which way it faced and faces, an arm's action the pose
 * it was in and is in. Its own length is the scenario's pace (PACE). Every mistake comes with its line
 * and a hint.
 */
export function checkScript(scenes: SceneActions[], library: LibraryFile | undefined): { scenes: SceneChecked[] } | { issues: Issue[] } {
  const { characters, backgrounds } = readLibrary(library);
  const issues: Issue[] = [];
  const checked = scenes.map((scene): SceneChecked => {
    const issue = (line: number, message: string, hint: string, also: number[] = []) => void issues.push({ line, ...(also.length > 0 ? { also } : {}), message, hint });
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
    const facing = new Map(placed.map((who) => [who, faces[who] === "left" ? -1 : 1] as const));
    const begins = Object.fromEntries([...stage.begins].map(([who, x]) => [who, { at: [x, GROUND] as Point, facing: facing.get(who)! } as const]));
    const poses = new Map<string, Pose>();
    /** What an action comes to, and its own length: none for a walk with a mistake. */
    const did = (action: string, { line, who, values, begun }: ActionLine): { values: Did["values"]; length: number } | undefined => {
      if (action === "walk") {
        const way = stage.walk({ line, who, begun }, (values as z.infer<typeof ACTIONS.walk.values>).to);
        return way && { values: { from: [way.from, GROUND], to: [way.to, GROUND] }, length: Math.max(ms(Math.abs(way.to - way.from) / PACE.walk), 0.001) };
      }
      if (action === "jump") {
        const { times } = values as z.infer<typeof ACTIONS.jump.values>;
        return { values: { times }, length: ms(PACE.hop * times) };
      }
      if (action === "turn") {
        const from = facing.get(who) ?? 1;
        const to = from === 1 ? -1 : 1;
        facing.set(who, to);
        return { values: { from, to }, length: PACE.turn };
      }
      const [from, to] = [poses.get(who) ?? "stand", action as Pose];
      // Standing needs no arm; a wave or a point with none would show nothing.
      if (to !== "stand" && characters[who] && !(ARM in characters[who].parts)) {
        const armed = Object.keys(characters).filter((one) => ARM in characters[one]!.parts);
        issue(line, `"${who}" has no part named "${ARM}" to ${to} with`, armed.length > 0 ? `those drawn with one are ${listed(armed)}` : `the library draws nobody with an ${ARM}`);
      }
      poses.set(who, to);
      return { values: { from, to }, length: PACE.arm };
    };
    const actions = scene.actions.map((one): SceneChecked["actions"][number] => {
      const { line, who, action } = one;
      if (who === NARRATOR) issue(line, `the ${NARRATOR} is nobody on the stage: only a character ${action}s`, `name a character${placed.length > 0 ? ` the scene places: ${listed(placed)}` : ", and give it a place in the scene"}`);
      else if (!(who in characters)) issue(line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
      else if (!placed.includes(who)) issue(line, `"${who}" has no place in this scene`, give(who));
      return did(action, one) ?? { values: {}, length: PACE.hold };
    });
    stage.spots();
    return { setting: { background, characters: begins } satisfies Setting, actions };
  });
  return issues.length > 0 ? { issues } : { scenes: checked };
}
