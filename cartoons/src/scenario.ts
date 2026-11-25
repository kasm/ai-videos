// A cartoon's scenario: the source of one episode (CLAUDE.md, "The scenario"), in names: the
// characters and backgrounds it names are drawn in the library (library.yaml, "The library"), and
// a place is a mark on the ground. Checked, it becomes the scenario the picture and the timeline
// read: each name found, each mark a point, each beat's length known. Nothing here draws. The tool
// reads both files and gives them here parsed, so this needs no Node API, as the picture needs none.
import type { Command, Library as LibraryFile } from "ai-videos/plugin";
import { z } from "zod";

/** The stage every scenario is written for, px: x right and y down from the top-left corner. */
export const STAGE = { width: 1920, height: 1080 } as const;

/** The speaker nobody draws. Every other speaker is one of the library's characters. */
export const NARRATOR = "narrator";

/** Whose line a script's change of background is: the scene's, as nobody does it. */
export const SCENE = "scene";

/** Where a character can stand: a mark's x on the stage, px. The two off it are out of sight. */
export const MARKS = { "off-left": -250, left: 480, middle: 960, right: 1440, "off-right": 2170 } as const;
export type Mark = keyof typeof MARKS;

/** The marks on the stage: one character each. Off it, any number wait out of sight. */
export const onStage = (it: Mark) => it !== "off-left" && it !== "off-right";

/** The ground's y, px: every mark is on it, above the caption. */
export const GROUND = 880;

/**
 * A beat's length when it does not say, at the scenario's own pace: a walk at `walk` px a second,
 * a turn in `turn` seconds, a jump in `hop` seconds a hop, and a hold as long as its words take to
 * say, `word` seconds each, and at least `hold`. The tool stretches a beat to its lines anyway. An arm
 * reaches a new pose in `arm` seconds, whatever its beat lasts.
 */
export const PACE = { walk: 320, turn: 0.5, hop: 0.6, word: 0.3, hold: 1, arm: 0.3 } as const;

export const name = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and dashes, a letter first");
const point = z.tuple([z.number(), z.number()]);
const size = z.tuple([z.number().positive(), z.number().positive()]);
const colour = z.string().regex(/^#[0-9a-f]{6}$/i, "a colour is #rrggbb");
const mark = z.enum(Object.keys(MARKS) as [Mark, ...Mark[]]);

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

/** The library, as the plugin reads it: the characters (the tool has taken their voices) and the backgrounds. */
const Library = z
  .strictObject({
    characters: z.record(name, Character).default({}),
    backgrounds: z.record(name, Background).default({}),
  })
  .superRefine((library, ctx) => {
    const issue = (message: string, at: (string | number)[]) => ctx.addIssue({ code: "custom", message, path: at });
    if (NARRATOR in library.characters) issue(`"${NARRATOR}" is the speaker nobody draws: name the character something else`, ["characters", NARRATOR]);
    if (SCENE in library.characters) issue(`"${SCENE}" is whose line changes the background, and nobody on the stage: name the character something else`, ["characters", SCENE]);
    for (const [who, character] of Object.entries(library.characters)) {
      if (ARM in character.parts && !character.shoulder) {
        issue(`"${who}" has an ${ARM} and no shoulder: give the point the arm turns around`, ["characters", who, "shoulder"]);
      }
    }
  });
export type Library = z.infer<typeof Library>;

/** The library as the plugin reads it: an error names its file, with every reason. */
export function readLibrary(library: LibraryFile | undefined): Library {
  const read = Library.safeParse(library?.raw ?? {});
  if (!read.success) throw new Error(`${library?.file} is not a library:\n${z.prettifyError(read.error)}`);
  return read.data;
}

const Line = z.strictObject({ who: name, text: z.string().trim().min(1) });

/**
 * What a beat may do, each described once (the tool's AGENTS.md, "Plugins"): what it takes, what
 * it does, and an example. A beat's checks come from these; so will the tool's prompt.
 */
export const COMMANDS = {
  walk: {
    description: `The character goes from where it stands to \`to\`, a mark (${Object.keys(MARKS).join(", ")}), in a whole number of steps, at about ${PACE.walk} px a second. A walk turns nobody: to walk back, turn first.`,
    example: { who: "pip", to: "middle" },
    schema: z.strictObject({ who: name, to: mark }),
  },
  turn: {
    description: `The character turns to face the other way, and stays so. It takes ${PACE.turn} seconds.`,
    example: { who: "pip" },
    schema: z.strictObject({ who: name }),
  },
  jump: {
    description: `The character hops in place \`times\` times (1 when left out), and ends on the ground. Each hop takes ${PACE.hop} seconds.`,
    example: { who: "pip", times: 2 },
    schema: z.strictObject({ who: name, times: z.number().int().positive().default(1) }),
  },
  pose: {
    description:
      "The poses that change as the beat begins, by character: stand (the arm hangs), wave (raised and swinging) or point (held straight forward). A pose stays until a later beat of the scene changes it; wave and point need the character's arm.",
    example: { pip: "wave", mo: "stand" },
    schema: z.record(name, Pose),
  },
  background: {
    description: "The background from this beat on, in its scene, by name. Everyone stays where they are.",
    example: "night",
    schema: name,
  },
} satisfies Record<string, Command>;

/**
 * A beat is one moment of the clip, and one event for the video tool. With a `walk`, a `turn` or a
 * `jump` (one of them) it is a move; without one it is a hold. As it begins it may change
 * characters' poses and the background. `takes` is its length at the scenario's own pace, seconds:
 * left out, the move's own length, or a hold's words (PACE).
 */
const Beat = z.strictObject({
  name,
  takes: z.number().positive().optional(),
  walk: COMMANDS.walk.schema.optional(),
  turn: COMMANDS.turn.schema.optional(),
  jump: COMMANDS.jump.schema.optional(),
  pose: COMMANDS.pose.schema.default({}),
  background: COMMANDS.background.schema.optional(),
  says: z.array(Line).default([]),
});

const Scene = z.strictObject({
  /** The background the scene begins with. */
  background: name,
  /** The mark each character of the scene stands on as it begins. */
  places: z.record(name, mark).default({}),
  /** Which way a character faces as the scene begins: right, as written, when it is not named. */
  faces: z.record(name, z.enum(["left", "right"])).default({}),
  beats: z.array(Beat).min(1),
});

/** A key a video does not have: what it would draw is drawn once, in the library. */
const inLibrary = (what: string) => z.never({ error: `${what} are drawn in library.yaml, once for every video: a video names them` }).optional();

/** The video file, as the plugin reads it: its scenes, naming the library's characters and backgrounds. */
const Episode = z.strictObject({ characters: inLibrary("characters"), backgrounds: inLibrary("backgrounds"), scenes: z.array(Scene).min(1) });

type Point = [number, number];

/** A beat as the picture and the timeline read it: its length found, and its walk's end a point on the stage. */
export type Beat = Omit<z.infer<typeof Beat>, "takes" | "walk"> & { takes: number; walk?: { who: string; to: Point } };

/** The scenario the picture and the timeline read: the library's drawings, and each scene's places as points. */
export interface Scenario {
  characters: Library["characters"];
  backgrounds: Library["backgrounds"];
  scenes: { background: string; places: Record<string, Point>; faces: Record<string, "left" | "right">; beats: Beat[] }[];
}

const MOVES = ["walk", "turn", "jump"] as const;
type Moves = Partial<Record<(typeof MOVES)[number], { who: string }>>;

/** The beat's move and who makes it, or nothing when the beat is a hold. */
export function moveOf(beat: Moves): { kind: (typeof MOVES)[number]; who: string } | undefined {
  for (const kind of MOVES) {
    const move = beat[kind];
    if (move) return { kind, who: move.who };
  }
  return undefined;
}

/** Whole milliseconds, so lengths added up stay equal where they should. */
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * The episode checked against the library and read as a scenario: every name found, each mark a
 * point on the ground, and each beat's length, written or its own (PACE). A walk's own length is
 * its way, so it is found from where the walker stands, beat by beat.
 */
const scenarioIn = (library: Library) =>
  Episode.transform((episode, ctx): Scenario => {
    const issue = (message: string, at: (string | number)[]) => ctx.issues.push({ code: "custom", message, path: at, input: episode });
    const has = (what: string, names: string[]) => `the library has ${names.length ? `${what}: ${names.join(", ")}` : `no ${what}`}`;
    const noCharacter = (who: string) => `no character is named "${who}": ${has("characters", Object.keys(library.characters))}`;
    const noBackground = (it: string) => `no background is named "${it}": ${has("backgrounds", Object.keys(library.backgrounds))}`;
    const noPlace = (who: string) => `"${who}" has no place in this scene: give it a mark in the scene's places`;
    const beats = new Set<string>();
    const scenes = episode.scenes.map((scene, i) => {
      if (!(scene.background in library.backgrounds)) issue(noBackground(scene.background), ["scenes", i, "background"]);
      for (const who of Object.keys(scene.places)) {
        if (!(who in library.characters)) issue(noCharacter(who), ["scenes", i, "places", who]);
      }
      for (const who of Object.keys(scene.faces)) {
        if (!(who in scene.places)) issue(noPlace(who), ["scenes", i, "faces", who]);
      }
      // Where each character stands, beat by beat: a walk's way begins there, and two never stand on one mark.
      const stands = new Map(Object.entries(scene.places));
      const taken = new Map<Mark, string>();
      for (const [who, it] of stands) {
        const other = taken.get(it);
        if (other !== undefined) issue(`"${other}" and "${who}" both stand at ${it}: give each a mark of its own`, ["scenes", i, "places", who]);
        else if (onStage(it)) taken.set(it, who);
      }
      const read = scene.beats.map((beat, j): Beat => {
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
          else if (pose !== "stand" && library.characters[who] && !(ARM in library.characters[who].parts)) {
            issue(`"${who}" has no part named "${ARM}" to ${pose} with`, [...at, "pose", who]);
          }
        }
        if (beat.background !== undefined && !(beat.background in library.backgrounds)) issue(noBackground(beat.background), [...at, "background"]);
        beat.says.forEach((line, k) => {
          if (line.who !== NARRATOR && !(line.who in library.characters)) {
            issue(`"${line.who}" is neither the ${NARRATOR} nor a character: ${has("characters", Object.keys(library.characters))}`, [...at, "says", k, "who"]);
          }
        });

        let own: number;
        const { walk, takes, ...rest } = beat;
        if (walk) {
          const from = stands.get(walk.who);
          if (from === walk.to) issue(`"${walk.who}" stands at ${walk.to} already: walk to another mark`, [...at, "walk", "to"]);
          else if (onStage(walk.to)) {
            const there = [...stands].find(([other, it]) => other !== walk.who && it === walk.to)?.[0];
            if (there !== undefined) issue(`"${walk.who}" walks to ${walk.to}, where "${there}" stands: walk to another mark`, [...at, "walk", "to"]);
          }
          own = from === undefined ? PACE.hold : Math.abs(MARKS[walk.to] - MARKS[from]) / PACE.walk;
          stands.set(walk.who, walk.to);
        } else if (beat.turn) own = PACE.turn;
        else if (beat.jump) own = PACE.hop * beat.jump.times;
        else own = Math.max(PACE.hold, PACE.word * beat.says.reduce((sum, line) => sum + words(line.text), 0));
        return { ...rest, takes: takes ?? ms(own), ...(walk ? { walk: { who: walk.who, to: [MARKS[walk.to], GROUND] } } : {}) };
      });
      const places = Object.fromEntries(Object.entries(scene.places).map(([who, it]) => [who, [MARKS[it], GROUND] as Point]));
      return { background: scene.background, places, faces: scene.faces, beats: read };
    });
    return { characters: library.characters, backgrounds: library.backgrounds, scenes };
  });

/**
 * Checks a scenario already parsed from YAML against its library, and reads it as the picture and
 * the timeline do. An error names the file that holds the mistake, the library or the video's
 * (`file`), with every reason.
 */
export function checkScenario(raw: unknown, file: string, library: LibraryFile | undefined): Scenario {
  const result = scenarioIn(readLibrary(library)).safeParse(raw);
  if (!result.success) throw new Error(`${file} is not a scenario:\n${z.prettifyError(result.error)}`);
  return result.data;
}
