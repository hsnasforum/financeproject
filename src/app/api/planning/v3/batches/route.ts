import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { ForbiddenDraftKeyError, assertNoForbiddenDraftKeys } from "@/lib/planning/v3/service/forbiddenDraftKeys";
import {
  getBatchSummary,
  type ImportBatchMeta,
  listLegacyBatches,
  listStoredBatchListCandidates,
  toStoredFirstPublicImportBatchMeta,
} from "@/lib/planning/v3/batches/store";

type LegacyBatchRow = {
  id: string;
  createdAt: string;
  kind: "csv";
  total: number;
};

type MergedBatchListMeta = {
  meta: ImportBatchMeta;
  metadataSource: "stored" | "synthetic" | "legacy-derived";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

function toMetaFromLegacy(batch: LegacyBatchRow): ImportBatchMeta {
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    source: "csv",
    rowCount: Math.max(0, Math.trunc(Number(batch.total) || 0)),
  };
}

function sortByCreatedAtDesc(items: MergedBatchListMeta[]): MergedBatchListMeta[] {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(left.meta.createdAt);
    const rightTs = Date.parse(right.meta.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return left.meta.id.localeCompare(right.meta.id);
  });
}

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
    const csrf = asString(new URL(request.url).searchParams.get("csrf"));
    requireCsrf(request, { csrf }, { allowWhenCookieMissing: true });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const limit = asPositiveInt(url.searchParams.get("limit")) ?? 50;

  try {
    const [legacyListed, storedListed] = await Promise.all([
      listLegacyBatches({ limit: Math.max(limit, 200) }),
      listStoredBatchListCandidates(),
    ]);

    const legacyById = new Map((legacyListed.items as LegacyBatchRow[]).map((item) => [item.id, toMetaFromLegacy(item)]));
    const mergedById = new Map<string, MergedBatchListMeta>();

    for (const row of legacyById.values()) {
      mergedById.set(row.id, {
        meta: row,
        metadataSource: "legacy-derived",
      });
    }
    for (const row of storedListed) {
      const existing = mergedById.get(row.meta.id);
      if (!existing) {
        mergedById.set(row.meta.id, row);
        continue;
      }
      const existingTs = Date.parse(existing.meta.createdAt);
      const nextTs = Date.parse(row.meta.createdAt);
      if (!Number.isFinite(existingTs) || (Number.isFinite(nextTs) && nextTs > existingTs)) {
        mergedById.set(row.meta.id, row);
      }
    }

    const mergedMeta = sortByCreatedAtDesc([...mergedById.values()]).slice(0, limit);
    // Batch center follows summary-style public metadata exposure:
    // hidden createdAt stays omitted instead of downgrading to "".
    const summaryRows = await Promise.all(mergedMeta.map(async (row) => {
      try {
        const summary = await getBatchSummary(row.meta.id);
        return {
          batchId: row.meta.id,
          ...(asString(summary.createdAt) ? { createdAt: asString(summary.createdAt) } : {}),
          stats: {
            months: summary.range?.months ?? summary.monthly.length,
            txns: summary.counts.txns,
            unassignedCategory: summary.counts.unassignedCategory,
            transfers: summary.counts.transfers,
          },
        };
      } catch {
        const publicMeta = toStoredFirstPublicImportBatchMeta({
          meta: row.meta,
          metadataSource: row.metadataSource,
        });
        return {
          batchId: row.meta.id,
          ...(asString(publicMeta.createdAt) ? { createdAt: asString(publicMeta.createdAt) } : {}),
        };
      }
    }));

    const payload = {
      ok: true,
      data: summaryRows,
    };
    assertNoForbiddenDraftKeys(payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ForbiddenDraftKeyError) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "배치 응답 데이터 검증에 실패했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
