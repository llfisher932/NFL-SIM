import { describe, expect, it } from "vitest";
import { devigHomeWinProbability, impliedProbability } from "../../src/eval/market";

describe("eval/market", () => {
  describe("impliedProbability", () => {
    it("converts a favorite's negative odds", () => {
      expect(impliedProbability(-150)).toBeCloseTo(0.6);
    });

    it("converts an underdog's positive odds", () => {
      expect(impliedProbability(130)).toBeCloseTo(100 / 230);
    });

    it("treats even money as one half", () => {
      expect(impliedProbability(100)).toBe(0.5);
      expect(impliedProbability(-100)).toBe(0.5);
    });

    it("rejects odds inside (-100, 100)", () => {
      expect(() => impliedProbability(50)).toThrow("invalid odds: 50");
    });
  });

  describe("devigHomeWinProbability", () => {
    it("removes the bookmaker margin", () => {
      const home = 0.6;
      const away = 100 / 230;
      expect(devigHomeWinProbability(-150, 130)).toBeCloseTo(home / (home + away));
    });

    it("returns one half for a symmetric -110 / -110 line", () => {
      expect(devigHomeWinProbability(-110, -110)).toBeCloseTo(0.5);
    });

    it("is complementary when the sides swap", () => {
      expect(devigHomeWinProbability(-150, 130) + devigHomeWinProbability(130, -150)).toBeCloseTo(1);
    });
  });
});
