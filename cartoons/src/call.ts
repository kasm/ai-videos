// The call the video tool appends to this project's `maker` (the tool's AGENTS.md, "The maker";
// its schema is MakerCall in the tool's src/maker.ts). Two shapes, told apart by --request:
//   <name> --format=landscape --data=<json>
//       step one: the clip's data at its own pace, nothing drawn
//   <name> --format=landscape --width=1920 --height=1080 --request=<json> --clip=<mp4> --data=<json>
//       step two: the clip drawn to the request, and its data again
// Read here, not imported from the tool, so that this repo runs without the tool's sources.
import path from "node:path";
import { parseArgs } from "node:util";

export type MakerCall =
  | { step: "data"; name: string; format: string; data: string }
  | { step: "draw"; name: string; format: string; width: number; height: number; request: string; clip: string; data: string };

/** Reads a call from the maker's arguments (`process.argv.slice(2)`); refuses anything else. */
export function readCall(args: string[]): MakerCall {
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
  const name = positionals[0];
  if (positionals.length !== 1 || !name) throw new Error(`not a maker call: name one cartoon, not ${positionals.length}`);
  const need = (flag: keyof typeof values): string => {
    const value = values[flag];
    if (!value) throw new Error(`not a maker call: --${flag} is missing`);
    return value;
  };
  // The maker runs in the project file's folder, not the video's, so the tool names every file in full.
  const file = (flag: keyof typeof values): string => {
    const value = need(flag);
    if (!path.isAbsolute(value)) throw new Error(`not a maker call: --${flag} is not an absolute path`);
    return value;
  };
  const pixels = (flag: keyof typeof values): number => {
    const value = Number(need(flag));
    if (!Number.isInteger(value) || value <= 0) throw new Error(`not a maker call: --${flag} is not a size in pixels`);
    return value;
  };
  const format = need("format");
  if (values.request === undefined) {
    for (const flag of ["width", "height", "clip"] as const) {
      if (values[flag] !== undefined) throw new Error(`not a maker call: --${flag} comes only with --request`);
    }
    return { step: "data", name, format, data: file("data") };
  }
  return { step: "draw", name, format, width: pixels("width"), height: pixels("height"), request: file("request"), clip: file("clip"), data: file("data") };
}
