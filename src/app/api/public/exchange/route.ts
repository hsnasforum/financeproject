import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { buildExternalApiFailure, statusFromExternalApiErrorCode } from "@/lib/publicApis/errorContract";
import { fetchEximExchange, getKstTodayYYYYMMDD } from "@/lib/publicApis/providers/exchange";

function minusDays(dateYYYYMMDD: string, days: number): string {
  const year = Number(dateYYYYMMDD.slice(0, 4));
  const month = Number(dateYYYYMMDD.slice(4, 6));
  const day = Number(dateYYYYMMDD.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedDate = (searchParams.get("date") ?? "").trim() || getKstTodayYYYYMMDD();
    if (!/^\d{8}$/.test(requestedDate)) {
      return NextResponse.json(
        buildExternalApiFailure({ code: "INPUT", message: "date는 YYYYMMDD 형식이어야 합니다." }),
        { status: statusFromExternalApiErrorCode("INPUT") },
      );
    }

    const key = makeApiCacheKey("exim-exchange", { requestedDate });
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

    let fallbackDays = 0;
    let result = await fetchEximExchange({ dateYYYYMMDD: requestedDate });

    if (!result.ok && result.error.code === "NO_DATA") {
      for (let i = 1; i <= 7; i += 1) {
        const date = minusDays(requestedDate, i);
        const retried = await fetchEximExchange({ dateYYYYMMDD: date });
        if (retried.ok) {
          result = retried;
          fallbackDays = i;
          break;
        }
        if (retried.error.code !== "NO_DATA") {
          result = retried;
          break;
        }
        result = retried;
      }
    }

    if (!result.ok) {
      return NextResponse.json(result, { status: statusFromExternalApiErrorCode(result.error.code) });
    }

    const payload = {
      ok: true,
      data: result.data,
      assumptions: { note: "환율은 기준일 데이터 기반 참고값입니다." },
      meta: {
        requestedDate,
        asOf: result.data.asOf,
        fallbackDays,
      },
    };

    const ttlSeconds = Number(process.env.EXIM_EXCHANGE_CACHE_TTL_SECONDS ?? 21600);
    const entry = setApiCache(key, payload, Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 21600);

    return NextResponse.json({
      ...payload,
      meta: {
        ...payload.meta,
        cache: "miss",
        key,
        fetchedAt: entry.fetchedAt,
        expiresAt: entry.expiresAt,
      },
    });
  } catch {
    return NextResponse.json(
      buildExternalApiFailure({ code: "INTERNAL", message: "환율 API 처리 중 오류가 발생했습니다." }),
      { status: statusFromExternalApiErrorCode("INTERNAL") },
    );
  }
}
