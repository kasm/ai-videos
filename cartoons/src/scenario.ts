// A cartoon's scenario: the hand-written source of one episode (CLAUDE.md, "The scenario").
// Everything the maker draws and says comes from it; nothing here draws.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

/** The stage every scenario is written for, px: x right and y down from the top-left corner. */
export const STAGE = { width: 1920, height: 1080 } as const;

/** The speaker nobody draws. Every other speaker is one of the scenario's characters. */
export const NARRATOR = "narrator";

const name = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and dashes, a letter first");
const point = z.tuple([z.number(), z.number()]);
const size = z.tuple([z.number().positive(), z.number().positive()]);
const colour = z.string().regex(/^#[0-9a-f]{6}$/i, "a colour is #rrggbb");

/** One flat shape: `at` is its centre, `size` its width and height. */
const Shape = z.discriminatedUnion("shape", [
  z.strictObject({ shape: z.literal("rect"), at: point, size, round: z.number().min(0).optional(), fill: colour }),
  z.strictObject({ shape: z.literal("ellipse"), at: point, size, fill: colour }),
]);

/** The part that waves and points: it turns around its character's `shoulder`. */
export const ARM = "arm";

/**
 * A character is its named parts (body, arm, eyes, mouth), drawn in the order written, around the
 * point between its feet, and written facing right. `shoulder` is the point its arm turns around.
 */
const Character = z.strictObject({ parts: z.record(name, z.array(Shape).min(1)), shoulder: point.optional() });

/** Where a character's arm is: hanging as written, raised and swinging, or held straight forward. */
const Pose = z.enum(["stand", "wave", "point"]);
export type Pose = z.infer<typeof Pose>;

/** A background fills the stage with a colour, then draws its shapes in stage coordinates. */
const Background = z.strictObject({ fill: colour, shapes: z.array(Shape).default([]) });

const Line = z.strictObject({ who: name, text: z.string().trim().min(1) });

/**
 * A beat is one moment of the clip, and one event for the video tool: it takes `takes` seconds at
 * the scenario's own pace. With a `walk`, a `turn` or a `jump` (one of them) it is a move; without
 * one it is a hold. As it begins it may change characters' poses and the background.
 */
const Beat = z.strictObject({
  name,
  takes: z.number().positive(),
  /** The character goes from where it stands to `to`. */
  walk: z.strictObject({ who: name, to: point }).optional(),
  /** The character turns to face the other way, and stays so. */
  turn: z.strictObject({ who: name }).optional(),
  /** The character hops in place, `times` times. */
  jump: z.strictObject({ who: name, times: z.number().int().positive().default(1) }).optional(),
  /** The poses that change as the beat begins, by character: each stays until a later beat changes it. */
  pose: z.record(name, Pose).default({}),
  /** The background from this beat on, in its scene. */
  background: name.optional(),
  says: z.array(Line).default([]),
});

type Beat = z.infer<typeof Beat>;
export type { Beat };

const MOVES = ["walk", "turn", "jump"] as const;

/** The beat's move and who makes it, or nothing when the beat is a hold. */
export function moveOf(beat: Beat): { kind: (typeof MOVES)[number]; who: string } | undefined {
  for (const kind of MOVES) {
    const move = beat[kind];
    if (move) return { kind, who: move.who };
  }
  return undefined;
}

const Scene = z.strictObject({
  /** The background the scene begins with. */
  background: name,
  /** Where each character of the scene stands as it begins: the point between its feet. */
  places: z.record(name, point).default({}),
  /** Which way a character faces as the scene begins: right, as written, when it is not named. */
  faces: z.record(name, z.enum(["left", "right"])).default({}),
  beats: z.array(Beat).min(1),
});

export const Scenario = z
  .strictObject({
    characters: z.record(name, Character).default({}),
    backgrounds: z.record(name, Background),
    scenes: z.array(Scene).min(1),
  })
  .superRefine((s, ctx) => {
    const issue = (message: string, at: (string | number)[]) => ctx.addIssue({ code: "custom", message, path: at });
    if (NARRATOR in s.characters) issue(`"${NARRATOR}" is the speaker nobody draws: name the character something else`, ["characters", NARRATOR]);
    for (const [who, character] of Object.entries(s.characters)) {
      if (ARM in character.parts && !character.shoulder) {
        issue(`"${who}" has an ${ARM} and no shoulder: give the point the arm turns around`, ["characters", who, "shoulder"]);
      }
    }
    const beats = new Set<string>();
    s.scenes.forEach((scene, i) => {
      const noPlace = (who: string) => `"${who}" has no place in this scene: give it one in the scene's places`;
      if (!(scene.background in s.backgrounds)) issue(`no background is named "${scene.background}"`, ["scenes", i, "background"]);
      for (const who of Object.keys(scene.places)) {
        if (!(who in s.characters)) issue(`no character is named "${who}"`, ["scenes", i, "places", who]);
      }
      for (const who of Object.keys(scene.faces)) {
        if (!(who in scene.places)) issue(noPlace(who), ["scenes", i, "faces", who]);
      }
      scene.beats.forEach((beat, j) => {
        const at = ["scenes", i, "beats", j];
        // A beat's name is its event's name in the clip, so it is unique in the whole scenario.
        if (beats.has(beat.name)) issue(`beat "${beat.name}" is named twice`, [...at, "name"]);
        beats.add(beat.name);
        const moves = MOVES.filter((kind) => beat[kind]);
        if (moves.length > 1) issue(`a beat has one move, not ${moves.join(" and ")}: give each a beat of its own`, [...at, moves[1]!]);
        for (const kind of moves) {
          const who = beat[kind]!.who;
          if (!(who in scene.places)) issue(noPlace(who), [...at, kind, "who"]);
        }
        for (const [who, pose] of Object.entries(beat.pose)) {
          if (!(who in scene.places)) issue(noPlace(who), [...at, "pose", who]);
          // Standing needs no arm; a wave or a point with none would show nothing.
          else if (pose !== "stand" && s.characters[who] && !(ARM in s.characters[who].parts)) {
            issue(`"${who}" has no part named "${ARM}" to ${pose} with`, [...at, "pose", who]);
          }
        }
        if (beat.background !== undefined && !(beat.background in s.backgrounds)) {
          issue(`no background is named "${beat.background}"`, [...at, "background"]);
        }
        beat.says.forEach((line, k) => {
          if (line.who !== NARRATOR && !(line.who in s.characters)) {
            issue(`"${line.who}" is neither the ${NARRATOR} nor a character`, [...at, "says", k, "who"]);
          }
        });
      });
    });
  });
export type Scenario = z.infer<typeof Scenario>;

/** Checks a scenario already parsed from YAML. `file` is only named in the error. */
export function checkScenario(raw: unknown, file: string): Scenario {
  const result = Scenario.safeParse(raw);
  if (!result.success) throw new Error(`${file} is not a scenario:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Reads and checks a scenario file. An error names the file and every reason. */
export function readScenario(file: string): Scenario {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no scenario at ${file}`);
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    throw new Error(`${file} is not YAML: ${(e as Error).message}`);
  }
  return checkScenario(raw, file);
}
