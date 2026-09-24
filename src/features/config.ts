import type { FeatureConfig } from "../types/features";

export const END_OF_SEASON_WEEK = 23;

// Priors are noise variance / talent variance, measured on 2021-2025 regular seasons.
// Retention is the noise-corrected year-over-year correlation. Untuned until Phase 4.
export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  halfLifeWeeks: 8,
  priorPlays: {
    offense: { all: 400, pass: 350, rush: 450 },
    defense: { all: 900, pass: 600, rush: 850 },
  },
  retention: { offense: 0.5, defense: 0.3 },
  interceptPriorPlays: 1,
  playsPerGame: { priorWeight: 20, retention: 0.4, fallback: 64.6 },
  neutralPassRate: { priorWeight: 110, retention: 0.6, fallback: 0.525 },
};
