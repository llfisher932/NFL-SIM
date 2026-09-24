export interface SeasonWeek {
  season: number;
  week: number;
}

export interface TeamGame extends SeasonWeek {
  gameId: string;
  team: string;
  opponent: string;
  passPlays: number;
  passEpa: number;
  rushPlays: number;
  rushEpa: number;
  plays: number;
  neutralPlays: number;
  neutralPasses: number;
}

export type Split = "all" | "pass" | "rush";
export type Side = "offense" | "defense";

export type UnitRatings = Record<Split, number>;

export interface TeamWeekFeatures extends SeasonWeek {
  team: string;
  gamesPlayed: number;
  offense: UnitRatings;
  defense: UnitRatings;
  league: UnitRatings;
  playsPerGame: number;
  neutralPassRate: number;
}

export interface ShrinkageConfig {
  priorWeight: number;
  retention: number;
  fallback: number;
}

export interface FeatureConfig {
  halfLifeWeeks: number;
  priorPlays: Record<Side, UnitRatings>;
  retention: Record<Side, number>;
  interceptPriorPlays: number;
  playsPerGame: ShrinkageConfig;
  neutralPassRate: ShrinkageConfig;
}

export interface SeasonSchedule {
  season: number;
  teams: readonly string[];
  weeks: readonly number[];
}
