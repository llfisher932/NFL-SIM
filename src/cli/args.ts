import { z } from "zod";

const seasonSchema = z.coerce
  .number({ error: "invalid season" })
  .int("invalid season")
  .min(1999, "season before 1999")
  .max(2100, "invalid season");

const weekSchema = z.coerce
  .number({ error: "invalid week" })
  .int("invalid week")
  .min(1, "invalid week")
  .max(22, "invalid week");

function parseSeasonToken(token: string): number[] {
  const range = /^(\d{4})-(\d{4})$/.exec(token);
  if (!range) return [seasonSchema.parse(token)];
  const from = seasonSchema.parse(range[1]);
  const to = seasonSchema.parse(range[2]);
  if (from > to) throw new Error(`invalid season range: ${token}`);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export function parseSeasons(input: string): number[] {
  const tokens = input.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error("missing seasons");
  return [...new Set(tokens.flatMap(parseSeasonToken))].sort((a, b) => a - b);
}

export function parseWeeks(input: string | undefined): number[] {
  if (input === undefined) throw new Error("missing weeks");
  const tokens = input.split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new Error("missing weeks");
  const weeks = tokens.flatMap((token) => {
    const range = /^(\d{1,2})-(\d{1,2})$/.exec(token);
    if (!range) return [weekSchema.parse(token)];
    const from = weekSchema.parse(range[1]);
    const to = weekSchema.parse(range[2]);
    if (from > to) throw new Error(`invalid week range: ${token}`);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });
  return [...new Set(weeks)].sort((x, y) => x - y);
}

export function parseSeason(input: string | undefined): number {
  if (input === undefined) throw new Error("missing season");
  return seasonSchema.parse(input);
}

export function parseWeek(input: string | undefined): number {
  if (input === undefined) throw new Error("missing week");
  return weekSchema.parse(input);
}

const halfLifeSchema = z.coerce
  .number({ error: "invalid half-life" })
  .positive("invalid half-life")
  .max(1000, "invalid half-life");

export function parseHalfLife(input: string): number {
  return halfLifeSchema.parse(input);
}

const simsSchema = z.coerce
  .number({ error: "invalid sims" })
  .int("invalid sims")
  .min(1, "invalid sims")
  .max(1_000_000, "invalid sims");

const seedSchema = z.coerce
  .number({ error: "invalid seed" })
  .int("invalid seed")
  .min(0, "invalid seed")
  .max(4_294_967_295, "invalid seed");

const hfaSchema = z.coerce
  .number({ error: "invalid home-field advantage" })
  .min(-0.5, "invalid home-field advantage")
  .max(0.5, "invalid home-field advantage");

export function parseSims(input: string): number {
  return simsSchema.parse(input);
}

export function parseSeed(input: string): number {
  return seedSchema.parse(input);
}

export function parseHfa(input: string): number {
  return hfaSchema.parse(input);
}

export function cliErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((issue) => issue.message).join("; ");
  return err instanceof Error ? err.message : String(err);
}
