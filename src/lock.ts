// A make's hold on a video file's cache (AGENTS.md, "The cache"): .cache/<name>/make.lock, which
// names the process that holds it. A second make of the video finds it and is refused, naming the
// first; a lock whose process is gone (a make killed half-way) is taken over. It lives on the
// disk, so it holds whatever runs make: a terminal, story, a session.
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const LOCK_FILE = "make.lock";

/** Who holds a lock: its process, since when, and the command it runs. */
export interface Holder {
  pid: number;
  since: string;
  command: string;
}

/** The locks this process holds: one of them found again is a second make here, not a stale one. */
const held = new Set<string>();

/** Whether a process is running: signal 0 tests it, and sends nothing. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // There, but not ours to signal.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function holderOf(file: string): Holder | undefined {
  try {
    const holder = JSON.parse(readFileSync(file, "utf8")) as Partial<Holder>;
    return typeof holder.pid === "number" && typeof holder.since === "string" && typeof holder.command === "string" ? (holder as Holder) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Takes the lock of the video whose cache is `dir`, for `command`: throws who holds it, when a
 * running process does. Returns its release, which removes it while it is still this process's.
 */
export async function lock(dir: string, name: string, command: string): Promise<() => Promise<void>> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, LOCK_FILE);
  const mine: Holder = { pid: process.pid, since: new Date().toISOString(), command };
  for (let tries = 0; ; tries++) {
    try {
      // Made only when it is not there: of two makes at once, one makes it.
      await writeFile(file, `${JSON.stringify(mine)}\n`, { flag: "wx" });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    // A lock this process's id wrote, and this process does not hold, is an old process's: ids are used again.
    const holder = holderOf(file);
    const running = holder && (holder.pid === process.pid ? held.has(file) : alive(holder.pid));
    // Taken again by another make the moment after a stale one went: that one holds it.
    if (holder === undefined || running || tries > 0) {
      const who = holder ? `process ${holder.pid} (${holder.command}), since ${new Date(holder.since).toLocaleString()}` : "a make whose lock does not read";
      throw new Error(`${name} is being made by ${who}: wait for it to end, or stop it. If no make is running, delete ${file}`);
    }
    // Its process is gone: a make stopped half-way, whose stages are forgotten until made again.
    await rm(file, { force: true });
  }
  held.add(file);
  return async () => {
    held.delete(file);
    const holder = holderOf(file);
    if (holder?.pid === process.pid && holder.since === mine.since) await rm(file, { force: true });
  };
}
