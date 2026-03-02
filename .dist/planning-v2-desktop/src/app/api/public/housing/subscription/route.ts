import { getApiCacheRecord, makeApiCacheKey, setApiCache } from "@/lib/cache/apiCache";
import { jsonError, jsonOk } from "@/lib/http/apiResponse";
import { attachFallback } from "@/lib/http/fallbackMeta";
import { listSubscriptionNotices } from "@/lib/publicApis/providers/subscription";
import { issuesToApi, parseSubscriptionFilters } from "../../../../../lib/schemas/subscriptionFilters";

const TTL_SECONDS = 12 * 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSubscriptionFilters(searchParams);
    if (!parsed.ok) {
      return jsonError("INPUT", "입력값 오류", {
        issues: issuesToApi(parsed.issues),
      });
    }

    const { region, mode, deep, from, to, q, houseType } = parsed.value;

    const key = makeApiCacheKey("housing-subscription", { region, mode, deep, from, to, q, houseType });
    const hit = getApiCacheRecord(key);
    if (hit) {
      const payload = isRecord(hit.entry.payload) ? hit.entry.payload : {};
      const payloadData = isRecord(payload.data)
        ? payload.data
        : {
            items: [],
            assumptions: { note: "공고 일정은 변동될 수 있으므로 최종 공고문을 확인하세요." },
          };
      const payloadMeta = isRecord(payload.meta) ? payload.meta : {};

      return jsonOk(
        {
          data: payloadData,
        },
        {
          meta: attachFallback(
            {
              ...payloadMeta,
              cache: "hit",
              key,
              fetchedAt: hit.entry.fetchedAt,
              expiresAt: hit.entry.expiresAt,
            },
            {
              mode: "CACHE",
              sourceKey: "subscription",
              reason: "cache_hit",
              generatedAt: typeof payloadMeta.generatedAt === "string" ? payloadMeta.generatedAt : undefined,
            },
          ),
        },
      );
    }

    const result = await listSubscriptionNotices(region, {
      mode,
      deep,
      from,
      to,
      q,
      houseType,
    });
    if (!result.ok) {
      return jsonError(result.error.code, result.error.message, {
        debug: result.error.diagnostics,
      });
    }

    const data = {
      items: result.data,
      assumptions: { note: "공고 일정은 변동될 수 있으므로 최종 공고문을 확인하세요." },
    };
    const liveMeta = attachFallback(result.meta ?? {}, {
      mode: "LIVE",
      sourceKey: "subscription",
      reason: "live_ok",
    });

    const entry = setApiCache(
      key,
      {
        data,
        meta: liveMeta,
      },
      TTL_SECONDS,
    );

    return jsonOk(
      {
        data,
      },
      {
        meta: {
          cache: "miss",
          key,
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          ...liveMeta,
        },
      },
    );
  } catch {
    return jsonError("INTERNAL", "청약 공고 API 처리 중 오류가 발생했습니다.");
  }
}
