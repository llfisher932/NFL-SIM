import type { Rng } from "./rng";

export interface NearestSampler<T> {
  size: number;
  sample(key: number, rng: Rng): T | null;
}

// Draws uniformly from the k entries whose keys are closest to the query key.
export function createNearestSampler<T>(
  entries: readonly { key: number; value: T }[],
  k: number,
): NearestSampler<T> {
  const sorted = [...entries].sort((a, b) => a.key - b.key);
  const keys = sorted.map((e) => e.key);

  function lowerBound(key: number): number {
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (keys[mid]! < key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  return {
    size: sorted.length,
    sample(key, rng) {
      if (sorted.length === 0) return null;
      const want = Math.min(k, sorted.length);
      let lo = lowerBound(key);
      let hi = lo;
      while (hi - lo < want) {
        const takeLeft =
          hi >= sorted.length || (lo > 0 && Math.abs(keys[lo - 1]! - key) <= Math.abs(keys[hi]! - key));
        if (takeLeft) lo--;
        else hi++;
      }
      return sorted[lo + rng.int(hi - lo)]!.value;
    },
  };
}
