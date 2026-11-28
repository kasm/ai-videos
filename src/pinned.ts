// Files the tool reads from this disk and `setup` alone fetches (setup.ts): those of a repository, at a
// revision, each with its size and sha256, so what is read is what was tried.
import path from "node:path";

export interface Pinned {
  /** What it is, as a missing piece is named: "the Ukrainian stress dictionary". */
  what: string;
  /** Its repository, as its host names it: its files are kept under this, in the models' folder. */
  name: string;
  /** Where a file of it is fetched from, at its revision. */
  url(file: string): string;
  /** Its files the tool reads, and its licence. */
  files: Record<string, { size: number; sha256: string }>;
}

/** Where its files are, in the models' folder. */
export const pinnedDir = (models: string, { name }: Pick<Pinned, "name">): string => path.join(models, ...name.split("/"));
