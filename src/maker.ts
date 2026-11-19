// The protocol between the tool and a project's maker, the command that draws its clips
// (AGENTS.md, "Projects"). The tool appends a call to the project file's `maker`; the maker writes
// the files the call names, and nothing about the tool's own folders.
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { FORMATS, MakerName as name, type FormatName } from "./script.ts";

/** The maker runs in the project file's folder, not the video's, so every file is named in full. */
const file = z.string().refine((p) => path.isAbsolute(p), "give an absolute path");

const format = z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]);

const pixels = z.number().int().positive();

/** Step one: the clip's data (its events and texts at its own pace), before anything is drawn. */
const DataCall = z.strictObject({
  step: z.literal("data"),
  name,
  /** The layout to draw: landscape or portrait. */
  format,
  /** Where to write the clip's data (ai-videos-clip, src/clip.ts). */
  data: file,
});

/** Step two: the clip drawn to the tool's request, and its data again, now with each event's `natural`. */
const DrawCall = z.strictObject({
  step: z.literal("draw"),
  name,
  format,
  /** The size to draw at, so the maker keeps no table of the formats. */
  width: pixels,
  height: pixels,
  /** The request to draw to (ai-videos-request, src/fit.ts). */
  request: file,
  /** Where to write the clip. */
  clip: file,
  /** Where to write the clip's data. */
  data: file,
});

export const MakerCall = z.discriminatedUnion("step", [DataCall, DrawCall]);
export type MakerCall = z.infer<typeof MakerCall>;

/** The arguments the tool appends to a project's `maker` for `call`. */
export function makerArgs(call: MakerCall): string[] {
  const args = [call.name, `--format=${call.format}`];
  if (call.step === "draw") {
    args.push(`--width=${call.width}`, `--height=${call.height}`, `--request=${call.request}`, `--clip=${call.clip}`);
  }
  args.push(`--data=${call.data}`);
  return args;
}

/**
 * Reads a call from a maker's arguments (`process.argv.slice(2)`), refusing anything the tool would
 * not send. A call with `--request` is step two, one without it step one.
 */
export function readMakerCall(args: string[]): MakerCall {
  const text = { type: "string" } as const;
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: { format: text, data: text, width: text, height: text, request: text, clip: text },
    });
  } catch (e) {
    throw new Error(`not a maker call: ${(e as Error).message}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(`not a maker call: name one thing to draw, not ${positionals.length}`);
  const { width, height, ...rest } = values;
  const given = {
    step: values.request === undefined ? "data" : "draw",
    name: positionals[0],
    ...rest,
    width: width === undefined ? undefined : Number(width),
    height: height === undefined ? undefined : Number(height),
  };
  // A flag the step does not take is refused by the strict schema; one not given is left out.
  const call = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));
  const result = MakerCall.safeParse(call);
  if (!result.success) throw new Error(`not a maker call:\n${z.prettifyError(result.error)}`);
  return result.data;
}
