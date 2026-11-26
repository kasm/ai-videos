// One frame's picture: where everything is in a frame of a compiled scenario, as the tool says the
// frame shows it, and that as an SVG. A pure function of what the frame shows and the library, so the
// same frame is the same text, and the same pixels. The script names actions; how each looks (the
// numbers below) is the plugin's.
import type { Library as LibraryFile, Shown, ShownAction } from "ai-videos/plugin";
import { ARM, PACE, STAGE, readLibrary, type Library, type Pose } from "./library.ts";
import type { Did, Setting } from "./script.ts";

type Point = [number, number];
type Background = Library["backgrounds"][string];
type Character = Library["characters"][string];
type Shape = Background["shapes"][number];

/** A walk's step: its length along the way, and how high the character rises in the middle of it, px. */
const STEP = 150;
const BOUNCE = 16;

/** A jump's height, px: each hop goes up and comes down as a thrown ball does. */
const JUMP = 120;

/** How narrow a turning character gets halfway, as a share of its width: a paper cut-out seen edge-on. */
const THIN = 0.04;

/** Within what distance one who passes by turns the character that looks at it, px from middle to middle: about a turn's time, at a walk's own pace. */
const PASS = 120;

/**
 * The arm's angle in each pose, degrees from hanging down as written, for a character facing right:
 * a negative angle lifts it forward, then up. A wave swings SWING to each side, WAVES times a second.
 */
const ARM_AT: Record<Pose, number> = { stand: 0, point: -90, wave: -155 };
const SWING = 20;
const WAVES = 2;

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

/** Which way a turn from facing `from` has a character, `p` of the way through it: a cut-out turned round, its width going as the cosine, fastest edge-on, and never to nothing. */
function turnAt(from: number, p: number): number {
  const width = Math.cos(Math.PI * p);
  return from * (Math.abs(width) < THIN ? (p < 0.5 ? THIN : -THIN) : width);
}

/** A facing, never to nothing. */
const thin = (facing: number) => (Math.abs(facing) < THIN ? (facing < 0 ? -THIN : THIN) : facing);

/**
 * Which way a character faces who looks at one `dx` px to its right, `into` seconds into a look that lasts
 * `length`, having faced `facing` before: as a turn goes, an angle round from 0, facing right, to π. It
 * turns to the other's side in a turn's time, and is as far round as that one is past while it passes
 * within `near`: edge-on as it is in front. When the look is over, `dx` being what it was then, it turns
 * the rest of the way to that side.
 */
function lookAt(facing: number, dx: number, near: number, { into, length }: Pick<ShownAction, "into" | "length">): number {
  const from = Math.acos(facing);
  const towards = (Math.PI / 2) * (1 - Math.max(-1, Math.min(1, dx / near)));
  const looked = from + (towards - from) * Math.min(1, Math.min(into, length) / PACE.turn);
  const side = dx < 0 ? Math.PI : 0;
  return Math.cos(looked + (side - looked) * Math.min(1, Math.max(0, into - length) / PACE.turn));
}

/** How high a jump of so many hops has a character, `p` of the way through it: whole hops, so it ends with the feet down. */
function hopAt(times: number, p: number): number {
  const hop = (p * times) % 1;
  return JUMP * 4 * hop * (1 - hop);
}

/** A pose's arm angle at `time`: a wave swings around its own. */
const armAt = (pose: Pose, time: number) => ARM_AT[pose] + (pose === "wave" ? SWING * Math.sin(2 * Math.PI * WAVES * time) : 0);

/** The arm's angle at `time`, `p` of the way from one pose to another: a wave's swing fades with it, or comes. */
function armBetween(was: Pose, pose: Pose, p: number, time: number): number {
  const reached = ease(p);
  return pose === was ? armAt(pose, time) : armAt(was, time) * (1 - reached) + armAt(pose, time) * reached;
}

/** A background of the library, by its name. */
function backgroundOf(library: Pick<Library, "backgrounds">, name: string): Background {
  const background = library.backgrounds[name];
  if (!background) throw new Error(`no background is named "${name}"`);
  return background;
}

/** One of a scene's actions that has begun, as a frame shows it. */
type Acted = Omit<ShownAction, "action" | "values"> & Did;

/** Where a character's walks had it, `ago` seconds before the frame that shows these actions: those begun by then, each as far through as it was. */
function placeIn(actions: Acted[], who: string, begins: Point, ago: number): Point {
  let at = begins;
  for (const one of actions) {
    if (one.who === who && one.action === "walk" && one.into >= ago) at = walkAt(one.values.from, one.values.to, ago === 0 ? one.progress : (one.into - ago) / one.length);
  }
  return at;
}

/**
 * What a frame of a compiled scenario shows (the tool's AGENTS.md, "A script"), as a staging: the
 * scene's characters as it begins, and then as their actions have them by now, each on its own channel,
 * whose actions are one after another: where a walk has it, how far round a turn or a look, how high a
 * jump over that, and where its arm is. Places depend on no facing, so they come first: a look goes by
 * where the two are, or were as it ended. The background is the last one it has changed to, or the one it
 * begins with.
 */
export function scriptStaging(library: Library, shown: Shown): Staging {
  const { background, characters } = shown.setting as unknown as Setting;
  const { time } = shown;
  const actions = shown.actions as unknown as Acted[];
  let backdrop = background;
  const placeOf = (who: string, ago = 0) => placeIn(actions, who, characters[who]!.at, ago);
  const cast = new Map(Object.entries(characters).map(([name, { facing }]) => [name, { at: placeOf(name), facing: facing as number, high: 0, arm: armAt("stand", time) }]));
  for (const did of actions) {
    const { who, progress, into, length } = did;
    if (did.action === "background") {
      backdrop = did.values.to;
      continue;
    }
    const one = cast.get(who)!;
    if (did.action === "walk") continue;
    if (did.action === "turn") one.facing = turnAt(one.facing, progress);
    else if (did.action === "look-at") {
      const { target, apart } = did.values;
      const ago = Math.max(0, into - length);
      one.facing = lookAt(one.facing, placeOf(target, ago)[0] - placeOf(who, ago)[0], Math.max(1, Math.min(PASS, apart)), did);
    } else if (did.action === "jump") one.high = hopAt(did.values.times, progress);
    else one.arm = armBetween(did.values.from, did.values.to, progress, time);
  }
  return {
    background: backgroundOf(library, backdrop),
    characters: [...cast].map(([name, { at: [x, y], facing, high, arm }]) => ({ name, at: [x, y - high], facing: thin(facing), arm, eyes: eyesAt(name, time) })),
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
 * MOUTH_OPEN of its width tall. Closed, it is the shape as the library draws it; one written
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
    // Only a speaker's mouth moves: the others keep theirs closed, as the library draws them.
    ...characters.map((actor) => characterSvg(library.characters[actor.name]!, actor, mouths[actor.name] ?? 0)),
    "</svg>",
  ].join("\n");
}
