import { isBefore } from "../features/window";
import type { CalibrationBucket } from "../types/eval";
import type { SeasonWeek } from "../types/features";
import type { PlayerGame, PlayerProjection, StatSummary } from "../types/players";
import { calibrationBuckets } from "./metrics";

export interface Baseline {
  receptions: number;
  recYards: number;
  rushYards: number;
}

export interface PlayerEvalRow {
  projection: PlayerProjection;
  actual: PlayerGame | null;
  baseline: Baseline;
}

export interface StatEval {
  games: number;
  absent: number;
  coverage: number;
  coverageAbsentAsZero: number;
  mae: number;
  baselineMae: number;
  meanProjected: number;
  meanActual: number;
  meanActualAbsentAsZero: number;
  meanProjectedAll: number;
}

export interface PlayerEvalReport {
  projected: number;
  appeared: number;
  receptions: StatEval;
  recYards: StatEval;
  rushYards: StatEval;
  passYards: StatEval;
  anytimeTd: CalibrationBucket[];
}

export const MIN_TARGETS = 2;
export const MIN_CARRIES = 3;

export function trailingBaseline(playerGames: readonly PlayerGame[], playerId: string, target: SeasonWeek, games = 4): Baseline {
  const recent = playerGames
    .filter((g) => g.playerId === playerId && isBefore(g, target) && g.season >= target.season - 1)
    .slice(-games);
  const avg = (f: (g: PlayerGame) => number) => (recent.length > 0 ? recent.reduce((s, g) => s + f(g), 0) / recent.length : 0);
  return { receptions: avg((g) => g.receptions), recYards: avg((g) => g.recYards), rushYards: avg((g) => g.rushYards) };
}

function statEval(
  rows: readonly PlayerEvalRow[],
  summary: (p: PlayerProjection) => StatSummary,
  actual: (g: PlayerGame) => number,
  baseline: (b: Baseline) => number,
): StatEval {
  const scored = rows.filter((r): r is PlayerEvalRow & { actual: PlayerGame } => r.actual !== null);
  const n = scored.length;
  const mean = (f: (r: (typeof scored)[number]) => number) => (n > 0 ? scored.reduce((s, r) => s + f(r), 0) / n : Number.NaN);
  const allMean = (f: (r: PlayerEvalRow) => number) => (rows.length > 0 ? rows.reduce((s, r) => s + f(r), 0) / rows.length : Number.NaN);
  const actualOrZero = (r: PlayerEvalRow) => (r.actual ? actual(r.actual) : 0);
  const covered = (r: PlayerEvalRow, v: number) => {
    const s = summary(r.projection);
    return v >= s.p10 && v <= s.p90 ? 1 : 0;
  };
  return {
    games: n,
    absent: rows.length - n,
    coverage: mean((r) => covered(r, actual(r.actual))),
    coverageAbsentAsZero: allMean((r) => covered(r, actualOrZero(r))),
    mae: mean((r) => Math.abs(summary(r.projection).mean - actual(r.actual))),
    baselineMae: mean((r) => Math.abs(baseline(r.baseline) - actual(r.actual))),
    meanProjected: mean((r) => summary(r.projection).mean),
    meanActual: mean((r) => actual(r.actual)),
    meanActualAbsentAsZero: allMean(actualOrZero),
    meanProjectedAll: allMean((r) => summary(r.projection).mean),
  };
}

// Box scores only list players who recorded a stat, so an absent player may have been inactive or
// active with zero volume. Metrics are reported both ways; the truth lies between.
export function evaluatePlayers(rows: readonly PlayerEvalRow[]): PlayerEvalReport {
  const receivers = rows.filter((r) => r.projection.targets >= MIN_TARGETS);
  const rushers = rows.filter((r) => r.projection.carries >= MIN_CARRIES);
  const qbs = rows.filter((r) => r.projection.starterQb);
  const skill = rows.filter((r) => !r.projection.starterQb && r.actual !== null);
  return {
    projected: rows.length,
    appeared: rows.filter((r) => r.actual !== null).length,
    receptions: statEval(receivers, (p) => p.receptions, (g) => g.receptions, (b) => b.receptions),
    recYards: statEval(receivers, (p) => p.recYards, (g) => g.recYards, (b) => b.recYards),
    rushYards: statEval(rushers, (p) => p.rushYards, (g) => g.rushYards, (b) => b.rushYards),
    passYards: statEval(qbs, (p) => p.passYards, (g) => g.passYards, () => Number.NaN),
    anytimeTd: calibrationBuckets(
      skill.map((r) => ({ probability: r.projection.anytimeTdProb, outcome: r.actual!.recTds + r.actual!.rushTds > 0 ? 1 : 0 })),
      5,
    ),
  };
}
