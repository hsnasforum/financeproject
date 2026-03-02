import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { getHousingSalesBenchmark } from "@/lib/publicApis/providers/housing";

const TTL_SECONDS = 14 * 24 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionCode = (searchParams.get("regionCode") ?? "11680").trim();
  const month = (searchParams.get("month") ?? new Date().toISOString().slice(0, 7).replace("-", "")).trim();
  const areaBand = (searchParams.get("areaBand") ?? "84").trim();

  if (!/^\d{5}$/.test(regionCode) || !/^\d{6}$/.test(month)) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "regionCode(5자리), month(YYYYMM)을 확인하세요." } }, { status: 400 });
  }

  const key = makeApiCacheKey("housing-sales", { regionCode, month, areaBand });
  const hit = getApiCacheRecord(key);
  if (hit) {
    const payload = hit.entry.payload as Record<string, unknown>;
    return NextResponse.json({
      ...payload,
      meta: {
        ...(typeof payload.meta === "object" && payload.meta !== null ? payload.meta : {}),
        cache: "hit",
        key,
        fetchedAt: hit.entry.fetchedAt,
        expiresAt: hit.entry.expiresAt,
      },
    });
  }

  const result = await getHousingSalesBenchmark(regionCode, month, areaBand);
  if (!result.ok) return NextResponse.json(result, { status: result.error.code === "CONFIG" ? 503 : 502 });

  const payload = { ok: true, data: result.data, assumptions: { note: "실거래 요약 통계는 참고 지표이며 개별 조건에 따라 달라질 수 있습니다." } };
  const entry = setApiCache(key, payload, TTL_SECONDS);
  return NextResponse.json({
    ...payload,
    meta: {
      cache: "miss",
      key,
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    },
  });
}
