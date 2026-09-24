import { describe, expect, it } from "vitest";
import {
  bucketize,
  columnPath,
  cropBins,
  histogramBins,
  linearScale,
  marginBuckets,
  niceTicks,
  TOTAL_BUCKETS,
} from "../src/lib/chart";

describe("web/lib/chart", () => {
  describe("linearScale", () => {
    const scale = linearScale([0, 10], [100, 200]);

    it("maps the domain onto the range", () => {
      expect([scale(0), scale(5), scale(10)]).toEqual([100, 150, 200]);
    });

    it("inverts pixels back to values", () => {
      expect(scale.invert(175)).toBe(7.5);
    });

    it("handles an inverted range for y axes", () => {
      expect(linearScale([0, 1], [300, 0])(0.25)).toBe(225);
    });
  });

  describe("niceTicks", () => {
    it("uses round steps", () => {
      expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    });

    it("ends at or above the maximum so the data fits the scale", () => {
      const ticks = niceTicks(0, 0.035, 4);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0.035);
    });

    it("does not add an extra tick when the maximum lands on one", () => {
      expect(niceTicks(0, 0.04, 4)).toEqual([0, 0.01, 0.02, 0.03, 0.04]);
    });

    it("returns the minimum for an empty range", () => {
      expect(niceTicks(3, 3)).toEqual([3]);
    });
  });

  describe("histogramBins", () => {
    it("converts counts into probabilities keyed by value", () => {
      expect(histogramBins({ start: -1, counts: [1, 2, 1] })).toEqual([
        { value: -1, probability: 0.25 },
        { value: 0, probability: 0.5 },
        { value: 1, probability: 0.25 },
      ]);
    });
  });

  describe("cropBins", () => {
    const bins = histogramBins({ start: 0, counts: [1, 0, 48, 50, 0, 1] });

    it("drops thin tails beyond the requested coverage", () => {
      expect(cropBins(bins, 0.97).map((b) => b.value)).toEqual([2, 3]);
    });

    it("keeps everything at full coverage", () => {
      expect(cropBins(bins, 1)).toHaveLength(6);
    });
  });

  describe("bucketize", () => {
    it("sums probabilities for each margin range", () => {
      const bins = histogramBins({ start: -14, counts: [...Array(28).fill(0), 1].map((_, i) => (i === 0 || i === 14 || i === 21 ? 1 : 0)) });
      const rows = bucketize(bins, marginBuckets("KC", "BUF"));
      expect(rows.find((r) => r.label === "BUF by 14+")?.probability).toBeCloseTo(1 / 3);
      expect(rows.find((r) => r.label === "Tie")?.probability).toBeCloseTo(1 / 3);
      expect(rows.find((r) => r.label === "KC by 7–13")?.probability).toBeCloseTo(1 / 3);
    });

    it("covers every total exactly once", () => {
      const bins = histogramBins({ start: 20, counts: Array(50).fill(1) });
      const sum = bucketize(bins, TOTAL_BUCKETS).reduce((s, r) => s + r.probability, 0);
      expect(sum).toBeCloseTo(1, 12);
    });
  });

  describe("columnPath", () => {
    it("draws a column with a square base", () => {
      expect(columnPath(10, 8, 20, 100, 2)).toMatch(/^M10,100 V22/);
    });

    it("draws nothing for a zero-height column", () => {
      expect(columnPath(10, 8, 100, 100, 2)).toBe("");
    });
  });
});
