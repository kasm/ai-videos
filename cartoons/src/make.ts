// This project's maker (videos/project.yaml): the video tool runs it in videos/, with a call
// appended (call.ts). The cartoon `<name>` is the folder videos/<name>/, and its source is the
// scenario.yaml there.
//   step one: the scenario's beats and lines as the clip's data, nothing drawn
//   step two: the clip drawn to the tool's request (not built yet)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCall } from "./call.ts";
import { readScenario } from "./scenario.ts";
import { timeline } from "./timeline.ts";

function main() {
  const call = readCall(process.argv.slice(2));
  // The stage is landscape (scenario.ts, STAGE); the project file asks for no other format.
  if (call.format !== "landscape") throw new Error(`cartoons are drawn in landscape only, not "${call.format}"`);
  const source = path.join(call.name, "scenario.yaml");
  const scenario = readScenario(path.resolve(source));
  if (call.step === "draw") throw new Error("drawing a clip is not built yet: only `new` and `make --fit` work so far");
  const time = timeline(scenario);
  // The clip's data (ai-videos-clip, the tool's src/clip.ts). A text there has no speaker yet.
  const data = {
    format: "ai-videos-clip",
    version: 1,
    made: { by: "cartoons: src/make.ts", from: source.replaceAll("\\", "/") },
    duration: time.duration,
    events: time.events,
    texts: time.lines.map(({ text, from, to }) => ({ text, from, to })),
  };
  mkdirSync(path.dirname(call.data), { recursive: true });
  writeFileSync(call.data, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  ${path.relative(process.cwd(), call.data)}`);
}

// A maker exits non-zero with the reason on stderr, and the tool stops there.
try {
  main();
} catch (e) {
  console.error(`cartoons maker: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
