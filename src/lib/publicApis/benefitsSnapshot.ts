import fs from "node:fs";
import path from "node:path";
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

const memoryCache = new Map<string, BenefitsSnapshot>();

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

export function loadSnapshot(filePath = defaultSnapshotPath()): BenefitsSnapshot | null {
  const cached = memoryCache.get(filePath);
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BenefitsSnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items) || !parsed.meta?.generatedAt) return null;
    memoryCache.set(filePath, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function getSnapshotOrNull(params?: { filePath?: string; ttlMs?: number }): { snapshot: BenefitsSnapshot; fromCache: "memory" | "disk"; isStale: boolean } | null {
  const filePath = params?.filePath ?? defaultSnapshotPath();
  const ttlMs = Math.max(60_000, params?.ttlMs ?? 24 * 60 * 60 * 1000);
  const mem = memoryCache.get(filePath);
  if (mem) {
    return { snapshot: mem, fromCache: "memory", isStale: !isSnapshotFresh(mem.meta.generatedAt, ttlMs) };
  }
  const disk = loadSnapshot(filePath);
  if (!disk) return null;
  return { snapshot: disk, fromCache: "disk", isStale: !isSnapshotFresh(disk.meta.generatedAt, ttlMs) };
}

export function saveSnapshot(filePath: string, snapshot: BenefitsSnapshot): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(snapshot), "utf-8");
  fs.renameSync(tempPath, filePath);
  memoryCache.set(filePath, snapshot);
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
  const ttlMs = Math.max(60_000, params.ttlMs ?? 24 * 60 * 60 * 1000);

  if (!params.forceRefresh) {
    const mem = memoryCache.get(filePath);
    if (mem && isSnapshotFresh(mem.meta.generatedAt, ttlMs)) return { snapshot: mem, fromCache: "memory" };
    const disk = loadSnapshot(filePath);
    if (disk && isSnapshotFresh(disk.meta.generatedAt, ttlMs)) return { snapshot: disk, fromCache: "disk" };
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
