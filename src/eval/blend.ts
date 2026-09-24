import type { BacktestPrediction } from "../types/eval";
import { regularSeasonWeeks } from "../features/league";

export interface BlendWeights {
  margin: { regular: number; playoffs: number };
  total: { early: number; rest: number };
}

// Games of prior weight pulling a small segment's fitted weight toward its market's overall weight.
const SHRINK_GAMES = 100;
const EARLY_WEEKS = 4;
const GRID = Array.from({ length: 21 }, (_, i) => i / 20);

interface Pair {
  market: number;
  model: number;
  actual: number;
}

// Weight on the model in (1 - w) * market + w * model that minimizes mean absolute error.
export function fitBlendWeight(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return 0;
  let best = { weight: 0, error: Infinity };
  for (const weight of GRID) {
    const error = pairs.reduce((s, p) => s + Math.abs((1 - weight) * p.market + weight * p.model - p.actual), 0);
    if (error < best.error - 1e-9) best = { weight, error };
  }
  return best.weight;
}

function shrunk(pairs: readonly Pair[], overall: number): number {
  return (pairs.length * fitBlendWeight(pairs) + SHRINK_GAMES * overall) / (pairs.length + SHRINK_GAMES);
}

// How much to trust the model against Vegas, by market and part of the season, from the backtest.
export function blendWeights(predictions: readonly BacktestPrediction[]): BlendWeights {
  const playoffs = (p: BacktestPrediction) => p.week > regularSeasonWeeks(p.season);
  const margins = (ps: readonly BacktestPrediction[]) =>
    ps.flatMap((p) => (p.spreadLine === null ? [] : [{ market: p.spreadLine, model: p.marginMean, actual: p.homeScore - p.awayScore }]));
  const totals = (ps: readonly BacktestPrediction[]) =>
    ps.flatMap((p) => (p.totalLine === null ? [] : [{ market: p.totalLine, model: p.totalMean, actual: p.homeScore + p.awayScore }]));

  const regular = predictions.filter((p) => !playoffs(p));
  const marginRegular = fitBlendWeight(margins(regular));
  const totalOverall = fitBlendWeight(totals(predictions));
  return {
    margin: { regular: marginRegular, playoffs: shrunk(margins(predictions.filter(playoffs)), marginRegular) },
    total: {
      early: shrunk(totals(regular.filter((p) => p.week <= EARLY_WEEKS)), totalOverall),
      rest: shrunk(totals(predictions.filter((p) => p.week > EARLY_WEEKS)), totalOverall),
    },
  };
}

export function gameWeights(weights: BlendWeights, week: number, postseason: boolean): { margin: number; total: number } {
  return {
    margin: postseason ? weights.margin.playoffs : weights.margin.regular,
    total: !postseason && week <= EARLY_WEEKS ? weights.total.early : weights.total.rest,
  };
}
