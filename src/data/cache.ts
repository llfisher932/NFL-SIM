import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { CachedFile, RawFile } from "../types/data";

export class DownloadError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`download failed: ${url} (${reason})`);
    this.name = "DownloadError";
  }
}

export interface CacheOptions {
  rawDir: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

async function isCached(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
  return `${err.message}${cause}`;
}

async function download(url: string, destination: string, fetchImpl: typeof fetch): Promise<void> {
  const partial = `${destination}.partial`;
  try {
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new DownloadError(url, `HTTP ${response.status} ${response.statusText}`.trim());
    }
    await mkdir(dirname(destination), { recursive: true });
    const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
    await pipeline(body, createWriteStream(partial));
    await rename(partial, destination);
  } catch (err) {
    await rm(partial, { force: true });
    throw err instanceof DownloadError ? err : new DownloadError(url, describeError(err));
  }
}

export async function ensureCached(file: RawFile, options: CacheOptions): Promise<CachedFile> {
  const path = join(options.rawDir, file.relativePath);
  if (!options.force && (await isCached(path))) {
    return { file, path, status: "cached" };
  }
  await download(file.url, path, options.fetchImpl ?? fetch);
  return { file, path, status: "downloaded" };
}
