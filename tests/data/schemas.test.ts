import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  pbpRowSchema,
  playerWeeklyStatsRowSchema,
  scheduleRowSchema,
} from "../../src/data/schemas";
import { rejectReason } from "../../src/data/load";
import { pbpRow, playerWeeklyStatsRow, scheduleRow } from "../fixtures/rows";

function reasonFor(schema: z.ZodType, row: unknown): string | null {
  const result = schema.safeParse(row);
  return result.success ? null : rejectReason(result.error);
}

describe("data/schemas", () => {
  describe("pbpRowSchema", () => {
    describe("valid rows", () => {
      it("accepts a complete pass play", () => {
        expect(reasonFor(pbpRowSchema, pbpRow())).toBeNull();
      });

      it("accepts a non-play row with null posteam, play_type, down and epa", () => {
        const row = pbpRow({ posteam: null, defteam: null, play_type: null, down: null, epa: null });
        expect(reasonFor(pbpRowSchema, row)).toBeNull();
      });

      it("accepts integral doubles for integer columns", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ play_id: 123.0, down: 3.0 }))).toBeNull();
      });

      it("accepts overtime quarters", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ qtr: 5 }))).toBeNull();
      });
    });

    describe("invalid rows", () => {
      it("reports a null game_id as missing", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ game_id: null }))).toBe("missing game_id");
      });

      it("reports a dropped column as missing", () => {
        const { play_type: _dropped, ...row } = pbpRow();
        expect(reasonFor(pbpRowSchema, row)).toBe("missing play_type");
      });

      it("rejects an unknown play_type", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ play_type: "lateral" }))).toBe("invalid play_type");
      });

      it("rejects a week outside 1-22", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ week: 23 }))).toBe("invalid week");
      });

      it("rejects a fifth down", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ down: 5 }))).toBe("invalid down");
      });

      it("rejects win probability above 1", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ wp: 1.2 }))).toBe("invalid wp");
      });

      it("rejects a non-finite epa", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ epa: Number.NaN }))).toBe("invalid epa");
      });

      it("rejects a malformed game_id", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ game_id: "BAL-CIN" }))).toBe("invalid game_id");
      });

      it("rejects a lowercase team code", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ posteam: "bal" }))).toBe("invalid posteam");
      });

      it("rejects an unknown drive result", () => {
        const row = pbpRow({ fixed_drive_result: "Kneel" });
        expect(reasonFor(pbpRowSchema, row)).toBe("invalid fixed_drive_result");
      });

      it("joins distinct messages when several fields fail", () => {
        expect(reasonFor(pbpRowSchema, pbpRow({ week: 0, down: 0 }))).toBe("invalid week; invalid down");
      });
    });
  });

  describe("scheduleRowSchema", () => {
    describe("valid rows", () => {
      it("accepts a completed game", () => {
        expect(reasonFor(scheduleRowSchema, scheduleRow())).toBeNull();
      });

      it("accepts an unplayed game with no score or lines", () => {
        const row = scheduleRow({
          home_score: null,
          away_score: null,
          result: null,
          total: null,
          spread_line: null,
          total_line: null,
        });
        expect(reasonFor(scheduleRowSchema, row)).toBeNull();
      });

      it("accepts a neutral-site playoff game", () => {
        const row = scheduleRow({ game_type: "SB", week: 22, location: "Neutral" });
        expect(reasonFor(scheduleRowSchema, row)).toBeNull();
      });
    });

    describe("invalid rows", () => {
      it("rejects a score for only one team", () => {
        expect(reasonFor(scheduleRowSchema, scheduleRow({ away_score: null }))).toBe("incomplete score");
      });

      it("rejects an unknown game_type", () => {
        expect(reasonFor(scheduleRowSchema, scheduleRow({ game_type: "PRE" }))).toBe("invalid game_type");
      });

      it("rejects a malformed gameday", () => {
        expect(reasonFor(scheduleRowSchema, scheduleRow({ gameday: "10/06/2024" }))).toBe("invalid gameday");
      });
    });
  });

  describe("playerWeeklyStatsRowSchema", () => {
    describe("valid rows", () => {
      it("accepts a receiver stat line", () => {
        expect(reasonFor(playerWeeklyStatsRowSchema, playerWeeklyStatsRow())).toBeNull();
      });

      it("accepts negative rushing yards", () => {
        const row = playerWeeklyStatsRow({ carries: 2, rushing_yards: -6 });
        expect(reasonFor(playerWeeklyStatsRowSchema, row)).toBeNull();
      });

      it("accepts a null position", () => {
        const row = playerWeeklyStatsRow({ position: null, position_group: null });
        expect(reasonFor(playerWeeklyStatsRowSchema, row)).toBeNull();
      });
    });

    describe("invalid rows", () => {
      it("rejects the unattributed team row nflverse emits each week", () => {
        const row = playerWeeklyStatsRow({ player_id: null, player_display_name: null });
        expect(reasonFor(playerWeeklyStatsRowSchema, row)).toBe(
          "missing player_id; missing player_display_name",
        );
      });

      it("rejects a non-GSIS player_id", () => {
        const row = playerWeeklyStatsRow({ player_id: "CHA123" });
        expect(reasonFor(playerWeeklyStatsRowSchema, row)).toBe("invalid player_id");
      });

      it("rejects negative targets", () => {
        const row = playerWeeklyStatsRow({ targets: -1 });
        expect(reasonFor(playerWeeklyStatsRowSchema, row)).toBe("invalid targets");
      });

      it("rejects a target share above 1", () => {
        const row = playerWeeklyStatsRow({ target_share: 1.5 });
        expect(reasonFor(playerWeeklyStatsRowSchema, row)).toBe("invalid target_share");
      });
    });
  });
});
