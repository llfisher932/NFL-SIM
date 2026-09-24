import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DashboardIndex, DashboardRecord, DashboardWeek } from "../types/dashboard";

export const DEFAULT_DASHBOARD_DIR = "web/public/data";
export const INDEX_FILE = "index.json";
export const RECORD_FILE = "record.json";

const roundNumbers = (_key: string, value: unknown) =>
  typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 10_000) / 10_000 : value;

async function writeJson(dir: string, file: string, value: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, file);
  await writeFile(`${path}.tmp`, JSON.stringify(value, roundNumbers));
  await rename(`${path}.tmp`, path);
}

export async function readDashboardIndex(dir: string): Promise<DashboardIndex | null> {
  try {
    return JSON.parse(await readFile(join(dir, INDEX_FILE), "utf8")) as DashboardIndex;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export const writeDashboardIndex = (dir: string, index: DashboardIndex) => writeJson(dir, INDEX_FILE, index);
export const writeDashboardWeek = (dir: string, file: string, week: DashboardWeek) => writeJson(dir, file, week);
export const writeDashboardRecord = (dir: string, record: DashboardRecord) => writeJson(dir, RECORD_FILE, record);
