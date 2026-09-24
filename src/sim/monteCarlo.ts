import type { Distribution, GameProjection, Histogram, Matchup, SimConfig } from "../types/sim";
import type { DriveModel } from "./driveModel";
import { simulateGame } from "./game";
import { createRng } from "./rng";

export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) throw new Error("empty sample");
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower]!;
  return low + (sorted[upper]! - low) * (position - lower);
}

export function distribution(values: Float64Array): Distribution {
  const sorted = Float64Array.from(values).sort();
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    mean,
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
  };
}

// Counts per integer value from the smallest to the largest observed.
export function histogram(values: Float64Array): Histogram {
  if (values.length === 0) return { start: 0, counts: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    const r = Math.round(v);
    if (r < min) min = r;
    if (r > max) max = r;
  }
  const counts = new Array<number>(max - min + 1).fill(0);
  for (const v of values) counts[Math.round(v) - min]!++;
  return { start: min, counts };
}

export function projectGame(
  model: DriveModel,
  matchup: Matchup,
  config: SimConfig,
  sims: number,
  seed: number,
): GameProjection {
  if (!Number.isInteger(sims) || sims < 1) throw new Error("invalid sims");
  const rng = createRng(seed);
  const home = new Float64Array(sims);
  const away = new Float64Array(sims);
  let homeWins = 0;
  let ties = 0;
  let drives = 0;
  let overtimes = 0;

  for (let i = 0; i < sims; i++) {
    const result = simulateGame(model, matchup, config, rng);
    home[i] = result.homeScore;
    away[i] = result.awayScore;
    if (result.homeScore > result.awayScore) homeWins++;
    else if (result.homeScore === result.awayScore) ties++;
    drives += result.drives;
    if (result.overtime) overtimes++;
  }

  const margins = home.map((h, i) => h - away[i]!);
  const totals = home.map((h, i) => h + away[i]!);
  return {
    sims,
    homeWinProb: homeWins / sims,
    awayWinProb: (sims - homeWins - ties) / sims,
    tieProb: ties / sims,
    homeScore: distribution(home),
    awayScore: distribution(away),
    margin: distribution(margins),
    total: distribution(totals),
    drivesPerGame: drives / sims,
    overtimeRate: overtimes / sims,
    marginHistogram: histogram(margins),
    totalHistogram: histogram(totals),
  };
}
