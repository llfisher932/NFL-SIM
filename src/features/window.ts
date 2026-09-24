import type { SeasonWeek } from "../types/features";

export interface Weighted<T> {
  item: T;
  weight: number;
}

export function isBefore(a: SeasonWeek, b: SeasonWeek): boolean {
  return a.season < b.season || (a.season === b.season && a.week < b.week);
}

export function decayWeight(ageWeeks: number, halfLifeWeeks: number): number {
  if (ageWeeks < 0) throw new Error("negative age");
  return 0.5 ** (ageWeeks / halfLifeWeeks);
}

export function seasonWindow<T extends SeasonWeek>(
  items: readonly T[],
  target: SeasonWeek,
  halfLifeWeeks: number,
): Weighted<T>[] {
  return items
    .filter((item) => item.season === target.season && isBefore(item, target))
    .map((item) => ({ item, weight: decayWeight(target.week - item.week - 1, halfLifeWeeks) }));
}
