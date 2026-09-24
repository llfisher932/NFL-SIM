import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { FEATURES_TABLE, writeTeamWeekFeatures } from "../data/featureStore";
import { loadSeasonSchedules, loadTeamGames } from "../data/teamGames";
import { DEFAULT_FEATURE_CONFIG } from "../features/config";
import { buildFeatureTable } from "../features/teamFeatures";
import type { TeamWeekFeatures } from "../types/features";
import { cliErrorMessage, parseHalfLife, parseSeasons } from "./args";
import { fixed, formatTable } from "./format";

const { values } = parseArgs({
  options: {
    seasons: { type: "string", default: "2021-2025" },
    "half-life": { type: "string", default: String(DEFAULT_FEATURE_CONFIG.halfLifeWeeks) },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

function printRatings(rows: readonly TeamWeekFeatures[]): void {
  const sorted = [...rows].sort((a, b) => b.offense.all - b.defense.all - (a.offense.all - a.defense.all));
  console.log(
    formatTable(
      ["team", "gp", "net", "off", "off pass", "off rush", "def", "def pass", "def rush", "plays/g", "neutral pass%"],
      sorted.map((t) => [
        t.team,
        t.gamesPlayed,
        fixed(t.offense.all - t.defense.all),
        fixed(t.offense.all),
        fixed(t.offense.pass),
        fixed(t.offense.rush),
        fixed(t.defense.all),
        fixed(t.defense.pass),
        fixed(t.defense.rush),
        fixed(t.playsPerGame, 1),
        fixed(100 * t.neutralPassRate, 1),
      ]),
    ),
  );
}

async function main(): Promise<void> {
  const seasons = parseSeasons(values.seasons);
  const config = { ...DEFAULT_FEATURE_CONFIG, halfLifeWeeks: parseHalfLife(values["half-life"]) };

  const db = await openDatabase(values.db);
  try {
    const games = await loadTeamGames(db.connection);
    const schedules = await loadSeasonSchedules(db.connection, seasons);
    const rows = buildFeatureTable(games, schedules, config);
    await writeTeamWeekFeatures(db.connection, rows);

    console.log(`Half-life: ${config.halfLifeWeeks} weeks. Team-games available: ${games.length}.`);
    console.log(
      formatTable(
        ["season", "weeks", "rows"],
        schedules.map((s) => [s.season, s.weeks.length, rows.filter((r) => r.season === s.season).length]),
      ),
    );

    const last = schedules[schedules.length - 1];
    const lastWeek = last?.weeks[last.weeks.length - 1];
    if (last && lastWeek !== undefined) {
      console.log(
        `\nRatings entering ${last.season} week ${lastWeek} (EPA/play vs league average; ` +
          "defense = EPA allowed, lower is better; net = off - def)",
      );
      printRatings(rows.filter((r) => r.season === last.season && r.week === lastWeek));
    }
    console.log(`\nWrote ${rows.length} rows to ${FEATURES_TABLE} in ${values.db}`);
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(cliErrorMessage(err));
  process.exitCode = 1;
});
