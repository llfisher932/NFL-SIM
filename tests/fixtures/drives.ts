import type { RatingLookup } from "../../src/sim/driveModel";
import type { ConversionCount, DriveOutcome, DriveRecord, SimConfig } from "../../src/types/sim";
import { DEFAULT_SIM_CONFIG } from "../../src/sim/config";
import { seededRandom } from "./league";

export const RATINGS: Record<string, { offense: number; defense: number }> = {
  GOOD: { offense: 0.15, defense: -0.1 },
  AVG: { offense: 0, defense: 0 },
  BAD: { offense: -0.15, defense: 0.1 },
};

export const fixedRatings: RatingLookup = (_at, team) => RATINGS[team] ?? { offense: 0, defense: 0 };

export const testSimConfig: SimConfig = { ...DEFAULT_SIM_CONFIG, minTrainingDrives: 500, neighbors: 10 };

function drawOutcome(random: () => number, startYardline: number, matchup: number, seconds: number): DriveOutcome {
  if (seconds < 30 && random() < 0.8) return "end_of_half";
  const scoring = Math.min(0.9, Math.max(0.05, 0.35 + 3 * matchup + (70 - startYardline) / 150));
  const u = random();
  if (u < scoring * 0.6) return "touchdown";
  if (u < scoring) return random() < 0.85 ? "field_goal" : "missed_field_goal";
  const v = random();
  if (v < 0.6) return "punt";
  if (v < 0.85) return "turnover";
  if (v < 0.97) return "turnover_on_downs";
  if (v < 0.985) return "safety";
  return "opp_touchdown";
}

export function syntheticDrives(seasons: readonly number[], weeks: number, seed = 3): DriveRecord[] {
  const random = seededRandom(seed);
  const teams = Object.keys(RATINGS);
  const drives: DriveRecord[] = [];
  for (const season of seasons) {
    for (let week = 1; week <= weeks; week++) {
      for (let i = 0; i < 60; i++) {
        const offense = teams[Math.floor(random() * teams.length)]!;
        const defense = teams[Math.floor(random() * teams.length)]!;
        const startYardline = 20 + Math.floor(random() * 70);
        const startSeconds = Math.floor(random() * 1800);
        const outcome = drawOutcome(random, startYardline, RATINGS[offense]!.offense + RATINGS[defense]!.defense, startSeconds);
        const endYardline = outcome === "touchdown" ? 5 : Math.max(1, startYardline - Math.floor(random() * 40));
        drives.push({
          gameId: `${season}_${String(week).padStart(2, "0")}_${i}`,
          season,
          week,
          half: startSeconds % 2 === 0 ? 1 : 2,
          offense,
          defense,
          startYardline,
          startSeconds,
          endYardline,
          outcome,
          durationSeconds: Math.max(5, Math.min(startSeconds, 60 + Math.floor(random() * 240))),
          nextStartYardline: outcome === "end_of_half" ? null : 60 + Math.floor(random() * 20),
          scoreDiff: 0,
          gameSecondsLeft: startSeconds + (startSeconds % 2 === 0 ? 1800 : 0),
          stats: {
            passAttempts: 3,
            completions: 2,
            passYards: outcome === "touchdown" ? 45 : 15,
            passTds: outcome === "touchdown" ? 1 : 0,
            interceptions: outcome === "turnover" ? 1 : 0,
            targets: 3,
            carries: 2,
            rushYards: 8,
            rushTds: 0,
          },
        });
      }
    }
  }
  return drives;
}

export function conversions(season: number, week: number, made: number, failed: number, twoPoint: number): ConversionCount[] {
  return [
    { season, week, bonusPoints: 0, count: failed },
    { season, week, bonusPoints: 1, count: made },
    { season, week, bonusPoints: 2, count: twoPoint },
  ];
}
