// The video tool's request: the clip's beats fitted to the voice, in whole frames (the tool's
// AGENTS.md, "Fitting a clip to the voice"; written by its src/fit.ts). Only what the maker draws
// from is read here; the request's other keys (its lines, what made it) are for reading.
import { readFileSync } from "node:fs";
import { z } from "zod";

const Span = z.object({
  /** The beat's name. */
  event: z.string(),
  span: z.enum(["hold", "move"]),
  /** The beat's length at the scenario's own pace: its `takes`. */
  natural: z.number().positive(),
  /** When the beat begins and how long it lasts in the clip, seconds. */
  at: z.number().min(0),
  duration: z.number().positive(),
  /** A move plays its motion over this long, then holds its last picture for the rest. */
  move: z.number().positive().optional(),
});

const Request = z.object({
  format: z.literal("ai-videos-request"),
  version: z.literal(1),
  fps: z.number().int().positive(),
  /** The clip's length: `frames` at `fps`. */
  duration: z.number().positive(),
  frames: z.number().int().positive(),
  spans: z.array(Span).min(1),
});
export type Request = z.infer<typeof Request>;

/** Checks a request already parsed from JSON. `file` is only named in the error. */
export function checkRequest(raw: unknown, file: string): Request {
  const result = Request.safeParse(raw);
  if (!result.success) throw new Error(`${file} is not a request:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Reads the request the tool wrote. An error names the file. */
export function readRequest(file: string): Request {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no request at ${file}: the video tool writes it (make <video> --fit)`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} is not JSON: ${(e as Error).message}`);
  }
  return checkRequest(raw, file);
}
