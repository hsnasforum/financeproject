import { NextResponse } from "next/server";
import { getSnapshotOrNull } from "@/lib/publicApis/benefitsSnapshot";
import { buildExternalApiFailure, statusFromExternalApiErrorCode } from "@/lib/publicApis/errorContract";
import { buildGov24SearchPayload } from "@/lib/publicApis/gov24SearchView";
import { isGov24SyncInFlight } from "@/lib/publicApis/gov24SyncState";
import { classifyOrgType } from "@/lib/gov24/orgClassifier";
import { isRegionMatch } from "@/lib/gov24/regionFilter";
import { normalizeSido } from "@/lib/regions/kr";

function parsePageSize(value: string | null): { value: number; valid: boolean } {
  if (value === null) return { value: 50, valid: true };
  const trimmed = value.trim();
  if (!trimmed) return { value: 50, valid: true };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    return { value: 50, valid: false };
  }
  return { value: Math.trunc(parsed), valid: true };
}

function parseCursor(value: string | null): { value: number; valid: boolean } {
  if (value === null) return { value: 0, valid: true };
  const trimmed = value.trim();
  if (!trimmed) return { value: 0, valid: true };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { value: 0, valid: false };
  }
  return { value: Math.trunc(parsed), valid: true };
}

function toCompletionRate(meta: Record<string, unknown>): number | undefined {
  const direct = meta.completionRate;
  if (typeof direct === "number") return direct;
  const upstreamTotal = meta.upstreamTotalCount;
  const uniqueCount = meta.uniqueCount;
  if (typeof upstreamTotal === "number" && upstreamTotal > 0 && typeof uniqueCount === "number") {
    return Math.min(1, uniqueCount / upstreamTotal);
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();
    const selectedSido = normalizeSido(searchParams.get("sido") ?? "") ?? null;
    const selectedSigungu = (searchParams.get("sigungu") ?? "").trim() || null;
    const cursorParsed = parseCursor(searchParams.get("cursor"));
    const pageSizeParsed = parsePageSize(searchParams.get("pageSize"));
    if (!cursorParsed.valid) {
      return NextResponse.json(
        buildExternalApiFailure({ code: "INPUT", message: "cursor는 0 이상의 정수여야 합니다." }),
        { status: statusFromExternalApiErrorCode("INPUT") },
      );
    }
    if (!pageSizeParsed.valid) {
      return NextResponse.json(
        buildExternalApiFailure({ code: "INPUT", message: "pageSize는 1~200 범위의 정수여야 합니다." }),
        { status: statusFromExternalApiErrorCode("INPUT") },
      );
    }
    const cursor = cursorParsed.value;
    const pageSize = pageSizeParsed.value;
    const snapshotTtlMs = 24 * 60 * 60 * 1000;

    const snap = getSnapshotOrNull({ ttlMs: snapshotTtlMs });
    if (!snap) {
      return NextResponse.json({
        ok: true,
        data: {
          items: [],
          totalMatched: 0,
          page: { cursor, pageSize, nextCursor: null, hasMore: false },
        },
        meta: {
          snapshot: null,
          sync: { state: isGov24SyncInFlight() ? "syncing" : "needs_sync" },
        },
      });
    }

    const completionRate = toCompletionRate(snap.snapshot.meta as Record<string, unknown>);
    const regionFiltered = snap.snapshot.items.filter((item) =>
      isRegionMatch({
        query,
        selectedSido,
        selectedSigungu,
        itemRegionScope: item.region.scope,
        itemRegionTags: item.region.tags,
        itemSido: item.region.sido ?? null,
        itemSigungu: item.region.sigungu ?? null,
        title: item.title,
        orgName: item.org,
        orgType: classifyOrgType(item.org),
      }),
    );

    const payload = buildGov24SearchPayload(regionFiltered, { query, cursor, pageSize }, {
      ...snap.snapshot.meta,
    });

    return NextResponse.json({
      ok: true,
      data: {
        items: payload.data.items,
        totalMatched: payload.data.totalMatched,
        page: payload.data.page,
      },
      meta: {
        snapshot: {
          totalItems: snap.snapshot.meta.totalItemsInSnapshot,
          completionRate,
          generatedAt: snap.snapshot.meta.generatedAt,
          hardCapPages: snap.snapshot.meta.hardCapPages,
          effectivePerPage: snap.snapshot.meta.effectivePerPage,
          neededPagesEstimate: snap.snapshot.meta.neededPagesEstimate,
          effectiveMaxPages: snap.snapshot.meta.effectiveMaxPages,
          pagesFetched: snap.snapshot.meta.pagesFetched,
          truncatedByHardCap: snap.snapshot.meta.truncatedByHardCap,
          uniqueCount: snap.snapshot.meta.uniqueCount,
        },
        sync: {
          state: isGov24SyncInFlight()
            ? "syncing"
            : completionRate !== undefined && completionRate >= 0.95
              ? "ready"
              : "needs_sync",
        },
      },
    });
  } catch {
    return NextResponse.json(
      buildExternalApiFailure({ code: "INTERNAL", message: "GOV24 검색 API 처리 중 오류가 발생했습니다." }),
      { status: statusFromExternalApiErrorCode("INTERNAL") },
    );
  }
}
