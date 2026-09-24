import { describe, expect, it } from "vitest";
import {
  cliErrorMessage,
  currentSeason,
  parseHalfLife,
  parseHfa,
  parseSeason,
  parseSeasons,
  parseSeed,
  parseSims,
  parseWeek,
  parseWeeks,
} from "../../src/cli/args";

describe("cli/args", () => {
  describe("parseSeasons", () => {
    describe("valid input", () => {
      it("expands an inclusive range", () => {
        expect(parseSeasons("2021-2025")).toEqual([2021, 2022, 2023, 2024, 2025]);
      });

      it("accepts a single season", () => {
        expect(parseSeasons("2024")).toEqual([2024]);
      });

      it("combines lists and ranges, sorted and deduplicated", () => {
        expect(parseSeasons("2025, 2021-2022,2022")).toEqual([2021, 2022, 2025]);
      });
    });

    describe("invalid input", () => {
      it("rejects an empty string", () => {
        expect(() => parseSeasons("")).toThrow("missing seasons");
      });

      it("rejects a reversed range", () => {
        expect(() => parseSeasons("2025-2021")).toThrow("invalid season range: 2025-2021");
      });

      it("rejects seasons before nflverse coverage", () => {
        expect(() => parseSeasons("1998")).toThrow("season before 1999");
      });

      it("rejects non-numeric tokens", () => {
        expect(() => parseSeasons("latest")).toThrow("invalid season");
      });
    });
  });

  describe("parseSeason", () => {
    it("parses a numeric string", () => {
      expect(parseSeason("2025")).toBe(2025);
    });

    it("rejects a missing value", () => {
      expect(() => parseSeason(undefined)).toThrow("missing season");
    });
  });

  describe("parseWeek", () => {
    it("parses a numeric string", () => {
      expect(parseWeek("5")).toBe(5);
    });

    it("rejects week 23", () => {
      expect(() => parseWeek("23")).toThrow("invalid week");
    });

    it("rejects a missing value", () => {
      expect(() => parseWeek(undefined)).toThrow("missing week");
    });
  });

  describe("currentSeason", () => {
    it("uses the calendar year from March on", () => {
      expect(currentSeason(new Date(2026, 8, 24))).toBe(2026);
    });

    it("assigns January and February to the previous season", () => {
      expect(currentSeason(new Date(2027, 1, 10))).toBe(2026);
    });
  });

  describe("parseWeeks", () => {
    it("expands a range", () => {
      expect(parseWeeks("1-4")).toEqual([1, 2, 3, 4]);
    });

    it("combines lists and ranges, sorted and deduplicated", () => {
      expect(parseWeeks("18, 1-2,2")).toEqual([1, 2, 18]);
    });

    it("rejects a week outside 1-22", () => {
      expect(() => parseWeeks("0-3")).toThrow("invalid week");
    });

    it("rejects a reversed range", () => {
      expect(() => parseWeeks("5-2")).toThrow("invalid week range: 5-2");
    });

    it("requires a value", () => {
      expect(() => parseWeeks(undefined)).toThrow("missing weeks");
    });
  });

  describe("parseHalfLife", () => {
    it("accepts fractional weeks", () => {
      expect(parseHalfLife("6.5")).toBe(6.5);
    });

    it("rejects zero", () => {
      expect(() => parseHalfLife("0")).toThrow("invalid half-life");
    });

    it("rejects non-numeric input", () => {
      expect(() => parseHalfLife("fast")).toThrow("invalid half-life");
    });
  });

  describe("parseSims", () => {
    it("parses a positive integer", () => {
      expect(parseSims("10000")).toBe(10_000);
    });

    it("rejects zero", () => {
      expect(() => parseSims("0")).toThrow("invalid sims");
    });

    it("rejects fractions", () => {
      expect(() => parseSims("2.5")).toThrow("invalid sims");
    });
  });

  describe("parseSeed", () => {
    it("accepts any unsigned 32-bit integer", () => {
      expect(parseSeed("4294967295")).toBe(4_294_967_295);
    });

    it("rejects negative seeds", () => {
      expect(() => parseSeed("-1")).toThrow("invalid seed");
    });
  });

  describe("parseHfa", () => {
    it("accepts a small EPA/play shift, including zero", () => {
      expect(parseHfa("0")).toBe(0);
      expect(parseHfa("0.015")).toBe(0.015);
    });

    it("rejects implausibly large values", () => {
      expect(() => parseHfa("2")).toThrow("invalid home-field advantage");
    });
  });

  describe("cliErrorMessage", () => {
    it("flattens zod issues into their messages", () => {
      let caught: unknown;
      try {
        parseWeek("0");
      } catch (err) {
        caught = err;
      }
      expect(cliErrorMessage(caught)).toBe("invalid week");
    });

    it("uses the message of a plain error", () => {
      expect(cliErrorMessage(new Error("boom"))).toBe("boom");
    });
  });
});
