// One frame's picture: where everything is at a moment of the scenario, and that as an SVG. A pure
// function of the scenario and the moment, so the same moment is the same text, and the same pixels.
import { STAGE, type Scenario } from "./scenario.ts";
import type { Moment } from "./timeline.ts";

type Point = [number, number];
type Background = Scenario["backgrounds"][string];
type Character = Scenario["characters"][string];
type Shape = Background["shapes"][number];

/** A walk's step: its length along the way, and how high the character rises in the middle of it, px. */
const STEP = 150;
const BOUNCE = 16;

/** The part that talks, and how tall it is when wide open, as a share of its width: nearly round. */
const MOUTH = "mouth";
const MOUTH_OPEN = 0.9;

/** 0 to 1, slow at both ends: a walk starts and stops softly. */
const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);

export interface Staging {
  background: Background;
  /** The characters the scene places, in the order written, each at the point between its feet. */
  characters: { name: string; at: Point }[];
}

/**
 * The scene of the moment's beat: its characters where the beats before left them, and the one who
 * walks now part of the way. A walk is a whole number of steps, so it ends with both feet down.
 */
export function stagingAt(scenario: Scenario, moment: Pick<Moment, "beat" | "progress">): Staging {
  let first = 0; // the scene's first beat, counted through the scenario
  for (const scene of scenario.scenes) {
    if (moment.beat >= first + scene.beats.length) {
      first += scene.beats.length;
      continue;
    }
    const places = new Map<string, Point>(Object.entries(scene.places).map(([who, at]) => [who, [...at]]));
    for (const [i, beat] of scene.beats.entries()) {
      if (first + i > moment.beat) break;
      const from = beat.walk && places.get(beat.walk.who);
      if (!beat.walk || !from) continue;
      const { who, to } = beat.walk;
      if (first + i < moment.beat) {
        places.set(who, [...to]);
        continue;
      }
      const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
      const p = ease(moment.progress);
      const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / STEP));
      const rise = moment.progress >= 1 ? 0 : BOUNCE * Math.abs(Math.sin(Math.PI * steps * p));
      places.set(who, [from[0] + dx * p, from[1] + dy * p - rise]);
    }
    const background = scenario.backgrounds[scene.background];
    if (!background) throw new Error(`no background is named "${scene.background}"`);
    return { background, characters: [...places].map(([name, at]) => ({ name, at })) };
  }
  throw new Error(`the scenario has no beat ${moment.beat}`);
}

/** Hundredths of a pixel: enough for the picture, and the same text for the same place. */
const n = (value: number) => String(Math.round(value * 100) / 100 + 0);

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

/** A character's parts in the order written, its `mouth` part as open as `mouth` says. */
const characterSvg = (character: Character, at: Point, mouth: number) =>
  `<g transform="translate(${n(at[0])} ${n(at[1])})">${Object.entries(character.parts)
    .flatMap(([part, shapes]) => (part === MOUTH && mouth > 0 ? shapes.map((shape) => openMouth(shape, mouth)) : shapes))
    .map(shapeSvg)
    .join("")}</g>`;

/** The moment's picture as an SVG of the whole stage, `width` by `height` pixels. */
export function frameSvg(scenario: Scenario, moment: Moment, { width, height }: { width: number; height: number }): string {
  const { background, characters } = stagingAt(scenario, moment);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAGE.width} ${STAGE.height}" width="${width}" height="${height}">`,
    `<rect width="${STAGE.width}" height="${STAGE.height}" fill="${background.fill}"/>`,
    ...background.shapes.map(shapeSvg),
    // Every character's mouth moves with the voice, until the request says who speaks.
    ...characters.map(({ name, at }) => characterSvg(scenario.characters[name]!, at, moment.mouth)),
    "</svg>",
  ].join("\n");
}
