import fs from "node:fs";
import path from "node:path";
import { getCachePolicy } from "../dataSources/cachePolicy";
import { type BenefitCandidate } from "./contracts/types";

type SnapshotMeta = {
  generatedAt: string;
  totalItemsInSnapshot: number;
  upstreamTotalCount?: number;
  hardCapPages?: number;
  effectivePerPage?: number;
  rows?: number;
  neededPagesEstimate?: number;
  requestedMaxPages?: number | "auto";
  effectiveMaxPages?: number;
  pagesFetched?: number;
  rowsFetched?: number;
  completionRate?: number;
  truncatedByHardCap?: boolean;
  uniqueCount?: number;
  dedupedCount?: number;
  paginationSuspected?: boolean;
  source?: string;
};

type BenefitsSnapshot = {
  meta: SnapshotMeta;
  items: BenefitCandidate[];
};

type SnapshotFileIdentity = {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  ino: number;
};

type CachedSnapshot = {
  identity: SnapshotFileIdentity;
  snapshot: BenefitsSnapshot;
};

const memoryCache = new Map<string, CachedSnapshot>();
const BENEFITS_TTL_MS = getCachePolicy("benefits").ttlMs;

function defaultSnapshotPath(): string {
  return path.join(process.cwd(), ".data", "benefits_snapshot.json");
}

function clampText(value: string | undefined, maxLen: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trim()}...`;
}

function sanitizeItem(item: BenefitCandidate): BenefitCandidate {
  return {
    ...item,
    summary: clampText(item.summary, 1200) ?? item.summary,
    applyHow: clampText(item.applyHow, 1200),
    org: clampText(item.org, 500),
    eligibilityHints: (item.eligibilityHints ?? []).map((line) => clampText(line, 400) ?? "").filter(Boolean).slice(0, 20),
    eligibilityExcerpt: clampText(item.eligibilityExcerpt, 1200),
    eligibilityText: clampText(item.eligibilityText, 2000),
    link: clampText(item.link, 600),
    contact: clampText(item.contact, 300),
  };
}

function readSnapshotFileIdentity(filePath: string): SnapshotFileIdentity | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return {
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      size: stat.size,
      ino: stat.ino,
    };
  } catch {
    return null;
  }
}

function isSameFileIdentity(left: SnapshotFileIdentity, right: SnapshotFileIdentity): boolean {
  return left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.size === right.size
    && left.ino === right.ino;
}

function loadSnapshotEntry(filePath: string): {
  snapshot: BenefitsSnapshot;
  fromCache: "memory" | "disk";
} | null {
  const currentIdentity = readSnapshotFileIdentity(filePath);
  if (!currentIdentity) {
    memoryCache.delete(filePath);
    return null;
  }

  const cached = memoryCache.get(filePath);
  if (cached && isSameFileIdentity(cached.identity, currentIdentity)) {
    return { snapshot: cached.snapshot, fromCache: "memory" };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const beforeRead = readSnapshotFileIdentity(filePath);
    if (!beforeRead) break;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const afterRead = readSnapshotFileIdentity(filePath);
      if (!afterRead || !isSameFileIdentity(beforeRead, afterRead)) continue;

      const parsed = JSON.parse(raw) as BenefitsSnapshot;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items) || !parsed.meta?.generatedAt) break;
      memoryCache.set(filePath, { identity: afterRead, snapshot: parsed });
      return { snapshot: parsed, fromCache: "disk" };
    } catch {
      break;
    }
  }

  memoryCache.delete(filePath);
  return null;
}

export function loadSnapshot(filePath = defaultSnapshotPath()): BenefitsSnapshot | null {
  return loadSnapshotEntry(filePath)?.snapshot ?? null;
}

export function getSnapshotOrNull(params?: { filePath?: string; ttlMs?: number }): { snapshot: BenefitsSnapshot; fromCache: "memory" | "disk"; isStale: boolean } | null {
  const filePath = params?.filePath ?? defaultSnapshotPath();
  const ttlMs = Math.max(60_000, params?.ttlMs ?? BENEFITS_TTL_MS);
  const loaded = loadSnapshotEntry(filePath);
  if (!loaded) return null;
  return {
    snapshot: loaded.snapshot,
    fromCache: loaded.fromCache,
    isStale: !isSnapshotFresh(loaded.snapshot.meta.generatedAt, ttlMs),
  };
}

export function saveSnapshot(filePath: string, snapshot: BenefitsSnapshot): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(snapshot), "utf-8");
  fs.renameSync(tempPath, filePath);
  const identity = readSnapshotFileIdentity(filePath);
  if (identity) memoryCache.set(filePath, { identity, snapshot });
  else memoryCache.delete(filePath);
}

export function isSnapshotFresh(generatedAt: string, ttlMs: number): boolean {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) return false;
  return Date.now() - generatedMs <= ttlMs;
}

export async function getOrBuildSnapshot(params: {
  filePath?: string;
  ttlMs?: number;
  forceRefresh?: boolean;
  build: () => Promise<{ items: BenefitCandidate[]; meta: Omit<SnapshotMeta, "generatedAt" | "totalItemsInSnapshot"> }>;
}): Promise<{ snapshot: BenefitsSnapshot; fromCache: "memory" | "disk" | "built" }> {
  const filePath = params.filePath ?? defaultSnapshotPath();
  const ttlMs = Math.max(60_000, params.ttlMs ?? BENEFITS_TTL_MS);

  if (!params.forceRefresh) {
    const loaded = loadSnapshotEntry(filePath);
    if (loaded && isSnapshotFresh(loaded.snapshot.meta.generatedAt, ttlMs)) {
      return { snapshot: loaded.snapshot, fromCache: loaded.fromCache };
    }
  }

  const built = await params.build();
  const now = new Date().toISOString();
  const snapshot: BenefitsSnapshot = {
    meta: {
      generatedAt: now,
      totalItemsInSnapshot: built.items.length,
      ...built.meta,
      source: "benefits-search-scan-all",
    },
    items: built.items.map((item) => sanitizeItem(item)),
  };
  saveSnapshot(filePath, snapshot);
  return { snapshot, fromCache: "built" };
}

export async function buildSnapshot(params: {
  filePath?: string;
  build: () => Promise<{ items: BenefitCandidate[]; meta: Omit<SnapshotMeta, "generatedAt" | "totalItemsInSnapshot"> }>;
}): Promise<{ snapshot: BenefitsSnapshot; fromCache: "built" }> {
  const filePath = params.filePath ?? defaultSnapshotPath();
  const built = await params.build();
  const now = new Date().toISOString();
  const snapshot: BenefitsSnapshot = {
    meta: {
      generatedAt: now,
      totalItemsInSnapshot: built.items.length,
      ...built.meta,
      source: "benefits-search-scan-all",
    },
    items: built.items.map((item) => sanitizeItem(item)),
  };
  saveSnapshot(filePath, snapshot);
  return { snapshot, fromCache: "built" };
}
