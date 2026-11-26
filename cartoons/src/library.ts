// The library (library.yaml, CLAUDE.md "The library"): what the cartoons name, each drawn once, the
// characters and the backgrounds, and the stage they are drawn on: its marks, its ground, and each
// action's own pace. Nothing here draws. The tool reads the file and gives it here parsed, so this
// needs no Node API, as the picture needs none.
import type { Library as LibraryFile } from "ai-videos/plugin";
import { z } from "zod";

/** The stage every cartoon is drawn on, px: x right and y down from the top-left corner. */
export const STAGE = { width: 1920, height: 1080 } as const;

/** The speaker nobody draws. Every other speaker is one of the library's characters, or only heard. */
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
 * An action's own pace: a walk at `walk` px a second, a turn in `turn` seconds, a jump in `hop`
 * seconds a hop, and an arm reaches a new pose in `arm` seconds. `hold` is how long the check takes
 * an action it refuses to be, so that the rest is still worked out.
 */
export const PACE = { walk: 320, turn: 0.5, hop: 0.6, hold: 1, arm: 0.3 } as const;

export const name = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and dashes, a letter first");
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
export type Pose = "stand" | "wave" | "point";

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
