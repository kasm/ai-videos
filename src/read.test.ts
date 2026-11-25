// A script's text read (read.ts): its lines and the blocks they are in, each with its line in the
// file, what joins, labels and anchors them; and every row that does not read, with a hint.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlock, readScript } from "./read.ts";
import { linesIn, type ScriptItem } from "./scenario.ts";

const read = (...rows: string[]) => readScript(rows.join("\n"));
/** A script that reads, its lines and blocks. */
const items = (...rows: string[]) => {
  const script = read(...rows);
  assert.deepEqual(script.issues, []);
  return script.items;
};
/** The shape of a script: a line by its line in the file, a block by its words and what is in it. */
type Shape = number | { [block: string]: Shape[] };
const shape = (list: ScriptItem[]): Shape[] =>
  list.map((item) => (isBlock(item) ? { [item.joined ? "&" : item.under ? "under" : item.order]: shape(item.items) } : item.line));
const issues = (...rows: string[]) => read(...rows).issues.map(({ line, message }) => [line, message]);

test("a line is who, the action, its values, and after the first colon its words, as written", () => {
  const script = readScript("sq slide to=right times=2\n\n# a note for the reader\nsq say: Here I go: a=b, @ 50%!\nnarrator say:   Done.  \n", 7);
  assert.deepEqual(script.issues, []);
  assert.deepEqual(script.items, [
    { line: 7, who: "sq", action: "slide", values: { to: "right", times: "2" } },
    { line: 10, who: "sq", action: "say", values: {}, text: "Here I go: a=b, @ 50%!" },
    { line: 11, who: "narrator", action: "say", values: {}, text: "Done." },
  ]);
  // A file's line endings are not the script's.
  assert.deepEqual(linesIn(readScript("sq say: One.\r\nsq say: Two.\r\n").items).map((l) => [l.line, l.text]), [[1, "One."], [2, "Two."]]);
});

test("a value is a formula, from its name to the next one's, on a line and on a block's header", () => {
  const values = (...rows: string[]) => items(...rows).map((item) => item.values);
  assert.deepEqual(values("sq slide to=left far=near * 2 + 20 takes=(a.length + 1s) / 2 @ a.end - 0.5s", "sq slide to=left"), [{ to: "left", far: "near * 2 + 20", takes: "(a.length + 1s) / 2" }, { to: "left" }]);
  assert.deepEqual(values("sq slide arrive=a.word(the mole) - beat far=- 3"), [{ arrive: "a.word(the mole) - beat", far: "- 3" }]);
  const [block, joined, plain] = items("[a] in order pause=beat / 2 slide.speed=slow sq.near=20 @ b.50%:", "  sq say: One.", "together near=2:", "  sq say: Two.", "& mo say: Three.", "under:", "  sq say: Four.");
  assert.ok(block && isBlock(block) && joined && isBlock(joined) && plain && isBlock(plain));
  assert.deepEqual([block.label, block.order, block.values, block.anchor], ["a", "in order", { pause: "beat / 2", "slide.speed": "slow", "sq.near": "20" }, { of: "b", at: { share: 0.5 } }]);
  assert.deepEqual([joined.values, joined.items[0]!.values], [undefined, { near: "2" }], "what joins has no header: its block's is its own");
  assert.deepEqual([plain.under, plain.values], [true, undefined]);
});

test("a value that does not read is refused, with its line, and the formula's own hint", () => {
  const one = (row: string, ...under: string[]) => issues(row, ...under).map(([, message]) => message)[0];
  assert.equal(one("sq slide to=left near"), 'to=left near: "near" comes after what is a value already');
  assert.equal(one("sq slide to="), "to= has no value");
  assert.equal(one("sq slide to= far=2"), "to= has no value");
  assert.equal(one("sq slide far=2 *"), 'far=2 *: something is missing after "*"');
  assert.equal(one("sq slide Far=2"), '"Far=2" is not a value');
  assert.equal(one("sq slide walk.sp.eed=2"), '"walk.sp.eed=2" is not a value');
  assert.equal(one("sq slide sq.speed=2"), "sq.speed is not a line's value");
  assert.equal(read("sq slide sq.speed=2").issues[0]!.hint, "a line's values are its own: write speed=2, and sq.speed on a block, a scene or the cartoon");
  assert.equal(one("sq slide to = left"), '"to" is not a value');
  assert.equal(one("in order pause=1s pause=2s:", "  sq say: One."), "pause is given twice");
  assert.equal(one("in order pause=1sec:", "  sq say: One."), 'pause=1sec: "1sec" has no unit that is known');
  assert.equal(one("in order slow:", "  sq say: One."), '"in order slow:" is neither a line nor a block\'s header');
  assert.match(read("sq slide far=2 *").issues[0]!.hint, /^a value is a number \(2, 0\.5s, 50%\)/);
});

test("a block is a header and the rows indented under it, however far, and blocks are in blocks", () => {
  const script = items(
    "sq say: One.",
    "together:",
    "  radio say: News.",
    "  in order:",
    "      # a note, wherever it begins",
    "      sq say: Two.",
    "",
    "      under:",
    "        mo say: Three.",
    "      mo say: Four.",
    "  tri say: Five.",
    "sq say: Six.",
  );
  assert.deepEqual(shape(script), [1, { together: [3, { "in order": [6, { under: [9] }, 10] }, 11] }, 12]);
  // A block's line is its header's. What is under the rest is in order.
  const [, together] = script as [ScriptItem, ScriptItem];
  assert.ok(isBlock(together) && together.line === 2 && together.order === "together");
  const under = items("under:", "  sq say: One.", "  sq say: Two.", "mo say: Three.")[0]!;
  assert.deepEqual(under, {
    line: 1,
    order: "in order",
    under: true,
    items: [
      { line: 2, who: "sq", action: "say", values: {}, text: "One." },
      { line: 3, who: "sq", action: "say", values: {}, text: "Two." },
    ],
  });
});

test("& joins a row to the one above it: a block together, with no header, of two or more", () => {
  assert.deepEqual(shape(items("sq slide to=left", "& sq say: One.", "&mo say: Two.", "sq say: Three.")), [{ "&": [1, 2, 3] }, 4]);
  // A block is joined as a line is, and a line to a block.
  assert.deepEqual(shape(items("sq say: One.", "& under:", "    radio say: News.", "together:", "  mo say: Two.", "  sq say: Three.", "& sq slide to=left")), [
    { "&": [1, { under: [3] }] },
    { "&": [{ together: [5, 6] }, 7] },
  ]);
  // Inside a block, to the row above in it.
  assert.deepEqual(shape(items("in order:", "  sq say: One.", "  mo say: Two.", "  & sq slide to=left", "mo say: Three.")), [{ "in order": [2, { "&": [3, 4] }] }, 5]);
});

test("a label is in square brackets before a line or a block; an anchor is after an @, before the colon", () => {
  const anchors = (...rows: string[]) => items("[a] sq say: I saw the mole.", ...rows).slice(1).map((item) => [item.label, item.anchor]);
  assert.deepEqual(
    anchors(
      "mo say @ a.start: One.",
      "[b] mo say @ a.end - 0.5s: Two.",
      "mo slide to=left @ a.50%",
      "mo say @ a.12.5% + 1s: Three.",
      "mo say @a.word(mole): Four.",
      "mo say @ a . word( the  mole ) -2s: Five.",
      "mo say @ prev.50%: Six.",
      "[c] in order @ block.start + 1.5s:",
      "  mo say: Seven.",
    ),
    [
      [undefined, { of: "a", at: "start" }],
      ["b", { of: "a", at: "end", plus: "- 0.5s" }],
      [undefined, { of: "a", at: { share: 0.5 } }],
      [undefined, { of: "a", at: { share: 0.125 }, plus: "+ 1s" }],
      [undefined, { of: "a", at: { word: "mole" } }],
      [undefined, { of: "a", at: { word: "the mole" }, plus: "-2s" }],
      [undefined, { of: "prev", at: { share: 0.5 } }],
      ["c", { of: "block", at: "start", plus: "+ 1.5s" }],
    ],
  );
  // A joined row has its label after the &.
  const [joined] = items("sq say: One.", "& [b] mo say: Two.");
  assert.deepEqual(joined && isBlock(joined) && joined.items.map((item) => item.label), [undefined, "b"]);
});

test("a script of any blocks, written at any margins, reads as it is written", () => {
  let seed = 7;
  const int = (to: number) => ((seed = (Math.imul(seed, 48271) >>> 0) % 2147483647), seed % to);
  for (let n = 0; n < 2000; n++) {
    const rows: string[] = [];
    let label = 0;
    /** Rows of a block at this margin, and the shape they read as. */
    const write = (margin: number, deep: number): Shape[] => {
      const list: Shape[] = [];
      for (let k = 0, count = 1 + int(4); k < count; k++) {
        if (int(6) === 0) rows.push(int(2) ? "" : `${" ".repeat(int(9))}# a note: together:`);
        const joined = k > 0 && int(4) === 0 ? "& " : "";
        const before = `${" ".repeat(margin)}${joined}${int(4) ? "" : `[l${label++}] `}`;
        const anchor = int(4) ? "" : " @ prev.50% + 1s";
        let item: Shape;
        if (deep > 0 && int(3) === 0) {
          const header = ["in order", "together", "under"][int(3)]!;
          rows.push(`${before}${header}${int(3) ? "" : " pause=beat * 2 slide.speed=slow"}${anchor}:`);
          item = { [header]: write(margin + 1 + int(4), deep - 1) };
        } else {
          rows.push(int(2) ? `${before}sq say${anchor}: in order: under @ a.50%: ${n}` : `${before}sq slide to=left${int(2) ? "" : " takes=beat + 1s"}${anchor}`);
          item = rows.length;
        }
        const last = list.at(-1);
        if (!joined) list.push(item);
        else if (typeof last === "object" && "&" in last) last["&"]!.push(item);
        else list[list.length - 1] = { "&": [last!, item] };
      }
      return list;
    };
    const written = write(0, 3);
    const script = read(...rows);
    assert.deepEqual(script.issues, [], rows.join("\n"));
    assert.deepEqual(shape(script.items), written, rows.join("\n"));
  }
});

test("what is joined to an anchored line begins with it: the block they are has the anchor", () => {
  const [, joined] = items("[a] sq say: One.", "mo say @ a.50%: Two.", "& tri slide to=left", "& sq say @ prev.end: Three.");
  assert.ok(joined && isBlock(joined));
  assert.deepEqual(joined.anchor, { of: "a", at: { share: 0.5 } });
  assert.deepEqual(joined.items.map((item) => item.anchor), [undefined, undefined, { of: "prev", at: "end" }]);
});

test("what is not a line is refused, with its line and a hint, and the rows around it are read", () => {
  const script = readScript(["sq", "Sq slide", "sq slide right", "sq slide to=right to=left", "sq slide to=2px", "sq say: Hello!", "sq Slide: x", ": x", "&"].join("\n"), 20);
  assert.deepEqual(linesIn(script.items).map((l) => l.line), [25]);
  assert.deepEqual(script.issues.map((i) => [i.line, i.message]), [
    [20, "sq does nothing: the action comes after the name"],
    [21, '"Sq" is not a name: a line begins with who does it'],
    [22, '"right" is not a value'],
    [23, "to is given twice"],
    [24, 'to=2px: "2px" has no unit that is known'],
    [26, '"Slide" is not an action\'s name'],
    [27, '"" is not a name: a line begins with who does it'],
    [28, '"" is not a name: a line begins with who does it'],
  ]);
  for (const issue of script.issues) assert.ok(issue.hint.length > 20, issue.message);
  assert.match(script.issues[2]!.hint, /write a value as name=value, before the colon, and what is said after it: sq say: Hello!/);
});

test("a block's mistakes: a header of another word, with no colon, with a line on it, with no line under it", () => {
  assert.deepEqual(issues("par:", "  sq say: One.", "  mo say: Two.", "at once:", "  sq say: Three."), [
    [1, '"par:" is neither a line nor a block\'s header'],
    [4, '"at once:" is neither a line nor a block\'s header'],
  ]);
  assert.match(read("par:", "  sq say: One.").issues[0]!.hint, /^the blocks are in order:, together: and under:/);
  assert.deepEqual(issues("together", "  sq say: One."), [[1, "the header together has no colon"]]);
  assert.deepEqual(issues("under: sq say: One."), [[1, "under: is a block's header, with nothing after its colon"]]);
  assert.deepEqual(issues("together:", "sq say: One.", "in order:", "  under:", "  sq say: Two.", "under:"), [
    [1, "this block has no line"],
    [4, "this block has no line"],
    [6, "this block has no line"],
  ]);
  assert.deepEqual(issues("[a] &  sq say: One."), [[1, "& comes after a label"]]);
  assert.deepEqual(issues("& sq say: One.", "together:", "  & sq say: Two."), [
    [1, "& joins a row to the one above it in its block, and none is above it"],
    [3, "& joins a row to the one above it in its block, and none is above it"],
  ]);
  // What is under a header that does not read is read too: its own mistake is said with the header's.
  assert.deepEqual(issues("par:", "  sq", "  mo say: Two."), [
    [1, '"par:" is neither a line nor a block\'s header'],
    [2, "sq does nothing: the action comes after the name"],
  ]);
});

test("a row indented with no block above it is refused once for all beside it, and a tab wherever it is", () => {
  const stray = "the row is indented, and no block begins above it";
  assert.deepEqual(issues("  sq say: One.", "  sq say: Two.", "sq say: Three."), [[1, stray]]);
  assert.deepEqual(issues("sq say:", "  Hello there!", "mo say: Two."), [
    [2, stray],
    [2, '"Hello" is not a name: a line begins with who does it'],
  ]);
  // A row out of its block but not yet at the margin of the one around it.
  assert.deepEqual(issues("together:", "    sq say: One.", "  mo say: Two."), [[3, stray]]);
  assert.deepEqual(issues("together:", "\tsq say: One.", "\tmo say: Two."), [
    [2, "the row is indented with a tab"],
    [3, "the row is indented with a tab"],
  ]);
});

test("a label and an anchor that do not read", () => {
  assert.deepEqual(issues("[A] sq say: One.", "[a sq say: Two.", "[prev] sq say: Three.", "[block] together:", "  sq say: Four."), [
    [1, '"[A]" is not a label'],
    [2, '"[a sq say: Two." is not a label'],
    [3, '"prev" is no label'],
    [4, '"block" is no label'],
  ]);
  const anchor = (written: string) => issues(`sq say @ ${written}: One.`).map(([, message]) => message)[0];
  assert.equal(anchor("a"), '"a" is not a moment of something above');
  assert.equal(anchor("a@50%"), '"a@50%" is not a moment of something above');
  assert.equal(anchor("a.middle"), '"a.middle" is not a moment of something above');
  // The colon of a.word:3 ends what is read: the hint gives the form there is.
  assert.equal(anchor("a.word:3"), '"a.word" is not a moment of something above');
  assert.match(read("sq say @ a.word:3: One.").issues[0]!.hint, /a\.word\(mole\)/);
  assert.equal(anchor("a.150%"), '150% is more than the whole of "a"');
  assert.equal(anchor("a.word()"), "word() names no word");
  assert.equal(anchor("a.end - 0.5s to=left"), '"a.end - 0.5s to=left" is not a moment of something above: "=left" is not read');
  assert.equal(anchor("a.end -"), '"a.end -" is not a moment of something above: something is missing after "-"');
  assert.equal(anchor("a.end beat"), '"a.end beat" is not a moment of something above');
});
