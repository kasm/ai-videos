// The fold of a HyperFrames check's progress (progress.ts), on the stderr of water-switch's check
// as HyperFrames 0.9.58 wrote it (2026-11-20): 634 counts, the check's status between them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { foldProgress, OVER } from "./progress.ts";
import { runFolded } from "./render.ts";

const counts = (phase: string, from: number, to: number, total: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `[hyperframes] check: ${phase} ${from + i}/${total}`);

const REAL = [
  "[hyperframes] check: the report is saved to build/landscape/.hyperframes/artifacts/checks/a751ff83.json when the check ends",
  "[hyperframes] check: starting Chrome",
  '[hyperframes] browserGpuMode probe → hardware (WebGL renderer vendor="Google Inc. (NVIDIA)")',
  "[hyperframes] check: loading the page",
  "[hyperframes] check: waiting for the page to be ready",
  "[hyperframes] check: checking samples",
  ...counts("samples", 1, 9, 9),
  "[hyperframes] check: running the overlap pass",
  ...counts("craft", 1, 599, 599),
  ...counts("overlap", 1, 23, 23),
  "[hyperframes] check: checking samples",
  ...counts("analyze", 0, 0, 3),
  "[hyperframes] check: analyzing the samples",
  ...counts("analyze", 1, 2, 3),
];

/** A phase each, on its last count; analyze ends on 2/3, its last, and its status comes above it. */
const FOLDED = [
  ...REAL.slice(0, 6),
  "[hyperframes] check: samples 9/9",
  "[hyperframes] check: running the overlap pass",
  "[hyperframes] check: craft 599/599",
  "[hyperframes] check: overlap 23/23",
  "[hyperframes] check: checking samples",
  "[hyperframes] check: analyzing the samples",
  "[hyperframes] check: analyze 2/3",
];

const VERDICT = "\nLint\n  ⚠ timeline_track_too_dense: This HTML file has 20 timed elements.\n\n◇  Check passed\n";

/** The fold's writes, each tagged by the stream it went to. */
function folded(stderr: string[], opts: { inPlace: boolean; chunk?: number }) {
  const writes: { to: "out" | "err"; text: string }[] = [];
  const sink = (to: "out" | "err") => ({ write: (text: string) => writes.push({ to, text }) });
  const fold = foldProgress({ out: sink("out"), err: sink("err"), inPlace: opts.inPlace });
  const text = stderr.map((line) => `${line}\n`).join("");
  const size = opts.chunk ?? text.length;
  for (let i = 0; i < text.length; i += size) fold.stderr(text.slice(i, i + size));
  fold.stdout(VERDICT);
  fold.end();
  return writes;
}

const errText = (writes: { to: string; text: string }[]) => writes.filter((w) => w.to === "err").map((w) => w.text).join("");

/** What a terminal shows of the fold's stderr: each OVER takes back the line above. */
function screen(text: string): string[] {
  const lines: string[] = [];
  for (const [i, piece] of text.split(OVER).entries()) {
    if (i > 0) lines.pop();
    lines.push(...piece.split("\n").slice(0, -1));
  }
  return lines;
}

test("a real check's 634 counts come a line per phase, in a log", () => {
  const writes = folded(REAL, { inPlace: false });
  assert.deepEqual(errText(writes).split("\n").slice(0, -1), FOLDED);
  assert.ok(!errText(writes).includes(OVER));
  // The last count is written before the verdict, and the verdict as it came.
  assert.deepEqual(writes.at(-2), { to: "err", text: "[hyperframes] check: analyze 2/3\n" });
  assert.deepEqual(writes.at(-1), { to: "out", text: VERDICT });
});

test("on a terminal each count is written over the last, and a line per phase stays", () => {
  const writes = folded(REAL, { inPlace: true });
  assert.deepEqual(screen(errText(writes)), FOLDED);
  // Every write ends its line, so the child's stdout, straight to the terminal, never lands on a count.
  for (const w of writes) assert.ok(w.text.endsWith("\n"), JSON.stringify(w.text));
});

test("lines split across chunks fold the same", () => {
  for (const inPlace of [false, true]) {
    assert.equal(errText(folded(REAL, { inPlace, chunk: 7 })), errText(folded(REAL, { inPlace })));
  }
});

test("an error ends a phase's open count; the check's status goes above it", () => {
  const stderr = [
    ...counts("craft", 1, 3, 599),
    "[hyperframes] check: still checking samples (30 s in this step)",
    ...counts("craft", 4, 5, 599),
    "✗ Check failed: Chrome closed",
  ];
  const expected = [
    "[hyperframes] check: still checking samples (30 s in this step)",
    "[hyperframes] check: craft 5/599",
    "✗ Check failed: Chrome closed",
  ];
  assert.deepEqual(errText(folded(stderr, { inPlace: false })).split("\n").slice(0, -1), expected);
  assert.deepEqual(screen(errText(folded(stderr, { inPlace: true }))), expected);
});

test("runFolded folds a child's stderr, passes its stdout, and gives its exit code", async () => {
  const child = [
    'console.log("◆  Checking landscape");',
    `for (let i = 1; i <= 50; i++) console.error("[hyperframes] check: craft " + i + "/50");`,
    'console.error("[hyperframes] check: analyze 0/3");',
    'console.error("[hyperframes] check: analyzing the samples");',
    'console.error("[hyperframes] check: analyze 2/3");',
    'setTimeout(() => { console.log("◇  Check failed"); process.exitCode = 3; }, 100);',
  ].join("\n");
  let out = "";
  let err = "";
  const code = await runFolded(process.execPath, ["-e", child], {
    out: { write: (t: string) => (out += t) },
    err: { write: (t: string) => (err += t) },
    inPlace: false,
  });
  assert.equal(code, 3);
  assert.equal(out, "◆  Checking landscape\n◇  Check failed\n");
  assert.equal(
    err,
    "[hyperframes] check: craft 50/50\n[hyperframes] check: analyzing the samples\n[hyperframes] check: analyze 2/3\n",
  );
});
