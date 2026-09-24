import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheRawFiles, shouldRefresh } from "../../src/data/ingest";
import { rawFilesFor } from "../../src/data/sources";
import type { RawFile } from "../../src/types/data";

const file = (season: number | null): RawFile => ({
  dataset: season === null ? "schedules" : "pbp",
  season,
  url: "https://example.test/x.parquet",
  relativePath: "x.parquet",
});

describe("data/ingest", () => {
  describe("shouldRefresh", () => {
    it("refreshes files for the requested seasons", () => {
      expect(shouldRefresh(file(2026), [2026])).toBe(true);
    });

    it("keeps earlier seasons cached", () => {
      expect(shouldRefresh(file(2025), [2026])).toBe(false);
    });

    it("refreshes all-season files such as the schedule", () => {
      expect(shouldRefresh(file(null), [2026])).toBe(true);
    });

    it("refreshes nothing when no season is requested", () => {
      expect(shouldRefresh(file(null), [])).toBe(false);
    });
  });

  describe("cacheRawFiles", () => {
    let rawDir: string;

    beforeEach(async () => {
      rawDir = await mkdtemp(join(tmpdir(), "gridiron-ingest-"));
      for (const f of rawFilesFor([2025, 2026])) {
        await mkdir(join(rawDir, dirname(f.relativePath)), { recursive: true });
        await writeFile(join(rawDir, f.relativePath), "cached");
      }
    });

    afterEach(async () => {
      await rm(rawDir, { recursive: true, force: true });
    });

    it("re-downloads only the refreshed season and the all-season files", async () => {
      const fetchImpl = vi.fn(async () => new Response("fresh")) as unknown as typeof fetch;
      const cached = await cacheRawFiles({ seasons: [2025, 2026], rawDir, refreshSeasons: [2026], fetchImpl });
      const downloaded = cached.filter((c) => c.status === "downloaded").map((c) => c.file.season);
      expect(downloaded.every((s) => s === 2026 || s === null)).toBe(true);
      expect(cached.filter((c) => c.file.season === 2025).every((c) => c.status === "cached")).toBe(true);
      expect(downloaded).toContain(null);
    });
  });
});
