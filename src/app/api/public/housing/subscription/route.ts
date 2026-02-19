import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { listSubscriptionNotices } from "@/lib/publicApis/providers/subscription";

const TTL_SECONDS = 12 * 60 * 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = (searchParams.get("region") ?? "").trim();

  const key = makeApiCacheKey("housing-subscription", { region });
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

  const result = await listSubscriptionNotices(region);
  if (!result.ok) return NextResponse.json(result, { status: 502 });

  const payload = {
    ok: true,
    data: {
      items: result.data,
      assumptions: { note: "공고 일정은 변동될 수 있으므로 최종 공고문을 확인하세요." },
    },
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
