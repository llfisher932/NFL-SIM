import type { BacktestPrediction, CalibrationBucket, ScoreCard, SeasonComparison } from "../types/eval";
import {
  brierScore,
  calibrationBuckets,
  homeOutcome,
  lineHitRate,
  logLoss,
  meanAbsoluteError,
  type ProbabilityOutcome,
} from "./metrics";

type Priced = BacktestPrediction & { spreadLine: number; totalLine: number; marketHomeWinProb: number };

export function hasMarket(p: BacktestPrediction): p is Priced {
  return p.spreadLine !== null && p.totalLine !== null && p.marketHomeWinProb !== null;
}

export const modelWinProbability = (p: BacktestPrediction) => p.homeWinProb + p.tieProb / 2;

const margin = (p: BacktestPrediction) => p.homeScore - p.awayScore;
const total = (p: BacktestPrediction) => p.homeScore + p.awayScore;

function scoreCard(rows: readonly Priced[], probability: (p: Priced) => number, predictedMargin: (p: Priced) => number, predictedTotal: (p: Priced) => number): ScoreCard {
  const outcomes: ProbabilityOutcome[] = rows.map((p) => ({
    probability: probability(p),
    outcome: homeOutcome(p.homeScore, p.awayScore),
  }));
  return {
    games: rows.length,
    brier: brierScore(outcomes),
    logLoss: logLoss(outcomes),
    marginMae: meanAbsoluteError(rows.map((p) => ({ predicted: predictedMargin(p), actual: margin(p) }))),
    totalMae: meanAbsoluteError(rows.map((p) => ({ predicted: predictedTotal(p), actual: total(p) }))),
  };
}

function compare(season: number | "all", rows: readonly Priced[]): SeasonComparison {
  return {
    season,
    model: scoreCard(rows, modelWinProbability, (p) => p.marginMean, (p) => p.totalMean),
    market: scoreCard(rows, (p) => p.marketHomeWinProb, (p) => p.spreadLine, (p) => p.totalLine),
    againstSpread: lineHitRate(rows.map((p) => ({ predicted: p.marginMean, line: p.spreadLine, actual: margin(p) }))),
    overUnder: lineHitRate(rows.map((p) => ({ predicted: p.totalMean, line: p.totalLine, actual: total(p) }))),
  };
}

// Model and market are scored on the same games: those with a spread, total and both moneylines.
export function compareToMarket(predictions: readonly BacktestPrediction[]): SeasonComparison[] {
  const priced = predictions.filter(hasMarket);
  const seasons = [...new Set(priced.map((p) => p.season))].sort((a, b) => a - b);
  return [...seasons.map((s) => compare(s, priced.filter((p) => p.season === s))), compare("all", priced)];
}

export interface CalibrationReport {
  model: CalibrationBucket[];
  market: CalibrationBucket[];
}

export function calibrationReport(predictions: readonly BacktestPrediction[], buckets = 10): CalibrationReport {
  const priced = predictions.filter(hasMarket);
  const rows = (probability: (p: Priced) => number) =>
    priced.map((p) => ({ probability: probability(p), outcome: homeOutcome(p.homeScore, p.awayScore) }));
  return {
    model: calibrationBuckets(rows(modelWinProbability), buckets),
    market: calibrationBuckets(rows((p) => p.marketHomeWinProb), buckets),
  };
}
