import type { SeasonWeek } from "./features";

export const SKILL_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type SkillPosition = (typeof SKILL_POSITIONS)[number];

export interface PlayerGame extends SeasonWeek {
  playerId: string;
  name: string;
  position: SkillPosition;
  team: string;
  gameId: string;
  attempts: number;
  completions: number;
  passYards: number;
  passTds: number;
  interceptions: number;
  targets: number;
  receptions: number;
  recYards: number;
  recTds: number;
  airYards: number;
  carries: number;
  rushYards: number;
  rushTds: number;
  rzTargets: number;
  rzCarries: number;
}

export interface PlayerUsage {
  playerId: string;
  name: string;
  position: SkillPosition;
  team: string;
  gamesInWindow: number;
  targetShare: number;
  carryShare: number;
  airYardsShare: number;
  rzTargetShare: number;
  rzCarryShare: number;
  catchRate: number;
  yardsPerTarget: number;
  yardsPerCarry: number;
}

export interface TeamUsage {
  team: string;
  players: PlayerUsage[];
  starterQb: string | null;
  other: { catchRate: number; yardsPerTarget: number; yardsPerCarry: number };
}

export interface PlayerOverride extends SeasonWeek {
  playerId: string;
  status?: "out" | undefined;
  targetShare?: number | undefined;
  carryShare?: number | undefined;
  // Fraction of his usual usage the player is expected to get, e.g. starters resting.
  playing?: number | undefined;
  team?: string | undefined;
  name?: string | undefined;
  position?: SkillPosition | undefined;
  note?: string | undefined;
}

export interface PlayerConfig {
  halfLifeGames: number;
  priorSeasonWeight: number;
  maxHistoryGames: number;
  recentTeamGames: number;
  phantomGames: number;
  shareVolatility: { targets: number; carries: number };
  shrinkage: { catchRate: number; yardsPerTarget: number; yardsPerCarry: number; redZone: number };
  airYardsPriorWeight: number;
  yardsCv: { receiving: number; rushing: number };
}

export interface StatSummary {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface PlayerProjection {
  gameId: string;
  playerId: string;
  name: string;
  position: SkillPosition;
  team: string;
  opponent: string;
  starterQb: boolean;
  targets: number;
  carries: number;
  receptions: StatSummary;
  recYards: StatSummary;
  rushYards: StatSummary;
  passYards: StatSummary;
  passTds: number;
  interceptions: number;
  touchdowns: StatSummary;
  anytimeTdProb: number;
}
