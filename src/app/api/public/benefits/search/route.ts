import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { searchBenefits } from "@/lib/publicApis/providers/benefits";

const TTL_SECONDS = 2 * 24 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();

  if (!query) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "query를 입력하세요." } }, { status: 400 });
  }

  const key = makeApiCacheKey("benefits-search", { query });
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

  const result = await searchBenefits(query);
  if (!result.ok) return NextResponse.json(result, { status: 502 });

  const payload = { ok: true, data: { items: result.data, assumptions: { note: "혜택 수급 여부는 개인 조건 심사에 따라 달라집니다." } } };
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
