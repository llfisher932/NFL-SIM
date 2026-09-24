import type { PickResult } from "./tracker";

export type SituationId = "playoffs" | "disagree-3" | "big-spread" | "early-total";
export type Market = "spread" | "total";

// What a situation rule needs to know about one game, before kickoff.
export interface SituationInput {
  week: number;
  postseason: boolean;
  home: string;
  away: string;
  modelMargin: number;
  modelTotal: number;
  spreadLine: number | null;
  totalLine: number | null;
}

export interface LineRecord {
  wins: number;
  losses: number;
  pushes: number;
}

export interface SituationRecord extends LineRecord {
  id: SituationId;
  label: string;
  market: Market;
  description: string;
  games: number;
  seasons: (LineRecord & { season: number })[];
  seasonsAboveBreakEven: number;
  // Market error minus model error on these games: positive means the model was more accurate.
  brierEdge: number | null;
  marginEdge: number | null;
  totalEdge: number | null;
  beatsVegas: boolean;
  live: LineRecord & { picks: number };
}

export interface SituationPick {
  situation: SituationId;
  label: string;
  market: Market;
  // Team abbreviation for spreads, "over" / "under" for totals.
  side: string;
  // Home margin for spreads, points for totals.
  line: number;
  // For spreads, the picked team's handicap as bet ("NYG -2.5"); for totals, "Over 41.5".
  bet: string;
  gap: number;
  result: PickResult | null;
  record: (LineRecord & { seasons: number; seasonsAboveBreakEven: number; beatsVegas: boolean }) | null;
}
