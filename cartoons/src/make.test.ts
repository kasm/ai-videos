// The maker run as the video tool runs it: in videos/, through its command line.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const videos = path.join(import.meta.dirname, "../videos");
const scratch = mkdtempSync(path.join(os.tmpdir(), "cartoons-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const maker = (...args: string[]) => spawnSync(process.execPath, ["../src/make.ts", ...args], { cwd: videos, encoding: "utf8" });

test("step one writes hello's data: its beats as events, its lines as texts", () => {
  const data = path.join(scratch, "clips", "hello-landscape.json");
  const run = maker("hello", "--format=landscape", `--data=${data}`);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(data, "utf8")), {
    format: "ai-videos-clip",
    version: 1,
    made: { by: "cartoons: src/make.ts", from: "hello/scenario.yaml" },
    duration: 7,
    events: [
      { name: "walks-in", at: 0, span: "move" },
      { name: "stops", at: 4, span: "hold" },
    ],
    texts: [
      { text: "This is Pip. Pip walks into the meadow.", from: 0, to: 4 },
      { text: "And here, Pip stops.", from: 4, to: 7 },
    ],
  });
});

test("a cartoon with no scenario stops the maker, with the reason", () => {
  const run = maker("nothing", "--format=landscape", `--data=${path.join(scratch, "nothing.json")}`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /cartoons maker: no scenario at .*nothing/);
});

test("portrait, the draw step and a call the tool would not send are refused", () => {
  const data = `--data=${path.join(scratch, "x.json")}`;
  assert.match(maker("hello", "--format=portrait", data).stderr, /landscape only/);
  const draw = maker("hello", "--format=landscape", "--width=1920", "--height=1080", `--request=${path.join(scratch, "r.json")}`, `--clip=${path.join(scratch, "x.mp4")}`, data);
  assert.equal(draw.status, 1);
  assert.match(draw.stderr, /not built yet/);
  assert.match(maker("hello", "--format=landscape", "--data=clips/x.json").stderr, /not an absolute path/);
  assert.match(maker("--format=landscape", data).stderr, /name one cartoon/);
});
