// Turns measured narration into a timeline: the voice sets the clock.
import type { SceneClips } from "./clip.ts";
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

/**
 * Lines are laid end to end with the script's pauses. In a clip scene the clip plays at its own
 * speed: a line cued to an event waits until the clip reaches it, and the scene lasts until both
 * the clip and the voice are done (fitting the clip to the voice is the next step).
 */
export async function buildTimeline(
  script: VideoScript,
  clips: Map<string, SceneClips>,
  provider: TtsProvider,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<Timeline> {
  const { lead, gap, tail } = script.timing;
  const scenes: TimedScene[] = [];
  let sceneStart = 0;
  let n = 0;

  for (const scene of script.scenes) {
    const clip = clips.get(scene.id);
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
      let note = "";
      const event = clip && line.cue ? clip.events.find((e) => e.name === line.cue) : undefined;
      if (event) {
        if (event.at > local) {
          note = `, waits ${(event.at - local).toFixed(2)}s for "${event.name}"`;
          local = event.at;
        } else if (local - event.at > lead) {
          // Up to the scene's opening silence, a voice behind its picture is on time.
          note = `, ${(local - event.at).toFixed(2)}s after "${event.name}"`;
        }
      }
      log(`  line ${n}: ${spoken.duration.toFixed(2)}s ${spoken.cached ? "(cached)" : "(generated)"}${note}`);
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
    const end = Math.max(local - gap + tail, clip?.duration ?? 0);
    // Scenes end on a whole frame so the next one starts on a frame boundary.
    const duration = Math.ceil(end * script.fps) / script.fps;
    scenes.push({ id: scene.id, start: round(sceneStart), duration: round(duration), lines });
    sceneStart += duration;
  }

  return { fps: script.fps, duration: round(sceneStart), scenes };
}
