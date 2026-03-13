import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  requireCsrf,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import {
  type ImportBatchMeta,
  listLegacyBatches,
  listStoredBatches,
} from "@/lib/planning/v3/transactions/store";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

type LegacyBatchRow = {
  id: string;
  createdAt: string;
  kind: "csv";
  fileName?: string;
  total: number;
  ok: number;
  failed: number;
};

function toMetaFromLegacy(batch: LegacyBatchRow): ImportBatchMeta {
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    source: "csv",
    rowCount: Math.max(0, Math.trunc(Number(batch.total) || 0)),
  };
}

function toLegacyFromMeta(meta: ImportBatchMeta, fileName?: string): LegacyBatchRow {
  const count = Math.max(0, Math.trunc(Number(meta.rowCount) || 0));
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    kind: "csv",
    ...(fileName ? { fileName } : {}),
    total: count,
    ok: count,
    failed: 0,
  };
}

function sortByCreatedAtDesc(items: ImportBatchMeta[]): ImportBatchMeta[] {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(left.createdAt);
    const rightTs = Date.parse(right.createdAt);
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    return right.id.localeCompare(left.id);
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

  try {
    const limit = asPositiveInt(url.searchParams.get("limit")) ?? 50;
    const [legacyListed, storedListed] = await Promise.all([
      listLegacyBatches({
        ...(limit ? { limit: Math.max(limit, 200) } : {}),
        ...(asString(url.searchParams.get("cursor")) ? { cursor: asString(url.searchParams.get("cursor")) } : {}),
      }),
      listStoredBatches(),
    ]);

    const legacyItems = legacyListed.items as LegacyBatchRow[];
    const legacyById = new Map(legacyItems.map((item) => [item.id, item]));
    const mergedById = new Map<string, ImportBatchMeta>();

    for (const item of legacyItems) {
      mergedById.set(item.id, toMetaFromLegacy(item));
    }
    for (const item of storedListed) {
      const existing = mergedById.get(item.id);
      if (!existing) {
        mergedById.set(item.id, item);
        continue;
      }
      const existingTs = Date.parse(existing.createdAt);
      const nextTs = Date.parse(item.createdAt);
      if (!Number.isFinite(existingTs) || (Number.isFinite(nextTs) && nextTs > existingTs)) {
        mergedById.set(item.id, item);
      }
    }

    const mergedMeta = sortByCreatedAtDesc([...mergedById.values()]).slice(0, limit);
    const items = mergedMeta.map((meta) => {
      const legacy = legacyById.get(meta.id);
      return legacy ?? toLegacyFromMeta(meta);
    });

    return NextResponse.json({
      ok: true,
      items,
      data: mergedMeta,
      ...(legacyListed.nextCursor ? { nextCursor: legacyListed.nextCursor } : {}),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "배치 목록 조회에 실패했습니다." } },
      { status: 500 },
    );
  }
}
