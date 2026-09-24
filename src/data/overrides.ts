import { readFile } from "node:fs/promises";
import { z } from "zod";
import { SKILL_POSITIONS, type PlayerOverride } from "../types/players";

export const DEFAULT_OVERRIDES_PATH = "overrides.json";

const share = (field: string) =>
  z.number({ error: `invalid ${field}` }).min(0, `invalid ${field}`).max(1, `invalid ${field}`);

export const overrideSchema = z
  .object({
    season: z.int({ error: "invalid season" }).min(1999, "invalid season").max(2100, "invalid season"),
    week: z.int({ error: "invalid week" }).min(1, "invalid week").max(22, "invalid week"),
    throughWeek: z.int({ error: "invalid throughWeek" }).min(1, "invalid throughWeek").max(22, "invalid throughWeek").optional(),
    playerId: z.string({ error: "missing playerId" }).regex(/^00-\d{7}$/, "invalid playerId"),
    status: z.literal("out", { error: "invalid status" }).optional(),
    targetShare: share("targetShare").optional(),
    carryShare: share("carryShare").optional(),
    playing: share("playing").optional(),
    team: z.string().regex(/^[A-Z]{2,3}$/, "invalid team").optional(),
    name: z.string().min(1, "missing name").optional(),
    position: z.enum(SKILL_POSITIONS, { error: "invalid position" }).optional(),
    note: z.string().optional(),
  })
  .strict()
  .refine(
    (o) => o.status !== undefined || o.targetShare !== undefined || o.carryShare !== undefined || o.playing !== undefined,
    "override does nothing",
  )
  .refine(
    (o) => o.status === undefined || (o.targetShare === undefined && o.carryShare === undefined && o.playing === undefined),
    "out player with shares",
  )
  .refine((o) => o.throughWeek === undefined || o.throughWeek >= o.week, "throughWeek before week");

export const overridesFileSchema = z.array(overrideSchema, { error: "overrides must be a list" });

export function parseOverrides(json: unknown): PlayerOverride[] {
  const result = overridesFileSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(`overrides: ${issue.path.length > 0 ? `[${issue.path.join(".")}] ` : ""}${issue.message}`);
  }
  return result.data.flatMap(({ throughWeek, ...override }) =>
    Array.from({ length: (throughWeek ?? override.week) - override.week + 1 }, (_, i) => ({ ...override, week: override.week + i })),
  );
}

export async function loadOverrides(path: string): Promise<PlayerOverride[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return parseOverrides(JSON.parse(text));
}
