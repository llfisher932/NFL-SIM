import { describe, expect, it } from "vitest";
import {
  breakEven,
  expectedValue,
  fairAmerican,
  fromHistogram,
  mean,
  moneylineOutcome,
  parseAmerican,
  poissonOutcome,
  spreadOutcome,
  summaryCdf,
  summaryOutcome,
  tilt,
  totalOutcome,
} from "../src/lib/odds";

// Home margins -3..7 with spikes at 3 and 7.
const margins = fromHistogram({ start: -3, counts: [10, 5, 5, 20, 5, 5, 30, 5, 5, 5, 25].slice(0, 11) });

describe("web/lib/odds", () => {
  describe("parseAmerican", () => {
    it("reads negative, positive and typographic-minus prices", () => {
      expect(parseAmerican("-110")).toBe(-110);
      expect(parseAmerican("+145")).toBe(145);
      expect(parseAmerican("−120")).toBe(-120);
    });

    it("rejects prices between -100 and +100 and non-numbers", () => {
      expect(parseAmerican("50")).toBeNull();
      expect(parseAmerican("abc")).toBeNull();
    });
  });

  describe("breakEven", () => {
    it("needs 52.4% at -110 and 40% at +150", () => {
      expect(breakEven(-110)).toBeCloseTo(0.5238, 4);
      expect(breakEven(150)).toBeCloseTo(0.4, 9);
    });
  });

  describe("fairAmerican", () => {
    it("prices favorites negative and underdogs positive", () => {
      expect(fairAmerican(0.6)).toBe("−150");
      expect(fairAmerican(0.4)).toBe("+150");
    });

    it("gives no price for near-certain outcomes", () => {
      expect(fairAmerican(1)).toBe("—");
    });
  });

  describe("expectedValue", () => {
    it("is zero at the fair price", () => {
      expect(expectedValue({ win: 0.4, push: 0, loss: 0.6 }, 150)).toBeCloseTo(0, 9);
    });

    it("returns the stake on a push", () => {
      expect(expectedValue({ win: 0.5, push: 0.1, loss: 0.4 }, 100)).toBeCloseTo(0.1, 9);
    });
  });

  describe("tilt", () => {
    it("moves the distribution to the target mean", () => {
      expect(mean(tilt(margins, 2))).toBeCloseTo(2, 6);
    });

    it("keeps the spikes at common margins", () => {
      const shifted = tilt(margins, mean(margins) - 1);
      const at = (x: number) => shifted.probs[x - shifted.start]!;
      expect(at(3)).toBeGreaterThan(at(2));
      expect(at(3)).toBeGreaterThan(at(4));
    });

    it("keeps impossible outcomes impossible", () => {
      const gap = fromHistogram({ start: 0, counts: [1, 0, 1] });
      expect(tilt(gap, 1.5).probs[1]).toBe(0);
    });
  });

  describe("spreadOutcome", () => {
    it("wins for the home favorite when it covers and pushes on the number", () => {
      const o = spreadOutcome(margins, "home", -3);
      const at = (x: number) => margins.probs[x - margins.start]!;
      expect(o.push).toBeCloseTo(at(3), 9);
      expect(o.win).toBeCloseTo([4, 5, 6, 7].reduce((s, x) => s + at(x), 0), 9);
    });

    it("mirrors the away side", () => {
      const home = spreadOutcome(margins, "home", -2.5);
      const away = spreadOutcome(margins, "away", 2.5);
      expect(away.win).toBeCloseTo(home.loss, 9);
    });
  });

  describe("moneylineOutcome", () => {
    it("counts a tie as a push", () => {
      const o = moneylineOutcome(margins, "home");
      expect(o.push).toBeCloseTo(margins.probs[3]!, 9);
      expect(o.win + o.push + o.loss).toBeCloseTo(1, 9);
    });
  });

  describe("totalOutcome", () => {
    const totals = fromHistogram({ start: 40, counts: [1, 2, 3, 4] });

    it("wins the over above the line", () => {
      expect(totalOutcome(totals, "over", 41.5).win).toBeCloseTo(0.7, 9);
    });

    it("swaps win and loss for the under", () => {
      expect(totalOutcome(totals, "under", 41.5).win).toBeCloseTo(0.3, 9);
    });
  });

  describe("summaryCdf", () => {
    const yards = { mean: 60, p10: 20, p50: 55, p90: 110 };

    it("passes through the 10th, 50th and 90th percentiles", () => {
      const cdf = summaryCdf(yards);
      expect(cdf(20)).toBeCloseTo(0.1, 9);
      expect(cdf(55)).toBeCloseTo(0.5, 9);
      expect(cdf(110)).toBeCloseTo(0.9, 9);
    });

    it("gives the over at the median even odds", () => {
      expect(summaryOutcome(yards, "over", 55).win).toBeCloseTo(0.5, 9);
    });
  });

  describe("poissonOutcome", () => {
    it("prices over 1.5 touchdowns from the mean", () => {
      const rate = 1.8;
      const atMost1 = Math.exp(-rate) * (1 + rate);
      expect(poissonOutcome(rate, "over", 1.5).win).toBeCloseTo(1 - atMost1, 9);
    });

    it("pushes on a whole-number line", () => {
      expect(poissonOutcome(1, "under", 1).push).toBeCloseTo(Math.exp(-1), 9);
    });
  });
});
