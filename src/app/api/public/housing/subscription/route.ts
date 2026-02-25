import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { listSubscriptionNotices } from "@/lib/publicApis/providers/subscription";

const TTL_SECONDS = 12 * 60 * 60;

function statusByCode(code: string): number {
  if (code === "INPUT" || code === "INVALID_DATE_FORMAT") return 400;
  if (code === "ENV_MISSING" || code === "ENV_INVALID_URL" || code === "ENV_INCOMPLETE_URL" || code === "ENV_DOC_URL") return 400;
  if (code === "NO_DATA") return 404;
  return 502;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = (searchParams.get("region") ?? "").trim();
    const mode = (searchParams.get("mode") ?? "search").trim().toLowerCase();
    const deep = (searchParams.get("scan") ?? "").trim().toLowerCase() === "deep";
    const from = (searchParams.get("from") ?? "").trim();
    const to = (searchParams.get("to") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();
    const houseType = ((searchParams.get("houseType") ?? "apt").trim().toLowerCase() || "apt") as
      | "apt"
      | "urbty"
      | "remndr";

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !dateRegex.test(from)) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_DATE_FORMAT", message: "from 날짜 형식은 YYYY-MM-DD 이어야 합니다." } },
        { status: 400 },
      );
    }
    if (to && !dateRegex.test(to)) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_DATE_FORMAT", message: "to 날짜 형식은 YYYY-MM-DD 이어야 합니다." } },
        { status: 400 },
      );
    }

    const key = makeApiCacheKey("housing-subscription", { region, mode, deep, from, to, q, houseType });
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

    const result = await listSubscriptionNotices(region, {
      mode: mode === "all" ? "all" : "search",
      deep,
      from,
      to,
      q,
      houseType,
    });
    if (!result.ok) return NextResponse.json(result, { status: statusByCode(result.error.code) });

    const payload = {
      ok: true,
      data: {
        items: result.data,
        assumptions: { note: "공고 일정은 변동될 수 있으므로 최종 공고문을 확인하세요." },
      },
      meta: result.meta ?? {},
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
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "청약 공고 API 처리 중 오류가 발생했습니다." } },
      { status: 502 },
    );
  }
}
