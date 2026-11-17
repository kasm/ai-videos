// Turns measured narration into a timeline: the voice sets the clock.
import type { VideoScript } from "./script.ts";
import { speak, type TtsProvider } from "./tts.ts";

export interface TimedLine {
  /** 1-based position in the whole video. */
  n: number;
  text: string;
  cue?: string;
  /** Extra silence before the line, seconds (already counted in `start`). */
  pause: number;
  audioFile: string;
  duration: number;
  /** Seconds from the start of the video. */
  start: number;
  /** Seconds from the start of its scene. */
  localStart: number;
}

export interface TimedScene {
  id: string;
  start: number;
  duration: number;
  lines: TimedLine[];
}

export interface Timeline {
  fps: number;
  duration: number;
  scenes: TimedScene[];
}

const round = (t: number) => Math.round(t * 1000) / 1000;

export async function buildTimeline(
  script: VideoScript,
  provider: TtsProvider,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<Timeline> {
  const { lead, gap, tail } = script.timing;
  const scenes: TimedScene[] = [];
  let sceneStart = 0;
  let n = 0;

  for (const scene of script.scenes) {
    const lines: TimedLine[] = [];
    let local = lead;
    for (const line of scene.narration) {
      n++;
      local += line.pause;
      const spoken = await speak(provider, cacheDir, {
        text: line.text,
        voice: line.voice ?? script.voice,
        speed: script.speed,
      });
      log(`  line ${n}: ${spoken.duration.toFixed(2)}s ${spoken.cached ? "(cached)" : "(generated)"}`);
      lines.push({
        n,
        text: line.text,
        cue: line.cue,
        pause: line.pause,
        audioFile: spoken.file,
        duration: round(spoken.duration),
        start: round(sceneStart + local),
        localStart: round(local),
      });
      local += spoken.duration + gap;
    }
    // Scenes end on a whole frame so the next one starts on a frame boundary.
    const duration = Math.ceil((local - gap + tail) * script.fps) / script.fps;
    scenes.push({ id: scene.id, start: round(sceneStart), duration: round(duration), lines });
    sceneStart += duration;
  }

  return { fps: script.fps, duration: round(sceneStart), scenes };
}
