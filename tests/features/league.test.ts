import { describe, expect, it } from "vitest";
import { CURRENT_CODE, PREVIOUS_CODE, playoffSeeds, regularSeasonWeeks, seasonsFrom } from "../../src/features/league";

describe("features/league", () => {
  describe("regularSeasonWeeks", () => {
    it("has 17 weeks through 2020 and 18 from 2021", () => {
      expect(regularSeasonWeeks(2020)).toBe(17);
      expect(regularSeasonWeeks(2021)).toBe(18);
    });
  });

  describe("playoffSeeds", () => {
    it("seeds six teams per conference through 2019 and seven from 2020", () => {
      expect(playoffSeeds(2019)).toBe(6);
      expect(playoffSeeds(2020)).toBe(7);
    });
  });

  describe("relocations", () => {
    it("maps each current code to the one used before the move", () => {
      expect(PREVIOUS_CODE).toEqual({ LA: "STL", LAC: "SD", LV: "OAK" });
    });

    it("maps each old code to the current one", () => {
      expect(CURRENT_CODE).toEqual({ STL: "LA", SD: "LAC", OAK: "LV" });
    });
  });

  describe("seasonsFrom", () => {
    it("lists every season in the range", () => {
      expect(seasonsFrom(2012, 2015)).toEqual([2012, 2013, 2014, 2015]);
    });

    it("is empty for a backward range", () => {
      expect(seasonsFrom(2016, 2015)).toEqual([]);
    });
  });
});
