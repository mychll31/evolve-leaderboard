/**
 * Swaps the item at `index` with its neighbour `delta` places away, returning a
 * new array. Out-of-range targets are a no-op rather than an error, so the
 * caller can wire "up" to the first row and "down" to the last without
 * special-casing the ends.
 */
export function moveItem<T>(
  items: readonly T[],
  index: number,
  delta: number,
): T[] {
  const next = [...items];
  const target = index + delta;
  if (index < 0 || index >= next.length) return next;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
