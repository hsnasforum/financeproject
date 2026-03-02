import { fetchLiveFinlife } from "./fetchLive";
import { fetchMockFinlife } from "./fetchMock";
import { extractPagingMeta } from "./meta";
import { normalizeFinlifeProducts } from "./normalize";
import { saveFinlifeSnapshot, type FinlifeSnapshotKind, type FinlifeSnapshotMeta } from "./snapshot";
import { type FinlifeMode, type NormalizedProduct } from "./types";

type SyncResult =
  | { ok: true; kind: FinlifeSnapshotKind; meta: FinlifeSnapshotMeta }
  | { ok: false; kind: FinlifeSnapshotKind; error: { code: string; message: string; upstreamStatus?: number | null } };

function parseMode(): "auto" | FinlifeMode {
  const mode = (process.env.FINLIFE_MODE ?? "auto").trim();
  if (mode === "mock" || mode === "live" || mode === "fixture") return mode;
  return "auto";
}

function parseFailOpenToMock(): boolean {
  return (process.env.FINLIFE_FAIL_OPEN_TO_MOCK ?? "0").trim() === "1";
}

function parseTopGroupList(): string[] {
  const raw = (process.env.FINLIFE_TOPFIN_GRP_LIST ?? "020000").trim();
  const list = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return list.length > 0 ? [...new Set(list)] : ["020000"];
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseHttpStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/HTTP\s*(\d{3})/i);
  if (!match?.[1]) return null;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : null;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLiveWithRetry(kind: FinlifeSnapshotKind, topFinGrpNo: string, pageNo: number): Promise<unknown> {
  let attempt = 0;
  while (true) {
    try {
      return await fetchLiveFinlife(kind, { topFinGrpNo, pageNo, scan: "page", scanMaxPages: "auto" });
    } catch (error) {
      const status = parseHttpStatus(error);
      const retryable = status === 429 || (status !== null && status >= 500);
      if (!retryable || attempt >= 2) throw error;
      const delayMs = 2000 * (2 ** attempt);
      attempt += 1;
      await wait(delayMs);
    }
  }
}

function mergeProductsAcrossGroups(groups: Array<{ topFinGrpNo: string; data: NormalizedProduct[] }>): {
  items: NormalizedProduct[];
  duplicateAcrossGroupsCount: number;
} {
  const seenByCode = new Map<string, { group: string; item: NormalizedProduct }>();
  let duplicateAcrossGroupsCount = 0;

  for (const group of groups) {
    for (const item of group.data) {
      const existing = seenByCode.get(item.fin_prdt_cd);
      if (!existing) {
        seenByCode.set(item.fin_prdt_cd, {
          group: group.topFinGrpNo,
          item: {
            ...item,
            options: [...item.options],
          },
        });
        continue;
      }

      if (existing.group !== group.topFinGrpNo) {
        duplicateAcrossGroupsCount += 1;
      }

      const optionsByKey = new Map<string, (typeof item.options)[number]>();
      for (const opt of existing.item.options) {
        const key = `${opt.save_trm ?? ""}:${opt.intr_rate ?? ""}:${opt.intr_rate2 ?? ""}`;
        optionsByKey.set(key, opt);
      }
      for (const opt of item.options) {
        const key = `${opt.save_trm ?? ""}:${opt.intr_rate ?? ""}:${opt.intr_rate2 ?? ""}`;
        if (!optionsByKey.has(key)) optionsByKey.set(key, opt);
      }
      existing.item.options = [...optionsByKey.values()];
      if (!existing.item.best && item.best) existing.item.best = item.best;
      if (!existing.item.kor_co_nm && item.kor_co_nm) existing.item.kor_co_nm = item.kor_co_nm;
      if (!existing.item.fin_prdt_nm && item.fin_prdt_nm) existing.item.fin_prdt_nm = item.fin_prdt_nm;
    }
  }

  return {
    items: [...seenByCode.values()].map((entry) => entry.item),
    duplicateAcrossGroupsCount,
  };
}

type CompletionInput = {
  groups: string[];
  pagesFetchedByGroup: Record<string, number>;
  maxPageByGroup: Record<string, number | null>;
  lastHasNextByGroup: Record<string, boolean>;
  hardCapPages: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function computeCompletion({
  groups,
  pagesFetchedByGroup,
  maxPageByGroup,
  lastHasNextByGroup,
  hardCapPages,
}: CompletionInput): { completionRate: number; truncatedByHardCap: boolean } {
  if (groups.length === 0) return { completionRate: 0, truncatedByHardCap: false };

  const rates: number[] = [];
  let truncatedByHardCap = false;

  for (const group of groups) {
    const pagesFetched = pagesFetchedByGroup[group] ?? 0;
    const maxPage = maxPageByGroup[group];
    const lastHasNext = lastHasNextByGroup[group] ?? false;

    let groupTruncated = false;
    if (typeof maxPage === "number" && Number.isFinite(maxPage) && maxPage > 0) {
      groupTruncated = maxPage > hardCapPages && pagesFetched >= hardCapPages;
    } else {
      groupTruncated = pagesFetched >= hardCapPages && lastHasNext;
    }
    if (groupTruncated) truncatedByHardCap = true;

    if (typeof maxPage === "number" && Number.isFinite(maxPage) && maxPage > 0) {
      rates.push(clamp01(pagesFetched / maxPage));
      continue;
    }
    rates.push(groupTruncated ? 0.9 : 1);
  }

  return {
    completionRate: rates.length > 0 ? Math.min(...rates) : 0,
    truncatedByHardCap,
  };
}

export async function runFinlifeSnapshotSync(kind: FinlifeSnapshotKind): Promise<SyncResult> {
  const mode = parseMode();
  const topGroups = parseTopGroupList();
  const ttlMs = parsePositiveInt(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS, 43_200, 60, 7 * 24 * 60 * 60) * 1000;
  const hardCapPages = parsePositiveInt(process.env.FINLIFE_SCAN_HARD_CAP_PAGES, 200, 1, 10_000);
  const failOpenToMock = parseFailOpenToMock();

  const pagesFetchedByGroup: Record<string, number> = {};
  const maxPageByGroup: Record<string, number | null> = {};
  const lastHasNextByGroup: Record<string, boolean> = {};
  const groupRows: Array<{ topFinGrpNo: string; data: NormalizedProduct[]; totalCount?: number }> = [];
  let fallbackUsed = false;
  let source: "finlife" | "mock" = "finlife";
  let lastUpstreamStatus: number | null = null;

  try {
    for (const topFinGrpNo of topGroups) {
      let pageNo = 1;
      let scanned = 0;
      let groupTotalCount: number | undefined;
      const groupData: NormalizedProduct[] = [];

      while (pageNo <= hardCapPages) {
        let raw: unknown;
        let pageSource: "finlife" | "mock" = "finlife";

        if (mode === "mock") {
          raw = fetchMockFinlife(kind);
          pageSource = "mock";
        } else {
          const shouldTryLive = mode === "live" || mode === "auto";
          if (shouldTryLive) {
            try {
              raw = await fetchLiveWithRetry(kind, topFinGrpNo, pageNo);
            } catch (error) {
              lastUpstreamStatus = parseHttpStatus(error);
              if (!failOpenToMock) {
                return {
                  ok: false,
                  kind,
                  error: {
                    code: "UPSTREAM_FETCH_FAILED",
                    message: "FINLIFE upstream fetch failed",
                    upstreamStatus: lastUpstreamStatus,
                  },
                };
              }
              raw = fetchMockFinlife(kind);
              pageSource = "mock";
            }
          } else {
            raw = fetchMockFinlife(kind);
            pageSource = "mock";
          }
        }

        if (pageSource === "mock") {
          fallbackUsed = true;
          source = "mock";
        }

        const root = (raw as { result?: { baseList?: unknown[]; optionList?: unknown[] } })?.result ?? {};
        const baseList = Array.isArray(root.baseList) ? root.baseList : [];
        const optionList = Array.isArray(root.optionList) ? root.optionList : [];
        const normalized = normalizeFinlifeProducts({ baseList, optionList });
        const pageMeta = extractPagingMeta(raw);

        if (pageNo === 1 && typeof pageMeta.totalCount === "number") groupTotalCount = pageMeta.totalCount;

        scanned += 1;
        pagesFetchedByGroup[topFinGrpNo] = scanned;
        groupData.push(...normalized);

        const hasNext =
          typeof pageMeta.nowPage === "number" && typeof pageMeta.maxPage === "number"
            ? pageMeta.nowPage < pageMeta.maxPage
            : normalized.length > 0;
        if (typeof pageMeta.maxPage === "number") maxPageByGroup[topFinGrpNo] = pageMeta.maxPage;
        lastHasNextByGroup[topFinGrpNo] = hasNext;

        if (!hasNext || pageSource === "mock") break;
        pageNo += 1;
      }
      if (maxPageByGroup[topFinGrpNo] === undefined) maxPageByGroup[topFinGrpNo] = null;

      groupRows.push({ topFinGrpNo, data: groupData, totalCount: groupTotalCount });
    }

    const merged = mergeProductsAcrossGroups(groupRows);
    const totalOptions = merged.items.reduce((sum, item) => sum + item.options.length, 0);
    const completion = computeCompletion({
      groups: topGroups,
      pagesFetchedByGroup,
      maxPageByGroup,
      lastHasNextByGroup,
      hardCapPages,
    });

    const meta: FinlifeSnapshotMeta = {
      generatedAt: new Date().toISOString(),
      ttlMs,
      configuredGroups: topGroups,
      groupsScanned: topGroups,
      pagesFetchedByGroup,
      totalProducts: merged.items.length,
      totalOptions,
      completionRate: completion.completionRate,
      truncatedByHardCap: completion.truncatedByHardCap,
      source,
      fallbackUsed,
      lastUpstreamStatus,
      duplicateAcrossGroupsCount: merged.duplicateAcrossGroupsCount,
      note: topGroups.length <= 1 ? "업권 범위가 좁을 수 있음. pnpm finlife:probe 권장" : undefined,
    };

    saveFinlifeSnapshot(kind, { meta, items: merged.items });
    return { ok: true, kind, meta };
  } catch (error) {
    return {
      ok: false,
      kind,
      error: {
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "finlife sync failed",
        upstreamStatus: lastUpstreamStatus,
      },
    };
  }
}

export const __test__ = {
  mergeProductsAcrossGroups,
  computeCompletion,
};
