import { parseArgs } from "node:util";
import { DEFAULT_DB_PATH, openDatabase } from "../data/db";
import { teamEpaPerPlay } from "../data/queries";
import { cliErrorMessage, parseSeason, parseWeek } from "./args";
import { fixed, formatTable } from "./format";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    week: { type: "string" },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

async function main(): Promise<void> {
  const season = parseSeason(values.season);
  const week = parseWeek(values.week);
  const db = await openDatabase(values.db);
  try {
    const rows = await teamEpaPerPlay(db.connection, season, week);
    if (rows.length === 0) {
      console.log(`No plays found for ${season} week ${week}. Has that season been ingested?`);
      return;
    }
    console.log(`Team EPA/play, ${season} week ${week} (pass + rush plays)`);
    console.log(
      formatTable(
        ["team", "off plays", "off EPA/play", "def plays", "def EPA/play"],
        rows.map((t) => [t.team, t.offPlays, fixed(t.offEpaPerPlay), t.defPlays, fixed(t.defEpaPerPlay)]),
      ),
    );
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(cliErrorMessage(err));
  process.exitCode = 1;
});
