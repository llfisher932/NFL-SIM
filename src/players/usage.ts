import { isBefore } from "../features/window";
import type { SeasonWeek } from "../types/features";
import type {
  PlayerConfig,
  PlayerGame,
  PlayerOverride,
  PlayerUsage,
  SkillPosition,
  TeamUsage,
} from "../types/players";

interface Efficiency {
  catchRate: number;
  yardsPerTarget: number;
  yardsPerCarry: number;
}

interface WindowGame {
  gameId: string;
  weight: number;
  totals: { targets: number; carries: number; airYards: number; rzTargets: number; rzCarries: number };
}

const ratio = (num: number, den: number, fallback = 0) => (den > 0 ? num / den : fallback);
const sum = <T>(items: readonly T[], f: (item: T) => number) => items.reduce((acc, item) => acc + f(item), 0);

export function leagueEfficiency(games: readonly PlayerGame[]): Efficiency {
  return {
    catchRate: ratio(sum(games, (g) => g.receptions), sum(games, (g) => g.targets), 0.65),
    yardsPerTarget: ratio(sum(games, (g) => g.recYards), sum(games, (g) => g.targets), 7.5),
    yardsPerCarry: ratio(sum(games, (g) => g.rushYards), sum(games, (g) => g.carries), 4.3),
  };
}

export function positionEfficiency(games: readonly PlayerGame[]): Map<SkillPosition, Efficiency> {
  const league = leagueEfficiency(games);
  const byPosition = new Map<SkillPosition, Efficiency>();
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const rows = games.filter((g) => g.position === position);
    byPosition.set(position, {
      catchRate: ratio(sum(rows, (g) => g.receptions), sum(rows, (g) => g.targets), league.catchRate),
      yardsPerTarget: ratio(sum(rows, (g) => g.recYards), sum(rows, (g) => g.targets), league.yardsPerTarget),
      yardsPerCarry: ratio(sum(rows, (g) => g.rushYards), sum(rows, (g) => g.carries), league.yardsPerCarry),
    });
  }
  return byPosition;
}

function teamWindow(history: readonly PlayerGame[], team: string, target: SeasonWeek, config: PlayerConfig): WindowGame[] {
  const teamRows = history.filter((g) => g.team === team && g.season >= target.season - 1);
  const games = [...new Map(teamRows.map((g) => [g.gameId, g])).values()]
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, config.maxHistoryGames);
  return games.map((game, k) => {
    const rows = teamRows.filter((g) => g.gameId === game.gameId);
    return {
      gameId: game.gameId,
      weight: 0.5 ** (k / config.halfLifeGames) * (game.season < target.season ? config.priorSeasonWeight : 1),
      totals: {
        targets: sum(rows, (g) => g.targets),
        carries: sum(rows, (g) => g.carries),
        airYards: sum(rows, (g) => g.airYards),
        rzTargets: sum(rows, (g) => g.rzTargets),
        rzCarries: sum(rows, (g) => g.rzCarries),
      },
    };
  });
}

function estimatePlayer(
  rows: readonly PlayerGame[],
  window: readonly WindowGame[],
  prior: Efficiency,
  config: PlayerConfig,
): Omit<PlayerUsage, "playerId" | "name" | "position" | "team"> {
  const played = window.flatMap((w) => {
    const row = rows.find((r) => r.gameId === w.gameId);
    return row ? [{ row, w }] : [];
  });
  // Averages over games the player appeared in, plus phantom zero-usage games, so a backup with
  // one appearance is shrunk hard while a regular who missed games for injury is barely affected.
  const totalWeight = sum(played, (p) => p.w.weight) + config.phantomGames;
  const weightedShare = (value: (r: PlayerGame) => number, total: (w: WindowGame) => number) =>
    ratio(sum(played, (p) => (total(p.w) > 0 ? p.w.weight * (value(p.row) / total(p.w)) : 0)), totalWeight);
  const weighted = (value: (r: PlayerGame) => number) => sum(played, (p) => p.w.weight * value(p.row));

  const targetShare = weightedShare((r) => r.targets, (w) => w.totals.targets);
  const carryShare = weightedShare((r) => r.carries, (w) => w.totals.carries);
  const airYardsShare = weightedShare((r) => Math.max(0, r.airYards), (w) => Math.max(0, w.totals.airYards));
  const k = config.shrinkage;
  const depth = targetShare > 0 ? Math.min(3, Math.max(0.3, airYardsShare / targetShare)) : 1;
  const yptPrior = prior.yardsPerTarget * (1 - config.airYardsPriorWeight + config.airYardsPriorWeight * depth);

  return {
    gamesInWindow: played.length,
    targetShare,
    carryShare,
    airYardsShare,
    rzTargetShare:
      (weighted((r) => r.rzTargets) + k.redZone * targetShare) /
      (sum(played, (p) => p.w.weight * p.w.totals.rzTargets) + k.redZone),
    rzCarryShare:
      (weighted((r) => r.rzCarries) + k.redZone * carryShare) /
      (sum(played, (p) => p.w.weight * p.w.totals.rzCarries) + k.redZone),
    catchRate: (weighted((r) => r.receptions) + k.catchRate * prior.catchRate) / (weighted((r) => r.targets) + k.catchRate),
    yardsPerTarget: (weighted((r) => r.recYards) + k.yardsPerTarget * yptPrior) / (weighted((r) => r.targets) + k.yardsPerTarget),
    yardsPerCarry:
      (weighted((r) => r.rushYards) + k.yardsPerCarry * prior.yardsPerCarry) / (weighted((r) => r.carries) + k.yardsPerCarry),
  };
}

// Weighted fraction of the team's volume that went to the current rotation in the recent games that
// define it. Shares are rescaled to this total so per-player shrinkage and older games from before
// the rotation formed do not leak volume to the "other" bucket.
function rotationCoverage(
  history: readonly PlayerGame[],
  window: readonly WindowGame[],
  rotation: readonly string[],
  value: (g: PlayerGame) => number,
  total: (w: WindowGame) => number,
): number {
  const members = new Set(rotation);
  let covered = 0;
  let weight = 0;
  for (const w of window) {
    if (total(w) <= 0) continue;
    const captured = sum(history.filter((g) => g.gameId === w.gameId && members.has(g.playerId)), value);
    covered += w.weight * (captured / total(w));
    weight += w.weight;
  }
  return weight > 0 ? covered / weight : 0;
}

function rescale(
  players: PlayerUsage[],
  key: "targetShare" | "carryShare",
  totalBefore: number,
  fixedIds: ReadonlySet<string>,
): PlayerUsage[] {
  const fixed = sum(players.filter((p) => fixedIds.has(p.playerId)), (p) => p[key]);
  const free = players.filter((p) => !fixedIds.has(p.playerId));
  const freeSum = sum(free, (p) => p[key]);
  const freeScale = freeSum > 0 ? Math.max(0, Math.min(1, totalBefore) - fixed) / freeSum : 0;
  const scaled = players.map((p) => (fixedIds.has(p.playerId) ? p : { ...p, [key]: p[key] * freeScale }));
  const total = sum(scaled, (p) => p[key]);
  return total > 1 ? scaled.map((p) => ({ ...p, [key]: p[key] / total })) : scaled;
}

function pickStarter(players: readonly PlayerUsage[], history: readonly PlayerGame[], window: readonly WindowGame[]): string | null {
  const qbs = players.filter((p) => p.position === "QB");
  for (const game of window) {
    const starter = history
      .filter((g) => g.gameId === game.gameId && qbs.some((q) => q.playerId === g.playerId) && g.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts || a.playerId.localeCompare(b.playerId))[0];
    if (starter) return starter.playerId;
  }
  return qbs[0]?.playerId ?? null;
}

export function estimateTeamUsage(
  playerGames: readonly PlayerGame[],
  team: string,
  target: SeasonWeek,
  overrides: readonly PlayerOverride[],
  config: PlayerConfig,
): TeamUsage {
  const history = playerGames.filter((g) => isBefore(g, target));
  const recent = history.filter((g) => g.season >= target.season - 1);
  const positions = positionEfficiency(recent);
  const league = leagueEfficiency(recent);
  const window = teamWindow(history, team, target, config);
  const recentGameIds = new Set(window.slice(0, config.recentTeamGames).map((w) => w.gameId));

  const latestTeam = new Map<string, string>();
  for (const g of history) latestTeam.set(g.playerId, g.team);
  const candidateIds = [
    ...new Set(
      history
        .filter((g) => g.team === team && recentGameIds.has(g.gameId) && latestTeam.get(g.playerId) === team)
        .map((g) => g.playerId),
    ),
  ].sort();

  let players: PlayerUsage[] = candidateIds.map((playerId) => {
    const rows = history.filter((g) => g.playerId === playerId && g.team === team);
    const last = rows[rows.length - 1]!;
    return {
      playerId,
      name: last.name,
      position: last.position,
      team,
      ...estimatePlayer(rows, window, positions.get(last.position)!, config),
    };
  });
  const recentWindow = window.slice(0, config.recentTeamGames);
  const targetsBefore = rotationCoverage(history, recentWindow, candidateIds, (g) => g.targets, (w) => w.totals.targets);
  const carriesBefore = rotationCoverage(history, recentWindow, candidateIds, (g) => g.carries, (w) => w.totals.carries);
  players = rescale(players, "targetShare", targetsBefore, new Set());
  players = rescale(players, "carryShare", carriesBefore, new Set());

  const weekOverrides = overrides.filter((o) => o.season === target.season && o.week === target.week);
  const out = new Set(weekOverrides.filter((o) => o.status === "out").map((o) => o.playerId));
  players = players.filter((p) => !out.has(p.playerId));

  const fixedTargets = new Set<string>();
  const fixedCarries = new Set<string>();
  for (const o of weekOverrides) {
    if (o.status === "out") continue;
    let player = players.find((p) => p.playerId === o.playerId);
    if (!player) {
      if (o.team !== team) continue;
      if (!o.name || !o.position) throw new Error(`override for new player ${o.playerId} needs name and position`);
      const prior = positions.get(o.position)!;
      player = {
        playerId: o.playerId,
        name: o.name,
        position: o.position,
        team,
        gamesInWindow: 0,
        targetShare: 0,
        carryShare: 0,
        airYardsShare: 0,
        rzTargetShare: 0,
        rzCarryShare: 0,
        ...prior,
      };
      players.push(player);
    }
    if (o.targetShare !== undefined) {
      player.targetShare = o.targetShare;
      player.rzTargetShare = o.targetShare;
      fixedTargets.add(o.playerId);
    }
    if (o.carryShare !== undefined) {
      player.carryShare = o.carryShare;
      player.rzCarryShare = o.carryShare;
      fixedCarries.add(o.playerId);
    }
  }

  players = rescale(players, "targetShare", targetsBefore, fixedTargets);
  players = rescale(players, "carryShare", carriesBefore, fixedCarries);
  const starterQb = pickStarter(players, history, window);
  return {
    team,
    players: players.filter((p) => p.targetShare > 0 || p.carryShare > 0 || p.playerId === starterQb),
    starterQb,
    other: league,
  };
}
