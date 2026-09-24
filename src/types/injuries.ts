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
  team: string;
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
  // Players ruled out by hand, keyed season:week:playerId.
  manualOuts?: ReadonlySet<string>;
}

export interface PlayerRole {
  playerId: string;
  group: PositionGroup;
  role: number;
}

export type AbsenceReason = "out" | "doubtful" | "questionable" | "inactive" | "reserve" | "not active" | "not on roster" | "ruled out" | "resting";

export interface MissingPlayer {
  playerId: string;
  group: PositionGroup;
  role: number;
  probability: number;
  reason: AbsenceReason;
}

export interface TeamAbsence extends SeasonWeek {
  team: string;
  offense: Record<OffenseGroup, number>;
  defense: Record<DefenseGroup, number>;
  // Expected QB's EPA/dropback minus the QB quality already baked into the team's rating.
  qbDelta: number;
  // Who the model expects at QB: the listed starter, his chance of missing, and the fallback.
  expectedQb?: { starter: string | null; backup: string | null; starterOut: number; skill: number };
  missing: MissingPlayer[];
}

export interface InjuryEffects {
  intercept: number;
  home: number;
  offense: Record<OffenseGroup, number>;
  defense: Record<DefenseGroup, number>;
  qbDelta: number;
  // Average net missing role in the training games; adjustments are applied relative to it.
  baseline: { offense: Record<OffenseGroup, number>; defense: Record<DefenseGroup, number>; qbDelta: number };
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

export interface QbProfile {
  draftRound: number | null;
  rookieSeason: number | null;
}

export interface QbSkillConfig {
  halfLifeGames: number;
  priorDropbacks: number;
  experiencedAfterSeasons: number;
  // Prior EPA/dropback relative to league, by draft slot for young QBs.
  offsets: { round1: number; round2to3: number; round4to7: number; undrafted: number; veteran: number };
  replacement: number;
}

export interface InjuryConfig {
  lookbackGames: number;
  roleGames: number;
  minRole: number;
  absence: AbsenceProbabilities;
  ridge: number;
  qbDeltaRidge: number;
  qbSkill: QbSkillConfig;
  // Share of snaps regulars sit in the final regular-season week when their playoff seed is locked.
  resting: { minRole: number; share: Record<PositionGroup, number> };
}
