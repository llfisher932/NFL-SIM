import { describe, expect, it } from "vitest";
import { cliErrorMessage, parseHalfLife, parseSeason, parseSeasons, parseWeek } from "../../src/cli/args";

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
