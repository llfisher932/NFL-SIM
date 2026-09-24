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
  type QbProfile,
  type TeamAbsence,
} from "../types/injuries";
import type { PlayerOverride } from "../types/players";
import type { WeekGame } from "../types/sim";
import { END_OF_SEASON_WEEK } from "./config";
import { choleskySolve, zeros } from "./linalg";
import { DEFAULT_QB_SKILL_CONFIG, createQbSkillModel } from "./qbSkill";
import { lockedSeeds } from "./seeding";
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
  qbDeltaRidge: 20,
  qbSkill: DEFAULT_QB_SKILL_CONFIG,
  // Healthy regulars on locked teams played 41% of usual snaps in week 18 (2021-2025, 12 teams) vs 88% elsewhere.
  resting: { minRole: 0.5, share: { QB: 0.75, RB: 0.6, WR: 0.6, TE: 0.6, OL: 0.5, DL: 0.5, LB: 0.5, DB: 0.5 } },
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
  qbDelta: number;
}

export interface InjuryModelInputs {
  snaps: readonly PlayerSnap[];
  qbDropbacks: readonly QbDropbacks[];
  qbProfiles?: ReadonlyMap<string, QbProfile>;
  // Relative worth of a player's snaps in a season (1 = average for his position).
  talent?: (playerId: string, season: number) => number;
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
  qbDeltaRidge = ridge,
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
      obs.qbDelta,
    ];
    for (let i = 0; i < n; i++) {
      b[i]! += obs.weight * obs.residual * x[i]!;
      for (let j = 0; j < n; j++) a[i]![j]! += obs.weight * x[i]! * x[j]!;
    }
  }
  for (let i = 0; i < n; i++) a[i]![i]! += i < 2 ? 1e-6 : i === n - 1 ? qbDeltaRidge : ridge;
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
    qbDelta: mean((o) => o.qbDelta),
  };
  return {
    intercept: beta[0]!,
    home: beta[1]!,
    offense,
    defense,
    qbDelta: beta[n - 1]!,
    baseline,
    observations: observations.length,
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// The typical team's absences in one week. Effects apply to differences from it, so league-wide
// churn such as week-1 offseason departures moves no one; the median ignores a few resting teams.
export function weekReference(absences: readonly Pick<TeamAbsence, "offense" | "defense" | "qbDelta">[]): InjuryEffects["baseline"] {
  return {
    offense: Object.fromEntries(OFFENSE_GROUPS.map((g) => [g, median(absences.map((a) => a.offense[g]))])) as Record<OffenseGroup, number>,
    defense: Object.fromEntries(DEFENSE_GROUPS.map((g) => [g, median(absences.map((a) => a.defense[g]))])) as Record<DefenseGroup, number>,
    qbDelta: median(absences.map((a) => a.qbDelta)),
  };
}

export function applyInjuryEffects(features: TeamWeekFeatures, absence: TeamAbsence, effects: InjuryEffects): TeamWeekFeatures {
  const offenseShift =
    OFFENSE_GROUPS.reduce((s, g) => s + effects.offense[g] * (absence.offense[g] - effects.baseline.offense[g]), 0) +
    effects.qbDelta * (absence.qbDelta - effects.baseline.qbDelta);
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

// Skill players likely to miss the game, as overrides for player projections. Resting receivers and
// backs keep a reduced share; a resting QB is ruled out since one passer takes the snaps.
export function absenceOverrides(absence: TeamAbsence, threshold = 0.5): PlayerOverride[] {
  return absence.missing.flatMap((m): PlayerOverride[] => {
    if (!SKILL_GROUPS.has(m.group)) return [];
    const base = { season: absence.season, week: absence.week, playerId: m.playerId };
    if (m.reason === "resting" && m.group !== "QB") return [{ ...base, playing: 1 - m.probability, note: "resting starters" }];
    if (m.probability < threshold) return [];
    return [{ ...base, status: "out", note: m.reason === "resting" ? "resting starters" : "injury report / inactive" }];
  });
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

  const qbSkill = createQbSkillModel(inputs.qbDropbacks, inputs.qbProfiles ?? new Map(), config.qbSkill);
  const qbsByTeamGame = new Map<string, QbDropbacks[]>();
  for (const d of inputs.qbDropbacks) pushTo(qbsByTeamGame, key(d.season, d.week, d.team), d);

  // Dropback-weighted skill, relative to league, of the QBs who played one team game.
  function playedQbSkill(team: string, game: SeasonWeek, target: SeasonWeek): { skill: number; dropbacks: number } | null {
    const rows = qbsByTeamGame.get(key(game.season, game.week, team)) ?? [];
    const dropbacks = rows.reduce((s, d) => s + d.dropbacks, 0);
    if (dropbacks === 0) return null;
    const skill = rows.reduce((s, d) => s + d.dropbacks * qbSkill.skill(d.playerId, target), 0) / dropbacks;
    return { skill: skill - qbSkill.league(target), dropbacks };
  }

  // QB quality the rating already contains: this season's QBs by decayed dropbacks, blended with
  // last season's (as regressed into the prior) by the rating's current-season share.
  function bakedQbSkill(team: string, target: SeasonWeek, currentShare: number): number {
    const average = (games: readonly SeasonWeek[], weekOf: (g: SeasonWeek) => number) => {
      let weight = 0;
      let total = 0;
      for (const g of games) {
        const played = playedQbSkill(team, g, target);
        if (!played) continue;
        const w = decayWeight(weekOf(g), featureConfig.halfLifeWeeks) * played.dropbacks;
        weight += w;
        total += w * played.skill;
      }
      return weight > 0 ? total / weight : 0;
    };
    const games = teamGameOrder.get(team) ?? [];
    const current = games.filter((g) => g.season === target.season && g.week < target.week);
    const previous = games.filter((g) => g.season === target.season - 1);
    const currentSkill = average(current, (g) => target.week - g.week - 1);
    const priorSkill = featureConfig.retention.offense * average(previous, (g) => END_OF_SEASON_WEEK - g.week - 1);
    return currentShare * currentSkill + (1 - currentShare) * priorSkill;
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

  const finalWeeks = new Map<number, number>();
  for (const g of inputs.games) {
    if (g.gameType === "REG") finalWeeks.set(g.season, Math.max(finalWeeks.get(g.season) ?? 0, g.week));
  }
  const lockedBySeason = new Map<number, Map<string, number>>();
  function seedLocked(team: string, target: SeasonWeek): boolean {
    if (finalWeeks.get(target.season) !== target.week) return false;
    let locked = lockedBySeason.get(target.season);
    if (!locked) {
      locked = lockedSeeds(inputs.games, target.season);
      lockedBySeason.set(target.season, locked);
    }
    return locked.has(team);
  }

  const talentOf = inputs.talent ?? (() => 1);

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

    const absent = new Map<string, number>();
    const missing: TeamAbsence["missing"] = [];
    const resting = seedLocked(team, target);
    for (const r of roles) {
      const report = reports.get(`${cacheKey}:${r.playerId}`);
      const manual = inputs.availability.manualOuts?.has(`${target.season}:${target.week}:${r.playerId}`) ?? false;
      let probability = manual ? 1 : absenceProbability(report, rosterPublished, gameday, config.absence);
      let reason: AbsenceReason = manual ? "ruled out" : absenceReason(report, rosterPublished);
      const restShare = config.resting.share[r.group];
      if (resting && r.role >= config.resting.minRole && probability < restShare) {
        probability = restShare;
        reason = "resting";
      }
      absent.set(r.playerId, probability);
      if (probability > 0) {
        add(r.group, r.role * probability * talentOf(r.playerId, target.season));
        missing.push({ ...r, probability, reason });
      }
    }

    const absenceOf = (playerId: string) =>
      absent.get(playerId) ??
      (inputs.availability.manualOuts?.has(`${target.season}:${target.week}:${playerId}`)
        ? 1
        : absenceProbability(reports.get(`${cacheKey}:${playerId}`), rosterPublished, gameday, config.absence));
    const qbRoles = roles.filter((r) => r.group === "QB").sort((a, b) => b.role - a.role);
    const listed = game ? (game.home === team ? game.homeQb : game.awayQb) : null;
    const starter = listed ?? qbRoles[0]?.playerId ?? null;
    const backup = qbRoles.find((r) => r.playerId !== starter && absenceOf(r.playerId) < 0.5);
    const skillOf = (playerId: string | null | undefined) =>
      playerId ? qbSkill.skill(playerId, target) : qbSkill.replacement(target);
    const starterOut = starter ? absenceOf(starter) : 1;
    const expectedQb = (1 - starterOut) * skillOf(starter) + starterOut * skillOf(backup?.playerId) - qbSkill.league(target);
    let offenseShare = 0;

    const season = (teamGameOrder.get(team) ?? []).filter((g) => g.season === target.season && g.week < target.week);
    if (season.length > 0) {
      let weightSum = 0;
      let offensePlays = 0;
      let defensePlays = 0;
      const bakedOffense = zeroOffense();
      const bakedDefense = zeroDefense();
      for (const g of season) {
        const w = decayWeight(target.week - g.week - 1, featureConfig.halfLifeWeeks);
        const p = plays.get(`${g.gameId}:${team}`) ?? { offense: 64, defense: 64 };
        weightSum += w;
        offensePlays += w * p.offense;
        defensePlays += w * p.defense;
        const present = gamePlayers.get(`${g.gameId}:${team}`) ?? new Set<string>();
        for (const r of roles) {
          if (present.has(r.playerId)) continue;
          const worth = w * r.role * talentOf(r.playerId, target.season);
          if (r.group in bakedOffense) bakedOffense[r.group as OffenseGroup] += worth;
          else bakedDefense[r.group as DefenseGroup] += worth;
        }
      }
      offenseShare = offensePlays / (offensePlays + featureConfig.priorPlays.offense.all);
      const defenseShare = defensePlays / (defensePlays + featureConfig.priorPlays.defense.all);
      for (const g of OFFENSE_GROUPS) offense[g] -= (offenseShare * bakedOffense[g]) / weightSum;
      for (const g of DEFENSE_GROUPS) defense[g] -= (defenseShare * bakedDefense[g]) / weightSum;
    }
    const qbDelta = expectedQb - bakedQbSkill(team, target, offenseShare);

    const absence: TeamAbsence = {
      season: target.season,
      week: target.week,
      team,
      offense,
      defense,
      qbDelta,
      expectedQb: { starter, backup: backup?.playerId ?? null, starterOut, skill: expectedQb },
      missing,
    };
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
          offense: { ...absenceAt(g.team, g).offense },
          defense: { ...absenceAt(g.opponent, g).defense },
          qbDelta: absenceAt(g.team, g).qbDelta,
        },
      ];
    });
    const byWeek = new Map<string, InjuryObservation[]>();
    for (const o of observations) pushTo(byWeek, `${o.season}:${o.week}`, o);
    for (const week of byWeek.values()) {
      const reference = weekReference(week);
      for (const o of week) {
        for (const g of OFFENSE_GROUPS) o.offense[g] -= reference.offense[g];
        for (const g of DEFENSE_GROUPS) o.defense[g] -= reference.defense[g];
        o.qbDelta -= reference.qbDelta;
      }
    }
    return observations;
  }

  const effectsCache = new Map<string, InjuryEffects>();
  function effectsAt(target: SeasonWeek): InjuryEffects {
    const cacheKey = `${target.season}:${target.week}`;
    let effects = effectsCache.get(cacheKey);
    if (!effects) {
      effects = fitInjuryEffects(allObservations().filter((o) => isBefore(o, target)), config.ridge, config.qbDeltaRidge);
      effectsCache.set(cacheKey, effects);
    }
    return effects;
  }

  return {
    absenceAt,
    effectsAt,
    adjust(features, target) {
      const absences = new Map([...features.keys()].map((team) => [team, absenceAt(team, target)]));
      const effects = { ...effectsAt(target), baseline: weekReference([...absences.values()]) };
      return {
        effects,
        absences,
        features: new Map([...features].map(([team, f]) => [team, applyInjuryEffects(f, absences.get(team)!, effects)])),
      };
    },
  };
}
