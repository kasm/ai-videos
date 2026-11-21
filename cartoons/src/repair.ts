// What the plugin mends in a scenario before it is checked (the tool's AGENTS.md, "Plugins"): only
// what has one right answer, each said in a sentence. The scenario stays in names, as written but
// for what is mended, so it could be written back. What it can't make sense of it leaves as it is,
// for the check to refuse.
import type { Library } from "ai-videos/plugin";
import { MARKS, type Mark } from "./scenario.ts";

const MOVES = ["walk", "turn", "jump"];

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const isMark = (v: unknown): v is Mark => typeof v === "string" && Object.hasOwn(MARKS, v);
const nameOf = (beat: Raw) => (typeof beat.name === "string" ? beat.name : "beat");
const both = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]!);

/**
 * The scenario mended, a copy:
 * - a beat with two or three moves becomes a beat for each, in the order written, its lines,
 *   poses, background and `takes` with the first;
 * - a walk away from where the walker faces gets a beat before it that turns the walker round.
 */
export function repairScenario(raw: unknown, _library: Library | undefined): { source: unknown; did: string[] } {
  if (!isRecord(raw) || !Array.isArray(raw.scenes)) return { source: raw, did: [] };
  const source = structuredClone(raw) as Raw & { scenes: unknown[] };
  const did: string[] = [];
  // Every beat's name, so a beat put in gets one no other has.
  const names = new Set<string>();
  for (const scene of source.scenes) {
    if (isRecord(scene) && Array.isArray(scene.beats)) for (const beat of scene.beats) if (isRecord(beat)) names.add(nameOf(beat));
  }
  const fresh = (base: string) => {
    let name = base;
    for (let n = 2; names.has(name); n++) name = `${base}-${n}`;
    names.add(name);
    return name;
  };
  for (const scene of source.scenes) {
    if (!isRecord(scene) || !Array.isArray(scene.beats)) continue;
    scene.beats = splitMoves(scene.beats, fresh, did);
    scene.beats = turnBeforeWalks(scene, scene.beats as unknown[], fresh, did);
  }
  return { source, did };
}

/** A beat has one move: the second and third of a beat become beats of their own after it. */
function splitMoves(beats: unknown[], fresh: (base: string) => string, did: string[]): unknown[] {
  return beats.flatMap((beat) => {
    if (!isRecord(beat)) return [beat];
    const moves = Object.keys(beat).filter((key) => MOVES.includes(key));
    if (moves.length < 2) return [beat];
    const name = nameOf(beat);
    const first: Raw = { ...beat };
    const after = moves.slice(1).map((kind) => {
      delete first[kind];
      return { name: fresh(`${name}-${kind}`), [kind]: beat[kind] };
    });
    const what = both(moves.map((kind) => `a ${kind}`));
    const beatsAfter = both(after.map((b) => `"${b.name}"`));
    did.push(`beat "${name}" had ${what}, and a beat has one move: ${after.length > 1 ? `beats ${beatsAfter} follow it` : `beat ${beatsAfter} follows it`} with the rest`);
    return [first, ...after];
  });
}

/**
 * A walk turns nobody, so one away from where the walker faces would go backwards: a beat that
 * turns the walker round is put in before it. Where each character stands and faces is followed
 * from the scene's places and faces, beat by beat.
 */
function turnBeforeWalks(scene: Raw, beats: unknown[], fresh: (base: string) => string, did: string[]): unknown[] {
  const faces = isRecord(scene.faces) ? scene.faces : {};
  const stands = new Map<string, number>();
  const facing = new Map<string, number>();
  for (const [who, mark] of Object.entries(isRecord(scene.places) ? scene.places : {})) {
    if (!isMark(mark)) continue;
    stands.set(who, MARKS[mark]);
    facing.set(who, faces[who] === "left" ? -1 : 1);
  }
  return beats.flatMap((beat) => {
    if (!isRecord(beat)) return [beat];
    const turned = isRecord(beat.turn) ? beat.turn.who : undefined;
    if (typeof turned === "string" && facing.has(turned)) facing.set(turned, -facing.get(turned)!);
    const walk = beat.walk;
    if (!isRecord(walk) || typeof walk.who !== "string" || !isMark(walk.to)) return [beat];
    const who = walk.who;
    const from = stands.get(who);
    if (from === undefined) return [beat];
    const to = MARKS[walk.to];
    stands.set(who, to);
    const way = Math.sign(to - from);
    if (way === 0 || way === facing.get(who)) return [beat];
    facing.set(who, way);
    const turn = { name: fresh(`${nameOf(beat)}-turn`), turn: { who } };
    did.push(`"${who}" faced away from ${walk.to}, where it walks in beat "${nameOf(beat)}": beat "${turn.name}" turns it round first`);
    return [turn, beat];
  });
}
