import { describe, expect, it } from "vitest";
import { kickoffLabel, lineLabel, marginLabel, pct, signed } from "../src/lib/format";
import { formatHash, parseHash } from "../src/lib/route";
import { teamName, teamNickname } from "../src/lib/teams";

describe("web/lib/format", () => {
  describe("pct", () => {
    it("formats a probability as a percentage", () => {
      expect(pct(0.7712)).toBe("77%");
      expect(pct(0.7712, 1)).toBe("77.1%");
    });
  });

  describe("signed", () => {
    it("adds a plus sign and uses a true minus", () => {
      expect(signed(3.21)).toBe("+3.2");
      expect(signed(-0.041, 3)).toBe("−0.041");
    });

    it("drops the sign when the value rounds to zero", () => {
      expect(signed(-0.01)).toBe("0.0");
    });
  });

  describe("lineLabel", () => {
    it("names the favorite with a negative number, like a betting line", () => {
      expect(lineLabel(3.5, "KC", "BUF")).toBe("KC −3.5");
      expect(lineLabel(-7, "KC", "BUF")).toBe("BUF −7.0");
    });

    it("calls an even game a pick'em", () => {
      expect(lineLabel(0.02, "KC", "BUF")).toBe("Pick'em");
    });
  });

  describe("marginLabel", () => {
    it("names the winning side", () => {
      expect(marginLabel(-3, "KC", "BUF")).toBe("BUF by 3");
      expect(marginLabel(0, "KC", "BUF")).toBe("Tie");
    });
  });

  describe("kickoffLabel", () => {
    it("formats an Eastern kickoff without timezone conversion", () => {
      expect(kickoffLabel("2025-10-12T13:00")).toBe("Sun, Oct 12 · 1:00 PM ET");
      expect(kickoffLabel("2025-10-09T20:15")).toBe("Thu, Oct 9 · 8:15 PM ET");
    });

    it("handles a missing kickoff", () => {
      expect(kickoffLabel(null)).toBe("TBD");
    });
  });
});

describe("web/lib/route", () => {
  it("round-trips every view", () => {
    for (const route of [
      { view: "slate", season: 2025, week: 5 },
      { view: "players", season: 2025, week: 5 },
      { view: "game", season: 2025, week: 5, gameId: "2025_05_SF_LA" },
      { view: "record" },
    ] as const) {
      expect(parseHash(formatHash(route))).toEqual(route);
    }
  });

  it("falls back to home for unknown hashes", () => {
    expect(parseHash("")).toEqual({ view: "home" });
    expect(parseHash("#/nonsense")).toEqual({ view: "home" });
  });
});

describe("web/lib/teams", () => {
  it("expands abbreviations and nicknames", () => {
    expect(teamName("LA")).toBe("Los Angeles Rams");
    expect(teamNickname("SF")).toBe("49ers");
  });

  it("passes through unknown codes", () => {
    expect(teamName("XYZ")).toBe("XYZ");
  });
});
