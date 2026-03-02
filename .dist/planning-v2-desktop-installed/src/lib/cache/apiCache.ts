import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type CacheEntry = {
  key: string;
  fetchedAt: string;
  expiresAt: string;
  status: number;
  contentType?: string;
  payload: unknown;
  meta?: {
    upstream?: string;
    params?: Record<string, string>;
  };
};

type CacheLookup = {
  entry: CacheEntry;
  source: "memory" | "file";
};

const memoryStore = new Map<string, CacheEntry>();
const CACHE_DIR = (process.env.API_FILE_CACHE_DIR ?? "").trim()
  ? path.resolve(process.cwd(), (process.env.API_FILE_CACHE_DIR ?? "").trim())
  : path.join(process.cwd(), "tmp", "api-cache");

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableSortObject(obj[key]);
      return acc;
    }, {});
}

function nowIso(): string {
  return new Date().toISOString();
}

function isExpired(expiresAtIso: string): boolean {
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) return true;
  return Date.now() > expiresAt;
}

function getStoreMode(): "memory" | "file" | "hybrid" {
  const forced = (process.env.API_CACHE_STORE ?? "").trim().toLowerCase();
  if (forced === "memory") return "memory";
  if (forced === "file") return "file";
  if (forced === "hybrid") return "hybrid";
  if ((process.env.NODE_ENV ?? "development") !== "production") return "hybrid";
  return "memory";
}

function filePathForKey(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function readFileEntry(key: string): CacheEntry | null {
  const filePath = filePathForKey(key);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.key !== key) return null;
    if (isExpired(parsed.expiresAt)) {
      fs.rmSync(filePath, { force: true });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeFileEntry(entry: CacheEntry): void {
  const filePath = filePathForKey(entry.key);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(entry), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function makeApiCacheKey(apiName: string, params: Record<string, unknown>, version = "v1"): string {
  const payload = JSON.stringify({ apiName, params: stableSortObject(params), version });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function getApiCacheRecord(key: string): CacheLookup | null {
  const mode = getStoreMode();
  const memHit = memoryStore.get(key);
  if (memHit) {
    if (isExpired(memHit.expiresAt)) {
      memoryStore.delete(key);
    } else {
      return { entry: memHit, source: "memory" };
    }
  }

  if (mode === "memory") return null;
  const fileHit = readFileEntry(key);
  if (!fileHit) return null;
  if (mode === "hybrid") {
    memoryStore.set(key, fileHit);
  }
  return { entry: fileHit, source: "file" };
}

export function getApiCache<T>(key: string): T | null {
  const hit = getApiCacheRecord(key);
  if (!hit) return null;
  return hit.entry.payload as T;
}

export function setApiCache<T>(
  key: string,
  payload: T,
  ttlSeconds: number,
  options?: { status?: number; contentType?: string; meta?: CacheEntry["meta"] },
): CacheEntry {
  const fetchedAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const entry: CacheEntry = {
    key,
    fetchedAt,
    expiresAt,
    status: options?.status ?? 200,
    contentType: options?.contentType,
    payload,
    meta: options?.meta,
  };

  const mode = getStoreMode();
  if (mode === "memory" || mode === "hybrid") {
    memoryStore.set(key, entry);
  }
  if (mode === "file" || mode === "hybrid") {
    writeFileEntry(entry);
  }
  return entry;
}

export function getApiCacheMeta(key: string): { cache: "hit" | "miss"; source?: "memory" | "file"; fetchedAt?: string; expiresAt?: string } {
  const hit = getApiCacheRecord(key);
  if (!hit) return { cache: "miss" };
  return {
    cache: "hit",
    source: hit.source,
    fetchedAt: hit.entry.fetchedAt,
    expiresAt: hit.entry.expiresAt,
  };
}

export function getApiCacheDiagnostics(): { mode: "memory" | "file" | "hybrid"; cacheDir: string; memoryEntries: number; fileEntries: number; fileBytes: number } {
  const mode = getStoreMode();
  let fileEntries = 0;
  let fileBytes = 0;

  if ((mode === "file" || mode === "hybrid") && fs.existsSync(CACHE_DIR)) {
    const files = fs.readdirSync(CACHE_DIR).filter((name) => name.endsWith(".json"));
    fileEntries = files.length;
    fileBytes = files.reduce((sum, fileName) => {
      try {
        return sum + fs.statSync(path.join(CACHE_DIR, fileName)).size;
      } catch {
        return sum;
      }
    }, 0);
  }

  return {
    mode,
    cacheDir: CACHE_DIR,
    memoryEntries: memoryStore.size,
    fileEntries,
    fileBytes,
  };
}
