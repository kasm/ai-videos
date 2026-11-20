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

/** A character is its named parts (body, eyes, mouth), drawn in the order written, around the point between its feet. */
const Character = z.strictObject({ parts: z.record(name, z.array(Shape).min(1)) });

/** A background fills the stage with a colour, then draws its shapes in stage coordinates. */
const Background = z.strictObject({ fill: colour, shapes: z.array(Shape).default([]) });

const Line = z.strictObject({ who: name, text: z.string().trim().min(1) });

/**
 * A beat is one moment of the clip, and one event for the video tool: it takes `takes` seconds at
 * the scenario's own pace. With a `walk` it is a move; without one, nothing moves and it is a hold.
 */
const Beat = z.strictObject({
  name,
  takes: z.number().positive(),
  walk: z.strictObject({ who: name, to: point }).optional(),
  says: z.array(Line).default([]),
});

const Scene = z.strictObject({
  background: name,
  /** Where each character of the scene stands as it begins: the point between its feet. */
  places: z.record(name, point).default({}),
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
    const beats = new Set<string>();
    s.scenes.forEach((scene, i) => {
      if (!(scene.background in s.backgrounds)) issue(`no background is named "${scene.background}"`, ["scenes", i, "background"]);
      for (const who of Object.keys(scene.places)) {
        if (!(who in s.characters)) issue(`no character is named "${who}"`, ["scenes", i, "places", who]);
      }
      scene.beats.forEach((beat, j) => {
        const at = ["scenes", i, "beats", j];
        // A beat's name is its event's name in the clip, so it is unique in the whole scenario.
        if (beats.has(beat.name)) issue(`beat "${beat.name}" is named twice`, [...at, "name"]);
        beats.add(beat.name);
        if (beat.walk && !(beat.walk.who in scene.places)) {
          issue(`"${beat.walk.who}" has no place in this scene: give it one in the scene's places`, [...at, "walk", "who"]);
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
export type Beat = Scenario["scenes"][number]["beats"][number];

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
