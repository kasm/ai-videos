// Where the characters of a scene stand, in a cartoon written as a script (CLAUDE.md, "The script"): a
// place worked out as its x on the ground, from marks, points, who stands where and how wide each is
// drawn, as the scene begins and then walk by walk in the order written; and how near two may stand,
// whenever each is there. The tool has read each place, worked out the numbers in it, and told of each
// walk which others have surely begun before its end.
import { listed, nearest, shownAs, type ActionLine, type ConstructionOf, type Worked } from "ai-videos/plugin";
import { z } from "zod";
import { MARKS, STAGE, type Library, type Mark } from "./scenario.ts";

/** The gap between two who stand near each other, and how much of one the other may cover: widths of the smaller of the two. */
export const NEAR = 0.3;
const COVER = 0.3;

/** What a place is worked out from others by, each described once: the guide comes from these. */
export const CONSTRUCTIONS = {
  "left-of": {
    description: `On the left of a place, as the viewer sees it, with a gap: from body to body, so many widths of the smaller of the two, as it is drawn. \`near\` is ${NEAR}, 1 leaves room for a body between them, and at 0 they touch. Beside a mark, a point or another construction the gap is from that, in widths of who goes there.`,
    example: "left-of(pip, near)",
  },
  "right-of": { description: "On the right of a place, with a gap, as left-of is on its left.", example: "right-of(pip, 0.5)" },
  midpoint: { description: "Half-way between two places.", example: "midpoint(pip, mo)" },
} satisfies Record<string, ConstructionOf>;

const MARK_NAMES = Object.keys(MARKS);
const isMark = (name: string): name is Mark => Object.hasOwn(MARKS, name);
/** Whether an x is on the stage. The marks off it are out of sight, where any number wait. */
const onStage = (x: number) => x >= 0 && x <= STAGE.width;

/** A place as the tool gives it: a point's x, a name, or a construction. What it names is found when it is worked out. */
export const place: z.ZodType<Worked> = z.union([z.number(), z.string(), z.lazy(() => z.strictObject({ construction: z.string(), of: z.array(place) }))], {
  error: `a place is a mark (${MARK_NAMES.join(", ")}), a point (its x, 0 to ${STAGE.width}), or one worked out: left-of(pip, near)`,
});

/** A place that cannot be worked out: why, and how to mend it; nothing to say, when it rests on another that cannot. */
class Nowhere extends Error {
  readonly hint: string;
  constructor(message: string, hint = "") {
    super(message);
    this.hint = hint;
  }
}

/** How wide a character is, px, as it is drawn: from its leftmost shape to its rightmost. */
function widthOf(character: Library["characters"][string] | undefined): number {
  const edges = Object.values(character?.parts ?? {}).flat().flatMap(({ at: [x], size: [w] }) => [x - w / 2, x + w / 2]);
  return edges.length > 0 ? Math.max(...edges) - Math.min(...edges) : 0;
}

/** How near two of these widths may stand, whole px from middle to middle: nearer, one covers too much of the other. */
const apart = (a: number, b: number) => Math.ceil((a + b) / 2 - COVER * Math.min(a, b) - 0.5);

/** A walk's line, as the tool gives it. */
type WalkLine = Pick<ActionLine, "line" | "who" | "begun">;

/** Where a character stands from when a walk brings it there, or the scene begins, until its next walk; nowhere, when its place is a mistake. */
interface Stay {
  who: string;
  x: number | undefined;
  by?: { walk: WalkLine; where: Worked };
  until?: WalkLine;
}

/** Whether one who stays has surely left when the other comes, however long the voices turn out to be. */
const leavesBefore = (stay: Stay, other: Stay) => stay.until !== undefined && other.by?.walk.begun.includes(stay.until.line) === true;

/**
 * The stage of a scene that begins with these places: where each character stands, its x, whole px. A
 * character's name in a place is where that character stands by then; a mark, a point and a place
 * worked out have no width. A mistake is said with its line: the scene's, or a walk's.
 */
export function stageOf(scene: number, places: Record<string, Worked>, { characters }: Pick<Library, "characters">, say: (line: number, message: string, hint: string, also?: number[]) => void) {
  const placed = Object.keys(places);
  const stands = new Map<string, number>();
  /** Those whose place is a mistake: it is said once, and not for what rests on it. */
  const lost = new Set<string>();
  const width = (who: string) => widthOf(characters[who]);

  /** Where a character stands; as the scene begins, worked out when it is first needed, `through` being whose places need it. */
  const at = (who: string, through: string[]): number | undefined => {
    if (stands.has(who) || lost.has(who) || !placed.includes(who)) return stands.get(who);
    if (through.includes(who)) {
      const round = through.slice(through.indexOf(who));
      throw new Nowhere(`the places go round: ${listed(round.map((one) => `${one} is at ${shownAs(places[one]!)}`))}`, "give one of them a mark or a point");
    }
    const x = worked(scene, who, "begins at", places[who]!, [...through, who]);
    if (x === undefined) lost.add(who);
    else stands.set(who, x);
    return x;
  };

  /** A place as `who` goes there: its x, and how wide what stands there is. */
  const spotOf = (where: Worked, who: string, through: string[]): { x: number; width: number } => {
    if (typeof where === "number") return { x: where, width: 0 };
    if (typeof where === "string") {
      if (isMark(where)) return { x: MARKS[where], width: 0 };
      const x = at(where, through);
      if (x !== undefined) return { x, width: width(where) };
      if (lost.has(where)) throw new Nowhere("");
      if (Object.hasOwn(characters, where)) throw new Nowhere(`"${where}" has no place in this scene`, `give it one, in the scene's places: places: { ${where}: off-left }`);
      const near = nearest(where, [...MARK_NAMES, ...placed]);
      const here = placed.length > 0 ? `, a character of the scene (${listed(placed)})` : "";
      throw new Nowhere(`no place is called "${where}"`, `a place is a mark (${listed(MARK_NAMES)})${here}, or a point that values set (values: { ${where}: 300 })${near ? `: did you mean ${near}?` : ""}`);
    }
    const { construction, of } = where;
    const [first, second] = of;
    if (construction === "midpoint") {
      if (of.length !== 2) throw new Nowhere(`${shownAs(where)} is not between two places`, `write both: ${CONSTRUCTIONS.midpoint.example}`);
      return { x: (spotOf(first!, who, through).x + spotOf(second!, who, through).x) / 2, width: 0 };
    }
    if (of.length !== 2) throw new Nowhere(`${shownAs(where)} is not a place and how far from it`, `write both: ${construction}(pip, near)`);
    if (typeof second !== "number") {
      const near = typeof second === "string" ? nearest(second, ["near"]) : undefined;
      throw new Nowhere(`how far is a number, and ${shownAs(second!)} is none`, `it is in widths of the smaller of the two: near (${NEAR}), or 1 for a body between them${near ? `: did you mean ${near}?` : ""}`);
    }
    const by = spotOf(first!, who, through);
    const own = width(who);
    const away = (own + by.width) / 2 + second * (by.width > 0 ? Math.min(own, by.width) : own);
    return { x: by.x + (construction === "left-of" ? -away : away), width: 0 };
  };

  /** Where a place is for `who`: a mark, or a point of the stage; none when it cannot be worked out, which is said. */
  const worked = (line: number, who: string, does: string, where: Worked, through: string[] = []): number | undefined => {
    try {
      if (typeof where === "string" && isMark(where)) return MARKS[where];
      const x = Math.round(spotOf(where, who, through).x);
      if (onStage(x)) return x;
      throw new Nowhere(`it is ${x}, off the stage, which is 0 to ${STAGE.width}`, `out of sight is off-left or off-right; how far beside is in widths of the smaller of the two, as near (${NEAR}), and not in pixels`);
    } catch (e) {
      if (!(e instanceof Nowhere)) throw e;
      if (e.message !== "") say(line, `"${who}" ${does} ${shownAs(where)}: ${e.message}`, e.hint);
      return undefined;
    }
  };

  for (const who of placed) at(who, []);
  /** Where everyone stays, those that begin there and then walk by walk, in the order written. */
  const stays = placed.map((who): Stay => ({ who, x: stands.get(who) }));

  /** Whether two stay on one spot of the stage: so near that one covers too much of the other. */
  const onOneSpot = (one: Stay, other: Stay) => one.x !== undefined && other.x !== undefined && onStage(one.x) && onStage(other.x) && Math.abs(one.x - other.x) < apart(width(one.who), width(other.who));
  const keepApart = (there: Stay, who: string, x: number) => `${there.who} is at ${there.x} and ${who} at ${x}: they keep ${apart(width(who), width(there.who))} px apart or more, middle to middle, so that neither covers much of the other; left-of(${there.who}, near) is beside ${there.who}`;
  for (const [n, stay] of stays.entries()) {
    const there = stays.slice(0, n).find((other) => onOneSpot(stay, other));
    if (there) say(scene, `"${there.who}" and "${stay.who}" begin on one spot`, keepApart(there, stay.who, stay.x!));
  }

  return {
    /** Where each stands as the scene begins: those whose place is no mistake. */
    begins: new Map(stands),
    /** A walk by a character of the scene: from where it stands, to a place, where it stands then. None when one of the two is a mistake, which is said. */
    walk(walk: WalkLine, where: Worked): { from: number; to: number } | undefined {
      const { line, who } = walk;
      const from = stands.get(who);
      if (from === undefined) return undefined;
      const to = worked(line, who, "walks to", where);
      if (to === from) {
        say(line, `"${who}" stands at ${shownAs(where)} already`, "walk to another place, or leave the line out");
        return { from, to };
      }
      stays.findLast((stay) => stay.who === who)!.until = walk;
      stays.push({ who, x: to, by: { walk, where } });
      if (to === undefined) return undefined;
      stands.set(who, to);
      return { from, to };
    },
    /**
     * Says it of each walk that ends on one spot with another: one who begins there, or whom a walk above
     * brings there, and who has not surely left it by the time this one comes. The walk that takes it away
     * may be written below: at once is at once. Nothing written below a walk has surely come and gone before
     * its end. Once all have walked.
     */
    spots(): void {
      for (const [n, stay] of stays.entries()) {
        const { who, x, by } = stay;
        const there = by && stays.slice(0, n).find((other) => other.who !== who && onOneSpot(stay, other) && !leavesBefore(other, stay));
        if (!there) continue;
        const { line } = by.walk;
        const walks = `"${who}" walks to ${shownAs(by.where)}, where "${there.who}"`;
        const { until } = there;
        if (!until) say(line, `${walks} stands`, keepApart(there, who, x!));
        else if (until.line > line) say(line, `${walks} stands`, `${there.who} leaves it at line ${until.line}: write that line above this one, or the two at once, joined by & and with no anchor; or walk beside ${there.who}`, [until.line]);
        else say(line, `${walks} may still stand`, `${there.who} leaves it at line ${until.line}, and only the voices say whether that begins before ${who} is there: write this line below that one, in order, or the two at once, joined by & and with no anchor`, [until.line]);
      }
    },
  };
}
