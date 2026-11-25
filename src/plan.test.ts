// A script as a plan of what happens at once (plan.ts): what each anchor names, when everything
// begins and ends, and what is refused before anything is spoken, with the lines it is between. The
// laws themselves are tried in times.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { planOf, timeIssues, type Lasting } from "./plan.ts";
import { readScript } from "./read.ts";
import { linesIn, type ScriptItem, type ScriptLine, type WrittenScene } from "./scenario.ts";
import { times } from "./times.ts";

/** Ten frames a second: half a second before a scene's first line, 0.3 s between lines, a second after its last. */
const PAUSES = { fps: 10, lead: 0.5, gap: 0.3, tail: 1 };

/** Scenes of these rows, the first row of the first on line 1. */
function scenes(...scripts: string[][]): WrittenScene[] {
  let first = 1;
  return scripts.map((rows) => {
    const { items, issues } = readScript(rows.join("\n"), first);
    assert.deepEqual(issues, []);
    const scene = { line: first, setting: {}, items };
    first += rows.length;
    return scene;
  });
}

/** A voice lasts a frame a letter, and an action 20 frames at its own speed, from 10 to 40. */
const lasting = ({ text }: ScriptLine): Lasting => (text === undefined ? { kind: "move", length: { own: 20, least: 10, most: 40 } } : { kind: "voice", length: text.length });

/** When each line of the scenes happens, by its line: the frame it begins on, and the one it has stopped by. */
function when(...scripts: string[][]) {
  const written = scenes(...scripts);
  assert.deepEqual(timeIssues(written), []);
  const { video, items } = planOf(written, PAUSES, lasting);
  const placed = times(video);
  return Object.fromEntries(
    written.flatMap((scene) => linesIn(scene.items)).map((line) => {
      const { start, end } = placed.get(items.get(line as ScriptItem)!)!;
      return [line.line, [start, end]];
    }),
  );
}
const refused = (...scripts: string[][]) => timeIssues(scenes(...scripts));
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
  // A character does one action at a time, and says one line at a time.
  assert.deepEqual(when(["together:", "  sq slide to=left", "  mo slide to=left", "  sq slide to=right", `  sq say: ${TEN}`, `  sq say: ${TEN}`]), { 2: [5, 25], 3: [5, 25], 4: [25, 35], 5: [5, 15], 6: [15, 25] });
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
  // A line by the end of what is cut where its own block ends.
  assert.deepEqual(loops("in order:", "  under:", "    [a] sq say: One.", "  mo say @ a.end: Two."), [[4, [1], "it goes round: the block of line 1 waits for line 4 and line 4 waits for the block of line 1"]]);
  // Of three, with no anchor: the first walk is fitted to the words, they wait for the second walk, and that for the first.
  assert.deepEqual(loops("together:", "  mo slide to=left", "  in order:", "    mo slide to=right", "    mo say: There."), [[2, [4, 5], "it goes round: line 2 waits for line 5, line 5 waits for line 4 and line 4 waits for line 2"]]);
  assert.deepEqual(loops("[w] sq slide to=left", "& narrator say: It goes.", "& sq say @ w.end: Here."), [[3, [1], "it goes round: line 1 waits for line 3 and line 3 waits for line 1"]]);
  assert.match(refused(["sq say: One.", "mo say @ block.end: Two."])[0]!.hint, /begin it by the start, a share or a word of something above, or write it after the block/);
});

test("refused: a voice that follows a cut one in its block, and an action that would be cut", () => {
  assert.deepEqual(refused(["in order:", "  under:", "    radio say: News.", "  sq say: One.", "  radio say: More."]), [
    {
      line: 5,
      also: [3],
      message: "radio is busy with line 3, which goes on under the rest to the end of the block both are in",
      hint: "write it after that block, or in the same under:, below that line",
    },
  ]);
  // After the block it may speak, and in the same under: too.
  assert.deepEqual(why(["in order:", "  under:", "    radio say: News.", "    radio say: More.", "  sq say: One.", "radio say: The end."]), []);
  assert.deepEqual(refused(["in order:", "  under:", "    sq say: One.", "    in order:", "      sq slide to=left", "  mo say: Two."]), [
    { line: 5, also: [2], message: "an action is never under the rest: cut, it would leave sq where only the voices know", hint: "write it beside the under: block, not in it" },
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
