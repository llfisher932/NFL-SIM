import { regularSeasonWeeks } from "../features/league";
import type { BacktestPrediction } from "../types/eval";
import type { LineRecord, Market, SituationId, SituationInput, SituationPick, SituationRecord } from "../types/situations";
import type { PickResult, TrackedPick, TrackerReport } from "../types/tracker";

export const BREAK_EVEN = 0.524;
const MINUS = "−";

export interface Situation {
  id: SituationId;
  label: string;
  market: Market;
  description: string;
  applies(input: SituationInput): boolean;
}

// Candidate situations. A situation is only flagged once it beats break-even across the whole
// backtest and in most seasons. The last four were picked from 2022-2025 and failed on 2015-2021;
// they stay listed so their record remains visible. "disagree-5" came from a fixed list of 33 rules
// found on 2015-2021 and confirmed on 2022-2025, the only one to pass both.
export const SITUATIONS: readonly Situation[] = [
  {
    id: "disagree-5",
    label: "5+ point disagreement",
    market: "spread",
    description: "The model's margin is 5+ points away from the spread",
    applies: (g) => g.spreadLine !== null && Math.abs(g.modelMargin - g.spreadLine) >= 5,
  },
  {
    id: "playoffs",
    label: "Playoff game",
    market: "spread",
    description: "Postseason games: the model's side of the spread",
    applies: (g) => g.postseason,
  },
  {
    id: "disagree-3",
    label: "3+ point disagreement",
    market: "spread",
    description: "The model's margin is 3+ points away from the spread",
    applies: (g) => g.spreadLine !== null && Math.abs(g.modelMargin - g.spreadLine) >= 3,
  },
  {
    id: "big-spread",
    label: "Big spread",
    market: "spread",
    description: "Vegas has a 7+ point favorite: the model's side of the spread",
    applies: (g) => g.spreadLine !== null && Math.abs(g.spreadLine) >= 7,
  },
  {
    id: "early-total",
    label: "Early-season total",
    market: "total",
    description: "Weeks 1-4: the model's side of the over/under",
    applies: (g) => !g.postseason && g.week <= 4,
  },
];


function handicap(value: number): string {
  if (value === 0) return "pk";
  return `${value > 0 ? "+" : MINUS}${Math.abs(value)}`;
}

export function sidePick(market: Market, g: SituationInput): { side: string; line: number; gap: number; bet: string } | null {
  if (market === "spread") {
    if (g.spreadLine === null || g.modelMargin === g.spreadLine) return null;
    const home = g.modelMargin > g.spreadLine;
    const side = home ? g.home : g.away;
    return { side, line: g.spreadLine, gap: g.modelMargin - g.spreadLine, bet: `${side} ${handicap(home ? -g.spreadLine : g.spreadLine)}` };
  }
  if (g.totalLine === null || g.modelTotal === g.totalLine) return null;
  const over = g.modelTotal > g.totalLine;
  return { side: over ? "over" : "under", line: g.totalLine, gap: g.modelTotal - g.totalLine, bet: `${over ? "Over" : "Under"} ${g.totalLine}` };
}

export function gradePick(market: Market, gap: number, line: number, final: { home: number; away: number }): PickResult {
  const outcome = market === "spread" ? final.home - final.away : final.home + final.away;
  const margin = Math.sign(gap) * (outcome - line);
  return margin > 0 ? "win" : margin < 0 ? "loss" : "push";
}

const emptyRecord = (): LineRecord => ({ wins: 0, losses: 0, pushes: 0 });

function tally(record: LineRecord, result: PickResult): void {
  if (result === "win") record.wins++;
  else if (result === "loss") record.losses++;
  else record.pushes++;
}

export function winRate(record: LineRecord): number | null {
  const decided = record.wins + record.losses;
  return decided === 0 ? null : record.wins / decided;
}

function predictionInput(p: BacktestPrediction): SituationInput {
  return {
    week: p.week,
    postseason: p.week > regularSeasonWeeks(p.season),
    home: p.home,
    away: p.away,
    modelMargin: p.marginMean,
    modelTotal: p.totalMean,
    spreadLine: p.spreadLine,
    totalLine: p.totalLine,
  };
}

function trackedInput(p: TrackedPick): SituationInput {
  return {
    week: p.week,
    postseason: p.postseason,
    home: p.home,
    away: p.away,
    modelMargin: p.modelMargin,
    modelTotal: p.modelTotal,
    spreadLine: p.spread?.line ?? null,
    totalLine: p.total?.line ?? null,
  };
}

const mean = (values: readonly number[]) => (values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length);

export function situationRecord(situation: Situation, predictions: readonly BacktestPrediction[], tracked: readonly TrackedPick[] = []): SituationRecord {
  const overall = emptyRecord();
  const bySeason = new Map<number, LineRecord>();
  const matched = predictions.filter((p) => situation.applies(predictionInput(p)));
  let games = 0;
  for (const p of matched) {
    const pick = sidePick(situation.market, predictionInput(p));
    if (!pick) continue;
    games++;
    const result = gradePick(situation.market, pick.gap, pick.line, { home: p.homeScore, away: p.awayScore });
    tally(overall, result);
    const season = bySeason.get(p.season) ?? emptyRecord();
    tally(season, result);
    bySeason.set(p.season, season);
  }
  const seasons = [...bySeason].sort(([a], [b]) => a - b).map(([season, r]) => ({ season, ...r }));

  const decided = matched.filter((p) => p.homeScore !== p.awayScore && p.marketHomeWinProb !== null);
  const brier = (prob: number, p: BacktestPrediction) => (prob - (p.homeScore > p.awayScore ? 1 : 0)) ** 2;
  const marketBrier = mean(decided.map((p) => brier(p.marketHomeWinProb!, p)));
  const modelBrier = mean(decided.map((p) => brier(p.homeWinProb, p)));
  const withSpread = matched.filter((p) => p.spreadLine !== null);
  const withTotal = matched.filter((p) => p.totalLine !== null);
  const marginEdge =
    withSpread.length === 0
      ? null
      : mean(withSpread.map((p) => Math.abs(p.spreadLine! - (p.homeScore - p.awayScore)) - Math.abs(p.marginMean - (p.homeScore - p.awayScore))));
  const totalEdge =
    withTotal.length === 0
      ? null
      : mean(withTotal.map((p) => Math.abs(p.totalLine! - (p.homeScore + p.awayScore)) - Math.abs(p.totalMean - (p.homeScore + p.awayScore))));
  const brierEdge = marketBrier === null || modelBrier === null ? null : marketBrier - modelBrier;
  const beatsVegas =
    situation.market === "spread" ? (brierEdge ?? 0) > 0 && (marginEdge ?? 0) > 0 : (totalEdge ?? 0) > 0;

  const live = { picks: 0, ...emptyRecord() };
  for (const t of tracked) {
    if (!situation.applies(trackedInput(t))) continue;
    const pick = situation.market === "spread" ? t.spread : t.total;
    if (!pick) continue;
    live.picks++;
    if (pick.result) tally(live, pick.result);
  }

  const seasonsAboveBreakEven = seasons.filter((s) => (winRate(s) ?? 0) > BREAK_EVEN).length;
  return {
    id: situation.id,
    label: situation.label,
    market: situation.market,
    description: situation.description,
    games,
    ...overall,
    seasons,
    seasonsAboveBreakEven,
    qualifies: (winRate(overall) ?? 0) > BREAK_EVEN && 2 * seasonsAboveBreakEven > seasons.length,
    firstSeason: seasons[0]?.season ?? null,
    lastSeason: seasons[seasons.length - 1]?.season ?? null,
    brierEdge,
    marginEdge,
    totalEdge,
    beatsVegas,
    live,
  };
}

export function situationRecords(predictions: readonly BacktestPrediction[], tracker?: TrackerReport): SituationRecord[] {
  return SITUATIONS.map((s) => situationRecord(s, predictions, tracker?.picks ?? []));
}

// The model's picks in this game that fall into a historically strong situation.
export function gameSituations(
  input: SituationInput,
  final: { home: number; away: number } | null,
  records: ReadonlyMap<SituationId, SituationRecord>,
): SituationPick[] {
  return SITUATIONS.flatMap((situation): SituationPick[] => {
    const record = records.get(situation.id);
    if (!record?.qualifies || !situation.applies(input)) return [];
    const pick = sidePick(situation.market, input);
    if (!pick) return [];
    return [
      {
        situation: situation.id,
        label: situation.label,
        market: situation.market,
        ...pick,
        result: final ? gradePick(situation.market, pick.gap, pick.line, final) : null,
        record: {
          wins: record.wins,
          losses: record.losses,
          pushes: record.pushes,
          seasons: record.seasons.length,
          seasonsAboveBreakEven: record.seasonsAboveBreakEven,
          beatsVegas: record.beatsVegas,
          firstSeason: record.firstSeason,
        },
      },
    ];
  });
}
