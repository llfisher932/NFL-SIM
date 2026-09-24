import { describe, expect, it } from "vitest";
import { DIVISIONS, lockedSeeds, seedConference, type Result } from "../../src/features/seeding";
import type { WeekGame } from "../../src/types/sim";

const NFC_OPPONENT = "ARI";

// A team's record, built from games against an NFC team so conference tiebreakers stay neutral.
function record(team: string, wins: number, losses: number): Result[] {
  return [
    ...Array.from({ length: wins }, () => ({ home: team, away: NFC_OPPONENT, homePoints: 1, awayPoints: 0 })),
    ...Array.from({ length: losses }, () => ({ home: team, away: NFC_OPPONENT, homePoints: 0, awayPoints: 1 })),
  ];
}

function game(week: number, home: string, away: string, homeScore: number | null, awayScore: number | null): WeekGame {
  return {
    gameId: `2024_${week}_${away}_${home}`,
    season: 2024,
    week,
    gameType: "REG",
    kickoff: null,
    home,
    away,
    neutralSite: false,
    spreadLine: null,
    totalLine: null,
    homeMoneyline: null,
    awayMoneyline: null,
    homeScore,
    awayScore,
  };
}

const afcTeams = Object.entries(DIVISIONS)
  .filter(([name]) => name.startsWith("AFC"))
  .flatMap(([, teams]) => teams);

// BUF wins its first two games and everyone else in the AFC loses both, then the AFC plays itself.
function runawaySeason(): WeekGame[] {
  const earlier = afcTeams.flatMap((team) => [1, 2].map((week) => game(week, team, NFC_OPPONENT, team === "BUF" ? 1 : 0, team === "BUF" ? 0 : 1)));
  const final = Array.from({ length: afcTeams.length / 2 }, (_, i) => game(3, afcTeams[2 * i]!, afcTeams[2 * i + 1]!, null, null));
  return [...earlier, ...final];
}

describe("features/seeding", () => {
  describe("seedConference", () => {
    const standings = [
      ...record("BUF", 5, 0),
      ...record("MIA", 4, 1),
      ...record("NE", 0, 5),
      ...record("NYJ", 0, 5),
      ...record("BAL", 2, 3),
      ...record("CIN", 0, 5),
      ...record("CLE", 0, 5),
      ...record("PIT", 0, 5),
      ...record("HOU", 3, 2),
      ...record("IND", 1, 4),
      ...record("JAX", 1, 4),
      ...record("TEN", 1, 4),
      ...record("KC", 4, 1),
      ...record("DEN", 3, 2),
      ...record("LAC", 2, 3),
      ...record("LV", 0, 5),
    ];

    it("seeds division winners first by record, then the best remaining teams", () => {
      expect(seedConference("AFC", standings)).toEqual(["BUF", "KC", "HOU", "BAL", "MIA", "DEN", "LAC"]);
    });

    it("gives a division winner a top-four seed over a wild card with a better record", () => {
      expect(seedConference("AFC", standings).indexOf("BAL")).toBeLessThan(seedConference("AFC", standings).indexOf("MIA"));
    });

    it("breaks a tie for the division by head-to-head result", () => {
      const tied = [...standings.filter((r) => r.home !== "BUF" && r.home !== "MIA"), ...record("BUF", 4, 0), ...record("MIA", 4, 0)];
      const headToHead = { home: "BUF", away: "MIA", homePoints: 10, awayPoints: 20 };
      expect(seedConference("AFC", [...tied, headToHead])[0]).toBe("MIA");
    });

    it("counts a tie as half a win", () => {
      const withTie = [
        ...standings.filter((r) => !["DEN", "LAC", "LV"].includes(r.home)),
        ...record("DEN", 5, 2),
        ...record("LAC", 3, 1),
        { home: "LAC", away: NFC_OPPONENT, homePoints: 3, awayPoints: 3 },
        ...record("LV", 13, 7),
      ];
      expect(seedConference("AFC", withTie).slice(4)).toEqual(["MIA", "DEN", "LAC"]);
    });
  });

  describe("before the 2020 expansion and franchise moves", () => {
    const oldAfc = [
      ...record("NE", 12, 4),
      ...record("MIA", 10, 6),
      ...record("BUF", 8, 8),
      ...record("NYJ", 6, 10),
      ...record("PIT", 11, 5),
      ...record("BAL", 9, 7),
      ...record("CIN", 7, 9),
      ...record("CLE", 3, 13),
      ...record("HOU", 10, 6),
      ...record("IND", 8, 8),
      ...record("JAX", 5, 11),
      ...record("TEN", 4, 12),
      ...record("DEN", 13, 3),
      ...record("KC", 11, 5),
      ...record("OAK", 9, 7),
      ...record("SD", 4, 12),
    ];

    it("places old team codes in their divisions", () => {
      const seeds = seedConference("AFC", oldAfc, 6);
      expect(seeds.slice(0, 4).sort()).toEqual(["DEN", "HOU", "NE", "PIT"]);
    });

    it("seeds six teams when asked", () => {
      expect(seedConference("AFC", oldAfc, 6)).toEqual(["DEN", "NE", "PIT", "HOU", "KC", "MIA"]);
    });
  });

  describe("lockedSeeds", () => {
    it("locks a team that holds its seed under every final-week outcome", () => {
      expect(lockedSeeds(runawaySeason(), 2024).get("BUF")).toBe(1);
    });

    it("does not lock teams whose seed depends on the final week", () => {
      expect(lockedSeeds(runawaySeason(), 2024).has("MIA")).toBe(false);
    });

    it("finds nothing when an earlier game has no result yet", () => {
      const season = runawaySeason().map((g) => (g.week === 2 && g.home === "KC" ? { ...g, homeScore: null, awayScore: null } : g));
      expect(lockedSeeds(season, 2024).size).toBe(0);
    });

    it("ignores the final week's own results", () => {
      const played = runawaySeason().map((g) => (g.week === 3 ? { ...g, homeScore: 0, awayScore: 1 } : g));
      expect(lockedSeeds(played, 2024)).toEqual(lockedSeeds(runawaySeason(), 2024));
    });

    it("finds nothing for a season without games", () => {
      expect(lockedSeeds(runawaySeason(), 2023).size).toBe(0);
    });
  });
});
