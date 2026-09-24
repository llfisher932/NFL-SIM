import type { SituationPick } from "../../../src/types/situations";
import { pct } from "./format";

export const BREAK_EVEN = 0.524;

export function recordLabel(r: { wins: number; losses: number; pushes: number }): string {
  const decided = r.wins + r.losses;
  const base = `${r.wins}–${r.losses}${r.pushes > 0 ? `–${r.pushes}` : ""}`;
  return decided === 0 ? base : `${base} (${pct(r.wins / decided, 1)})`;
}

export function spotHistory(spot: SituationPick): string {
  const r = spot.record;
  if (!r) return "";
  const vegas = r.beatsVegas ? ", and more accurate than Vegas" : "";
  return `${recordLabel(r)} since 2022, above break-even in ${r.seasonsAboveBreakEven} of ${r.seasons} seasons${vegas}`;
}

export function resultLabel(result: SituationPick["result"]): string | null {
  if (result === null) return null;
  return result === "win" ? "Won" : result === "loss" ? "Lost" : "Push";
}
