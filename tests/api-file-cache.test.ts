import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getApiCache, getApiCacheDiagnostics, makeApiCacheKey, setApiCache } from "../src/lib/cache/apiCache";

describe("api file cache", () => {
  const prevStore = process.env.API_CACHE_STORE;
  const dir = path.join(process.cwd(), "tmp", "api-cache");

  afterEach(() => {
    if (typeof prevStore === "string") process.env.API_CACHE_STORE = prevStore;
    else delete process.env.API_CACHE_STORE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes and reads cache entries from file store", () => {
    process.env.API_CACHE_STORE = "file";
    const key = makeApiCacheKey("test-file-cache", { a: 1 });
    setApiCache(key, { ok: true, value: 123 }, 60);

    const hit = getApiCache<{ ok: boolean; value: number }>(key);
    expect(hit).toEqual({ ok: true, value: 123 });

    const diagnostics = getApiCacheDiagnostics();
    expect(diagnostics.mode).toBe("file");
    expect(diagnostics.fileEntries).toBeGreaterThan(0);
  });

  it("treats expired entries as miss and does not leave tmp files", () => {
    process.env.API_CACHE_STORE = "file";
    const key = makeApiCacheKey("test-file-cache-expired", { a: 2 });
    setApiCache(key, { ok: true }, -1);

    const hit = getApiCache(key);
    expect(hit).toBeNull();

    const tmpFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")) : [];
    expect(tmpFiles.length).toBe(0);
  });
});
