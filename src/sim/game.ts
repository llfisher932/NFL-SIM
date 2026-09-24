import {
  DRIVE_OUTCOMES,
  EMPTY_STATS,
  type GameResult,
  type Matchup,
  type SimConfig,
  type TeamGameStats,
} from "../types/sim";
import { HALF_SECONDS } from "./config";
import type { DriveModel } from "./driveModel";
import { sampleIndex, type Rng } from "./rng";

type Side = "home" | "away";

const other = (side: Side): Side => (side === "home" ? "away" : "home");

const MAX_POSTSEASON_OVERTIMES = 10;

interface GameState {
  score: Record<Side, number>;
  stats: Record<Side, TeamGameStats>;
  drives: number;
}

function addStats(total: TeamGameStats, drive: TeamGameStats): TeamGameStats {
  return {
    passAttempts: total.passAttempts + drive.passAttempts,
    completions: total.completions + drive.completions,
    passYards: total.passYards + drive.passYards,
    passTds: total.passTds + drive.passTds,
    interceptions: total.interceptions + drive.interceptions,
    targets: total.targets + drive.targets,
    carries: total.carries + drive.carries,
    rushYards: total.rushYards + drive.rushYards,
    rushTds: total.rushTds + drive.rushTds,
  };
}

interface PeriodRules {
  seconds: number;
  firstOffense: Side;
  suddenDeath: boolean;
  // Game seconds that remain after this period ends (1800 for the first half, 0 otherwise).
  secondsAfter: number;
}

export function restEdgeEpa(matchup: Matchup, config: Pick<SimConfig, "restEpaPerDay" | "restCapDays">): number {
  const diff = Math.max(-config.restCapDays, Math.min(config.restCapDays, matchup.restDiff ?? 0));
  return config.restEpaPerDay * diff;
}

export function matchupEpa(matchup: Matchup, offense: Side, homeFieldEpa: number, restEpa = 0): number {
  const hfa = (matchup.neutralSite ? 0 : homeFieldEpa) + restEpa;
  return offense === "home"
    ? matchup.home.offense + matchup.away.defense + hfa
    : matchup.away.offense + matchup.home.defense - hfa;
}

function playPeriod(
  model: DriveModel,
  matchup: Matchup,
  config: SimConfig,
  state: GameState,
  rules: PeriodRules,
  rng: Rng,
): void {
  const possessed = { home: false, away: false };
  const paceScale = {
    home: matchup.leaguePlaysPerGame / matchup.home.playsPerGame,
    away: matchup.leaguePlaysPerGame / matchup.away.playsPerGame,
  };
  let clock = rules.seconds;
  let offense = rules.firstOffense;
  let start = model.sampleKickoffStart(rng);

  while (clock > 0) {
    state.drives++;
    possessed[offense] = true;
    const defense = other(offense);
    const gameState = { scoreDiff: state.score[offense] - state.score[defense], gameSecondsLeft: clock + rules.secondsAfter };
    const probabilities = model.outcomeProbabilities(start, matchupEpa(matchup, offense, config.homeFieldEpa, restEdgeEpa(matchup, config)), clock, gameState, matchup.leagueEpa ?? 0);
    const outcome = DRIVE_OUTCOMES[sampleIndex(probabilities, rng)]!;
    const drive = model.sampleDrive(outcome, start, clock, paceScale[offense], rng, gameState);
    if (outcome === "end_of_half") {
      if (drive) state.stats[offense] = addStats(state.stats[offense], drive.stats);
      return;
    }

    if (!drive) return;
    clock -= Math.max(1, drive.durationSeconds * paceScale[offense]);
    state.stats[offense] = addStats(state.stats[offense], drive.stats);

    let next: Side = defense;
    let defensiveScore = false;
    switch (outcome) {
      case "touchdown":
        state.score[offense] += model.sampleTouchdownPoints(rng);
        start = model.sampleKickoffStart(rng);
        break;
      case "field_goal":
        state.score[offense] += 3;
        start = model.sampleKickoffStart(rng);
        break;
      case "opp_touchdown":
        state.score[defense] += model.sampleTouchdownPoints(rng);
        next = offense;
        defensiveScore = true;
        start = model.sampleKickoffStart(rng);
        break;
      case "safety":
        state.score[defense] += 2;
        defensiveScore = true;
        start = model.sampleNextStart(outcome, drive.endYardline, rng);
        break;
      default:
        start = model.sampleNextStart(outcome, drive.endYardline, rng);
    }
    offense = next;

    const decided = state.score.home !== state.score.away;
    if (rules.suddenDeath && decided && (defensiveScore || (possessed.home && possessed.away))) return;
  }
}

export function simulateGame(model: DriveModel, matchup: Matchup, config: SimConfig, rng: Rng): GameResult {
  const state: GameState = { score: { home: 0, away: 0 }, stats: { home: EMPTY_STATS, away: EMPTY_STATS }, drives: 0 };
  const openingReceiver: Side = rng.next() < 0.5 ? "home" : "away";
  playPeriod(
    model,
    matchup,
    config,
    state,
    { seconds: HALF_SECONDS, firstOffense: openingReceiver, suddenDeath: false, secondsAfter: HALF_SECONDS },
    rng,
  );
  playPeriod(
    model,
    matchup,
    config,
    state,
    { seconds: HALF_SECONDS, firstOffense: other(openingReceiver), suddenDeath: false, secondsAfter: 0 },
    rng,
  );

  let overtime = false;
  const periods = matchup.postseason ? MAX_POSTSEASON_OVERTIMES : 1;
  for (let period = 0; period < periods && state.score.home === state.score.away; period++) {
    overtime = true;
    playPeriod(
      model,
      matchup,
      config,
      state,
      {
        seconds: matchup.postseason ? config.overtimeSeconds.postseason : config.overtimeSeconds.regular,
        firstOffense: rng.next() < 0.5 ? "home" : "away",
        suddenDeath: true,
        secondsAfter: 0,
      },
      rng,
    );
  }

  return {
    homeScore: state.score.home,
    awayScore: state.score.away,
    homeStats: state.stats.home,
    awayStats: state.stats.away,
    drives: state.drives,
    overtime,
  };
}
