import { parseArgs } from "node:util";
import { DEFAULT_DASHBOARD_DIR } from "../data/dashboardStore";
import { DEFAULT_DB_PATH } from "../data/db";
import { DEFAULT_OVERRIDES_PATH } from "../data/overrides";
import { DEFAULT_SEED, DEFAULT_SIMS } from "../sim/config";
import { cliErrorMessage, parseSeason, parseSeed, parseSims, parseWeeks } from "./args";
import { exportWeeks } from "./exportRunner";

const { values } = parseArgs({
  options: {
    season: { type: "string" },
    weeks: { type: "string" },
    sims: { type: "string", default: String(DEFAULT_SIMS) },
    seed: { type: "string", default: String(DEFAULT_SEED) },
    out: { type: "string", default: DEFAULT_DASHBOARD_DIR },
    overrides: { type: "string", default: DEFAULT_OVERRIDES_PATH },
    "no-injuries": { type: "boolean", default: false },
    db: { type: "string", default: DEFAULT_DB_PATH },
  },
});

exportWeeks({
  season: parseSeason(values.season),
  weeks: parseWeeks(values.weeks),
  sims: parseSims(values.sims),
  seed: parseSeed(values.seed),
  out: values.out,
  overridesPath: values.overrides,
  injuries: !values["no-injuries"],
  dbPath: values.db,
  log: (line) => console.log(line),
}).catch((err: unknown) => {
  console.error(cliErrorMessage(err));
  process.exitCode = 1;
});
