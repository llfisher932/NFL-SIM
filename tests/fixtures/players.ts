import type { PlayerGame, PlayerUsage, TeamUsage } from "../../src/types/players";

export function playerGame(overrides: Partial<PlayerGame> & Pick<PlayerGame, "playerId" | "week">): PlayerGame {
  return {
    name: overrides.playerId,
    position: "WR",
    team: "BUF",
    season: 2024,
    gameId: `2024_${String(overrides.week).padStart(2, "0")}_BUF`,
    attempts: 0,
    completions: 0,
    passYards: 0,
    passTds: 0,
    interceptions: 0,
    targets: 0,
    receptions: 0,
    recYards: 0,
    recTds: 0,
    airYards: 0,
    carries: 0,
    rushYards: 0,
    rushTds: 0,
    rzTargets: 0,
    rzCarries: 0,
    ...overrides,
  };
}

// A four-game BUF history: QB1 starts, WR1 dominates targets, RB1 leads carries,
// BACKUP appears once with a kneel-down, and a KC player plays elsewhere.
export function buffaloHistory(weeks = [1, 2, 3, 4]): PlayerGame[] {
  return weeks.flatMap((week) => [
    playerGame({ playerId: "00-0000001", name: "QB1", position: "QB", week, attempts: 32, completions: 21, passYards: 240, carries: 5, rushYards: 30 }),
    playerGame({ playerId: "00-0000002", name: "WR1", week, targets: 10, receptions: 7, recYards: 90, airYards: 120, rzTargets: 2 }),
    playerGame({ playerId: "00-0000003", name: "WR2", week, targets: 6, receptions: 4, recYards: 40, airYards: 30 }),
    playerGame({ playerId: "00-0000004", name: "RB1", position: "RB", week, targets: 3, receptions: 3, recYards: 15, airYards: -3, carries: 15, rushYards: 70, rzCarries: 3 }),
    playerGame({ playerId: "00-0000005", name: "TE1", position: "TE", week, targets: 5, receptions: 4, recYards: 35, airYards: 25, rzTargets: 1 }),
    playerGame({ playerId: "00-0000009", name: "KCWR", team: "KC", gameId: `2024_${String(week).padStart(2, "0")}_KC`, week, targets: 8, receptions: 6, recYards: 70, airYards: 60 }),
    ...(week === weeks[weeks.length - 1]
      ? [playerGame({ playerId: "00-0000006", name: "BACKUP", position: "QB", week, carries: 2, rushYards: -2 })]
      : []),
  ]);
}

export function usageFor(players: Partial<PlayerUsage>[], starterQb: string | null = null): TeamUsage {
  return {
    team: "BUF",
    starterQb,
    other: { catchRate: 0.65, yardsPerTarget: 7.5, yardsPerCarry: 4.3 },
    players: players.map((p, i) => ({
      playerId: `00-000000${i + 1}`,
      name: `P${i + 1}`,
      position: "WR",
      team: "BUF",
      gamesInWindow: 4,
      targetShare: 0,
      carryShare: 0,
      airYardsShare: 0,
      rzTargetShare: 0,
      rzCarryShare: 0,
      catchRate: 0.65,
      yardsPerTarget: 8,
      yardsPerCarry: 4.3,
      ...p,
    })),
  };
}
