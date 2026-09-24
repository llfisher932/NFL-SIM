import type { SimConfig } from "../types/sim";

export const DEFAULT_SIMS = 10_000;
export const DEFAULT_SEED = 20_260_924;
export const HALF_SECONDS = 1800;

export const DEFAULT_SIM_CONFIG: SimConfig = {
  // ~1.8 points of home margin. Swept 0-0.03 (pnpm tune --stage hfa): 0.015 and 0.02 tied on
  // 2022-2023; 0.015 was better on every metric for held-out 2024-2025.
  homeFieldEpa: 0.015,
  // 0.23 points per day of rest advantage (2022-2025 margin residuals, leave-one-season-out CV;
  // byes, short weeks and time-zone travel added nothing beyond it) at ~116 points per EPA/play.
  restEpaPerDay: 0.002,
  restCapDays: 7,
  priorTrainingSeasons: 3,
  minTrainingDrives: 2000,
  neighbors: 40,
  recentKickoffs: 1500,
  l2: 0.1,
  overtimeSeconds: { regular: 600, postseason: 900 },
};
