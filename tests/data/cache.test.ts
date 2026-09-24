import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadError, ensureCached } from "../../src/data/cache";
import type { RawFile } from "../../src/types/data";

const file: RawFile = {
  dataset: "pbp",
  season: 2024,
  url: "https://example.test/pbp/play_by_play_2024.parquet",
  relativePath: "pbp/play_by_play_2024.parquet",
};

const okFetch = (body = "fresh") => vi.fn(async () => new Response(body)) as unknown as typeof fetch;

describe("data/cache", () => {
  let rawDir: string;

  beforeEach(async () => {
    rawDir = await mkdtemp(join(tmpdir(), "gridiron-cache-"));
  });

  afterEach(async () => {
    await rm(rawDir, { recursive: true, force: true });
  });

  describe("ensureCached", () => {
    describe("when the file is not cached", () => {
      it("downloads it to rawDir/relativePath", async () => {
        const result = await ensureCached(file, { rawDir, fetchImpl: okFetch("parquet-bytes") });
        expect(result.status).toBe("downloaded");
        expect(await readFile(join(rawDir, file.relativePath), "utf8")).toBe("parquet-bytes");
      });

      it("requests the file's url", async () => {
        const fetchImpl = okFetch();
        await ensureCached(file, { rawDir, fetchImpl });
        expect(fetchImpl).toHaveBeenCalledWith(file.url, expect.anything());
      });
    });

    describe("when the file is already cached", () => {
      beforeEach(async () => {
        await mkdir(join(rawDir, "pbp"), { recursive: true });
        await writeFile(join(rawDir, file.relativePath), "cached");
      });

      it("does not call fetch", async () => {
        const fetchImpl = okFetch();
        const result = await ensureCached(file, { rawDir, fetchImpl });
        expect(result.status).toBe("cached");
        expect(fetchImpl).not.toHaveBeenCalled();
      });

      it("re-downloads when forced", async () => {
        const result = await ensureCached(file, { rawDir, force: true, fetchImpl: okFetch("fresh") });
        expect(result.status).toBe("downloaded");
        expect(await readFile(join(rawDir, file.relativePath), "utf8")).toBe("fresh");
      });
    });

    describe("when a cached file is empty", () => {
      it("treats it as not cached", async () => {
        await mkdir(join(rawDir, "pbp"), { recursive: true });
        await writeFile(join(rawDir, file.relativePath), "");
        const result = await ensureCached(file, { rawDir, fetchImpl: okFetch() });
        expect(result.status).toBe("downloaded");
      });
    });

    describe("when the server returns an error status", () => {
      const notFound = vi.fn(
        async () => new Response("nope", { status: 404, statusText: "Not Found" }),
      ) as unknown as typeof fetch;

      it("throws a DownloadError naming the url and status", async () => {
        const error = await ensureCached(file, { rawDir, fetchImpl: notFound }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(DownloadError);
        expect(error).toMatchObject({ url: file.url, reason: "HTTP 404 Not Found" });
      });

      it("attempts the request only once", async () => {
        await ensureCached(file, { rawDir, fetchImpl: notFound }).catch(() => {});
        expect(notFound).toHaveBeenCalledTimes(1);
      });
    });

    describe("when the network request fails", () => {
      const blocked = vi.fn(async () => {
        throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND github.com") });
      }) as unknown as typeof fetch;

      it("includes the underlying cause in the reason", async () => {
        const error = await ensureCached(file, { rawDir, fetchImpl: blocked }).catch((e: unknown) => e);
        expect(error).toMatchObject({
          url: file.url,
          reason: "fetch failed: getaddrinfo ENOTFOUND github.com",
        });
      });

      it("leaves no file or partial download behind", async () => {
        await ensureCached(file, { rawDir, fetchImpl: blocked }).catch(() => {});
        const entries = await readdir(rawDir, { recursive: true });
        expect(entries.filter((e) => e.endsWith(".parquet") || e.endsWith(".partial"))).toEqual([]);
      });
    });
  });
});
