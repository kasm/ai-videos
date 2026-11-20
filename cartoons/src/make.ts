// This project's maker (videos/project.yaml): the video tool runs it in videos/, with a call
// appended (call.ts). The cartoon `<name>` is the folder videos/<name>/, and its source is the
// scenario.yaml there.
//   step one: the scenario's beats and lines as the clip's data, nothing drawn
//   step two: the clip drawn to the tool's request (draw.ts), and its data again, as the request times it
import path from "node:path";
import { writeClipData } from "ai-videos/frames";
import { readCall } from "./call.ts";
import { drawClip } from "./draw.ts";
import { readRequest } from "./request.ts";
import { NARRATOR, readScenario } from "./scenario.ts";
import { timeline } from "./timeline.ts";

async function main() {
  const call = readCall(process.argv.slice(2));
  // The stage is landscape (scenario.ts, STAGE); the project file asks for no other format.
  if (call.format !== "landscape") throw new Error(`cartoons are drawn in landscape only, not "${call.format}"`);
  const source = path.join(call.name, "scenario.yaml");
  const scenario = readScenario(path.resolve(source));
  const request = call.step === "draw" ? readRequest(call.request) : undefined;
  const time = timeline(scenario, request);
  const shown = (file: string) => path.relative(process.cwd(), file);
  let wrote = shown(call.data);
  if (call.step === "draw" && request) {
    const began = Date.now();
    const { frames, drawn } = await drawClip(scenario, request, call);
    wrote = `${shown(call.clip)}: ${frames} frames (${drawn} drawn) in ${((Date.now() - began) / 1000).toFixed(1)} s, to ${path.basename(call.request)}; and its JSON`;
  }
  // The clip's data (ai-videos-clip, the tool's src/clip.ts). A character's text names it as the
  // speaker, for its voice and its mouth; the narrator's names nobody, and keeps the project's voice.
  writeClipData(call.data, {
    by: "cartoons: src/make.ts",
    from: source.replaceAll("\\", "/"),
    request: call.step === "draw" ? call.request : undefined,
    duration: time.duration,
    events: time.events,
    texts: time.lines.map(({ who, text, from, to }) => ({ text, speaker: who === NARRATOR ? undefined : who, from, to })),
  });
  console.log(`  ${wrote}`);
}

// A maker exits non-zero with the reason on stderr, and the tool stops there.
main().catch((e) => {
  console.error(`cartoons maker: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
