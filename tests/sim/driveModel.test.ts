import { describe, expect, it } from "vitest";
import { driveFeatures, fitDriveModel, timeBand, trainingWindow } from "../../src/sim/driveModel";
import { createRng } from "../../src/sim/rng";
import { DRIVE_OUTCOMES, type DriveRecord } from "../../src/types/sim";
import { conversions, fixedRatings, syntheticDrives, testSimConfig } from "../fixtures/drives";

const drives = syntheticDrives([2022, 2023, 2024], 10);
const target = { season: 2024, week: 6 };
const td = DRIVE_OUTCOMES.indexOf("touchdown");
const punt = DRIVE_OUTCOMES.indexOf("punt");
const endOfHalf = DRIVE_OUTCOMES.indexOf("end_of_half");

// Independent of src/features/window so a bug there cannot hide here.
const strictlyBefore = (d: { season: number; week: number }) =>
  d.season < target.season || (d.season === target.season && d.week < target.week);

function fingerprint(model: ReturnType<typeof fitDriveModel>): unknown {
  const rng = createRng(77);
  return {
    trainingDrives: model.trainingDrives,
    coefficients: model.outcomeModel.coefficients,
    draws: Array.from({ length: 200 }, (_, i) => [
      model.sampleDrive(DRIVE_OUTCOMES[i % DRIVE_OUTCOMES.length]!, 20 + (i % 70), 1800 - i * 7, 1, rng),
      model.sampleNextStart("punt", 30 + (i % 60), rng),
      model.sampleKickoffStart(rng),
      model.sampleTouchdownPoints(rng),
    ]),
  };
}

describe("sim/driveModel", () => {
  describe("driveFeatures", () => {
    it("scales field position to [0, 1] with a squared term", () => {
      expect(driveFeatures(75, 0, 1800).slice(0, 3)).toEqual([1, 0.75, 0.5625]);
    });

    it("leaves every clock feature at zero with more than ten minutes left", () => {
      expect(driveFeatures(75, 0, 900).slice(4)).toEqual([0, 0, 0, 0]);
    });

    it("turns on every clock feature in the final seconds", () => {
      const clock = driveFeatures(75, 0, 10).slice(4);
      expect(clock.every((v) => v > 0)).toBe(true);
    });
  });

  describe("timeBand", () => {
    it("separates the final 30 seconds", () => {
      expect(timeBand(29)).toBe(0);
      expect(timeBand(30)).toBe(1);
    });

    it("groups everything beyond ten minutes together", () => {
      expect(timeBand(601)).toBe(timeBand(1800));
    });
  });

  describe("trainingWindow", () => {
    const window = trainingWindow(drives, target, 1);

    it("excludes the target week and everything after it", () => {
      expect(window.every(strictlyBefore)).toBe(true);
    });

    it("includes the weeks just before the target", () => {
      expect(window.some((d) => d.season === 2024 && d.week === 5)).toBe(true);
    });

    it("drops seasons older than the prior-season limit", () => {
      expect(window.some((d) => d.season === 2022)).toBe(false);
    });
  });

  describe("fitDriveModel", () => {
    const conv = conversions(2023, 1, 90, 5, 5);
    const model = fitDriveModel(drives, conv, target, fixedRatings, testSimConfig);

    describe("outcome probabilities", () => {
      it("sum to one", () => {
        const p = model.outcomeProbabilities(75, 0, 1200);
        expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      });

      it("give a stronger matchup more touchdowns and fewer punts", () => {
        const weak = model.outcomeProbabilities(75, -0.2, 1200);
        const strong = model.outcomeProbabilities(75, 0.2, 1200);
        expect(strong[td]!).toBeGreaterThan(weak[td]!);
        expect(strong[punt]!).toBeLessThan(weak[punt]!);
      });

      it("give better field position more touchdowns", () => {
        expect(model.outcomeProbabilities(30, 0, 1200)[td]!).toBeGreaterThan(
          model.outcomeProbabilities(85, 0, 1200)[td]!,
        );
      });

      it("make end of half dominant with seconds left", () => {
        expect(model.outcomeProbabilities(75, 0, 10)[endOfHalf]!).toBeGreaterThan(0.5);
      });
    });

    describe("drive templates", () => {
      it("returns a template that fits in the time left", () => {
        const rng = createRng(1);
        for (let i = 0; i < 200; i++) {
          const drive = model.sampleDrive("punt", 70, 400, 1, rng);
          if (drive) expect(drive.durationSeconds).toBeLessThanOrEqual(400);
        }
      });

      it("accounts for pace when checking the time left", () => {
        const rng = createRng(1);
        for (let i = 0; i < 200; i++) {
          const drive = model.sampleDrive("punt", 70, 400, 2, rng);
          if (drive) expect(drive.durationSeconds * 2).toBeLessThanOrEqual(400);
        }
      });

      it("returns null when no template can fit", () => {
        expect(model.sampleDrive("touchdown", 70, 1, 1, createRng(1))).toBeNull();
      });
    });

    describe("touchdown points", () => {
      it("follow the conversion rates in the training window", () => {
        const rng = createRng(2);
        const points = Array.from({ length: 20_000 }, () => model.sampleTouchdownPoints(rng));
        expect(points.filter((p) => p === 7).length / points.length).toBeCloseTo(0.9, 1);
        expect(new Set(points)).toEqual(new Set([6, 7, 8]));
      });
    });

    describe("kickoffs", () => {
      it("draw only from the most recent kickoff starts", () => {
        const recent = { ...testSimConfig, recentKickoffs: 1 };
        const kickoffDrives: DriveRecord[] = drives.map((d) =>
          d.season === 2024 && d.week === 5 && (d.outcome === "touchdown" || d.outcome === "field_goal")
            ? { ...d, nextStartYardline: 99 }
            : d,
        );
        const m = fitDriveModel(kickoffDrives, conv, target, fixedRatings, recent);
        expect(m.sampleKickoffStart(createRng(3))).toBe(99);
      });
    });

    describe("with too little history", () => {
      it("refuses to fit", () => {
        expect(() =>
          fitDriveModel(drives, conv, { season: 2022, week: 2 }, fixedRatings, testSimConfig),
        ).toThrow(/only \d+ training drives before 2022 week 2/);
      });
    });
  });

  describe("no future data", () => {
    const conv = [...conversions(2023, 1, 90, 5, 5), ...conversions(2024, 8, 0, 100, 0)];
    const baseline = fingerprint(fitDriveModel(drives, conv, target, fixedRatings, testSimConfig));

    it("is unchanged when drives in or after the target week are rewritten", () => {
      const poisoned = drives.map((d): DriveRecord =>
        strictlyBefore(d) ? d : { ...d, outcome: "touchdown", durationSeconds: 1, nextStartYardline: 1 },
      );
      expect(fingerprint(fitDriveModel(poisoned, conv, target, fixedRatings, testSimConfig))).toEqual(baseline);
    });

    it("is unchanged when a later season is appended", () => {
      const withFuture = [...drives, ...syntheticDrives([2025], 10, 99)];
      expect(fingerprint(fitDriveModel(withFuture, conv, target, fixedRatings, testSimConfig))).toEqual(baseline);
    });

    it("ignores ratings requested for the target week or later", () => {
      const spying = (at: { season: number; week: number }, team: string) => {
        if (!strictlyBefore(at)) throw new Error(`future rating requested: ${at.season} week ${at.week}`);
        return fixedRatings(at, team);
      };
      expect(() => fitDriveModel(drives, conv, target, spying, testSimConfig)).not.toThrow();
    });

    it("does change when a drive from the week before is rewritten", () => {
      const altered = drives.map((d): DriveRecord =>
        d.season === 2024 && d.week === 5 ? { ...d, outcome: "touchdown" } : d,
      );
      expect(fingerprint(fitDriveModel(altered, conv, target, fixedRatings, testSimConfig))).not.toEqual(baseline);
    });
  });
});
