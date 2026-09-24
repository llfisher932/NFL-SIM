import { isBefore } from "../features/window";
import type { SeasonWeek } from "../types/features";
import {
  DRIVE_OUTCOMES,
  type ConversionCount,
  type DriveOutcome,
  type DriveRecord,
  type SimConfig,
} from "../types/sim";
import { fitMultinomial, softmaxProbabilities, type MultinomialModel } from "./multinomial";
import { createNearestSampler, type NearestSampler } from "./nearestSampler";
import { sampleIndex, type Rng } from "./rng";

export type RatingLookup = (at: SeasonWeek, team: string) => { offense: number; defense: number };

export interface DriveTemplate {
  endYardline: number;
  durationSeconds: number;
}

export interface DriveModel {
  trainingDrives: number;
  outcomeModel: MultinomialModel;
  outcomeProbabilities(startYardline: number, matchupEpa: number, secondsLeft: number): number[];
  sampleDrive(
    outcome: DriveOutcome,
    startYardline: number,
    secondsLeft: number,
    paceScale: number,
    rng: Rng,
  ): DriveTemplate | null;
  sampleNextStart(outcome: DriveOutcome, endYardline: number, rng: Rng): number;
  sampleKickoffStart(rng: Rng): number;
  sampleTouchdownPoints(rng: Rng): number;
}

const SAFETY_FREE_KICK_START = 58;
const TEMPLATE_ATTEMPTS = 25;
const TIME_BAND_UPPER_BOUNDS = [30, 60, 120, 180, 300, 600, Number.POSITIVE_INFINITY];

export function timeBand(secondsLeft: number): number {
  return TIME_BAND_UPPER_BOUNDS.findIndex((upper) => secondsLeft < upper);
}
const MATCHUP_SCALE = 10;

export function driveFeatures(startYardline: number, matchupEpa: number, secondsLeft: number): number[] {
  const fieldPosition = startYardline / 100;
  return [
    1,
    fieldPosition,
    fieldPosition * fieldPosition,
    MATCHUP_SCALE * matchupEpa,
    Math.max(0, 120 - secondsLeft) / 120,
    Math.max(0, 300 - secondsLeft) / 300,
    Math.max(0, 600 - secondsLeft) / 600,
    secondsLeft <= 30 ? 1 : 0,
  ];
}

export function trainingWindow<T extends SeasonWeek>(
  items: readonly T[],
  target: SeasonWeek,
  priorSeasons: number,
): T[] {
  return items.filter((item) => isBefore(item, target) && item.season >= target.season - priorSeasons);
}

const clampYardline = (y: number) => Math.min(99, Math.max(1, Math.round(y)));

export function fitDriveModel(
  drives: readonly DriveRecord[],
  conversions: readonly ConversionCount[],
  target: SeasonWeek,
  ratings: RatingLookup,
  config: SimConfig,
): DriveModel {
  const training = trainingWindow(drives, target, config.priorTrainingSeasons);
  if (training.length < config.minTrainingDrives) {
    throw new Error(
      `only ${training.length} training drives before ${target.season} week ${target.week} ` +
        `(need ${config.minTrainingDrives})`,
    );
  }

  const matchupOf = (d: DriveRecord) => {
    const at = { season: d.season, week: d.week };
    return ratings(at, d.offense).offense + ratings(at, d.defense).defense;
  };
  const outcomeModel = fitMultinomial(
    training.map((d) => driveFeatures(d.startYardline, matchupOf(d), d.startSeconds)),
    training.map((d) => DRIVE_OUTCOMES.indexOf(d.outcome)),
    DRIVE_OUTCOMES.length,
    { l2: config.l2 },
  );

  const byOutcome = <T>(build: (outcome: DriveOutcome) => T) =>
    Object.fromEntries(DRIVE_OUTCOMES.map((o) => [o, build(o)])) as Record<DriveOutcome, T>;

  const templateSampler = (source: readonly DriveRecord[]) =>
    createNearestSampler(
      source.map((d) => ({
        key: d.startYardline,
        value: { endYardline: d.endYardline, durationSeconds: d.durationSeconds },
      })),
      config.neighbors,
    );
  const templates = byOutcome((outcome) => {
    const ofOutcome = training.filter((d) => d.outcome === outcome);
    const all = templateSampler(ofOutcome);
    const banded = TIME_BAND_UPPER_BOUNDS.map((_, band) =>
      templateSampler(ofOutcome.filter((d) => timeBand(d.startSeconds) === band)),
    );
    return (secondsLeft: number) => {
      const sampler = banded[timeBand(secondsLeft)]!;
      return sampler.size >= config.neighbors ? sampler : all;
    };
  });
  const transitions: Record<DriveOutcome, NearestSampler<number>> = byOutcome((outcome) =>
    createNearestSampler(
      training.flatMap((d) =>
        d.outcome === outcome && d.nextStartYardline !== null
          ? [{ key: d.endYardline, value: d.nextStartYardline }]
          : [],
      ),
      config.neighbors,
    ),
  );

  const kickoffStarts = [...training]
    .sort((a, b) => a.season - b.season || a.week - b.week)
    .filter((d) => (d.outcome === "touchdown" || d.outcome === "field_goal") && d.nextStartYardline !== null)
    .map((d) => d.nextStartYardline!)
    .slice(-config.recentKickoffs);
  if (kickoffStarts.length === 0) throw new Error("no kickoffs in training window");

  const conversionWindow = trainingWindow(conversions, target, config.priorTrainingSeasons);
  const bonusCounts = [0, 1, 2].map((b) =>
    conversionWindow.filter((c) => c.bonusPoints === b).reduce((sum, c) => sum + c.count, 0),
  );
  const bonusTotal = bonusCounts.reduce((a, b) => a + b, 0);
  const bonusProbabilities = bonusTotal > 0 ? bonusCounts.map((c) => c / bonusTotal) : [0, 1, 0];

  const medianDuration = (() => {
    const sorted = training.map((d) => d.durationSeconds).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  })();

  return {
    trainingDrives: training.length,
    outcomeModel,
    outcomeProbabilities: (startYardline, matchupEpa, secondsLeft) =>
      softmaxProbabilities(outcomeModel, driveFeatures(startYardline, matchupEpa, secondsLeft)),
    sampleDrive: (outcome, startYardline, secondsLeft, paceScale, rng) => {
      const sampler = templates[outcome](secondsLeft);
      const maxSeconds = secondsLeft / paceScale;
      if (sampler.size === 0) {
        const fallback = { endYardline: outcome === "safety" ? 99 : startYardline, durationSeconds: medianDuration };
        return fallback.durationSeconds <= maxSeconds ? fallback : null;
      }
      for (let attempt = 0; attempt < TEMPLATE_ATTEMPTS; attempt++) {
        const template = sampler.sample(startYardline, rng)!;
        if (template.durationSeconds <= maxSeconds) return template;
      }
      return null;
    },
    sampleNextStart: (outcome, endYardline, rng) => {
      const sampled = transitions[outcome].sample(endYardline, rng);
      if (sampled !== null) return clampYardline(sampled);
      return outcome === "safety" ? SAFETY_FREE_KICK_START : clampYardline(100 - endYardline);
    },
    sampleKickoffStart: (rng) => kickoffStarts[rng.int(kickoffStarts.length)]!,
    sampleTouchdownPoints: (rng) => 6 + sampleIndex(bonusProbabilities, rng),
  };
}
