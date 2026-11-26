// A formula (formula.ts): what reads as one, what it is told when it does not, and its arithmetic, in
// seconds, in decibels and in numbers with no unit, with lines' lengths in it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Wrong, calculate, minus, namesIn, readFormula, secondsOf, shownAs, spanOf, type Amount, type Formula, type Unit } from "./formula.ts";

const number = (n: number, unit: Unit = ""): Formula => ({ is: "number", number: n, unit });
const name = (one: string): Formula => ({ is: "name", name: one });

/** Why a formula does not read, with its hint. */
function wrong(text: string): [message: string, hint: string] {
  try {
    readFormula(text);
  } catch (e) {
    assert.ok(e instanceof Wrong, String(e));
    return [e.message, e.hint];
  }
  assert.fail(`${text} reads`);
}

test("a formula is a number with its unit, a name, or + - * / over them, * and / first, with parentheses", () => {
  assert.deepEqual(readFormula("2"), number(2));
  assert.deepEqual(readFormula("0.25s"), number(0.25, "s"));
  assert.deepEqual(readFormula("50%"), number(0.5));
  assert.deepEqual(readFormula("6dB"), number(6, "dB"));
  assert.deepEqual(readFormula("-4.5dB"), { is: "minus", of: number(4.5, "dB") });
  assert.deepEqual(readFormula("off-left"), name("off-left"));
  assert.deepEqual(readFormula("near * 2 + 20"), { is: "+", left: { is: "*", left: name("near"), right: number(2) }, right: number(20) });
  assert.deepEqual(readFormula("20+near*2"), { is: "+", left: number(20), right: { is: "*", left: name("near"), right: number(2) } });
  assert.deepEqual(readFormula(" ( near + 20 ) / 2 "), { is: "/", left: { is: "+", left: name("near"), right: number(20) }, right: number(2) });
  // From the left.
  assert.deepEqual(readFormula("8 - 3 - 2"), { is: "-", left: { is: "-", left: number(8), right: number(3) }, right: number(2) });
  assert.deepEqual(readFormula("8 / 2 * 3"), { is: "*", left: { is: "/", left: number(8), right: number(2) }, right: number(3) });
  assert.deepEqual(readFormula("- beat * 2"), { is: "*", left: { is: "minus", of: name("beat") }, right: number(2) });
  assert.deepEqual(readFormula("2 * -3"), { is: "*", left: number(2), right: { is: "minus", of: number(3) } });
  // A dash is a name's own; with spaces it is a minus.
  assert.deepEqual(readFormula("near-20"), name("near-20"));
  assert.deepEqual(readFormula("near - 20"), { is: "-", left: name("near"), right: number(20) });
});

test("a line's length is read in a formula, and a moment of a line stands by itself", () => {
  assert.deepEqual(readFormula("a.length / 2"), { is: "/", left: { is: "length", of: "a" }, right: number(2) });
  assert.deepEqual(readFormula("prev . length"), { is: "length", of: "prev" });
  assert.deepEqual(readFormula("a.end"), { is: "moment", moment: { of: "a", at: "end" } });
  assert.deepEqual(readFormula("a.50% - beat / 2"), { is: "moment", moment: { of: "a", at: { share: 0.5 }, plus: "- beat / 2" } });
  assert.deepEqual(readFormula("a.word(the mole)"), { is: "moment", moment: { of: "a", at: { word: "the mole" } } });
  assert.equal(wrong("2 * a.end")[0], '"a.end" is nothing that a formula reads');
  assert.match(wrong("2 + a.middle")[1], /how long a line lasts is a\.length/);
  assert.equal(wrong("a.length.start")[0], '"." comes after what is a value already');
  assert.equal(wrong("a.ending")[0], '"a.ending" is nothing that a formula reads');
  assert.equal(wrong("a.")[0], '"a." is nothing that a formula reads');
});

test("a construction is a name, and in parentheses what it is worked out from, each a formula, others in it too", () => {
  const made = (one: string, ...of: Formula[]): Formula => ({ is: "construction", name: one, of });
  assert.deepEqual(readFormula("left-of(pip, near)"), made("left-of", name("pip"), name("near")));
  assert.deepEqual(readFormula(" midpoint( door ,tree) "), made("midpoint", name("door"), name("tree")));
  assert.deepEqual(readFormula("edge(left)"), made("edge", name("left")));
  assert.deepEqual(readFormula("left-of(midpoint(pip, 300), near * 2 + 1)"), made("left-of", made("midpoint", name("pip"), number(300)), { is: "+", left: { is: "*", left: name("near"), right: number(2) }, right: number(1) }));
  assert.deepEqual(readFormula("right-of(pip, -(1 + 2))"), made("right-of", name("pip"), { is: "minus", of: { is: "+", left: number(1), right: number(2) } }));
  // A name with a "(" after it, and not a multiplication; a moment of a line is none of it.
  assert.deepEqual(readFormula("2 * half(near)"), { is: "*", left: number(2), right: made("half", name("near")) });
  assert.deepEqual(readFormula("word(mole)"), made("word", name("mole")));
  assert.deepEqual(readFormula("a.word(mole)"), { is: "moment", moment: { of: "a", at: { word: "mole" } } });

  const within = "what it is worked out from is in its parentheses, a comma between one and the next: left-of(pip, near)";
  assert.deepEqual(wrong("left-of()"), ["left-of() has nothing in its parentheses", within]);
  assert.deepEqual(wrong("left-of(pip, near"), ['left-of( has no ")" after it', within]);
  assert.deepEqual(wrong("left-of(pip near)"), ['"near" comes after what is a value already', within]);
  assert.equal(wrong("left-of(pip,)")[0], '")" has nothing before it');
  assert.equal(wrong("left-of(pip,")[0], 'something is missing after ","');
  assert.equal(wrong("left-of(, near)")[0], '"," has nothing before it');
  assert.equal(wrong("left-of(pip, near) near")[0], '"near" comes after what is a value already');
  assert.equal(wrong("pip, near")[0], '"," comes after what is a value already');
  assert.equal(wrong("2(near)")[0], '"(" comes after what is a value already');
  assert.equal(wrong("left-of(a.end, near)")[0], '"a.end" is nothing that a formula reads');

  // Worked out, it is shown as a formula would have it.
  assert.equal(shownAs({ construction: "left-of", of: [{ construction: "midpoint", of: ["pip", 300] }, 0.3] }), "left-of(midpoint(pip, 300), 0.3)");
  assert.deepEqual([shownAs("middle"), shownAs(-2.5)], ["middle", "-2.5"]);
});

test("what does not read is told why, with a hint", () => {
  assert.equal(wrong("")[0], "nothing is written");
  assert.equal(wrong("near *")[0], 'something is missing after "*"');
  assert.equal(wrong("(near + 2")[0], 'a "(" has no ")" after it');
  assert.equal(wrong("near + 2)")[0], '")" comes after what is a value already');
  assert.equal(wrong("near far")[0], '"far" comes after what is a value already');
  assert.equal(wrong("* 2")[0], '"*" has nothing before it');
  assert.equal(wrong("Near")[0], '"Near" is not read');
  assert.equal(wrong('"middle"')[0], '""middle"" is not read');
  assert.equal(wrong("1.5.2")[0], '"." comes after what is a value already');
  assert.deepEqual(wrong("150px"), ['"150px" has no unit that is known', "a time is in seconds (0.5s), a volume in decibels (-12dB) and a share in hundredths (50%); any other number has no unit"]);
  for (const text of ["12db", "12DB", "12d"]) assert.equal(wrong(`-${text}`)[0], `"${text}" has no unit that is known`);
  assert.match(wrong("near far")[1], /^a value is a number \(2, 0\.5s, 50%, -12dB\), a name \(middle\), or a formula of these: near \* 2 \+ 20/);
});

test("the names a formula reads, those after a moment too", () => {
  assert.deepEqual(namesIn(readFormula("(near + 2) * far - a.length")), ["near", "far"]);
  assert.deepEqual(namesIn(readFormula("- beat")), ["beat"]);
  assert.deepEqual(namesIn(readFormula("left-of(midpoint(pip, door + 20), near)")), ["pip", "door", "near"]);
  assert.deepEqual(namesIn(readFormula("a.end - beat * two")), ["beat", "two"]);
  assert.deepEqual(namesIn(readFormula("a.end")), []);
  assert.deepEqual(namesIn(readFormula("2s")), []);
});

/** An amount: a number, its unit, and lines' lengths by their lines. */
const amount = (n: number, unit: Unit = "", lengths: [number, number][] = []): Amount => ({ unit, number: n, lengths: new Map(lengths) });
const refused = (op: "+" | "-" | "*" | "/", left: Amount, right: Amount) => {
  try {
    calculate(op, left, right);
  } catch (e) {
    assert.ok(e instanceof Wrong, String(e));
    return e.message;
  }
  assert.fail("it has an answer");
};

test("numbers are worked out with their units: times add up, and are multiplied and divided by numbers", () => {
  assert.deepEqual(calculate("+", amount(2), amount(3)), amount(5));
  assert.deepEqual(calculate("-", amount(2, "s"), amount(0.5, "s")), amount(1.5, "s"));
  assert.deepEqual(calculate("*", amount(2, "s"), amount(3)), amount(6, "s"));
  assert.deepEqual(calculate("*", amount(3), amount(2, "s")), amount(6, "s"));
  assert.deepEqual(calculate("/", amount(3, "s"), amount(2)), amount(1.5, "s"));
  assert.deepEqual(calculate("/", amount(3, "s"), amount(2, "s")), amount(1.5), "a time by a time is how many");
  assert.deepEqual(minus(amount(2, "s", [[7, 0.5]])), amount(-2, "s", [[7, -0.5]]));
  assert.equal(refused("+", amount(2, "s"), amount(3)), "a time and a number without a unit do not add up");
  assert.equal(refused("-", amount(2), amount(3, "s")), "a time and a number without a unit do not add up");
  assert.equal(refused("*", amount(2, "s"), amount(3, "s")), "a time is not multiplied by a time");
  assert.equal(refused("/", amount(2), amount(3, "s")), "a number without a unit is not divided by a time");
  assert.equal(refused("/", amount(2, "s"), amount(0)), "nothing is divided by 0");
  assert.equal(refused("/", amount(2, "s"), amount(0.1 + 0.2 - 0.3)), "nothing is divided by 0", "a hair off it, as a computer's sums are");
});

test("volumes are worked out as times are: added up, and multiplied and divided by numbers, and never with a time", () => {
  assert.deepEqual(calculate("+", amount(-12, "dB"), amount(3, "dB")), amount(-9, "dB"));
  assert.deepEqual(calculate("-", amount(-12, "dB"), amount(3, "dB")), amount(-15, "dB"));
  assert.deepEqual(calculate("*", amount(-6, "dB"), amount(2)), amount(-12, "dB"));
  assert.deepEqual(calculate("*", amount(2), amount(-6, "dB")), amount(-12, "dB"));
  assert.deepEqual(calculate("/", amount(-6, "dB"), amount(2)), amount(-3, "dB"));
  assert.deepEqual(calculate("/", amount(-6, "dB"), amount(3, "dB")), amount(-2));
  assert.deepEqual(minus(amount(6, "dB")), amount(-6, "dB"));
  assert.equal(refused("+", amount(-6, "dB"), amount(3)), "a volume and a number without a unit do not add up");
  assert.equal(refused("-", amount(3), amount(-6, "dB")), "a volume and a number without a unit do not add up");
  assert.equal(refused("+", amount(-6, "dB"), amount(3, "s")), "a time and a volume do not add up");
  assert.equal(refused("-", amount(3, "s"), amount(-6, "dB")), "a time and a volume do not add up");
  assert.equal(refused("*", amount(-6, "dB"), amount(-6, "dB")), "a volume is not multiplied by a volume");
  assert.equal(refused("*", amount(2, "s"), amount(-6, "dB")), "a time is not multiplied by a volume");
  assert.equal(refused("/", amount(2, "s"), amount(-6, "dB")), "a time is not divided by a volume");
  assert.equal(refused("/", amount(-6, "dB"), amount(2, "s")), "a volume is not divided by a time");
  assert.equal(refused("/", amount(2), amount(-6, "dB")), "a number without a unit is not divided by a volume");
});

test("lines' lengths are added up and multiplied by numbers, and nothing is divided by one", () => {
  const a = amount(0, "s", [[4, 1]]);
  const b = amount(1, "s", [[4, 1], [9, 2]]);
  assert.deepEqual(calculate("+", a, b), amount(1, "s", [[4, 2], [9, 2]]));
  assert.deepEqual(calculate("-", a, b), amount(-1, "s", [[4, 0], [9, -2]]));
  assert.deepEqual(calculate("*", b, amount(3)), amount(3, "s", [[4, 3], [9, 6]]));
  assert.deepEqual(calculate("*", amount(3), b), amount(3, "s", [[4, 3], [9, 6]]));
  assert.deepEqual(calculate("/", b, amount(2)), amount(0.5, "s", [[4, 0.5], [9, 1]]));
  // A length by a time is how many of them, and so many of another time again.
  const many = calculate("/", a, amount(2, "s"));
  assert.deepEqual(many, amount(0, "", [[4, 0.5]]));
  assert.deepEqual(calculate("*", many, amount(3, "s")), amount(0, "s", [[4, 1.5]]));
  assert.equal(refused("/", amount(2, "s"), a), "nothing is divided by a line's length");
  assert.equal(refused("*", many, many), "a length is not multiplied by a length");
  assert.equal(refused("*", a, b), "a time is not multiplied by a time");
});

test("seconds worked out are a number, or one with the lengths still to be measured in it", () => {
  assert.equal(spanOf(amount(0.1 + 0.2, "s")), 0.3);
  assert.equal(spanOf(amount(1, "s", [[4, 0]])), 1, "a length taken from itself is not there");
  const span = spanOf(amount(0.5, "s", [[4, 2], [9, 1 / 3]]));
  assert.deepEqual(span, { seconds: 0.5, lengths: [{ line: 4, times: 2 }, { line: 9, times: 0.333333 }] });
  assert.equal(secondsOf(1.5, () => assert.fail("nothing is measured for it")), 1.5);
  assert.equal(secondsOf({ seconds: 0.5, lengths: [{ line: 4, times: 2 }, { line: 9, times: 0.5 }] }, (line) => line), 13);
});
