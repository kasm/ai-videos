// A cartoon written as a script (CLAUDE.md, "The script"; the tool's AGENTS.md, "A script"): the
// actions a line may name, each on its channel, its names for numbers, and the script's check: each
// scene's setting and each action found in the library and worked out in plain numbers, a place as a
// point (places.ts), an action with its own length. The tool reads the lines, works out their values,
// checks what each action takes, and lays them in time; picture.ts draws what the check gives.
import { NARRATOR, listed, nearest, type Action, type ActionLine, type Issue, type Library as LibraryFile, type SceneActions, type SceneChecked } from "ai-videos/plugin";
import { z } from "zod";
import { NEAR, place, stageOf } from "./places.ts";
import { ARM, GROUND, MARKS, PACE, SCENE, name, readLibrary, type Pose } from "./scenario.ts";

/** An action on the arm: it changes the pose, and takes as long as the arm does. */
const onArm = (pose: Pose, description: string) => ({ description: `${description} The arm gets there in ${PACE.arm} seconds.`, example: `pip ${pose}`, values: z.strictObject({}), channels: ["arm"] });

/** What happens at once has no length of its own, and the least there is: a frame. */
const AT_ONCE = 0.001;

/**
 * What a line of a script may do, besides the tool's `say`, each described once: what it does, a
 * line that uses it, the values it takes, the channel of the character it keeps busy, and whether it
 * is fitted to words, or open. All but `background` are a character's. The tool's check and the guide
 * come from these.
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
  "look-at": {
    description: `The character faces another of the scene, \`target\`, wherever that one goes: it turns to face them, and turns as they go past. Then it stays facing the way it does as the look ends. A first turn takes ${PACE.turn} seconds. It is where the character faces, and nothing more: it walks, hops, points and talks meanwhile.`,
    example: "mo look-at target=pip",
    values: z.strictObject({ target: z.string({ error: "it is the name of a character of the scene" }) }),
    channels: ["facing"],
    open: true,
  },
  wave: onArm("wave", "The character raises its arm and waves it, and goes on waving until it points or stands."),
  point: onArm("point", "The character holds its arm straight forward, the way it faces, until it waves or stands."),
  stand: onArm("stand", "The character lets its arm hang again, as everyone's does when a scene begins."),
  background: {
    description: `The background changes to \`to\`, another of the library's, at once as the row begins, and stays so until a row changes it again. Everyone stays where they are, and goes on with what they do. Nobody does it, so its row is the \`${SCENE}\`'s, which does nothing else.`,
    example: `${SCENE} background to=night`,
    values: z.strictObject({ to: z.string({ error: "it is the name of one of the library's backgrounds" }) }),
    channels: ["background"],
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
export type Walk = { from: Point; to: Point };

/** An action as the check gives it and the picture draws it, with its values in plain numbers and names. */
export type Did =
  | { action: "walk"; values: Walk }
  /** So many hops. */
  | { action: "jump"; values: { times: number } }
  /** It faces the other way then: which way that is, only the picture knows, as a look may have turned it before. */
  | { action: "turn"; values: Record<string, never> }
  /** Whom it faces, wherever they are by then, and how near the two may stand, px. */
  | { action: "look-at"; values: { target: string; apart: number } }
  /** The pose its arm was in, and is in then. */
  | { action: Pose; values: { from: Pose; to: Pose } }
  /** The background from its first frame on: the scene's line, and no character's. */
  | { action: "background"; values: { to: string } };

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
 * walk is its way, from point to point, an arm's action the pose it was in and is in. A turn and a look
 * are not: which way a look leaves a character is where the other is as it ends, which the voices may say.
 * Its own length is the scenario's pace (PACE), and a look has none. A change of background is another
 * than the one there by then, and the least there is long (AT_ONCE). Every mistake comes with its line
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
    const drawn = (line: number, called: string) => {
      if (Object.hasOwn(backgrounds, called)) return true;
      issue(line, `no background is named "${called}"`, has("backgrounds", Object.keys(backgrounds), called));
      return false;
    };
    drawn(scene.line, background);
    const placed = Object.keys(places);
    const give = (who: string) => `give it one, in the scene's places: places: { ${who}: off-left }`;
    for (const who of placed) {
      if (!(who in characters)) issue(scene.line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
    }
    for (const who of Object.keys(faces)) {
      if (!(who in places)) issue(scene.line, `"${who}" faces ${faces[who]}, and has no place in this scene`, give(who));
    }
    const stage = stageOf(scene.line, places, { characters }, issue);
    const begins = Object.fromEntries([...stage.begins].map(([who, x]) => [who, { at: [x, GROUND] as Point, facing: faces[who] === "left" ? -1 : 1 } as const]));
    const poses = new Map<string, Pose>();
    /** The background by now, and the line that has it so. */
    let backdrop = { name: background, line: scene.line };
    /** Says it of one who is no character of the scene. */
    const known = (line: number, who: string) => {
      if (!(who in characters)) issue(line, `no character is named "${who}"`, has("characters", Object.keys(characters), who));
      else if (!placed.includes(who)) issue(line, `"${who}" has no place in this scene`, give(who));
    };
    /** What an action comes to, and its own length: none for a walk with a mistake, and no length for what is open. */
    const did = (action: string, { line, who, values, begun }: ActionLine): { values: Did["values"]; length?: number } | undefined => {
      if (action === "walk") {
        const way = stage.walk({ line, who, begun }, (values as z.infer<typeof ACTIONS.walk.values>).to);
        return way && { values: { from: [way.from, GROUND], to: [way.to, GROUND] }, length: Math.max(ms(Math.abs(way.to - way.from) / PACE.walk), 0.001) };
      }
      if (action === "jump") {
        const { times } = values as z.infer<typeof ACTIONS.jump.values>;
        return { values: { times }, length: ms(PACE.hop * times) };
      }
      if (action === "turn") return { values: {}, length: PACE.turn };
      if (action === "look-at") {
        const { target } = values as z.infer<(typeof ACTIONS)["look-at"]["values"]>;
        const others = placed.filter((one) => one !== who && one in characters);
        const another = others.length > 0 ? `name another character the scene places: ${listed(others)}` : "there is nobody else in the scene to look at";
        if (target === who) issue(line, `"${who}" looks at itself`, another);
        else if (target === NARRATOR || target === SCENE) issue(line, `the ${target} is nobody on the stage to look at`, another);
        else known(line, target);
        return { values: { target, apart: stage.apart(who, target) } };
      }
      if (action === "background") {
        const { to } = values as z.infer<typeof ACTIONS.background.values>;
        if (drawn(line, to) && to === backdrop.name) issue(line, `the background is ${to} already`, "change it to another, or leave the line out", [backdrop.line]);
        else backdrop = { name: to, line };
        return { values: { to }, length: AT_ONCE };
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
      if (action === "background") {
        if (who !== SCENE) issue(line, `the background is the ${SCENE}'s to change, and not ${who}'s`, `as in: ${ACTIONS.background.example}`);
      } else if (who === NARRATOR || who === SCENE) issue(line, `the ${who} is nobody on the stage: only a character ${action === "look-at" ? "looks at another" : `${action}s`}`, `name a character${placed.length > 0 ? ` the scene places: ${listed(placed)}` : ", and give it a place in the scene"}`);
      else known(line, who);
      return did(action, one) ?? { values: {}, length: PACE.hold };
    });
    stage.spots();
    return { setting: { background, characters: begins } satisfies Setting, actions };
  });
  return issues.length > 0 ? { issues } : { scenes: checked };
}
