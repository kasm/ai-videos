// The call the tool appends to a project's maker: a name and a format in, the files to write, and
// nothing else a maker would have to guess at.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { makerArgs, readMakerCall, type MakerCall } from "./maker.ts";

const at = (file: string) => path.resolve("videos", "intro", "clips", file);

const DATA: MakerCall = { step: "data", name: "two-chains", format: "landscape", data: at("tour-landscape.json") };

const DRAW: MakerCall = {
  step: "draw",
  name: "two-chains",
  format: "portrait",
  width: 1080,
  height: 1920,
  request: at("tour-portrait.request.json"),
  clip: at("tour-portrait.mp4"),
  data: at("tour-portrait.json"),
};

test("a sample call of each step goes onto the command line and back unchanged", () => {
  assert.deepEqual(makerArgs(DATA), ["two-chains", "--format=landscape", `--data=${DATA.data}`]);
  assert.deepEqual(makerArgs(DRAW), [
    "two-chains",
    "--format=portrait",
    "--width=1080",
    "--height=1920",
    `--request=${DRAW.request}`,
    `--clip=${DRAW.clip}`,
    `--data=${DRAW.data}`,
  ]);
  assert.deepEqual(readMakerCall(makerArgs(DATA)), DATA);
  assert.deepEqual(readMakerCall(makerArgs(DRAW)), DRAW);
});

test("a call is refused when it is not one the tool would send", () => {
  const data = `--data=${at("c.json")}`;
  const draw = ["--width=1920", "--height=1080", `--request=${at("c.request.json")}`, `--clip=${at("c.mp4")}`, data];
  const wrong: Record<string, string[]> = {
    "nothing to draw": ["--format=landscape", data],
    "two things to draw": ["one", "two", "--format=landscape", data],
    "a name with capitals and spaces": ["Two Chains", "--format=landscape", data],
    "no format": ["two-chains", data],
    "a format that is not one": ["two-chains", "--format=square", data],
    "no file to write": ["two-chains", "--format=landscape"],
    "a relative path": ["two-chains", "--format=landscape", "--data=clips/c.json"],
    "a flag the tool never sends": ["two-chains", "--format=landscape", "--gpu", data],
    "a size on step one": ["two-chains", "--format=landscape", "--width=1920", data],
    "step two without a clip to write": ["two-chains", "--format=landscape", ...draw.filter((a) => !a.startsWith("--clip"))],
    "step two without a size": ["two-chains", "--format=landscape", ...draw.filter((a) => !a.startsWith("--height"))],
    "a size that is not whole pixels": ["two-chains", "--format=landscape", ...draw.map((a) => a.replace("1920", "wide"))],
  };
  for (const [what, args] of Object.entries(wrong)) {
    assert.throws(() => readMakerCall(args), /not a maker call/, what);
  }
  assert.ok(readMakerCall(["two-chains", "--format=landscape", ...draw]), "the same flags, all present, are a call");
});
