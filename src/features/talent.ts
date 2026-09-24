import type { PlayerSnap, PositionGroup } from "../types/injuries";

export interface PlayerContract {
  playerId: string;
  yearSigned: number;
  apyCapPct: number;
}

export interface TalentConfig {
  exponent: number;
  min: number;
  max: number;
}

// Contract value as a share of the cap, relative to the position group's median, is a market read
// on talent. Chosen on 2023-2025 out-of-sample offensive EPA residuals (exponent 0.25 / 0.5 / 1).
export const DEFAULT_TALENT_CONFIG: TalentConfig = { exponent: 0.5, min: 0.25, max: 4 };

// Returns a snap-worth multiplier (1 = the group's median contract) for a player in a season, from
// the latest contract signed in or before that season. Players without a contract count as median.
export function createTalentModel(
  contracts: readonly PlayerContract[],
  snaps: readonly PlayerSnap[],
  config: TalentConfig,
): (playerId: string, season: number) => number {
  const byPlayer = new Map<string, PlayerContract[]>();
  for (const c of contracts) {
    const list = byPlayer.get(c.playerId) ?? [];
    list.push(c);
    byPlayer.set(c.playerId, list);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.yearSigned - b.yearSigned);
  const capShare = (playerId: string, season: number): number | null => {
    let share: number | null = null;
    for (const c of byPlayer.get(playerId) ?? []) {
      if (c.yearSigned > season) break;
      share = c.apyCapPct;
    }
    return share;
  };

  const groupOf = new Map<string, PositionGroup>();
  for (const s of snaps) groupOf.set(s.playerId, s.group);
  const medians = new Map<number, Map<PositionGroup, number>>();
  const medianFor = (group: PositionGroup, season: number): number | null => {
    let seasonMedians = medians.get(season);
    if (!seasonMedians) {
      const shares = new Map<PositionGroup, number[]>();
      for (const [playerId, g] of groupOf) {
        const share = capShare(playerId, season);
        if (share !== null) shares.set(g, [...(shares.get(g) ?? []), share]);
      }
      seasonMedians = new Map(
        [...shares].map(([g, values]) => [g, values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!]),
      );
      medians.set(season, seasonMedians);
    }
    return seasonMedians.get(group) ?? null;
  };

  return (playerId, season) => {
    const share = capShare(playerId, season);
    const group = groupOf.get(playerId);
    const median = group ? medianFor(group, season) : null;
    if (share === null || median === null || share <= 0) return 1;
    return Math.min(config.max, Math.max(config.min, Math.pow(share / median, config.exponent)));
  };
}
