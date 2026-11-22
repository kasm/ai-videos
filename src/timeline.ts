// Turns measured narration into a timeline: the voice sets the clock.
import type { SceneClip } from "./clip.ts";
import { voiceOf, type VideoScript } from "./script.ts";
import { speak, type TtsProvider } from "./tts.ts";

/** A narration line, spoken and measured. */
export interface SpokenLine {
  /** 1-based position in the whole video. */
  n: number;
  text: string;
  /** Who says it, when the script names a speaker. */
  speaker?: string;
  cue?: string;
  audioFile: string;
  /** The voice's length, seconds, as measured (not rounded). */
  duration: number;
}

export interface TimedLine {
  /** 1-based position in the whole video. */
  n: number;
  text: string;
  cue?: string;
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

/** Speaks every line (or takes it from the cache) and measures it: one list per scene. */
export async function narrate(
  script: VideoScript,
  provider: TtsProvider,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<SpokenLine[][]> {
  let n = 0;
  const scenes: SpokenLine[][] = [];
  for (const scene of script.scenes) {
    const lines: SpokenLine[] = [];
    for (const line of scene.narration) {
      n++;
      const voice = voiceOf(script, line);
      const spoken = await speak(provider, cacheDir, { text: line.text, voice, speed: script.speed });
      // A line in another voice than the video's says whose, so a cast is checked by reading.
      const who = voice === script.voice ? "" : ` (${[line.speaker, voice].filter(Boolean).join(", ")})`;
      log(`  line ${n}${who}: ${spoken.duration.toFixed(2)}s ${spoken.cached ? "(cached)" : "(generated)"}`);
      lines.push({
        n,
        text: line.text,
        ...(line.speaker ? { speaker: line.speaker } : {}),
        cue: line.cue,
        audioFile: spoken.file,
        duration: spoken.duration,
      });
    }
    scenes.push(lines);
  }
  return scenes;
}

/**
 * Lines are laid end to end with the script's gaps, and the clip plays as it was drawn: a line
 * cued to an event waits until the clip reaches it, and the scene lasts until both the clip and
 * the voice are done. A clip drawn to its request (see fit.ts) has every event where
 * the voice wants it, so no line waits for longer than a frame.
 */
export function buildTimeline(
  script: VideoScript,
  clips: Map<string, SceneClip>,
  spoken: SpokenLine[][],
  log: (msg: string) => void,
): Timeline {
  const { lead, gap, tail } = script.timing;
  const fps = script.fps;
  const scenes: TimedScene[] = [];
  let sceneStart = 0;

  for (const [i, scene] of script.scenes.entries()) {
    const clip = clips.get(scene.id);
    const lines: TimedLine[] = [];
    let local = lead;
    for (const line of spoken[i]!) {
      const event = clip && line.cue ? clip.events.find((e) => e.name === line.cue) : undefined;
      if (event && event.at > local) {
        // A fitted clip puts an event on the frame after the voice's time: less than a frame is no wait.
        if (event.at - local > 1 / fps) log(`  line ${line.n} waits ${(event.at - local).toFixed(2)}s for "${event.name}"`);
        local = event.at;
      } else if (event && local - event.at > lead) {
        // Up to the scene's opening silence, a voice behind its picture is on time.
        log(`  line ${line.n} starts ${(local - event.at).toFixed(2)}s after "${event.name}"`);
      }
      lines.push({
        n: line.n,
        text: line.text,
        cue: line.cue,
        audioFile: line.audioFile,
        duration: round(line.duration),
        start: round(sceneStart + local),
        localStart: round(local),
      });
      local += line.duration + gap;
    }
    // Scenes end on a whole frame so the next one starts on a frame boundary. A clip has whole
    // frames already; its length is rounded, not raised, so a written 16.633 stays 499 frames.
    const voice = Math.ceil((local - gap + tail) * fps);
    const frames = clip ? Math.max(voice, Math.round(clip.duration * fps)) : voice;
    const duration = frames / fps;
    scenes.push({ id: scene.id, start: round(sceneStart), duration: round(duration), lines });
    sceneStart += duration;
  }

  return { fps, duration: round(sceneStart), scenes };
}
