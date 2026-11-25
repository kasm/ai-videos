// A script as a plan of what happens at once (plan.ts): what each anchor names, when everything
// begins and ends, and what is refused before anything is spoken, with the lines it is between. The
// laws themselves are tried in times.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { secondsOf, type Span } from "./formula.ts";
import { begunBy, planOf, timeIssues, type Channels, type Lasting } from "./plan.ts";
import { readScript } from "./read.ts";
import { linesIn, type ScriptItem } from "./scenario.ts";
import { times } from "./times.ts";
import { workOut, type WorkedLine, type WorkedScene } from "./values.ts";

/** A `slide` keeps the place busy, a `nod` the head, a `turn` the facing, a `spin` the place and the facing, and a `watch`, which is open, the facing. */
const ACTIONS: Channels = { slide: { channels: ["place"] }, nod: { channels: ["head"] }, turn: { channels: ["facing"] }, spin: { channels: ["place", "facing"] }, watch: { channels: ["facing"], open: true } };
/** Half a second before a scene's first line, 0.3 s between lines, a second after its last; an action's value is `to`. */
const GIVEN = { actions: { slide: { to: {} }, nod: {}, turn: {}, spin: {}, watch: {} }, open: ["watch"], names: {}, speakers: ["sq", "mo", "tri", "radio"], timing: { lead: 0.5, gap: 0.3, tail: 1 } };

/** Scenes of these rows, their values worked out, the first row of the first on line 1. */
function scenes(...scripts: string[][]): WorkedScene[] {
  let first = 1;
  const written = scripts.map((rows) => {
    const { items, issues } = readScript(rows.join("\n"), first);
    assert.deepEqual(issues, []);
    const scene = { line: first, setting: {}, items };
    first += rows.length;
    return scene;
  });
  const worked = workOut({ scenes: written, issues: [] }, GIVEN);
  assert.deepEqual(worked.issues, []);
  return worked.scenes;
}

/** Ten frames a second. */
const frames = (seconds: Span) => Math.round(secondsOf(seconds, () => 0) * 10);
/** A voice lasts a frame a letter, and an action 20 frames at its own speed, from 10 to 40, unless it is given its length. */
const lasting = ({ action, text, lasts }: WorkedLine): Lasting => {
  if (text !== undefined) return { kind: "voice", length: text.length };
  const { channels, open } = ACTIONS[action]!;
  if (open) return { kind: "move", channels, length: "open" };
  if (lasts && "takes" in lasts) return { kind: "move", channels, length: frames(lasts.takes) };
  return { kind: "move", channels, length: { own: 20, least: 10, most: 40 }, arrive: lasts && "arrive" in lasts ? lasts.arrive : undefined };
};

/** When each line of the scenes happens, by its line: the frame it begins on, and the one it has stopped by. */
function when(...scripts: string[][]) {
  const written = scenes(...scripts);
  assert.deepEqual(timeIssues(written, ACTIONS), []);
  const { video, items } = planOf(written, frames, lasting);
  const placed = times(video);
  return Object.fromEntries(
    written.flatMap((scene) => linesIn(scene.items)).map((line) => {
      const { start, end } = placed.get(items.get(line as ScriptItem<WorkedLine>)!)!;
      return [line.line, [start, end]];
    }),
  );
}
const refused = (...scripts: string[][]) => timeIssues(scenes(...scripts), ACTIONS);
/** What is refused: the line, the others it is between, and why. */
const why = (...scripts: string[][]) => refused(...scripts).map(({ line, also = [], message }) => [line, also, message]);

const TEN = "0123456789";
const TWENTY = TEN + TEN;

test("lines are in order, and blocks in order or together, to any depth", () => {
  assert.deepEqual(when([`sq say: ${TEN}`, "sq slide to=left", `mo say: ${TEN}`]), { 1: [5, 15], 2: [18, 38], 3: [41, 51] });
  const tracks = [
    "together:",
    "  in order:",
    `    radio say: ${TWENTY}`,
    `    radio say: ${TWENTY}`,
    "  in order:",
    `    sq say: ${TEN}`,
    "    together:",
    `      mo say: ${TEN}`,
    `      tri say: ${TEN}56`,
    `    sq say: ${TEN}`,
    `narrator say: ${TEN}`,
  ];
  assert.deepEqual(when(tracks), { 3: [5, 25], 4: [28, 48], 6: [5, 15], 8: [18, 28], 9: [18, 30], 10: [33, 43], 11: [51, 61] });
  // The next scene begins where the one before has ended, its tail too.
  assert.deepEqual(when([`sq say: ${TEN}`], [`sq say: ${TEN}`]), { 1: [5, 15], 2: [30, 40] });
});

test("what is joined begins with the line above it, and the next line waits for both; an action is fitted to the words", () => {
  assert.deepEqual(when([`sq say: ${TEN}`, `& mo say: ${TWENTY}`, `sq say: ${TEN}`]), { 1: [5, 15], 2: [5, 25], 3: [28, 38] });
  assert.deepEqual(when(["sq slide to=left", `& narrator say: ${TEN}4567`, `sq say: ${TEN}`]), { 1: [5, 19], 2: [5, 19], 3: [22, 32] });
  // No faster than its fastest, and no slower than its slowest.
  assert.deepEqual(when(["sq slide to=left", "& narrator say: 012"]), { 1: [5, 15], 2: [5, 8] });
  assert.deepEqual(when(["sq slide to=left", `& narrator say: ${TWENTY}${TWENTY}${TEN}`]), { 1: [5, 45], 2: [5, 55] });
});

test("channels: one character's different ones go on at once, and one does one thing at a time, whatever blocks it is in", () => {
  // Each with its own start and length: a slide fitted to the words, a nod told its time, and a voice; another nods half a second later.
  assert.deepEqual(when(["together:", "  sq slide to=left", "  sq nod takes=0.4s", `  sq say: ${TEN}5678`, "  mo nod @ block.start + 0.5s", `mo say: ${TEN}`]), { 2: [5, 19], 3: [5, 9], 4: [5, 19], 5: [10, 30], 6: [33, 43] });
  // In two blocks at once, what one character does in the second waits for what it does in the first.
  assert.deepEqual(when(["together:", "  in order:", "    sq slide to=left", "    sq nod", "  in order:", "    mo nod", "    sq slide to=right"]), { 3: [5, 25], 4: [28, 48], 6: [5, 25], 7: [28, 48] });
  assert.deepEqual(when(["together:", "  in order:", "    sq slide to=left", "    sq slide to=right", "  in order:", "    mo nod takes=0.1s", "    sq slide to=left"]), { 3: [5, 25], 4: [28, 48], 6: [5, 6], 7: [48, 68] });
  // One on two channels waits for both, and both wait for it.
  assert.deepEqual(when(["sq slide to=left", "sq spin @ prev.start", "sq slide to=right @ prev.start", "sq nod @ prev.start"]), { 1: [5, 25], 2: [25, 45], 3: [45, 65], 4: [45, 65] });
  assert.deepEqual(when(["sq turn", "sq spin @ prev.start", "sq turn @ prev.start", "sq slide to=left @ prev.start"]), { 1: [5, 25], 2: [25, 45], 3: [45, 65], 4: [45, 65] });
  // With a start of its own, a row of a block together is after the other, and begins no earlier than that has ended.
  assert.deepEqual(when(["together:", "  sq slide to=left", "  sq slide to=right @ prev.end + 0.2s", `  sq say: ${TEN}`, `  sq say @ prev.50%: ${TEN}`]), { 2: [5, 25], 3: [27, 47], 4: [5, 15], 5: [15, 25] });
});

test("refused: two on one channel that would begin at once, directly in a block together or joined", () => {
  const hint = "write the two one after the other, in an in order: there, or begin this one by the end of the other (@ prev.end, or its label)";
  assert.deepEqual(refused(["together:", "  sq slide to=left", "  mo slide to=left", "  sq slide to=right", "  sq say: One.", "  sq say: Two."]), [
    { line: 4, also: [1, 2], message: "sq's place is busy with line 2, and the two would begin at once", hint },
    { line: 6, also: [1, 5], message: "sq's voice is busy with line 5, and the two would begin at once", hint },
  ]);
  assert.deepEqual(refused(["sq say: One.", "& mo nod", "& sq say: Two."]), [{ line: 3, also: [1], message: "sq's voice is busy with line 1, and the two would begin at once", hint }]);
  // One of two channels is enough; and whoever is last of three is told with the one before it.
  assert.deepEqual(why(["together:", "  sq spin", "  sq slide to=left"]), [[3, [1, 2], "sq's place is busy with line 2, and the two would begin at once"]]);
  assert.deepEqual(why(["together:", "  sq spin", "  sq turn"]), [[3, [1, 2], "sq's facing is busy with line 2, and the two would begin at once"]]);
  assert.deepEqual(why(["together:", "  sq nod", "  sq nod", "  sq nod"]), [[3, [1, 2], "sq's head is busy with line 2, and the two would begin at once"], [4, [1, 3], "sq's head is busy with line 3, and the two would begin at once"]]);
  // The later one with no start of its own, whatever the other has; an arrival is an end.
  assert.deepEqual(why(["together:", "  sq nod @ block.start + 1s", "  sq nod"]).map(([line]) => line), [3]);
  assert.deepEqual(why(["[a] mo say: One.", "sq slide to=left", "& sq slide to=right arrive=a.end"]).map(([line]) => line), [3]);
  assert.deepEqual(why(["together:", "  sq nod", "  mo nod", "  sq slide to=left", "  sq say: One.", "  narrator say: Two."]), []);
  // An action that nobody knows is a mistake of its own, and on no channel.
  assert.deepEqual(why(["together:", "  sq slide to=left", "  sq dance", "  sq dance"]), []);
  // In order, or in a block of its own, it waits; joined below a block, that is not a line of it.
  assert.deepEqual(why(["sq nod", "sq nod", "together:", "  in order:", "    sq nod", "    sq nod", "  sq slide to=left", "& sq say: One."]), []);
});

test("what has surely begun before an action ends, of its scene's other actions, by their lines", () => {
  const begun = (...scripts: string[][]) => Object.fromEntries(begunBy(scenes(...scripts), ACTIONS));
  assert.deepEqual(begun(["sq slide to=left", "mo say: One.", "mo slide to=left"], ["tri nod", "& sq nod"]), { 1: [], 3: [1], 4: [5], 5: [4] });
  // At once, whichever is written first; a moment of something is no earlier than it begins.
  assert.deepEqual(begun(["together:", "  sq slide to=left", "  mo slide to=left", "  tri slide to=left @ prev.start + 1s"]), { 2: [3], 3: [2], 4: [2, 3] });
  // In two blocks at once, only their first are: when the rest is, the voices say.
  assert.deepEqual(begun(["together:", "  in order:", "    sq nod", "    sq say: One.", "    sq slide to=left", "  in order:", "    mo nod", "    mo slide to=left"]), { 3: [7], 5: [3, 7], 7: [3], 8: [3, 7] });
});

test("an anchor begins a line at a moment of something above: a start, an end, a share or a word, plus or minus seconds", () => {
  const at = (anchor: string) => when([`[a] sq say: abcd efgh ijkl mnopq`, `mo say @ ${anchor}: ${TEN}`])[2]![0];
  assert.equal(at("a.start"), 5);
  assert.equal(at("a.end"), 25);
  assert.equal(at("a.50%"), 15);
  assert.equal(at("a.word(ijkl)"), 15);
  assert.equal(at("a.word(ijkl mnopq)"), 15);
  assert.equal(at("a.end - 0.5s"), 20);
  assert.equal(at("a.start + 1s"), 15);
  assert.equal(at("a.word(efgh) + 0.2s"), 12);
  assert.equal(at("prev.50%"), 15);
  assert.equal(at("block.start + 0.2s"), 2, "the scene's own start, before its lead");
  assert.equal(at("a.start - 3s"), 5, "no earlier than what it names begins");
});

test("prev is the line or the block just above, and block the block around it, as they are written", () => {
  // After joined lines, prev is the last of them; among them, the one above.
  assert.equal(when([`sq say: ${TWENTY}`, `& mo say: ${TEN}`, "tri say @ prev.50%: 012"])[3]![0], 10);
  assert.equal(when([`sq say: ${TWENTY}`, "& mo say @ prev.50%: 012"])[2]![0], 15);
  assert.equal(when([`sq say: ${TWENTY}`, `& mo say: ${TEN}`, "& tri say @ prev.50%: 012"])[3]![0], 10);
  // Above is a block: prev is the whole of it.
  assert.equal(when(["in order:", `  sq say: ${TEN}`, `  mo say: ${TEN}7`, "tri say @ prev.50%: 012"])[4]![0], 17);
  // In a block, joined or not, block is that block and not the joined lines.
  assert.equal(when([`sq say: ${TEN}`, "together:", `  mo say: ${TWENTY}`, "  tri slide to=left", "  & sq say @ block.start + 1s: 012"])[5]![0], 28);
  assert.equal(when(["in order:", `  mo say: ${TEN}`, "  tri slide to=left", "  & sq say @ block.start + 1s: 012"])[4]![0], 18, "a second into the block is before the joined lines begin: with them");
  // A label names a block, from inside it too.
  assert.equal(when([`[b] together:`, `  mo say: ${TWENTY}`, "  sq say @ b.start + 1s: 012", "tri say @ b.50%: 01"])[4]![0], 15);
  // A label is its scene's: another scene has its own.
  assert.deepEqual(when([`[a] sq say: ${TWENTY}`, "mo say @ a.50%: 012"], [`[a] sq say: ${TEN}`, "mo say @ a.50%: 012"]), { 1: [5, 25], 2: [15, 18], 3: [40, 50], 4: [45, 48] });
});

test("what is joined to an anchored line begins with it", () => {
  assert.deepEqual(when([`[a] sq say: ${TWENTY}`, "mo say @ a.50%: 01234567", "& tri slide to=left"]), { 1: [5, 25], 2: [15, 23], 3: [15, 25] });
});

test("under the rest: cut where the block it is in ends, and it moves nothing", () => {
  const murmur = (...under: string[]) => when(["in order:", ...under, `  sq say: ${TEN}`, `  tri say: ${TEN}`, `  sq say: ${TEN}`, `mo say: ${TEN}`]);
  assert.deepEqual(murmur("  under:", `    mo say: ${TWENTY}`, `    mo say: ${TWENTY}`), { 3: [5, 25], 4: [28, 41], 5: [5, 15], 6: [18, 28], 7: [31, 41], 8: [44, 54] });
  // Under a line that is joined to it, and the first of two under it alone; what never begins is not there.
  assert.deepEqual(when([`sq say: ${TEN}`, "& under:", `    radio say: ${TWENTY}`, `    radio say: ${TEN}`, `sq say: ${TEN}`]), { 1: [5, 15], 3: [5, 15], 4: [28, 28], 5: [18, 28] });
  // At a scene's own level, through its tail.
  assert.deepEqual(when(["under:", `  radio say: ${TWENTY}${TWENTY}`, `sq say: ${TEN}`]), { 2: [5, 25], 3: [5, 15] });
  // Beginning where it is told to.
  assert.deepEqual(when(["together:", `  [a] sq say: ${TWENTY}`, "  under @ a.50%:", `    radio say: ${TWENTY}`]), { 2: [5, 25], 4: [15, 25] });
});

test("what is open goes on to the end of its block, which does not wait for it, and neither does what follows it in order", () => {
  assert.deepEqual(when(["sq slide to=left", `& mo say: ${TEN}4567`, "& mo watch", `sq say: ${TEN}`]), { 1: [5, 19], 2: [5, 19], 3: [5, 19], 4: [22, 32] });
  // In order, what is below it begins as it does; at a scene's own level it goes on through the tail.
  assert.deepEqual(when(["in order:", "  mo watch", `  sq say: ${TEN}`, `  sq say: ${TEN}`, `tri say: ${TEN}`]), { 2: [5, 28], 3: [5, 15], 4: [18, 28], 5: [31, 41] });
  assert.deepEqual(when([`sq say: ${TEN}`, "mo watch", `sq say: ${TEN}`], [`sq say: ${TEN}`]), { 1: [5, 15], 2: [18, 38], 3: [18, 28], 4: [43, 53] });
  // Begun where it is told to, and by its end what follows the block.
  assert.deepEqual(when([`[a] sq say: ${TWENTY}`, "& [w] mo watch @ a.50%", "tri say @ w.end - 0.2s: 01", "sq say @ w.50%: 01"]), { 1: [5, 25], 2: [15, 25], 3: [23, 25], 4: [25, 27] });
  // A walk is fitted to the words all the same, and the watch is no voice.
  assert.deepEqual(when(["together:", "  sq slide to=left", "  mo watch", "  tri watch @ block.start + 0.5s", `  mo say: ${TEN}`]), { 2: [5, 15], 3: [5, 15], 4: [10, 15], 5: [5, 15] });
  assert.deepEqual(when(["ending together:", "  sq slide to=left", "  mo watch", `  mo say: ${TEN}`]), { 2: [5, 25], 3: [5, 25], 4: [15, 25] });
  // After its block its channel is free, and another's is free all the while.
  assert.deepEqual(when(["sq slide to=left", "& mo watch", "mo turn", "together:", "  mo watch", "  tri turn"]), { 1: [5, 25], 2: [5, 25], 3: [28, 48], 5: [51, 71], 6: [51, 71] });
  // Beside what it has begun by.
  const begun = (...rows: string[]) => Object.fromEntries(begunBy(scenes(rows), ACTIONS));
  assert.deepEqual(begun("sq slide to=left", "& mo watch", "tri nod"), { 1: [2], 2: [1], 3: [1, 2] });
});

test("refused: what follows an open action on its channel in its block, and an open action under the rest", () => {
  assert.deepEqual(refused(["mo watch", "sq slide to=left", "mo turn", "mo nod"]), [
    {
      line: 3,
      also: [1],
      message: "mo's facing is busy with line 1, which goes on to the end of the scene",
      hint: "have line 1 end sooner, in a block of its own: join it to what it goes with (&)",
    },
  ]);
  assert.deepEqual(refused(["in order:", "  mo watch", "  sq slide to=left", "  mo turn", "mo turn"]), [
    {
      line: 4,
      also: [2],
      message: "mo's facing is busy with line 2, which goes on to the end of the block of line 1",
      hint: "write it after that block, or have line 2 end sooner, in a block of its own: join it to what it goes with (&)",
    },
  ]);
  assert.deepEqual(why(["mo watch", "sq slide to=left", "in order:", "  tri watch", "  sq nod", "  mo watch", "  sq nod"]), [[6, [1], "mo's facing is busy with line 1, which goes on to the end of the scene"]]);
  assert.deepEqual(why(["sq slide to=left", "& mo watch", "& mo turn @ prev.start + 1s"]), [[3, [2], "mo's facing is busy with line 2, which goes on to the end of the lines joined at line 1"]]);
  // Joined to what it goes with, it ends there.
  assert.deepEqual(why(["sq slide to=left", "& mo watch", "mo turn", "tri slide to=left", "& mo watch"]), []);
  // Directly in one block together, the two would begin at once.
  assert.deepEqual(why(["together:", "  mo turn", "  mo watch", "  sq nod"]), [[3, [1, 2], "mo's facing is busy with line 2, and the two would begin at once"]]);

  assert.deepEqual(refused(["in order:", "  under:", "    sq say: One.", "    in order:", "      mo watch", "      sq say: Two.", "  mo say: Three."]), [
    { line: 5, also: [2], message: "an action is never under the rest: cut, it would leave mo where only the voices know", hint: "write it beside the under: block, not in it" },
  ]);
});

test("refused: an open action that would never be seen, as nothing says where its block ends", () => {
  assert.deepEqual(refused(["sq say: One.", "mo watch"]), [{ line: 2, message: "nothing comes after this in the scene, so there is nothing for it to go with", hint: "join it to what it goes with (&), or write that below it" }]);
  assert.deepEqual(refused(["mo watch", "tri watch"]), [{ line: 1, message: "everything in the scene goes on to its end, and nothing in it says where that is", hint: "write in it too what it goes with: what is said, or an action with a length" }]);
  assert.deepEqual(why(["sq say: One.", "& together:", "    mo watch", "    tri watch"]), [[2, [], "everything in the block of line 2 goes on to its end, and nothing in it says where that is"]]);
  assert.deepEqual(why(["mo watch", "& under:", "    radio say: One.", "sq say: Two."]), [[1, [], "everything in the lines joined at line 1 goes on to its end, and nothing in it says where that is"]]);
  // Of several at the end of a block in order, each is said.
  assert.deepEqual(why(["sq say: One.", "mo watch", "under:", "  radio say: Two.", "tri watch"]).map(([line, , message]) => [line, message]), [
    [2, "nothing comes after this in the scene, so there is nothing for it to go with"],
    [3, "nothing comes after this in the scene, so there is nothing for it to be under"],
    [5, "nothing comes after this in the scene, so there is nothing for it to go with"],
  ]);
  // Together, or with a start of its own, it may be seen wherever it is written.
  assert.deepEqual(why(["together:", "  sq say: One.", "  mo watch", "[a] sq say: Two.", "tri watch @ a.50%"]), []);
  // Its own block ends with it: in it, nothing waits for its end.
  assert.deepEqual(why(["sq say: One.", "& [w] mo watch", "& tri say @ w.end: Two."]), [[3, [1, 2], "it goes round: the lines joined at line 1 wait for line 3, line 3 waits for line 2 and line 2 ends with the lines joined at line 1"]]);
});

test("ending together: a voice ends with a longer walk, two voices at once, and one that waits for its channel ends them all later", () => {
  assert.deepEqual(when(["ending together:", "  sq slide to=left", `  narrator say: ${TEN}`, `sq say: ${TEN}`]), { 2: [5, 25], 3: [15, 25], 4: [28, 38] });
  assert.deepEqual(when(["ending together:", `  mo say: ${TEN}`, `  tri say: ${TWENTY}`, `sq say: ${TEN}`]), { 2: [15, 25], 3: [5, 25], 4: [28, 38] });
  assert.deepEqual(when(["together:", `  radio say: ${TWENTY}`, "  ending together:", "    mo slide to=left", `    radio say: ${TEN}`, `sq say: ${TEN}`]), { 2: [5, 25], 4: [15, 35], 5: [25, 35], 6: [38, 48] });
  // An action is not fitted there: it goes at its own speed, or takes what it is given.
  assert.deepEqual(when(["ending together:", `  narrator say: ${TWENTY}${TEN}`, "  sq slide to=left", "  mo slide to=left takes=1s"]), { 2: [5, 35], 3: [15, 35], 4: [25, 35] });
  // A character may act and speak in it: those are two channels.
  assert.deepEqual(when(["ending together:", "  sq slide to=left", `  sq say: ${TEN}`]), { 2: [5, 25], 3: [15, 25] });
});

test("a block that ends its lines together is anchored, joined, named, and under the rest, as any", () => {
  assert.deepEqual(when([`[a] sq say: ${TWENTY}`, "ending together @ a.50%:", `  mo say: ${TEN}`, "  tri slide to=left", `sq say @ prev.start: ${TEN}`]), { 1: [5, 25], 3: [25, 35], 4: [15, 35], 5: [25, 35] });
  assert.deepEqual(when([`sq say: ${TEN}`, "& ending together:", `    [m] mo say: ${TEN}`, "    tri slide to=left", `narrator say @ m.start: ${TEN}`]), { 1: [5, 15], 3: [15, 25], 4: [5, 25], 5: [15, 25] });
  // An action joined to it is fitted to its voices.
  assert.deepEqual(when(["ending together:", `  mo say: ${TEN}`, `  tri say: ${TWENTY}${TEN}`, "& sq slide to=left"]), { 2: [25, 35], 3: [5, 35], 4: [5, 35] });
  // Under the rest, and cut: one that would have begun later is not there.
  assert.deepEqual(when(["in order:", "  under:", "    ending together:", `      radio say: ${TWENTY}`, "      mo say: 01234", `  sq say: ${TEN}`, `tri say: ${TEN}`]), { 4: [5, 15], 5: [20, 20], 6: [5, 15], 7: [18, 28] });
});

test("a word of a line that is cut is where it would be said, cut or not", () => {
  // The interrupted goes on under the line that interrupts it, and stops with it.
  assert.deepEqual(when(["in order:", "  under:", "    [a] sq say: abcd efgh ijkl mnopq", "  mo say @ a.word(efgh): 012345", "sq say: 01"]), { 3: [5, 16], 4: [10, 16], 5: [19, 21] });
});

test("refused: an anchor that names something below it, in another scene, or nothing", () => {
  const scene = ["sq say @ b.end: One.", "[b] mo say: Two.", "[c] sq say @ c.start: Three.", "mo say @ d.start: Four.", "tri say @ c.50%: Five."];
  assert.deepEqual(refused(scene, ["sq say @ b.end: Six."]), [
    { line: 1, also: [2], message: '"b" is below, at line 2: a line begins by what is above it', hint: "write line 2 above this one, or begin this one by something else" },
    { line: 3, message: '"c" is its own label', hint: "it begins by something above it: another label, or prev, the line just above" },
    { line: 4, message: 'nothing above is called "d"', hint: "labelled above: b and c; prev is the line just above, and block the block it is in" },
    { line: 6, also: [2], message: '"b" is in another scene, at line 2', hint: "a line begins by something of its own scene" },
  ]);
  assert.deepEqual(refused(["sq say @ prev.end: One.", "together:", "  mo say @ prev.50%: Two."]).map(({ line, message, hint }) => [line, message, hint]), [
    [1, "there is no prev: it is the first of its block", "begin it by the block it is in (@ block.start + 1s), or by a label above"],
    [3, "there is no prev: it is the first of its block", "begin it by the block it is in (@ block.start + 1s), or by a label above"],
  ]);
  assert.deepEqual(why(["[a] sq say @ a.50%: One.", "& mo say: Two."]), [[1, [], '"a" is its own label']]);
  assert.deepEqual(refused(["[a] sq say: One.", "mo say @ prv.end: Two."])[0]!.hint, "labelled above: a; prev is the line just above, and block the block it is in: did you mean prev?");
  assert.deepEqual(why(["[a] sq say: One.", "mo say: Two.", "[a] sq say: Three."]), [[3, [1], "a is the label of line 1 already"]]);
});

test("refused: a word that the line does not say, or says more than once, and the word of what says nothing", () => {
  const word = (said: string) => refused(["[a] sq say: I saw the mole by the pond.", `mo say @ a.word(${said}): Oh!`]).map(({ also, message, hint }) => [also, message, hint])[0];
  assert.deepEqual(word("mol"), [[1], 'line 1 does not say "mol"', "write a word as the line says it: did you mean mole?"]);
  assert.deepEqual(word("badger"), [[1], 'line 1 does not say "badger"', "write a word as the line says it"]);
  assert.deepEqual(word("the"), [[1], 'line 1 says "the" 2 times', "write the words after it too, until it is one place: a.word(the ...)"]);
  assert.equal(word("the pond"), undefined);
  assert.deepEqual(why(["[a] sq slide to=left", "mo say @ a.word(left): Oh!"]), [[2, [1], "line 1 says nothing, so it has no words"]]);
  assert.deepEqual(why(["[a] together:", "  sq say: One.", "mo say @ a.word(One): Oh!"]), [[3, [1], "the block of line 1 has no words: a line that is said has"]]);
  assert.deepEqual(why(["sq say: One.", "mo say @ block.word(One): Oh!"]), [[2, [], "the scene has no words: a line that is said has"]]);
});

test("refused: a loop, with everything in it", () => {
  const loops = (...rows: string[]) => refused(rows).map(({ line, also, message }) => [line, also, message]);
  // A voice that waits for the end of its own block's fitted move.
  assert.deepEqual(loops("together:", "  [w] sq slide to=left", "  narrator say: It goes.", "  sq say @ w.end: Here."), [[4, [2], "it goes round: line 2 waits for line 4 and line 4 waits for line 2"]]);
  // A line by the end of the block that waits for it.
  assert.deepEqual(loops("sq say: One.", "together:", "  mo say: Two.", "  sq say @ block.end - 1s: Three."), [[4, [2], "it goes round: the block of line 2 waits for line 4 and line 4 waits for the block of line 2"]]);
  assert.deepEqual(loops("sq say: One.", "mo say @ block.end: Two."), [[2, [1], "it goes round: the scene waits for line 2 and line 2 waits for the scene"]]);
  assert.deepEqual(loops("sq say: One.", "& mo say @ block.end: Two."), [
    [2, [1], "it goes round: the scene waits for the lines joined at line 1, the lines joined at line 1 wait for line 2 and line 2 waits for the scene"],
  ]);
  // A line by the end of what is cut where its own block ends.
  assert.deepEqual(loops("in order:", "  under:", "    [a] sq say: One.", "  mo say @ a.end: Two."), [[4, [1], "it goes round: the block of line 1 waits for line 4 and line 4 waits for the block of line 1"]]);
  // Of three, with no anchor: the first walk is fitted to the words, they wait for the second walk, and that for the first.
  assert.deepEqual(loops("together:", "  mo slide to=left", "  in order:", "    mo slide to=right", "    mo say: There."), [[2, [4, 5], "it goes round: line 2 waits for line 5, line 5 waits for line 4 and line 4 waits for line 2"]]);
  assert.deepEqual(loops("[w] sq slide to=left", "& narrator say: It goes.", "& sq say @ w.end: Here."), [[3, [1], "it goes round: line 1 waits for line 3 and line 3 waits for line 1"]]);
  const hint = "begin it by the start, a share or a word of something above, or write it after the block";
  assert.equal(refused(["sq say: One.", "mo say @ block.end: Two."])[0]!.hint, hint);
  assert.equal(refused(["[w] sq slide to=left", "& narrator say: It goes.", "& sq say @ w.end: Here."])[0]!.hint, `${hint}, or give the action its length (takes=2s)`);
  // With its length given, the action waits for no words, and they may wait for it.
  assert.deepEqual(when(["[w] sq slide to=left takes=1s", "& narrator say: It goes.", "& sq say @ w.end: Here."]), { 1: [5, 15], 2: [5, 13], 3: [15, 20] });
});

test("refused: a voice that follows a cut one in its block, and an action that would be cut", () => {
  assert.deepEqual(refused(["in order:", "  under:", "    radio say: News.", "  sq say: One.", "  radio say: More."]), [
    {
      line: 5,
      also: [3],
      message: "radio's voice is busy with line 3, which goes on under the rest to the end of the block both are in",
      hint: "write it after that block, or in the same under:, below that line",
    },
  ]);
  // After the block it may speak, and in the same under: too.
  assert.deepEqual(why(["in order:", "  under:", "    radio say: News.", "    radio say: More.", "  sq say: One.", "radio say: The end."]), []);
  assert.deepEqual(refused(["in order:", "  under:", "    sq say: One.", "    in order:", "      sq slide to=left", "  mo say: Two."]), [
    { line: 5, also: [2], message: "an action is never under the rest: cut, it would leave sq where only the voices know", hint: "write it beside the under: block, not in it" },
  ]);
});

test("refused in a block that ends its lines together: two on one channel of one character, a line with a start of its own, and a block", () => {
  assert.deepEqual(refused(["ending together:", "  sq say: One.", "  mo say: Two.", "  sq say: Three."]), [
    {
      line: 4,
      also: [1, 2],
      message: "sq's voice is busy with line 2, which ends when this does: the block of line 1 ends its lines together",
      hint: "write one of the two before that block or after it, or give it to another",
    },
  ]);
  assert.deepEqual(why(["ending together:", "  sq slide to=left", "  sq say: One.", "  sq slide to=right"]), [[4, [1, 2], "sq's place is busy with line 2, which ends when this does: the block of line 1 ends its lines together"]]);

  const anchored = (anchor: string) => refused(["[a] sq say: One.", "ending together:", "  [b] mo say: Two.", `  tri say @ ${anchor}: Three.`]);
  for (const anchor of ["b.50%", "b.end - 0.5s", "prev.start", "a.start", "block.start + 1s", "block.end"]) {
    assert.deepEqual(anchored(anchor), [
      {
        line: 4,
        also: [2],
        message: "the block of line 2 ends its lines together, so a line in it has no start of its own",
        hint: "leave its anchor out, or begin the whole block by it: ending together @ a.50%:",
      },
    ]);
  }

  const block = (...rows: string[]) => refused(["ending together:", "  sq say: One.", ...rows]);
  for (const header of ["in order:", "together:", "ending together:", "under:"]) {
    assert.deepEqual(block(`  ${header}`, "    mo say: Two.", "    tri say: Three."), [
      {
        line: 3,
        also: [1],
        message: "the block of line 1 ends its lines together, and holds no block",
        hint: "write its lines as lines of that block, or all of it beside that block, in a together: around both",
      },
    ]);
  }
  assert.deepEqual(block("  & mo say: Two.", "  tri say: Three."), [
    {
      line: 2,
      also: [1],
      message: "the block of line 1 ends its lines together, and holds no block: lines joined by & are one",
      hint: "leave the & out: all rows of that block end at once as they are",
    },
  ]);
  // Every mistake of one is found in one pass.
  assert.deepEqual(why(["ending together:", "  sq say: One.", "  sq say @ prev.50%: Two.", "  in order:", "    mo say: Three."]).map(([line]) => line).toSorted(), [3, 3, 4]);
});

test("refused: a loop through a block that ends its lines together, in words that say so", () => {
  // The first slide is fitted to the words, they end with the second, and that waits for the first.
  const loop = (walk = "") => why(["together:", `  sq slide to=left${walk}`, "  ending together:", "    sq slide to=right", "    mo say: There."]);
  assert.deepEqual(loop(), [[2, [3, 5], "it goes round: line 2 waits for line 5, line 5 ends with the block of line 3 and the block of line 3 waits for line 2"]]);
  assert.deepEqual(loop(" takes=2s"), []);
  // One that is not in it waits for it.
  assert.deepEqual(why(["together:", "  sq slide to=left", "  [b] ending together:", "    sq slide to=right", "  tri say @ b.end: Three."]), [
    [5, [2, 3], "it goes round: line 2 waits for line 5, line 5 waits for the block of line 3 and the block of line 3 waits for line 2"],
  ]);
});

test("refused: what is under nothing, so that it would never be heard", () => {
  assert.deepEqual(why(["sq say: One.", "under:", "  radio say: News."]), [[2, [], "nothing comes after this in the scene, so there is nothing for it to be under"]]);
  assert.deepEqual(why(["under:", "  radio say: News."]), [[1, [], "everything in the scene is under the rest, and there is no rest"]]);
  assert.deepEqual(why(["sq say: One.", "together:", "  under:", "    radio say: News.", "  under:", "    mo say: Two."]), [[2, [], "everything in the block of line 2 is under the rest, and there is no rest"]]);
  assert.deepEqual(why(["under:", "  under:", "    radio say: News.", "sq say: One."]), [[1, [], "everything in the block of line 1 is under the rest, and there is no rest"]]);
  // Together, or with a start of its own, it may be heard wherever it is written.
  assert.deepEqual(why(["together:", "  sq say: One.", "  under:", "    radio say: News.", "[a] sq say: Two.", "under @ a.50%:", "  radio say: News."]), []);
});

test("every mistake of the times is found in one pass, but where a name is missing the rest is not tried", () => {
  assert.deepEqual(
    why(["[w] sq slide to=left", "& narrator say: It goes.", "& sq say @ w.end: Here.", "in order:", "  under:", "    radio say: News.", "  mo say: Two.", "  radio say: More."]).map(([line]) => line).toSorted(),
    [3, 8],
  );
  assert.deepEqual(why(["sq say @ nobody.end: One.", "mo say @ block.end: Two."]).map(([line]) => line), [1]);
});
