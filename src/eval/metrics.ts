import type { CalibrationBucket, HitRate } from "../types/eval";

const PROBABILITY_FLOOR = 1e-6;

export interface ProbabilityOutcome {
  probability: number;
  outcome: number;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function brierScore(rows: readonly ProbabilityOutcome[]): number {
  return mean(rows.map((r) => (r.probability - r.outcome) ** 2));
}

export function logLoss(rows: readonly ProbabilityOutcome[]): number {
  return mean(
    rows.map((r) => {
      const p = Math.min(1 - PROBABILITY_FLOOR, Math.max(PROBABILITY_FLOOR, r.probability));
      return -(r.outcome * Math.log(p) + (1 - r.outcome) * Math.log(1 - p));
    }),
  );
}

export function meanAbsoluteError(pairs: readonly { predicted: number; actual: number }[]): number {
  return mean(pairs.map((p) => Math.abs(p.predicted - p.actual)));
}

export function homeOutcome(homeScore: number, awayScore: number): number {
  if (homeScore > awayScore) return 1;
  if (homeScore < awayScore) return 0;
  return 0.5;
}

// Picks the side of the line the prediction favors; pushes and exact agreement are not decisions.
export function lineHitRate(rows: readonly { predicted: number; line: number; actual: number }[]): HitRate {
  let hits = 0;
  let decisions = 0;
  for (const r of rows) {
    const pick = Math.sign(r.predicted - r.line);
    const result = Math.sign(r.actual - r.line);
    if (pick === 0 || result === 0) continue;
    decisions++;
    if (pick === result) hits++;
  }
  return { hits, decisions };
}

export function calibrationBuckets(rows: readonly ProbabilityOutcome[], buckets = 10): CalibrationBucket[] {
  return Array.from({ length: buckets }, (_, i) => {
    const lower = i / buckets;
    const upper = (i + 1) / buckets;
    const inBucket = rows.filter(
      (r) => r.probability >= lower && (r.probability < upper || (i === buckets - 1 && r.probability <= upper)),
    );
    return {
      lower,
      upper,
      games: inBucket.length,
      meanPredicted: mean(inBucket.map((r) => r.probability)),
      actualRate: mean(inBucket.map((r) => r.outcome)),
    };
  });
}
