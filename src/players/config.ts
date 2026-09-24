import type { PlayerConfig } from "../types/players";

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  halfLifeGames: 4,
  priorSeasonWeight: 0.5,
  maxHistoryGames: 12,
  recentTeamGames: 3,
  phantomGames: 1,
  // Volatility and yardage noise tuned on 2023 weeks 4/8/12/16 (injury outs on) for p10-p90
  // coverage, then checked on 2024 (pnpm player-backtest).
  shareVolatility: { targets: 0.05, carries: 0.5 },
  shrinkage: { catchRate: 40, yardsPerTarget: 60, yardsPerCarry: 100, redZone: 10 },
  airYardsPriorWeight: 0.5,
  yardsCv: { receiving: 1.1, rushing: 1.8 },
};
