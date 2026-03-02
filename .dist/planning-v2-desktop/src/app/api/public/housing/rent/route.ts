import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { getHousingRentBenchmark } from "@/lib/publicApis/providers/housing";

const TTL_SECONDS = 14 * 24 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionCode = (searchParams.get("regionCode") ?? "11680").trim();
  const month = (searchParams.get("month") ?? new Date().toISOString().slice(0, 7).replace("-", "")).trim();
  const areaBand = (searchParams.get("areaBand") ?? "84").trim();
  const rentType = (searchParams.get("rentType") ?? "all").trim().toLowerCase();

  const key = makeApiCacheKey("housing-rent", { regionCode, month, areaBand, rentType });
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

  const result = await getHousingRentBenchmark(regionCode, month, areaBand);
  if (!result.ok) return NextResponse.json(result, { status: result.error.code === "CONFIG" ? 503 : 502 });

  const data = { ...result.data };
  if (rentType === "jeonse") {
    data.rentType = "JEONSE";
    data.monthlyMin = 0;
    data.monthlyMedian = 0;
    data.monthlyP75 = 0;
    data.monthlyMax = 0;
  } else if (rentType === "wolse") {
    data.rentType = "WOLSE";
  } else {
    data.rentType = data.rentType ?? "ALL";
  }

  const payload = {
    ok: true,
    data,
    assumptions: { note: "전월세 벤치마크는 참고용입니다. 개별 계약 조건에 따라 달라질 수 있습니다." },
  };
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
