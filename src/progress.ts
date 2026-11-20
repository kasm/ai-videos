// HyperFrames' check reports its progress a line a step (`[hyperframes] check: craft 1/599`, 634
// lines for water-switch's): the fold keeps one line per phase, ending on the phase's last count.
// Everything else the check prints passes through, in order: its status, warnings, errors, verdict.

/** A count of a check's progress: its phase, done, of total. The `\r` of a Windows tool is allowed. */
const PROGRESS = /^\[hyperframes\] check: ([a-z]+) (\d+)\/(\d+)\r?$/;

/** The check's own status: a step announced (`check: analyzing the samples`), or still going. */
const STATUS = /^\[hyperframes\] check: /;

/** On a terminal: up to the line above, and cleared, so what follows is written over it. */
export const OVER = "\x1B[1A\x1B[2K";

/** Where the fold writes: a stream, or a test's string. */
export interface Sink {
  write(text: string): unknown;
}

export interface Fold {
  /** A chunk of the child's stdout: written as it is, after a count held back. */
  stdout(text: string): void;
  /** A chunk of the child's stderr, which carries the progress. */
  stderr(text: string): void;
  /** The child has closed: what is held back is written. */
  end(): void;
}

/**
 * Folds the counts of a HyperFrames check into one line per phase.
 *
 * A phase's count stays open, the last line, until it reaches its total or something other than
 * the check's status comes. The status is written above an open count: the check announces a step
 * while a phase is under way (`analyze 0/3`, then `analyzing the samples`), and every 30 s says it
 * is still at it; neither should cut a phase in two.
 *
 * In place (on a terminal) each count is written as it comes, over the one before, and every line
 * ends with its newline: the cursor rests on a fresh line, so the child's stdout, which goes to the
 * terminal straight, never lands on a count. HyperFrames writes there only before the counts and
 * after them (its verdict). Elsewhere (a log, an agent) an open count is held back and written once,
 * before whatever comes next, the child's stdout included.
 */
export function foldProgress({ out, err, inPlace }: { out: Sink; err: Sink; inPlace: boolean }): Fold {
  let tail = ""; // the stderr after its last newline: a line not yet whole
  let open: { phase: string; text: string } | undefined; // the open count: last on screen, or held back

  /** The open count is final: held back, it is written now. */
  const close = () => {
    if (open && !inPlace) err.write(`${open.text}\n`);
    open = undefined;
  };

  const line = (text: string) => {
    const count = PROGRESS.exec(text);
    if (count) {
      const [, phase, done, total] = count;
      if (open?.phase !== phase) close();
      if (inPlace) err.write(`${open ? OVER : ""}${text}\n`);
      open = { phase: phase!, text };
      if (done === total) close();
    } else if (open && STATUS.test(text)) {
      err.write(inPlace ? `${OVER}${text}\n${open.text}\n` : `${text}\n`);
    } else {
      close();
      err.write(`${text}\n`);
    }
  };

  return {
    stdout(text) {
      close();
      out.write(text);
    },
    stderr(text) {
      const lines = (tail + text).split("\n");
      tail = lines.pop()!;
      for (const text of lines) line(text);
    },
    end() {
      close();
      if (tail) err.write(tail);
      tail = "";
    },
  };
}
