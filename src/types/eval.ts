import type { SeasonWeek } from "./features";

export interface BacktestPrediction extends SeasonWeek {
  gameId: string;
  home: string;
  away: string;
  neutralSite: boolean;
  homeWinProb: number;
  tieProb: number;
  marginMean: number;
  marginP10: number;
  marginP90: number;
  totalMean: number;
  totalP10: number;
  totalP90: number;
  spreadLine: number | null;
  totalLine: number | null;
  marketHomeWinProb: number | null;
  homeScore: number;
  awayScore: number;
}

export interface ScoreCard {
  games: number;
  brier: number;
  logLoss: number;
  marginMae: number;
  totalMae: number;
}

export interface HitRate {
  hits: number;
  decisions: number;
}

export interface SeasonComparison {
  season: number | "all";
  model: ScoreCard;
  market: ScoreCard;
  againstSpread: HitRate;
  overUnder: HitRate;
}

export interface CalibrationBucket {
  lower: number;
  upper: number;
  games: number;
  meanPredicted: number;
  actualRate: number;
}
