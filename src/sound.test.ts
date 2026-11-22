// A video file's one sound track (sound.ts): each line's voice laid from where the timeline starts it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mix } from "./sound.ts";

test("the sound lays each line's voice from its start, on a track as long as the video", () => {
  const first = { samples: new Float32Array([0.5, 0.5]), start: 0.1 };
  // The second line runs past the video's end: it is cut there.
  const second = { samples: new Float32Array([0.25, 0.25, 0.25]), start: 0.3 };
  assert.deepEqual([...mix([first, second], 10, 0.5)], [0, 0.5, 0.5, 0.25, 0.25]);
  // Silence where no line is, and nothing at all with no line.
  assert.deepEqual([...mix([], 10, 0.3)], [0, 0, 0]);
});
