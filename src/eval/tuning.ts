import { createFeatureModel } from "../features/teamFeatures";
import { createWeekFeatureCache, teamsBySeason } from "../sim/matchups";
import type { FeatureConfig, Side, TeamGame, UnitRatings } from "../types/features";
import type { WeekGame } from "../types/sim";

export interface MarginFit {
  home: number;
  slope: number;
}

export interface MarginSample {
  isHome: number;
  ratingGap: number;
  margin: number;
}

export interface FeatureScore {
  tuneRmse: number;
  validateRmse: number;
  tuneCorrelation: number;
  validateCorrelation: number;
  fit: MarginFit;
}

export interface FeatureGridPoint {
  halfLifeWeeks: number;
  priorScale: number;
  retentionScale: number;
}

const scaleRatings = (r: UnitRatings, k: number): UnitRatings => ({ all: r.all * k, pass: r.pass * k, rush: r.rush * k });

export function applyGridPoint(base: FeatureConfig, point: FeatureGridPoint): FeatureConfig {
  const retention = (side: Side) => Math.min(1, base.retention[side] * point.retentionScale);
  return {
    ...base,
    halfLifeWeeks: point.halfLifeWeeks,
    priorPlays: {
      offense: scaleRatings(base.priorPlays.offense, point.priorScale),
      defense: scaleRatings(base.priorPlays.defense, point.priorScale),
    },
    retention: { offense: retention("offense"), defense: retention("defense") },
  };
}

// Least squares for margin = home * isHome + slope * ratingGap (no free intercept: a neutral,
// evenly rated game should project to zero).
export function fitMargin(samples: readonly MarginSample[]): MarginFit {
  let hh = 0;
  let hg = 0;
  let gg = 0;
  let hm = 0;
  let gm = 0;
  for (const s of samples) {
    hh += s.isHome * s.isHome;
    hg += s.isHome * s.ratingGap;
    gg += s.ratingGap * s.ratingGap;
    hm += s.isHome * s.margin;
    gm += s.ratingGap * s.margin;
  }
  const det = hh * gg - hg * hg;
  if (det === 0) throw new Error("degenerate margin fit");
  return { home: (gg * hm - hg * gm) / det, slope: (hh * gm - hg * hm) / det };
}

export function rmse(samples: readonly MarginSample[], fit: MarginFit): number {
  const sse = samples.reduce((sum, s) => sum + (s.margin - fit.home * s.isHome - fit.slope * s.ratingGap) ** 2, 0);
  return Math.sqrt(sse / samples.length);
}

export function correlation(samples: readonly MarginSample[]): number {
  const n = samples.length;
  const mx = samples.reduce((s, x) => s + x.ratingGap, 0) / n;
  const my = samples.reduce((s, x) => s + x.margin, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const s of samples) {
    sxy += (s.ratingGap - mx) * (s.margin - my);
    sxx += (s.ratingGap - mx) ** 2;
    syy += (s.margin - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

export function marginSamples(
  teamGames: readonly TeamGame[],
  games: readonly WeekGame[],
  config: FeatureConfig,
): (MarginSample & { season: number })[] {
  const weekFeatures = createWeekFeatureCache(createFeatureModel(teamGames, config), teamsBySeason(teamGames, games));
  return games.flatMap((g) => {
    if (g.homeScore === null || g.awayScore === null) return [];
    const week = weekFeatures(g);
    const home = week.get(g.home);
    const away = week.get(g.away);
    if (!home || !away) return [];
    return [
      {
        season: g.season,
        isHome: g.neutralSite ? 0 : 1,
        ratingGap: home.offense.all - home.defense.all - (away.offense.all - away.defense.all),
        margin: g.homeScore - g.awayScore,
      },
    ];
  });
}

// Fits the margin line on the tuning seasons only, then scores it on both splits.
export function scoreFeatureConfig(
  teamGames: readonly TeamGame[],
  games: readonly WeekGame[],
  config: FeatureConfig,
  tuneSeasons: readonly number[],
  validateSeasons: readonly number[],
): FeatureScore {
  const samples = marginSamples(teamGames, games, config);
  const tune = samples.filter((s) => tuneSeasons.includes(s.season));
  const validate = samples.filter((s) => validateSeasons.includes(s.season));
  const fit = fitMargin(tune);
  return {
    tuneRmse: rmse(tune, fit),
    validateRmse: rmse(validate, fit),
    tuneCorrelation: correlation(tune),
    validateCorrelation: correlation(validate),
    fit,
  };
}
