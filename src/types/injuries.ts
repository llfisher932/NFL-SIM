import type { SeasonWeek } from "./features";

export const OFFENSE_GROUPS = ["QB", "RB", "WR", "TE", "OL"] as const;
export const DEFENSE_GROUPS = ["DL", "LB", "DB"] as const;
export type OffenseGroup = (typeof OFFENSE_GROUPS)[number];
export type DefenseGroup = (typeof DEFENSE_GROUPS)[number];
export type PositionGroup = OffenseGroup | DefenseGroup;

export interface PlayerSnap extends SeasonWeek {
  playerId: string;
  gameId: string;
  team: string;
  group: PositionGroup;
  snapPct: number;
}

export interface QbDropbacks extends SeasonWeek {
  playerId: string;
  dropbacks: number;
  epa: number;
}

export interface AvailabilityReport extends SeasonWeek {
  team: string;
  playerId: string;
  rosterStatus: string | null;
  injuryStatus: string | null;
}

export interface Availability {
  reports: readonly AvailabilityReport[];
  rosterTeamWeeks: ReadonlySet<string>;
}

export interface PlayerRole {
  playerId: string;
  group: PositionGroup;
  role: number;
}

export interface TeamAbsence extends SeasonWeek {
  team: string;
  offense: Record<OffenseGroup, number>;
  defense: Record<DefenseGroup, number>;
  // Missing QB quality: role x absence x EPA/dropback above replacement, net of what the rating absorbed.
  qbValue: number;
  missing: { playerId: string; group: PositionGroup; role: number; probability: number }[];
}

export interface InjuryEffects {
  intercept: number;
  home: number;
  offense: Record<OffenseGroup, number>;
  defense: Record<DefenseGroup, number>;
  qbValue: number;
  // Average net missing role in the training games; adjustments are applied relative to it.
  baseline: { offense: Record<OffenseGroup, number>; defense: Record<DefenseGroup, number>; qbValue: number };
  observations: number;
}

export interface AbsenceProbabilities {
  inactive: number;
  offRoster: number;
  out: number;
  doubtful: number;
  questionableGameday: number;
  questionablePregame: number;
}

export interface InjuryConfig {
  lookbackGames: number;
  roleGames: number;
  minRole: number;
  absence: AbsenceProbabilities;
  ridge: number;
  qbValueRidge: number;
  qbQuality: { priorDropbacks: number; replacementBelowLeague: number };
}
