import type { DuckDBConnection } from "@duckdb/node-api";
import { loadAvailability, loadPlayerSnaps, loadQbDropbacks } from "../data/availability";
import type { InjuryInputs } from "../eval/backtest";
import { DEFAULT_INJURY_CONFIG } from "../features/injuries";
import type { TeamAbsence } from "../types/injuries";
import type { PlayerOverride } from "../types/players";

export async function loadInjuryInputs(connection: DuckDBConnection, enabled: boolean): Promise<InjuryInputs | undefined> {
  if (!enabled) return undefined;
  return {
    snaps: await loadPlayerSnaps(connection),
    qbDropbacks: await loadQbDropbacks(connection),
    availability: await loadAvailability(connection),
    config: DEFAULT_INJURY_CONFIG,
  };
}

// Manual overrides win over automatic injury outs for the same player and week.
export function mergeOverrides(manual: readonly PlayerOverride[], automatic: readonly PlayerOverride[]): PlayerOverride[] {
  const manualKeys = new Set(manual.map((o) => `${o.season}:${o.week}:${o.playerId}`));
  return [...manual, ...automatic.filter((o) => !manualKeys.has(`${o.season}:${o.week}:${o.playerId}`))];
}

export function describeAbsence(absence: TeamAbsence | undefined, names: ReadonlyMap<string, string>, limit = 4): string {
  if (!absence) return "";
  return absence.missing
    .filter((m) => m.probability >= 0.5 && m.role >= 0.3)
    .sort((a, b) => b.role - a.role)
    .slice(0, limit)
    .map((m) => `${names.get(m.playerId) ?? m.playerId} (${m.group})`)
    .join(", ");
}
