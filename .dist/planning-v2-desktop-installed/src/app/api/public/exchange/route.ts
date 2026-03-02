import { NextResponse } from "next/server";
import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { makeHttpError, isDebugEnabled } from "@/lib/http/apiError";
import { attachFallback } from "@/lib/http/fallbackMeta";
import { setCooldown, shouldCooldown } from "@/lib/http/rateLimitCooldown";
import { pushError } from "../../../../lib/observability/errorRingBuffer";
import { attachTrace, getOrCreateTraceId, setTraceHeader } from "../../../../lib/observability/trace";
import { statusFromExternalApiErrorCode } from "@/lib/publicApis/errorContract";
import { fetchEximExchange, getKstTodayYYYYMMDD } from "@/lib/publicApis/providers/exchange";
import { getCachePolicy } from "../../../../lib/dataSources/cachePolicy";
import { timingsToDebugMap, withTiming } from "../../../../lib/http/timing";

const EXCHANGE_SOURCE_KEY = "exchange";
const EXCHANGE_DEFAULT_COOLDOWN_SECONDS = 120;

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
  const startedAt = Date.now();
  const traceId = getOrCreateTraceId(request);
  const traceMeta = (meta: unknown = {}) => attachTrace(meta, traceId);
  const withTrace = <T extends Response>(response: T) => setTraceHeader(response, traceId);
  const recordError = (code: string, message: string, status: number) => {
    pushError({
      time: new Date().toISOString(),
      traceId,
      route: "/api/public/exchange",
      source: "exchange",
      code,
      message,
      status,
      elapsedMs: Date.now() - startedAt,
    });
  };

  let requestedDate = "";
  let fallbackDays = 0;
  const { searchParams } = new URL(request.url);
  const debugTimingEnabled = searchParams.get("debug") === "1";
  const debugEnabled = isDebugEnabled(searchParams);
  try {
    requestedDate = (searchParams.get("date") ?? "").trim() || getKstTodayYYYYMMDD();
    if (!/^\d{8}$/.test(requestedDate)) {
      const code = "INPUT";
      const message = "date는 YYYYMMDD 형식이어야 합니다.";
      const status = statusFromExternalApiErrorCode(code);
      recordError(code, message, status);
      return withTrace(NextResponse.json(
        {
          ok: false,
          meta: traceMeta(),
          error: makeHttpError(code, message, {
            debugEnabled,
            debug: { requestedDate },
          }),
        },
        { status },
      ));
    }

    const key = makeApiCacheKey("exim-exchange", { requestedDate });
    const hit = getApiCacheRecord(key);
    const cooldown = shouldCooldown(EXCHANGE_SOURCE_KEY);
    if (cooldown.cooldown && hit) {
      const payload = hit.entry.payload as Record<string, unknown>;
      return withTrace(NextResponse.json({
        ...payload,
        meta: traceMeta(attachFallback({
          ...(typeof payload.meta === "object" && payload.meta !== null ? payload.meta : {}),
          cache: "hit",
          key,
          fetchedAt: hit.entry.fetchedAt,
          expiresAt: hit.entry.expiresAt,
        }, {
          mode: "CACHE",
          sourceKey: EXCHANGE_SOURCE_KEY,
          reason: "cooldown_cache_hit",
          nextRetryAt: cooldown.nextRetryAt,
        })),
      }));
    }
    if (cooldown.cooldown && !hit) {
      const code = "UPSTREAM_ERROR";
      const message = "환율 API 호출 제한으로 잠시 대기 후 다시 시도해주세요.";
      const status = 429;
      recordError(code, message, status);
      return withTrace(NextResponse.json(
        {
          ok: false,
          meta: traceMeta(attachFallback({}, {
            mode: "CACHE",
            sourceKey: EXCHANGE_SOURCE_KEY,
            reason: "cooldown_no_cache",
            nextRetryAt: cooldown.nextRetryAt,
          })),
          error: makeHttpError(code, message, {
            debugEnabled,
            debug: {
              requestedDate,
              nextRetryAt: cooldown.nextRetryAt,
            },
          }),
        },
        { status },
      ));
    }
    if (hit) {
      const payload = hit.entry.payload as Record<string, unknown>;
      return withTrace(NextResponse.json({
        ...payload,
        meta: traceMeta(attachFallback({
          ...(typeof payload.meta === "object" && payload.meta !== null ? payload.meta : {}),
          cache: "hit",
          key,
          fetchedAt: hit.entry.fetchedAt,
          expiresAt: hit.entry.expiresAt,
        }, {
          mode: "CACHE",
          sourceKey: EXCHANGE_SOURCE_KEY,
          reason: "cache_hit",
        })),
      }));
    }

    const fetchTimed = await withTiming("exchange.fetch", async () => {
      let localFallbackDays = 0;
      let result = await fetchEximExchange({ dateYYYYMMDD: requestedDate });

      if (!result.ok && result.error.code === "NO_DATA") {
        for (let i = 1; i <= 7; i += 1) {
          const date = minusDays(requestedDate, i);
          const retried = await fetchEximExchange({ dateYYYYMMDD: date });
          if (retried.ok) {
            result = retried;
            localFallbackDays = i;
            break;
          }
          if (retried.error.code !== "NO_DATA") {
            result = retried;
            break;
          }
          result = retried;
        }
      }
      return { result, localFallbackDays };
    });
    const timingMeta = debugTimingEnabled
      ? {
          debug: {
            timings: timingsToDebugMap([fetchTimed.timing]),
          },
        }
      : {};
    const result = fetchTimed.value.result;
    fallbackDays = fetchTimed.value.localFallbackDays;

    if (!result.ok) {
      const diagnostics = (result.error.diagnostics ?? {}) as Record<string, unknown>;
      const upstreamStatus = typeof diagnostics.upstreamStatus === "number" ? diagnostics.upstreamStatus : undefined;
      const retryAfterSeconds = typeof diagnostics.retryAfterSeconds === "number" ? diagnostics.retryAfterSeconds : undefined;
      const timeout = Boolean(diagnostics.timeout);
      let nextRetryAt: string | undefined;
      if (upstreamStatus === 429) {
        nextRetryAt = setCooldown(EXCHANGE_SOURCE_KEY, retryAfterSeconds ?? EXCHANGE_DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      } else if ((typeof upstreamStatus === "number" && upstreamStatus >= 500) || timeout) {
        nextRetryAt = setCooldown(EXCHANGE_SOURCE_KEY, EXCHANGE_DEFAULT_COOLDOWN_SECONDS).nextRetryAt;
      }

      if (nextRetryAt) {
        const degraded = getApiCacheRecord(key);
        if (degraded) {
          const degradedPayload = degraded.entry.payload as Record<string, unknown>;
          return withTrace(NextResponse.json({
            ...degradedPayload,
            meta: traceMeta(attachFallback({
              ...(typeof degradedPayload.meta === "object" && degradedPayload.meta !== null ? degradedPayload.meta : {}),
              ...timingMeta,
              cache: "hit",
              key,
              fetchedAt: degraded.entry.fetchedAt,
              expiresAt: degraded.entry.expiresAt,
            }, {
              mode: "CACHE",
              sourceKey: EXCHANGE_SOURCE_KEY,
              reason: "live_failed_cache_hit",
              nextRetryAt,
            })),
          }));
        }
      }

      const status = statusFromExternalApiErrorCode(result.error.code);
      recordError(result.error.code, result.error.message, status);
      return withTrace(NextResponse.json(
        {
          ok: false,
          meta: traceMeta(attachFallback({
            ...timingMeta,
          }, {
            mode: "LIVE",
            sourceKey: EXCHANGE_SOURCE_KEY,
            reason: "live_failed",
            nextRetryAt,
          })),
          error: makeHttpError(result.error.code, result.error.message, {
            debugEnabled,
            debug: {
              requestedDate,
              fallbackDays,
              upstreamStatus,
              nextRetryAt,
            },
          }),
        },
        { status },
      ));
    }

    const payload = {
      ok: true,
      data: result.data,
      assumptions: { note: "환율은 기준일 데이터 기반 참고값입니다." },
      meta: attachFallback({
        requestedDate,
        asOf: result.data.asOf,
        fallbackDays,
        ...timingMeta,
      }, {
        mode: "LIVE",
        sourceKey: EXCHANGE_SOURCE_KEY,
        reason: fallbackDays > 0 ? "historical_date_fallback" : "live_ok",
        generatedAt: result.data.asOf,
      }),
    };

    const ttlMs = getCachePolicy("exchange").ttlMs;
    const ttlSeconds = Math.max(1, Math.trunc(ttlMs / 1000));
    const entry = setApiCache(key, payload, ttlSeconds);

    return withTrace(NextResponse.json({
      ...payload,
      meta: traceMeta({
        ...payload.meta,
        cache: "miss",
        key,
        fetchedAt: entry.fetchedAt,
        expiresAt: entry.expiresAt,
      }),
    }));
  } catch {
    const code = "INTERNAL";
    const message = "환율 API 처리 중 오류가 발생했습니다.";
    const status = statusFromExternalApiErrorCode(code);
    recordError(code, message, status);
    return withTrace(NextResponse.json(
      {
        ok: false,
        meta: traceMeta(attachFallback({}, {
          mode: "LIVE",
          sourceKey: EXCHANGE_SOURCE_KEY,
          reason: "route_internal_error",
        })),
        error: makeHttpError(code, message, {
          debugEnabled,
          debug: {
            requestedDate,
            fallbackDays,
          },
        }),
      },
      { status },
    ));
  }
}
