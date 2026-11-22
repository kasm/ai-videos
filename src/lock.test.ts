// A make's lock on a video's cache: a second make is refused, naming the first; a lock whose
// process is gone is taken over; a release removes only this process's lock.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { after, test } from "node:test";
import { alive, lock, LOCK_FILE } from "./lock.ts";

const scratch = await mkdtemp(path.join(os.tmpdir(), "ai-videos-lock-"));
after(() => rm(scratch, { recursive: true, force: true }));

/** A Node process that waits until it is killed, and its exit. */
function waiting() {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  return { pid: child.pid!, ended: once(child, "exit"), kill: () => child.kill() };
}

const holder = (pid: number, command = "make videos/meet.yaml") => `${JSON.stringify({ pid, since: "2026-11-22T10:14:03.000Z", command })}\n`;

test("a make holds the lock until it releases it: a second one is refused, naming the first", async () => {
  const dir = path.join(scratch, "meet");
  const release = await lock(dir, "meet", "make videos/meet.yaml --as web");
  const file = path.join(dir, LOCK_FILE);
  assert.deepEqual(
    { ...JSON.parse(readFileSync(file, "utf8")), since: "" },
    { pid: process.pid, since: "", command: "make videos/meet.yaml --as web" },
  );
  await assert.rejects(lock(dir, "meet", "make videos/meet.yaml"), (e: Error) => {
    assert.match(e.message, new RegExp(`^meet is being made by process ${process.pid} \\(make videos/meet\\.yaml --as web\\), since .+: wait for it to end, or stop it\\.`));
    assert.ok(e.message.endsWith(`If no make is running, delete ${file}`));
    return true;
  });
  await release();
  assert.equal(existsSync(file), false);
  await (await lock(dir, "meet", "make videos/meet.yaml"))();
});

test("a lock whose process is running is refused; once it is gone, the lock is taken over", async () => {
  const dir = path.join(scratch, "held");
  const other = waiting();
  try {
    assert.equal(alive(other.pid), true);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, LOCK_FILE), holder(other.pid));
    await assert.rejects(lock(dir, "held", "make videos/held.yaml"), new RegExp(`held is being made by process ${other.pid} \\(make videos/meet\\.yaml\\)`));
  } finally {
    other.kill();
    await other.ended;
  }
  // Killed half-way, it left its lock: the next make takes it over.
  assert.equal(alive(other.pid), false);
  const release = await lock(dir, "held", "make videos/held.yaml");
  assert.equal(JSON.parse(readFileSync(path.join(dir, LOCK_FILE), "utf8")).pid, process.pid);
  await release();
});

test("a lock this process's id wrote, which it does not hold, is an old process's; one that does not read is refused", async () => {
  const dir = path.join(scratch, "reused");
  await (await lock(dir, "reused", "first"))();
  await writeFile(path.join(dir, LOCK_FILE), holder(process.pid));
  const release = await lock(dir, "reused", "make videos/reused.yaml");
  // A lock taken over by another make since is not removed by this one's release.
  await writeFile(path.join(dir, LOCK_FILE), holder(process.pid, "another"));
  await release();
  assert.equal(existsSync(path.join(dir, LOCK_FILE)), true);

  await writeFile(path.join(dir, LOCK_FILE), "");
  await assert.rejects(lock(dir, "reused", "make"), /reused is being made by a make whose lock does not read: .* If no make is running, delete /);
});
