import { describe, expect, it } from "vitest";
import { RELEASE_BASE_URL, rawFilesFor } from "../../src/data/sources";

describe("data/sources", () => {
  describe("rawFilesFor", () => {
    describe("with two seasons", () => {
      const files = rawFilesFor([2023, 2024]);

      it("returns one play-by-play parquet per season", () => {
        expect(files.filter((f) => f.dataset === "pbp").map((f) => f.url)).toEqual([
          `${RELEASE_BASE_URL}/pbp/play_by_play_2023.parquet`,
          `${RELEASE_BASE_URL}/pbp/play_by_play_2024.parquet`,
        ]);
      });

      it("returns one weekly player stats parquet per season from the stats_player release", () => {
        expect(files.filter((f) => f.dataset === "player_weekly_stats").map((f) => f.url)).toEqual([
          `${RELEASE_BASE_URL}/stats_player/stats_player_week_2023.parquet`,
          `${RELEASE_BASE_URL}/stats_player/stats_player_week_2024.parquet`,
        ]);
      });

      it("returns a single all-seasons schedule file", () => {
        const schedules = files.filter((f) => f.dataset === "schedules");
        expect(schedules).toEqual([
          {
            dataset: "schedules",
            season: null,
            url: `${RELEASE_BASE_URL}/schedules/games.parquet`,
            relativePath: "schedules/games.parquet",
          },
        ]);
      });

      it("mirrors the release tag in the cache path", () => {
        const pbp2024 = files.find((f) => f.dataset === "pbp" && f.season === 2024);
        expect(pbp2024?.relativePath).toBe("pbp/play_by_play_2024.parquet");
      });
    });
  });
});
