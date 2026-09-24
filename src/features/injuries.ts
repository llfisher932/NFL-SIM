import type { WeekFeatures } from "../sim/matchups";
import type { FeatureConfig, SeasonWeek, TeamGame, TeamWeekFeatures } from "../types/features";
import {
  DEFENSE_GROUPS,
  OFFENSE_GROUPS,
  type AbsenceProbabilities,
  type AbsenceReason,
  type Availability,
  type AvailabilityReport,
  type DefenseGroup,
  type InjuryConfig,
  type InjuryEffects,
  type OffenseGroup,
  type PlayerRole,
  type PlayerSnap,
  type QbDropbacks,
  type TeamAbsence,
} from "../types/injuries";
import type { PlayerOverride } from "../types/players";
import type { WeekGame } from "../types/sim";
import { choleskySolve, zeros } from "./linalg";
import { decayWeight, isBefore } from "./window";

// Absence rates measured on 2021-2025 for players who took >= 30% of snaps the previous game.
export const DEFAULT_INJURY_CONFIG: InjuryConfig = {
  lookbackGames: 8,
  roleGames: 3,
  minRole: 0.05,
  absence: {
    inactive: 1,
    offRoster: 0.97,
    out: 1,
    doubtful: 0.95,
    questionableGameday: 0.03,
    questionablePregame: 0.24,
  },
  ridge: 2000,
  qbValueRidge: 20,
  qbQuality: { priorDropbacks: 200, replacementBelowLeague: 0.12 },
};

const SKILL_GROUPS = new Set(["QB", "RB", "WR", "TE"]);
const key = (season: number, week: number, team: string) => `${season}:${week}:${team}`;
const zeroOffense = (): Record<OffenseGroup, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0, OL: 0 });
const zeroDefense = (): Record<DefenseGroup, number> => ({ DL: 0, LB: 0, DB: 0 });

export function absenceProbability(
  report: AvailabilityReport | undefined,
  rosterPublished: boolean,
  gameday: boolean,
  p: AbsenceProbabilities,
): number {
  let probability = 0;
  if (rosterPublished) {
    if (!report || report.rosterStatus === null) probability = p.offRoster;
    else if (report.rosterStatus !== "ACT") probability = p.inactive;
  }
  if (report?.injuryStatus === "Out") probability = Math.max(probability, p.out);
  if (report?.injuryStatus === "Doubtful") probability = Math.max(probability, p.doubtful);
  if (report?.injuryStatus === "Questionable") {
    probability = Math.max(probability, gameday ? p.questionableGameday : p.questionablePregame);
  }
  return probability;
}

// Why a player is expected to miss: Out, then definitive roster status, then softer designations.
export function absenceReason(report: AvailabilityReport | undefined, rosterPublished: boolean): AbsenceReason {
  if (report?.injuryStatus === "Out") return "out";
  if (report?.rosterStatus === "INA") return "inactive";
  if (report?.rosterStatus === "RES") return "reserve";
  if (report?.rosterStatus && report.rosterStatus !== "ACT") return "not active";
  if (report?.injuryStatus === "Doubtful") return "doubtful";
  if (report?.injuryStatus === "Questionable") return "questionable";
  return rosterPublished ? "not on roster" : "questionable";
}

interface TeamGameRef extends SeasonWeek {
  gameId: string;
}

export interface InjuryObservation extends SeasonWeek {
  residual: number;
  weight: number;
  home: number;
  offense: Record<OffenseGroup, number>;
  defense: Record<DefenseGroup, number>;
  qbValue: number;
}

export interface InjuryModelInputs {
  snaps: readonly PlayerSnap[];
  qbDropbacks: readonly QbDropbacks[];
  availability: Availability;
  teamGames: readonly TeamGame[];
  games: readonly WeekGame[];
  weekFeatures: (at: SeasonWeek) => WeekFeatures;
  featureConfig: FeatureConfig;
  config: InjuryConfig;
}

export interface AdjustedWeek {
  features: Map<string, TeamWeekFeatures>;
  absences: Map<string, TeamAbsence>;
  effects: InjuryEffects;
}

export interface InjuryModel {
  absenceAt(team: string, target: SeasonWeek): TeamAbsence;
  effectsAt(target: SeasonWeek): InjuryEffects;
  adjust(features: WeekFeatures, target: SeasonWeek): AdjustedWeek;
}

function pushTo<K, V>(map: Map<K, V[]>, k: K, v: V): void {
  const list = map.get(k);
  if (list) list.push(v);
  else map.set(k, [v]);
}

export function fitInjuryEffects(
  observations: readonly InjuryObservation[],
  ridge: number,
  qbValueRidge = ridge,
): InjuryEffects {
  const groups = [...OFFENSE_GROUPS.map((g) => ["offense", g] as const), ...DEFENSE_GROUPS.map((g) => ["defense", g] as const)];
  const n = 3 + groups.length;
  const a = zeros(n, n);
  const b = new Array<number>(n).fill(0);
  for (const obs of observations) {
    const x = [
      1,
      obs.home,
      ...groups.map(([side, g]) => (side === "offense" ? obs.offense[g as OffenseGroup] : obs.defense[g as DefenseGroup])),
      obs.qbValue,
    ];
    for (let i = 0; i < n; i++) {
      b[i]! += obs.weight * obs.residual * x[i]!;
      for (let j = 0; j < n; j++) a[i]![j]! += obs.weight * x[i]! * x[j]!;
    }
  }
  for (let i = 0; i < n; i++) a[i]![i]! += i < 2 ? 1e-6 : i === n - 1 ? qbValueRidge : ridge;
  const beta = choleskySolve(a, b);
  const offense = zeroOffense();
  const defense = zeroDefense();
  groups.forEach(([side, g], i) => {
    if (side === "offense") offense[g as OffenseGroup] = beta[2 + i]!;
    else defense[g as DefenseGroup] = beta[2 + i]!;
  });
  const totalWeight = observations.reduce((s, o) => s + o.weight, 0);
  const mean = (value: (o: InjuryObservation) => number) =>
    totalWeight > 0 ? observations.reduce((s, o) => s + o.weight * value(o), 0) / totalWeight : 0;
  const baseline = {
    offense: Object.fromEntries(OFFENSE_GROUPS.map((g) => [g, mean((o) => o.offense[g])])) as Record<OffenseGroup, number>,
    defense: Object.fromEntries(DEFENSE_GROUPS.map((g) => [g, mean((o) => o.defense[g])])) as Record<DefenseGroup, number>,
    qbValue: mean((o) => o.qbValue),
  };
  return {
    intercept: beta[0]!,
    home: beta[1]!,
    offense,
    defense,
    qbValue: beta[n - 1]!,
    baseline,
    observations: observations.length,
  };
}

export function applyInjuryEffects(features: TeamWeekFeatures, absence: TeamAbsence, effects: InjuryEffects): TeamWeekFeatures {
  const offenseShift =
    OFFENSE_GROUPS.reduce((s, g) => s + effects.offense[g] * (absence.offense[g] - effects.baseline.offense[g]), 0) +
    effects.qbValue * (absence.qbValue - effects.baseline.qbValue);
  const defenseShift = DEFENSE_GROUPS.reduce(
    (s, g) => s + effects.defense[g] * (absence.defense[g] - effects.baseline.defense[g]),
    0,
  );
  return {
    ...features,
    offense: { ...features.offense, all: features.offense.all + offenseShift },
    defense: { ...features.defense, all: features.defense.all + defenseShift },
  };
}

// Skill players likely to miss the game, as overrides for player projections.
export function absenceOverrides(absence: TeamAbsence, threshold = 0.5): PlayerOverride[] {
  return absence.missing
    .filter((m) => SKILL_GROUPS.has(m.group) && m.probability >= threshold)
    .map((m) => ({ season: absence.season, week: absence.week, playerId: m.playerId, status: "out" as const, note: "injury report / inactive" }));
}

export function createInjuryModel(inputs: InjuryModelInputs): InjuryModel {
  const { config, featureConfig } = inputs;
  const teamGameOrder = new Map<string, TeamGameRef[]>();
  const gamePlayers = new Map<string, Set<string>>();
  const appearances = new Map<string, PlayerSnap[]>();
  for (const s of inputs.snaps) {
    const gameKey = `${s.gameId}:${s.team}`;
    if (!gamePlayers.has(gameKey)) {
      gamePlayers.set(gameKey, new Set());
      pushTo(teamGameOrder, s.team, { season: s.season, week: s.week, gameId: s.gameId });
    }
    if (s.snapPct > 0) {
      gamePlayers.get(gameKey)!.add(s.playerId);
      pushTo(appearances, s.playerId, s);
    }
  }
  for (const list of teamGameOrder.values()) list.sort((x, y) => x.season - y.season || x.week - y.week);
  for (const list of appearances.values()) list.sort((x, y) => x.season - y.season || x.week - y.week);

  const reports = new Map(inputs.availability.reports.map((r) => [`${key(r.season, r.week, r.team)}:${r.playerId}`, r]));
  const plays = new Map<string, { offense: number; defense: number }>();
  const byGame = new Map<string, TeamGame[]>();
  for (const g of inputs.teamGames) pushTo(byGame, g.gameId, g);
  for (const [gameId, sides] of byGame) {
    for (const side of sides) {
      const opponent = sides.find((o) => o.team !== side.team);
      plays.set(`${gameId}:${side.team}`, { offense: side.plays, defense: opponent?.plays ?? side.plays });
    }
  }
  const gameInfo = new Map<string, WeekGame>();
  for (const g of inputs.games) {
    gameInfo.set(key(g.season, g.week, g.home), g);
    gameInfo.set(key(g.season, g.week, g.away), g);
  }

  const dropbacksByQb = new Map<string, QbDropbacks[]>();
  for (const d of inputs.qbDropbacks) pushTo(dropbacksByQb, d.playerId, d);
  const replacementCache = new Map<string, number>();
  function replacementLevel(target: SeasonWeek): number {
    const cacheKey = `${target.season}:${target.week}`;
    let level = replacementCache.get(cacheKey);
    if (level === undefined) {
      const rows = inputs.qbDropbacks.filter((d) => isBefore(d, target) && d.season >= target.season - 1);
      const dropbacks = rows.reduce((s, d) => s + d.dropbacks, 0);
      const league = dropbacks > 0 ? rows.reduce((s, d) => s + d.epa, 0) / dropbacks : 0;
      level = league - config.qbQuality.replacementBelowLeague;
      replacementCache.set(cacheKey, level);
    }
    return level;
  }

  // Regressed EPA per dropback above replacement, from dropbacks before the target only.
  function qbValueAboveReplacement(playerId: string, target: SeasonWeek): number {
    const rows = (dropbacksByQb.get(playerId) ?? []).filter((d) => isBefore(d, target) && d.season >= target.season - 1);
    const replacement = replacementLevel(target);
    const dropbacks = rows.reduce((s, d) => s + d.dropbacks, 0);
    const epa = rows.reduce((s, d) => s + d.epa, 0);
    const prior = config.qbQuality.priorDropbacks;
    return Math.max(0, (epa + prior * replacement) / (dropbacks + prior) - replacement);
  }

  function rolesAt(team: string, target: SeasonWeek): PlayerRole[] {
    const recent = (teamGameOrder.get(team) ?? [])
      .filter((g) => isBefore(g, target) && g.season >= target.season - 1)
      .slice(-config.lookbackGames);
    const candidates = new Set(recent.flatMap((g) => [...(gamePlayers.get(`${g.gameId}:${team}`) ?? [])]));
    return [...candidates].sort().flatMap((playerId) => {
      const before = (appearances.get(playerId) ?? []).filter((a) => isBefore(a, target));
      const latest = before[before.length - 1];
      if (!latest || latest.team !== team) return [];
      const own = before.filter((a) => a.team === team).slice(-config.roleGames);
      const role = own.reduce((s, a) => s + a.snapPct, 0) / own.length;
      return role >= config.minRole ? [{ playerId, group: latest.group, role }] : [];
    });
  }

  const absenceCache = new Map<string, TeamAbsence>();
  function absenceAt(team: string, target: SeasonWeek): TeamAbsence {
    const cacheKey = key(target.season, target.week, team);
    const cached = absenceCache.get(cacheKey);
    if (cached) return cached;

    const roles = rolesAt(team, target);
    const rosterPublished = inputs.availability.rosterTeamWeeks.has(cacheKey);
    const game = gameInfo.get(cacheKey);
    const gameday = game ? game.homeScore !== null : false;
    const offense = zeroOffense();
    const defense = zeroDefense();
    const add = (group: string, value: number) => {
      if (group in offense) offense[group as OffenseGroup] += value;
      else defense[group as DefenseGroup] += value;
    };

    const qbValues = new Map(
      roles.filter((r) => r.group === "QB").map((r) => [r.playerId, qbValueAboveReplacement(r.playerId, target)]),
    );
    let qbValue = 0;
    const missing: TeamAbsence["missing"] = [];
    for (const r of roles) {
      const report = reports.get(`${cacheKey}:${r.playerId}`);
      const probability = absenceProbability(report, rosterPublished, gameday, config.absence);
      if (probability > 0) {
        add(r.group, r.role * probability);
        qbValue += r.role * probability * (qbValues.get(r.playerId) ?? 0);
        missing.push({ ...r, probability, reason: absenceReason(report, rosterPublished) });
      }
    }

    const season = (teamGameOrder.get(team) ?? []).filter((g) => g.season === target.season && g.week < target.week);
    if (season.length > 0) {
      let weightSum = 0;
      let offensePlays = 0;
      let defensePlays = 0;
      const bakedOffense = zeroOffense();
      const bakedDefense = zeroDefense();
      let bakedQbValue = 0;
      for (const g of season) {
        const w = decayWeight(target.week - g.week - 1, featureConfig.halfLifeWeeks);
        const p = plays.get(`${g.gameId}:${team}`) ?? { offense: 64, defense: 64 };
        weightSum += w;
        offensePlays += w * p.offense;
        defensePlays += w * p.defense;
        const present = gamePlayers.get(`${g.gameId}:${team}`) ?? new Set<string>();
        for (const r of roles) {
          if (present.has(r.playerId)) continue;
          bakedQbValue += w * r.role * (qbValues.get(r.playerId) ?? 0);
          if (r.group in bakedOffense) bakedOffense[r.group as OffenseGroup] += w * r.role;
          else bakedDefense[r.group as DefenseGroup] += w * r.role;
        }
      }
      const offenseShare = offensePlays / (offensePlays + featureConfig.priorPlays.offense.all);
      const defenseShare = defensePlays / (defensePlays + featureConfig.priorPlays.defense.all);
      for (const g of OFFENSE_GROUPS) offense[g] -= (offenseShare * bakedOffense[g]) / weightSum;
      for (const g of DEFENSE_GROUPS) defense[g] -= (defenseShare * bakedDefense[g]) / weightSum;
      qbValue -= (offenseShare * bakedQbValue) / weightSum;
    }

    const absence = { season: target.season, week: target.week, team, offense, defense, qbValue, missing };
    absenceCache.set(cacheKey, absence);
    return absence;
  }

  let observations: InjuryObservation[] | null = null;
  const snapSeasons = new Set(inputs.snaps.map((s) => s.season));
  function allObservations(): InjuryObservation[] {
    if (observations) return observations;
    observations = inputs.teamGames.flatMap((g) => {
      const plays = g.passPlays + g.rushPlays;
      if (plays === 0 || !snapSeasons.has(g.season)) return [];
      const week = inputs.weekFeatures(g);
      const offense = week.get(g.team);
      const defense = week.get(g.opponent);
      if (!offense || !defense) return [];
      const info = gameInfo.get(key(g.season, g.week, g.team));
      const home = !info || info.neutralSite ? 0 : info.home === g.team ? 1 : -1;
      return [
        {
          season: g.season,
          week: g.week,
          residual: (g.passEpa + g.rushEpa) / plays - (offense.league.all + offense.offense.all + defense.defense.all),
          weight: plays,
          home,
          offense: absenceAt(g.team, g).offense,
          defense: absenceAt(g.opponent, g).defense,
          qbValue: absenceAt(g.team, g).qbValue,
        },
      ];
    });
    return observations;
  }

  const effectsCache = new Map<string, InjuryEffects>();
  function effectsAt(target: SeasonWeek): InjuryEffects {
    const cacheKey = `${target.season}:${target.week}`;
    let effects = effectsCache.get(cacheKey);
    if (!effects) {
      effects = fitInjuryEffects(allObservations().filter((o) => isBefore(o, target)), config.ridge, config.qbValueRidge);
      effectsCache.set(cacheKey, effects);
    }
    return effects;
  }

  return {
    absenceAt,
    effectsAt,
    adjust(features, target) {
      const effects = effectsAt(target);
      const absences = new Map([...features.keys()].map((team) => [team, absenceAt(team, target)]));
      return {
        effects,
        absences,
        features: new Map([...features].map(([team, f]) => [team, applyInjuryEffects(f, absences.get(team)!, effects)])),
      };
    },
  };
}
