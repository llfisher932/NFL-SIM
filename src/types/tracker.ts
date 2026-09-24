import type { SeasonWeek } from "./features";

// The model's view of one game at one refresh, taken before kickoff.
export interface PickSnapshot extends SeasonWeek {
  gameId: string;
  capturedAt: string;
  home: string;
  away: string;
  modelHomeWinProb: number;
  modelMargin: number;
  modelTotal: number;
  spreadLine: number | null;
  totalLine: number | null;
}

export type PickResult = "win" | "loss" | "push";

export interface LinePick {
  side: string;
  // Model minus the line at the time of the pick, in points.
  gap: number;
  line: number;
  closingLine: number | null;
  // Points the line moved toward the model's side by kickoff.
  clv: number | null;
  result: PickResult | null;
}

export interface TrackedPick extends SeasonWeek {
  gameId: string;
  home: string;
  away: string;
  kickoff: string | null;
  capturedAt: string;
  started: boolean;
  modelMargin: number;
  modelTotal: number;
  spread: LinePick | null;
  total: LinePick | null;
  final: { home: number; away: number } | null;
}

export interface TrackerLine {
  minGap: number;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  averageClv: number | null;
}

export interface TrackerReport {
  season: number;
  spread: TrackerLine[];
  total: TrackerLine[];
  picks: TrackedPick[];
}
