import type { SeasonWeek } from "../types/features";
import type { QbDropbacks, QbProfile, QbSkillConfig } from "../types/injuries";
import { isBefore } from "./window";

// Chosen by predicting each 2022-2025 QB game's EPA/dropback from earlier games only; CPOE added
// nothing once EPA/dropback was known. Offsets are early-career EPA/dropback vs league by draft slot.
export const DEFAULT_QB_SKILL_CONFIG: QbSkillConfig = {
  halfLifeGames: 12,
  priorDropbacks: 120,
  experiencedAfterSeasons: 3,
  offsets: { round1: -0.09, round2to3: -0.13, round4to7: -0.2, undrafted: -0.25, veteran: -0.08 },
  replacement: -0.2,
};

export interface QbSkillModel {
  // League EPA/dropback from the previous season and this season before the target.
  league(target: SeasonWeek): number;
  // Expected EPA/dropback for a QB, from his dropbacks before the target, regressed toward a prior.
  skill(playerId: string, target: SeasonWeek): number;
  // Expected EPA/dropback for an unidentified replacement.
  replacement(target: SeasonWeek): number;
}

export function priorOffset(profile: QbProfile | undefined, season: number, config: QbSkillConfig): number {
  const experience = profile?.rookieSeason == null ? Infinity : season - profile.rookieSeason;
  if (experience >= config.experiencedAfterSeasons) return config.offsets.veteran;
  const round = profile?.draftRound ?? null;
  if (round === null) return config.offsets.undrafted;
  if (round === 1) return config.offsets.round1;
  return round <= 3 ? config.offsets.round2to3 : config.offsets.round4to7;
}

export function createQbSkillModel(
  dropbacks: readonly QbDropbacks[],
  profiles: ReadonlyMap<string, QbProfile>,
  config: QbSkillConfig,
): QbSkillModel {
  const byQb = new Map<string, QbDropbacks[]>();
  for (const d of dropbacks) {
    const list = byQb.get(d.playerId) ?? [];
    list.push(d);
    byQb.set(d.playerId, list);
  }
  for (const list of byQb.values()) list.sort((a, b) => a.season - b.season || a.week - b.week);

  const leagueCache = new Map<string, number>();
  function league(target: SeasonWeek): number {
    const key = `${target.season}:${target.week}`;
    let level = leagueCache.get(key);
    if (level === undefined) {
      const rows = dropbacks.filter((d) => isBefore(d, target) && d.season >= target.season - 1);
      const total = rows.reduce((s, d) => s + d.dropbacks, 0);
      level = total > 0 ? rows.reduce((s, d) => s + d.epa, 0) / total : 0;
      leagueCache.set(key, level);
    }
    return level;
  }

  const decay = Math.pow(0.5, 1 / config.halfLifeGames);
  const skillCache = new Map<string, number>();
  function skill(playerId: string, target: SeasonWeek): number {
    const key = `${target.season}:${target.week}:${playerId}`;
    let value = skillCache.get(key);
    if (value === undefined) {
      let weight = 0;
      let epa = 0;
      for (const d of byQb.get(playerId) ?? []) {
        if (!isBefore(d, target)) break;
        weight = weight * decay + d.dropbacks;
        epa = epa * decay + d.epa;
      }
      const prior = league(target) + priorOffset(profiles.get(playerId), target.season, config);
      value = (epa + config.priorDropbacks * prior) / (weight + config.priorDropbacks);
      skillCache.set(key, value);
    }
    return value;
  }

  return { league, skill, replacement: (target) => league(target) + config.replacement };
}
