import type { SimConfig } from "../types/sim";

export const DEFAULT_SIMS = 10_000;
export const DEFAULT_SEED = 20_260_924;
export const HALF_SECONDS = 1800;

export const DEFAULT_SIM_CONFIG: SimConfig = {
  // ~1.7 points of home margin, matching the 2021-2025 average home spread (1.74). Tune in Phase 4.
  homeFieldEpa: 0.015,
  priorTrainingSeasons: 3,
  minTrainingDrives: 2000,
  neighbors: 40,
  recentKickoffs: 1500,
  l2: 0.1,
  overtimeSeconds: { regular: 600, postseason: 900 },
};
