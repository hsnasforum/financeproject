import { NextResponse } from "next/server";
import { makeHttpError } from "@/lib/http/apiError";
import { getSnapshotOrNull } from "@/lib/publicApis/benefitsSnapshot";
import { paginateByCursor, rankBySimpleFind } from "@/lib/publicApis/gov24SimpleFind/matcher";
import { type Gov24SimpleFindInput } from "@/lib/publicApis/gov24SimpleFind/types";
import { buildOrgTypeCounts, classifyOrgType, type Gov24OrgType } from "@/lib/gov24/orgClassifier";
import { buildGov24CardFields } from "@/lib/gov24/cardFields";
import { attachFallback } from "@/lib/http/fallbackMeta";
import { normalizeSido } from "@/lib/regions/kr";
import { filterByResidence } from "@/lib/gov24/residenceHardFilter";
import { extractApplyLinks } from "@/lib/gov24/applyLinks";
import { getCachePolicy } from "../../../../lib/dataSources/cachePolicy";

function parsePageSize(value: string | null, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function parseCursor(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function parseOrgType(value: string | null): Gov24OrgType {
  if (value === "central" || value === "local" || value === "public" || value === "education") return value;
  return "all";
}

function parseBody(raw: unknown): Gov24SimpleFindInput | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const targetType = body.targetType;
  const region = body.region as Record<string, unknown> | undefined;
  const birth = body.birth as Record<string, unknown> | undefined;
  const incomeBracket = body.incomeBracket;
  const personalTraits = Array.isArray(body.personalTraits) ? body.personalTraits.filter((v): v is string => typeof v === "string") : [];
  const householdTraits = Array.isArray(body.householdTraits) ? body.householdTraits.filter((v): v is string => typeof v === "string") : [];
  const q = typeof body.q === "string" ? body.q : "";
  const sidoCanonical = normalizeSido(region?.sido?.toString().trim() ?? "");
  if (targetType !== "individual" && targetType !== "smallbiz" && targetType !== "corp") return null;
  if (!region || typeof region.sido !== "string" || typeof region.sigungu !== "string") return null;
  if (!sidoCanonical) return null;
  if (!birth || typeof birth.yyyymmdd !== "string" || (birth.gender !== "M" && birth.gender !== "F")) return null;
  if (incomeBracket !== "0_50" && incomeBracket !== "51_75" && incomeBracket !== "76_100" && incomeBracket !== "101_200" && incomeBracket !== "200_plus") return null;
  return {
    targetType,
    region: { sido: sidoCanonical, sigungu: region.sigungu.trim() },
    birth: { yyyymmdd: birth.yyyymmdd.trim(), gender: birth.gender },
    incomeBracket,
    personalTraits,
    householdTraits,
    q,
  };
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = parseCursor(searchParams.get("cursor"));
  const pageSize = parsePageSize(searchParams.get("pageSize"), 50);
  const orgType = parseOrgType(searchParams.get("orgType"));

  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json(
      {
        ok: false,
        meta: attachFallback({}, {
          mode: "LIVE",
          sourceKey: "gov24",
          reason: "input_invalid",
        }),
        error: makeHttpError("INPUT", "간편찾기 입력값이 올바르지 않습니다."),
      },
      { status: 400 },
    );
  }
  if (body.targetType !== "individual") {
    return NextResponse.json({
      ok: true,
      data: { items: [], totalMatched: 0, page: { cursor, pageSize, nextCursor: null, hasMore: false } },
      meta: attachFallback({ message: "개인/가구 대상만 우선 지원합니다." }, {
        mode: "CACHE",
        sourceKey: "gov24",
        reason: "target_type_not_supported",
      }),
    });
  }

  const snap = getSnapshotOrNull({ ttlMs: getCachePolicy("gov24").ttlMs });
  if (!snap) {
    return NextResponse.json({
      ok: true,
      data: { items: [], totalMatched: 0, page: { cursor, pageSize, nextCursor: null, hasMore: false } },
      meta: attachFallback({ generatedAt: null, snapshotTotal: 0 }, {
        mode: "CACHE",
        sourceKey: "gov24",
        reason: "snapshot_missing",
      }),
    });
  }

  const residenceItems = filterByResidence(snap.snapshot.items, {
    sido: body.region.sido,
    sigungu: body.region.sigungu,
  });

  const rankedAll = rankBySimpleFind(residenceItems, body);
  const matched = rankedAll.filter((item) => (item.simpleFindMatch?.score ?? 0) >= 1.5);
  const orgTypeCounts = buildOrgTypeCounts(matched);
  const filtered = orgType === "all" ? matched : matched.filter((item) => classifyOrgType(item.org) === orgType);
  const paged = paginateByCursor(filtered, cursor, pageSize);
  const mappedItems = paged.items.map((item) => {
    const apply = extractApplyLinks({
      serviceId: item.id,
      applyHow: item.applyHow,
      link: item.link,
      title: item.title,
      orgName: item.org,
    });
    return {
      ...item,
      orgType: classifyOrgType(item.org),
      card: buildGov24CardFields(item),
      applyLinks: apply.links,
      primaryApplyUrl: apply.primaryUrl,
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      items: mappedItems,
      totalMatched: filtered.length,
      page: {
        cursor,
        pageSize,
        nextCursor: paged.nextCursor,
        hasMore: paged.hasMore,
      },
      facets: {
        orgTypeCounts: {
          all: matched.length,
          ...orgTypeCounts,
        },
      },
    },
    meta: {
      generatedAt: snap.snapshot.meta.generatedAt,
      snapshotTotal: snap.snapshot.meta.totalItemsInSnapshot,
      residenceFilter: { before: snap.snapshot.items.length, after: residenceItems.length },
      fallback: {
        mode: "CACHE",
        sourceKey: "gov24",
        reason: "snapshot_read",
        generatedAt: snap.snapshot.meta.generatedAt,
      },
    },
  });
}
