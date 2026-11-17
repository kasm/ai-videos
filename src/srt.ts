// Subtitle file from the timeline. Lines are known text, so no speech recognition is involved.
import type { Timeline } from "./timeline.ts";

const MAX_CHARS = 84; // two rows of 42
const ROW = 42;

function stamp(t: number): string {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (v: number, w = 2) => String(v).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Splits a long line at clause boundaries into chunks that fit one subtitle. */
function chunk(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const clauses = text.match(/[^.!?,;:]+[.!?,;:]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const clause of clauses) {
    if (current && (current + clause).trim().length > MAX_CHARS) {
      chunks.push(current.trim());
      current = "";
    }
    current += clause;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Breaks one subtitle into at most two balanced rows. */
function wrap(text: string): string {
  if (text.length <= ROW) return text;
  const words = text.split(" ");
  let best = text;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = `${a}\n${b}`;
    }
  }
  return best;
}

export function toSrt(timeline: Timeline): string {
  const entries: string[] = [];
  let index = 0;
  for (const scene of timeline.scenes) {
    for (const line of scene.lines) {
      const chunks = chunk(line.text);
      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      let t = line.start;
      for (const c of chunks) {
        const span = line.duration * (c.length / total);
        index++;
        entries.push(`${index}\n${stamp(t)} --> ${stamp(t + span)}\n${wrap(c)}\n`);
        t += span;
      }
    }
  }
  return entries.join("\n");
}
