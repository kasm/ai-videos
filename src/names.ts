// Names in a hint: those there are, as a person reads them, and the one that was most likely meant.

/** `a, b and c`, or with another word for "and" (a prompt's in its language). */
export const listed = (names: string[], and = "and") => (names.length > 1 ? `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}` : (names[0] ?? ""));

/** How many letters put in, left out or changed make `a` into `b`. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let corner = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, corner + (a[i - 1] === b[j - 1] ? 0 : 1));
      corner = above;
    }
  }
  return row[b.length]!;
}

/** The name of `names` that `name` was most likely meant to be: a slip of a letter or two, for a hint. None when none is near. */
export function nearest(name: string, names: string[]): string | undefined {
  const near = names.map((other) => [distance(name, other), other] as const).filter(([d, other]) => d <= 2 && d < Math.max(name.length, other.length));
  return near.sort((a, b) => a[0] - b[0])[0]?.[1];
}
