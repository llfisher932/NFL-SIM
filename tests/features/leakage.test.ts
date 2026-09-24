import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Database } from "../../src/data/db";
import { loadTeamGames } from "../../src/data/teamGames";
import { DEFAULT_FEATURE_CONFIG } from "../../src/features/config";
import { buildFeatureTable, featuresAt } from "../../src/features/teamFeatures";
import type { SeasonWeek, TeamGame } from "../../src/types/features";
import { schedule, seededRandom, syntheticTeamGames, TEAMS } from "../fixtures/league";

const config = DEFAULT_FEATURE_CONFIG;
const history = syntheticTeamGames([2022, 2023]);
const weeks2023 = [1, 2, 3, 4, 5, 6, 7, 8];

// Deliberately independent of src/features/window so a bug there cannot hide here.
const strictlyBefore = (g: SeasonWeek, target: SeasonWeek) =>
  g.season < target.season || (g.season === target.season && g.week < target.week);

const onlyBefore = (games: readonly TeamGame[], target: SeasonWeek) =>
  games.filter((g) => strictlyBefore(g, target));

function poison(game: TeamGame): TeamGame {
  return {
    ...game,
    passPlays: 500,
    passEpa: 500 * 9,
    rushPlays: 500,
    rushEpa: -500 * 9,
    plays: 1000,
    neutralPlays: 400,
    neutralPasses: 400,
  };
}

describe("features/leakage", () => {
  describe("featuresAt", () => {
    describe.each(weeks2023)("for 2023 week %i", (week) => {
      const target = { season: 2023, week };

      it("matches features computed from only the games before that week", () => {
        expect(featuresAt(history, target, TEAMS, config)).toEqual(
          featuresAt(onlyBefore(history, target), target, TEAMS, config),
        );
      });

      it("is unchanged when every game in or after that week is replaced with extreme values", () => {
        const poisoned = history.map((g) => (strictlyBefore(g, target) ? g : poison(g)));
        expect(featuresAt(poisoned, target, TEAMS, config)).toEqual(featuresAt(history, target, TEAMS, config));
      });

      it("is unchanged when a later season is added", () => {
        const withFuture = [...history, ...syntheticTeamGames([2024], 99).map(poison)];
        expect(featuresAt(withFuture, target, TEAMS, config)).toEqual(
          featuresAt(history, target, TEAMS, config),
        );
      });
    });

    describe("sensitivity controls", () => {
      it("changes when a game from the previous week changes", () => {
        const target = { season: 2023, week: 4 };
        const altered = history.map((g) => (g.season === 2023 && g.week === 3 ? poison(g) : g));
        expect(featuresAt(altered, target, TEAMS, config)).not.toEqual(
          featuresAt(history, target, TEAMS, config),
        );
      });

      it("changes when a prior-season game changes", () => {
        const target = { season: 2023, week: 1 };
        const altered = history.map((g) => (g.season === 2022 && g.week === 7 ? poison(g) : g));
        expect(featuresAt(altered, target, TEAMS, config)).not.toEqual(
          featuresAt(history, target, TEAMS, config),
        );
      });
    });
  });

  describe("buildFeatureTable", () => {
    const rows = buildFeatureTable(history, [{ season: 2023, teams: TEAMS, weeks: weeks2023 }], config);

    it("produces a row per team per week", () => {
      expect(rows).toHaveLength(TEAMS.length * weeks2023.length);
    });

    it("gives every row exactly the features computed from strictly earlier games", () => {
      for (const week of weeks2023) {
        const target = { season: 2023, week };
        const expected = featuresAt(onlyBefore(history, target), target, TEAMS, config);
        expect(rows.filter((r) => r.week === week)).toEqual(expected);
      }
    });
  });

  describe("through DuckDB play-by-play", () => {
    let db: Database;

    async function insertPlays(seasons: number[], seed: number): Promise<void> {
      const random = seededRandom(seed);
      const values: string[] = [];
      let playId = 1;
      for (const m of schedule(seasons)) {
        for (const [posteam, defteam] of [
          [m.home, m.away],
          [m.away, m.home],
        ]) {
          for (let i = 0; i < 12; i++) {
            const pass = random() < 0.55 ? 1 : 0;
            const epa = random() < 0.05 ? "NULL" : ((random() - 0.5) * 3).toFixed(4);
            values.push(
              `('${m.gameId}', ${playId++}, ${m.season}, ${m.week}, '${posteam}', '${defteam}', ` +
                `${pass}, ${1 - pass}, ${epa}, ${random().toFixed(3)}, ${1 + (i % 4)}, ${1800 - i * 60}, ${1 + (i % 4)})`,
            );
          }
        }
      }
      await db.connection.run(`INSERT INTO pbp VALUES ${values.join(", ")}`);
    }

    beforeEach(async () => {
      db = await openDatabase(":memory:");
      await db.connection.run(
        `CREATE TABLE pbp (game_id VARCHAR, play_id INTEGER, season INTEGER, week INTEGER,
           posteam VARCHAR, defteam VARCHAR, pass INTEGER, rush INTEGER, epa DOUBLE, wp DOUBLE,
           down INTEGER, half_seconds_remaining DOUBLE, qtr INTEGER)`,
      );
      await insertPlays([2022, 2023], 11);
    });

    afterEach(() => {
      db.close();
    });

    it.each([2, 4, 6])("keeps 2023 week %i features fixed when later plays are rewritten", async (week) => {
      const target = { season: 2023, week };
      const before = featuresAt(await loadTeamGames(db.connection), target, TEAMS, config);

      await db.connection.run(
        `UPDATE pbp SET epa = 25, pass = 1, rush = 0, wp = 0.5, down = 1
         WHERE season > 2023 OR (season = 2023 AND week >= ${week})`,
      );
      await insertPlays([2024], 12);

      const after = featuresAt(await loadTeamGames(db.connection), target, TEAMS, config);
      expect(after).toEqual(before);
    });

    it("does reflect rewritten plays from the week before", async () => {
      const target = { season: 2023, week: 4 };
      const before = featuresAt(await loadTeamGames(db.connection), target, TEAMS, config);
      await db.connection.run("UPDATE pbp SET epa = 25 WHERE season = 2023 AND week = 3");
      const after = featuresAt(await loadTeamGames(db.connection), target, TEAMS, config);
      expect(after).not.toEqual(before);
    });
  });
});
