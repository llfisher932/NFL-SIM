import { gameSituations, situationRecords } from "../eval/situations";
import type { SituationId, SituationRecord } from "../types/situations";
import type { TrackerReport } from "../types/tracker";
import { devigHomeWinProbability } from "../eval/market";
import { calibrationReport, compareToMarket } from "../eval/report";
import type { BacktestPrediction } from "../types/eval";
import type {
  DashboardAbsence,
  DashboardGame,
  DashboardIndex,
  DashboardIndexEntry,
  DashboardPlayer,
  DashboardRecord,
  DashboardTeam,
  DashboardWeek,
} from "../types/dashboard";
import type { TeamWeekFeatures } from "../types/features";
import type { TeamAbsence } from "../types/injuries";
import type { PlayerProjection } from "../types/players";
import type { Distribution, GameProjection, WeekGame } from "../types/sim";

export const MIN_OUT_ROLE = 0.2;
export const MAX_OUT_LISTED = 8;
export const MIN_PLAYER_TOUCHES = 0.5;

export interface GameInputs {
  game: WeekGame;
  projection: GameProjection;
  players: readonly PlayerProjection[];
  ratings: { home: TeamWeekFeatures; away: TeamWeekFeatures };
  baseline: { home: TeamWeekFeatures; away: TeamWeekFeatures };
  absences: { home: TeamAbsence | undefined; away: TeamAbsence | undefined };
  names: ReadonlyMap<string, string>;
  situations?: ReadonlyMap<SituationId, SituationRecord>;
}

const netRating = (f: TeamWeekFeatures) => f.offense.all - f.defense.all;

export function listAbsences(absence: TeamAbsence | undefined, names: ReadonlyMap<string, string>): DashboardAbsence[] {
  if (!absence) return [];
  return absence.missing
    .filter((m) => m.probability >= 0.5 && m.role >= MIN_OUT_ROLE)
    .sort((a, b) => b.role * b.probability - a.role * a.probability || a.playerId.localeCompare(b.playerId))
    .slice(0, MAX_OUT_LISTED)
    .map((m) => ({ ...m, name: names.get(m.playerId) ?? m.playerId }));
}

export function expectedQb(absence: TeamAbsence | undefined, names: ReadonlyMap<string, string>): DashboardTeam["qb"] {
  const qb = absence?.expectedQb;
  if (!qb) return undefined;
  const name = (id: string | null) => (id ? (names.get(id) ?? id) : "Replacement-level QB");
  const starterSits = qb.starterOut >= 0.5;
  return {
    name: starterSits ? name(qb.backup) : name(qb.starter),
    skill: qb.skill,
    starterOut: starterSits && qb.starter ? name(qb.starter) : null,
  };
}

function team(
  side: "home" | "away",
  inputs: GameInputs,
  winProb: number,
  score: Distribution,
): DashboardTeam {
  const rating = inputs.ratings[side];
  return {
    team: inputs.game[side],
    winProb,
    score,
    offense: rating.offense.all,
    defense: rating.defense.all,
    injuryShift: netRating(rating) - netRating(inputs.baseline[side]),
    qb: expectedQb(inputs.absences[side], inputs.names),
    out: listAbsences(inputs.absences[side], inputs.names),
  };
}

export function toDashboardPlayer(p: PlayerProjection): DashboardPlayer {
  return {
    playerId: p.playerId,
    name: p.name,
    position: p.position,
    team: p.team,
    starterQb: p.starterQb,
    targets: p.targets,
    carries: p.carries,
    receptions: p.receptions,
    recYards: p.recYards,
    rushYards: p.rushYards,
    passYards: p.passYards,
    passTds: p.passTds,
    interceptions: p.interceptions,
    touchdowns: p.touchdowns.mean,
    anytimeTdProb: p.anytimeTdProb,
  };
}

export function buildDashboardGame(inputs: GameInputs): DashboardGame {
  const { game, projection: p } = inputs;
  const final = game.homeScore !== null && game.awayScore !== null ? { home: game.homeScore, away: game.awayScore } : null;
  return {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    gameType: game.gameType,
    kickoff: game.kickoff,
    neutralSite: game.neutralSite,
    away: team("away", inputs, p.awayWinProb, p.awayScore),
    home: team("home", inputs, p.homeWinProb, p.homeScore),
    tieProb: p.tieProb,
    margin: p.margin,
    total: p.total,
    marginHistogram: p.marginHistogram,
    totalHistogram: p.totalHistogram,
    spots: inputs.situations
      ? gameSituations(
          {
            week: game.week,
            postseason: game.gameType !== "REG",
            home: game.home,
            away: game.away,
            modelMargin: p.margin.mean,
            modelTotal: p.total.mean,
            spreadLine: game.spreadLine,
            totalLine: game.totalLine,
          },
          final,
          inputs.situations,
        )
      : undefined,
    vegas: {
      spread: game.spreadLine,
      total: game.totalLine,
      homeWinProb:
        game.homeMoneyline === null || game.awayMoneyline === null
          ? null
          : devigHomeWinProbability(game.homeMoneyline, game.awayMoneyline),
    },
    final,
    players: inputs.players
      .filter((pl) => pl.starterQb || pl.targets + pl.carries >= MIN_PLAYER_TOUCHES)
      .sort(
        (a, b) =>
          a.team.localeCompare(b.team) ||
          Number(b.starterQb) - Number(a.starterQb) ||
          b.targets + b.carries - (a.targets + a.carries),
      )
      .map(toDashboardPlayer),
  };
}

// The latest week with a final score and the earliest week still to be played.
export function weeksToRefresh(games: readonly WeekGame[], season: number): number[] {
  const inSeason = games.filter((g) => g.season === season);
  const played = inSeason.filter((g) => g.homeScore !== null).map((g) => g.week);
  const upcoming = inSeason.filter((g) => g.homeScore === null).map((g) => g.week);
  const weeks = [
    ...(played.length > 0 ? [Math.max(...played)] : []),
    ...(upcoming.length > 0 ? [Math.min(...upcoming)] : []),
  ];
  return [...new Set(weeks)].sort((a, b) => a - b);
}

export const weekFileName = (season: number, week: number) =>
  `week-${season}-${String(week).padStart(2, "0")}.json`;

export function indexEntry(week: DashboardWeek): DashboardIndexEntry {
  return {
    season: week.season,
    week: week.week,
    games: week.games.length,
    generatedAt: week.generatedAt,
    file: weekFileName(week.season, week.week),
  };
}

// Adds or replaces entries by season and week, newest first.
export function mergeIndex(existing: DashboardIndex | null, entries: readonly DashboardIndexEntry[], record: string | null): DashboardIndex {
  const byKey = new Map((existing?.weeks ?? []).map((e) => [`${e.season}-${e.week}`, e]));
  for (const e of entries) byKey.set(`${e.season}-${e.week}`, e);
  return {
    weeks: [...byKey.values()].sort((a, b) => b.season - a.season || b.week - a.week),
    record: record ?? existing?.record ?? null,
  };
}

export function buildRecord(
  predictions: readonly BacktestPrediction[],
  generatedAt: string,
  tracker?: TrackerReport,
): DashboardRecord {
  return {
    generatedAt,
    games: predictions.length,
    seasons: compareToMarket(predictions),
    calibration: calibrationReport(predictions),
    tracker,
    situations: situationRecords(predictions, tracker),
  };
}
