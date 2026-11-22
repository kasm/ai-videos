// Which moment each frame of a request shows (AGENTS.md, "Moments"): the part of step two that is
// pure, so that a web page draws its frames with the same code as the video (page.ts). It imports
// nothing; plugin.ts exports it to the plugins, for their tests.

/** What `moments` reads of a request (ai-videos-request, fit.ts); its other keys are for reading. */
export interface Request {
  fps: number;
  /** The clip's length in whole frames. */
  frames: number;
  spans: {
    event: string;
    span: "hold" | "move";
    /** When the span begins and how long it lasts in the clip, seconds. */
    at: number;
    duration: number;
    /** A move plays its motion over this long, then holds its last picture for the rest. */
    move?: number;
  }[];
  /** The spoken lines. A request with none, or a line with no track or no speaker, moves no mouth. */
  lines?: {
    speaker?: string;
    /** `open[k]` is for the clip's frame `frame + k`, 0 closed to 1 wide. */
    mouth?: { frame: number; open: number[] };
  }[];
}

/** What one frame shows. */
export interface Moment {
  /** Which of the request's spans the frame is in, from 0. */
  span: number;
  /** How far through the span's motion: a move goes evenly from 0 to 1 and stays there; a hold is at 0. */
  progress: number;
  /** Seconds since the clip began, and since the span did. */
  time: number;
  into: number;
  /** How open each speaker's mouth is, above 0 to 1. A speaker it does not name has it closed. */
  mouths: Record<string, number>;
}

/**
 * Whose mouth is open in each frame of the clip, and how wide: each line's track laid on the frames
 * it names, for its speaker alone. A line with no speaker is a narrator's, whom nobody draws, so it
 * opens no mouth.
 */
function mouths(request: Request): Record<string, number>[] {
  const open = Array.from({ length: request.frames }, (): Record<string, number> => ({}));
  for (const { speaker, mouth } of request.lines ?? []) {
    if (speaker === undefined) continue;
    mouth?.open.forEach((value, k) => {
      const at = open[mouth.frame + k];
      // One speaker's line may end in the frame their next begins in: the wider mouth shows.
      if (at && value > 0) at[speaker] = Math.max(at[speaker] ?? 0, value);
    });
  }
  return open;
}

/**
 * The moment each frame of the requested clip shows. The tool puts every span on a whole frame; a
 * move's motion takes its `move` seconds from there and then stays at its end, and the next span
 * begins where it ended. Each speaker's mouth follows their lines' voice, whatever the span.
 */
export function moments(request: Request): Moment[] {
  if (!Number.isInteger(request.frames) || request.frames <= 0 || !(request.fps > 0)) {
    throw new Error(`the request gives no whole number of frames at a frame rate (frames ${request.frames}, fps ${request.fps})`);
  }
  const open = mouths(request);
  const starts = request.spans.map((span) => Math.round(span.at * request.fps));
  const frames: Moment[] = [];
  request.spans.forEach((span, i) => {
    const start = starts[i]!;
    const end = starts[i + 1] ?? request.frames;
    if (start !== frames.length || end <= start) throw new Error(`the request's span "${span.event}" does not follow the one before it on a whole frame`);
    for (let frame = start; frame < end; frame++) {
      const progress = span.span === "move" ? Math.min(1, (frame - start) / request.fps / (span.move ?? span.duration)) : 0;
      frames.push({ span: i, progress, time: frame / request.fps, into: (frame - start) / request.fps, mouths: open[frame]! });
    }
  });
  return frames;
}
