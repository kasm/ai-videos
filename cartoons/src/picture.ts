// One frame's picture: where everything is at a moment of the scenario, and that as an SVG. A pure
// function of the scenario and the moment, so the same moment is the same text, and the same pixels.
// The scenario names moves and poses; how each looks (the numbers below) is the plugin's. A cartoon
// written as a script is drawn the same, from what a frame of its compiled scenario shows.
import type { Library as LibraryFile, Shown } from "ai-videos/plugin";
import { ARM, STAGE, moveOf, readLibrary, type Library, type Pose, type Scenario } from "./scenario.ts";
import type { Setting, Walk } from "./script.ts";
import type { Moment } from "./timeline.ts";

type Point = [number, number];
type Background = Scenario["backgrounds"][string];
type Character = Scenario["characters"][string];
type Shape = Background["shapes"][number];

/** A walk's step: its length along the way, and how high the character rises in the middle of it, px. */
const STEP = 150;
const BOUNCE = 16;

/** A jump's height, px: each hop goes up and comes down as a thrown ball does. */
const JUMP = 120;

/** How narrow a turning character gets halfway, as a share of its width: a paper cut-out seen edge-on. */
const THIN = 0.04;

/**
 * The arm's angle in each pose, degrees from hanging down as written, for a character facing right:
 * a negative angle lifts it forward, then up. A wave swings SWING to each side, WAVES times a second.
 */
const ARM_AT: Record<Pose, number> = { stand: 0, point: -90, wave: -155 };
const SWING = 20;
const WAVES = 2;
/** How long an arm takes to reach a new pose, seconds. */
const REACH = 0.3;

/** The part that talks, and how tall it is when wide open, as a share of its width: nearly round. */
const MOUTH = "mouth";
const MOUTH_OPEN = 0.9;

/**
 * The part that blinks: once in every `every` seconds, for `takes` seconds, down to `shut` of its
 * height.
 */
const EYES = "eyes";
const BLINK = { every: 3.2, takes: 0.2, shut: 0.1 };

/** 0 to 1, slow at both ends: a walk starts and stops softly. */
const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);

/** One character on the stage at a moment. */
export interface Actor {
  name: string;
  /** The point between its feet. */
  at: Point;
  /** 1 facing right, as written, and -1 mirrored; between them, how wide it is while it turns. */
  facing: number;
  /** Its arm's angle, degrees from hanging down. */
  arm: number;
  /** How open its eyes are: 1, or less in a blink. */
  eyes: number;
}

export interface Staging {
  background: Background;
  /** The characters the scene places, in the order written. */
  characters: Actor[];
}

/**
 * A number from 0 to 1 for a name and a count: the same in every run, and different for each
 * character and each blink. FNV-1a, then MurmurHash3's last mix: without it the count, hashed last,
 * hardly moves the high bits, and every blink would come at nearly the same place in its 3.2 s.
 */
function chance(name: string, count: number): number {
  let hash = 0x811c9dc5;
  for (const letter of `${name}:${count}`) hash = Math.imul(hash ^ letter.codePointAt(0)!, 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
}

/**
 * How open `name`'s eyes are at `time`: one blink in every BLINK.every seconds, somewhere in the
 * middle of them, so blinks are neither regular nor close together. The lids go down, stay shut
 * for the middle third of the blink (two frames at 30 a second), and go up.
 */
function eyesAt(name: string, time: number): number {
  const count = Math.floor(time / BLINK.every);
  const begins = (count + 0.2 + 0.6 * chance(name, count)) * BLINK.every;
  const through = (time - begins) / BLINK.takes;
  if (through <= 0 || through >= 1) return 1;
  const open = Math.max(0, (Math.abs(2 * through - 1) - 1 / 3) * 1.5);
  return BLINK.shut + (1 - BLINK.shut) * open;
}

/** Where a walk has a character, `p` of the way through it: a whole number of steps, so it ends with the feet down. */
function walkAt(from: Point, to: Point, p: number): Point {
  if (p >= 1) return [...to];
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const way = ease(p);
  const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / STEP));
  return [from[0] + dx * way, from[1] + dy * way - BOUNCE * Math.abs(Math.sin(Math.PI * steps * way))];
}

/** A pose's arm angle at `time`: a wave swings around its own. */
const armAt = (pose: Pose, time: number) => ARM_AT[pose] + (pose === "wave" ? SWING * Math.sin(2 * Math.PI * WAVES * time) : 0);

/**
 * The scene of the moment's beat: its characters where the beats before left them, facing and posed
 * as those left them, and the moment's own beat part of the way. A jump is a whole number of hops,
 * so it ends with the feet down.
 */
export function stagingAt(scenario: Scenario, moment: Pick<Moment, "beat" | "progress" | "time" | "into">): Staging {
  let first = 0; // the scene's first beat, counted through the scenario
  for (const scene of scenario.scenes) {
    if (moment.beat >= first + scene.beats.length) {
      first += scene.beats.length;
      continue;
    }
    // `was` is the pose the moment's beat found the character in: its arm goes from there.
    const cast = new Map(
      Object.entries(scene.places).map(([who, at]) => [who, { at: [...at] as Point, facing: scene.faces[who] === "left" ? -1 : 1, pose: "stand" as Pose, was: "stand" as Pose }]),
    );
    let backdrop = scene.background;
    for (const [i, beat] of scene.beats.entries()) {
      if (first + i > moment.beat) break;
      const now = first + i === moment.beat;
      if (beat.background !== undefined) backdrop = beat.background;
      for (const [who, pose] of Object.entries(beat.pose)) {
        const one = cast.get(who);
        if (!one) continue;
        if (!now) one.was = pose;
        one.pose = pose;
      }
      const move = moveOf(beat);
      const one = move && cast.get(move.who);
      if (!one) continue;
      const p = now ? moment.progress : 1;
      if (beat.walk) {
        one.at = walkAt(one.at, beat.walk.to, p);
      } else if (beat.turn) {
        // A cut-out turned round: its width goes as the cosine, fastest edge-on, and never to nothing.
        const width = Math.cos(Math.PI * p);
        one.facing *= p >= 1 ? -1 : Math.abs(width) < THIN ? (p < 0.5 ? THIN : -THIN) : width;
      } else if (beat.jump && p < 1) {
        const hop = (p * beat.jump.times) % 1;
        one.at = [one.at[0], one.at[1] - JUMP * 4 * hop * (1 - hop)];
      }
    }
    const background = backgroundOf(scenario, backdrop);
    // The arm leaves its old pose and reaches the new one over REACH: a wave's swing fades with it.
    const reached = ease(Math.min(1, moment.into / REACH));
    const characters = [...cast].map(([name, { at, facing, pose, was }]) => ({
      name,
      at,
      facing,
      arm: pose === was ? armAt(pose, moment.time) : armAt(was, moment.time) * (1 - reached) + armAt(pose, moment.time) * reached,
      eyes: eyesAt(name, moment.time),
    }));
    return { background, characters };
  }
  throw new Error(`the scenario has no beat ${moment.beat}`);
}

/** A background of the library, by its name. */
function backgroundOf(library: Pick<Library, "backgrounds">, name: string): Background {
  const background = library.backgrounds[name];
  if (!background) throw new Error(`no background is named "${name}"`);
  return background;
}

/**
 * What a frame of a compiled scenario shows (the tool's AGENTS.md, "A script"), as a staging: the
 * scene's characters where it begins, each then where its walks have it by now. Nothing turns a
 * character or moves its arm yet.
 */
export function scriptStaging(library: Library, shown: Shown): Staging {
  const { background, characters } = shown.setting as unknown as Setting;
  const at = new Map(Object.entries(characters).map(([name, one]) => [name, one.at]));
  for (const { who, values, progress } of shown.actions) {
    const { from, to } = values as unknown as Walk;
    at.set(who, walkAt(from, to, progress));
  }
  return {
    background: backgroundOf(library, background),
    characters: Object.entries(characters).map(([name, { facing }]) => ({ name, at: at.get(name)!, facing, arm: ARM_AT.stand, eyes: eyesAt(name, shown.time) })),
  };
}

/** Hundredths of a pixel (or one part in `per`): enough for the picture, and the same text for the same place. */
const n = (value: number, per = 100) => String(Math.round(value * per) / per + 0);

function shapeSvg(shape: Shape): string {
  const [x, y] = shape.at;
  const [w, h] = shape.size;
  if (shape.shape === "ellipse") return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${shape.fill}"/>`;
  const round = shape.round ? ` rx="${n(shape.round)}"` : "";
  return `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}"${round} fill="${shape.fill}"/>`;
}

/**
 * A mouth's shape, `open` from 0 to 1: its top edge stays and the jaw drops, until the shape is
 * MOUTH_OPEN of its width tall. Closed, it is the shape as the scenario writes it; one written
 * taller than that stays as it is.
 */
function openMouth(shape: Shape, open: number): Shape {
  const [w, h] = shape.size;
  const tall = h + Math.max(0, MOUTH_OPEN * w - h) * open;
  return { ...shape, at: [shape.at[0], shape.at[1] + (tall - h) / 2], size: [w, tall] };
}

/**
 * The eyes' shapes, `open` of their height: all close towards one line, the middle of the whole
 * part, so a pupil stays inside its eye.
 */
function blink(shapes: Shape[], open: number): Shape[] {
  const top = Math.min(...shapes.map((shape) => shape.at[1] - shape.size[1] / 2));
  const bottom = Math.max(...shapes.map((shape) => shape.at[1] + shape.size[1] / 2));
  const middle = (top + bottom) / 2;
  return shapes.map((shape) => ({ ...shape, at: [shape.at[0], middle + (shape.at[1] - middle) * open], size: [shape.size[0], shape.size[1] * open] }));
}

/**
 * A character's parts in the order written, around the point between its feet: mirrored when it
 * faces left, its `mouth` as open as `mouth` says, its `eyes` as the blink leaves them, and its
 * `arm` turned around the shoulder. A part that is as written is drawn as written.
 */
function characterSvg(character: Character, actor: Actor, mouth: number): string {
  const facing = n(actor.facing, 10000);
  const parts = Object.entries(character.parts).map(([part, shapes]) => {
    if (part === MOUTH && mouth > 0) shapes = shapes.map((shape) => openMouth(shape, mouth));
    if (part === EYES && actor.eyes < 1) shapes = blink(shapes, actor.eyes);
    const svg = shapes.map(shapeSvg).join("");
    const angle = n(actor.arm);
    if (part !== ARM || !character.shoulder || angle === "0") return svg;
    return `<g transform="rotate(${angle} ${n(character.shoulder[0])} ${n(character.shoulder[1])})">${svg}</g>`;
  });
  return `<g transform="translate(${n(actor.at[0])} ${n(actor.at[1])})${facing === "1" ? "" : ` scale(${facing} 1)`}">${parts.join("")}</g>`;
}

/** A picture's size, pixels. */
interface Size {
  width: number;
  height: number;
}

/** The moment's picture as an SVG of the whole stage, `width` by `height` pixels. */
export const frameSvg = (scenario: Scenario, moment: Moment, size: Size) => svgOf(scenario, stagingAt(scenario, moment), moment.mouths, size);

/** The pictures of a cartoon written as a script: the library read once, and each frame's SVG drawn from what it shows. */
export function drawScript(file: LibraryFile | undefined): (shown: Shown, size: Size) => string {
  const library = readLibrary(file);
  return (shown, size) => svgOf(library, scriptStaging(library, shown), shown.mouths, size);
}

/** A staging as an SVG of the whole stage, the characters drawn as the library has them, each mouth as open as `mouths` says. */
function svgOf(library: Pick<Library, "characters">, { background, characters }: Staging, mouths: Record<string, number>, { width, height }: Size): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAGE.width} ${STAGE.height}" width="${width}" height="${height}">`,
    `<rect width="${STAGE.width}" height="${STAGE.height}" fill="${background.fill}"/>`,
    ...background.shapes.map(shapeSvg),
    // Only a speaker's mouth moves: the others keep theirs closed, as the scenario writes it.
    ...characters.map((actor) => characterSvg(library.characters[actor.name]!, actor, mouths[actor.name] ?? 0)),
    "</svg>",
  ].join("\n");
}
