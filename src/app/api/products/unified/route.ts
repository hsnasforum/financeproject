import {
  getUnifiedProducts,
  UnifiedInputError,
  type UnifiedCursorErrorReason,
  type UnifiedMode,
  type UnifiedRequestInterruptionReason,
} from "@/lib/sources/unified";
import { jsonError, jsonOk, statusFromCode } from "@/lib/http/apiResponse";
import { singleflight } from "../../../../lib/cache/singleflight";
import { timingsToDebugMap, withTiming } from "../../../../lib/http/timing";
import {
  addIssue,
  createValidationBag,
  hasIssues,
  parseEnum,
  parseIntValue,
  parseNumberValue,
  parseStringValue,
} from "@/lib/http/validate";
import type { UnifiedSourceId } from "@/lib/sources/types";
import { isSamplebankPublicAccessAllowed } from "@/lib/products/samplebankPolicy";
import { pushError } from "../../../../lib/observability/errorRingBuffer";
import { attachTrace, getOrCreateTraceId, setTraceHeader } from "../../../../lib/observability/trace";
import { applyProductSourceIssues, getProductFreshnessSummary } from "@/lib/sources/productFreshness";

function parseEnrichSources(input: string | null): Array<"datago_kdb"> {
  if (!input || !input.trim()) return [];
  const picked = new Set<"datago_kdb">();
  for (const token of input.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)) {
    if (token === "datago_kdb") picked.add(token);
  }
  return [...picked];
}

function parseIncludeSourcesWithIssues(
  input: string[],
  addInvalid: (token: string) => void,
): UnifiedSourceId[] {
  const tokens = input
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) return ["finlife"];

  const picked = new Set<UnifiedSourceId>();
  for (const token of tokens) {
    if (token === "finlife" || token === "datago_kdb" || token === "samplebank") {
      picked.add(token);
    } else {
      addInvalid(token);
    }
  }
  return picked.size > 0 ? [...picked] : ["finlife"];
}

function summarizeIssues(issues: string[]): string {
  const first = issues[0] ?? "요청 파라미터가 올바르지 않습니다.";
  return `요청 파라미터 오류 ${issues.length}건: ${first}`;
}

function hasSamplebankSource(input: {
  includeSources: UnifiedSourceId[];
  sourceId: UnifiedSourceId | null;
}): boolean {
  return input.sourceId === "samplebank" || input.includeSources.includes("samplebank");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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
      route: "/api/products/unified",
      source: "unified",
      code,
      message,
      status,
      elapsedMs: Date.now() - startedAt,
    });
  };

  try {
    const { searchParams } = new URL(request.url);
    const bag = createValidationBag();
    const kind = parseEnum(bag, {
      path: "kind",
      value: (searchParams.get("kind") ?? "deposit").trim().toLowerCase(),
      allowed: ["deposit", "saving"] as const,
      fallback: "deposit",
    });

    const includeSourcesValues = searchParams.getAll("includeSources");
    const includeSources = parseIncludeSourcesWithIssues(
      includeSourcesValues.length > 0
        ? includeSourcesValues
        : (searchParams.get("includeSources") ? [searchParams.get("includeSources") as string] : []),
      (token) => addIssue(bag, "includeSources", `includes unsupported value: ${token}`),
    );
    const sourceIdRaw = parseStringValue(bag, {
      path: "sourceId",
      value: searchParams.get("sourceId"),
      fallback: "",
      trim: true,
    });
    if (sourceIdRaw && sourceIdRaw !== "finlife" && sourceIdRaw !== "datago_kdb" && sourceIdRaw !== "samplebank") {
      addIssue(bag, "sourceId", "must be one of finlife|datago_kdb|samplebank");
    }
    const sourceId = (sourceIdRaw === "finlife" || sourceIdRaw === "datago_kdb" || sourceIdRaw === "samplebank")
      ? sourceIdRaw
      : null;
    if (hasSamplebankSource({ includeSources, sourceId }) && !isSamplebankPublicAccessAllowed()) {
      addIssue(bag, sourceId === "samplebank" ? "sourceId" : "includeSources", "샘플 데이터 소스는 운영 공개 카탈로그에서 사용할 수 없습니다.");
    }

    const cursor = searchParams.get("cursor");
    const q = searchParams.get("q");
    const providerRaw = parseStringValue(bag, {
      path: "provider",
      value: searchParams.get("provider"),
      fallback: "",
      trim: true,
      maxLength: 200,
    });
    const provider = providerRaw && providerRaw !== "all" ? providerRaw : null;
    const termMonthsRaw = (searchParams.get("termMonths") ?? "").trim();
    const termMonths = termMonthsRaw
      ? parseIntValue(bag, {
          path: "termMonths",
          value: termMonthsRaw,
          fallback: 1,
          min: 1,
          max: 1200,
        })
      : null;
    const minRateRaw = (searchParams.get("minRate") ?? "").trim();
    const parsedMinRate = minRateRaw
      ? parseNumberValue(bag, {
          path: "minRate",
          value: minRateRaw,
          fallback: 0,
          min: 0,
          max: 100,
        })
      : null;
    const minRate = typeof parsedMinRate === "number" && parsedMinRate > 0 ? parsedMinRate : null;
    const catalogFiltersActive = Boolean(provider || termMonths !== null || minRate !== null);
    const queryMode = parseEnum(bag, {
      path: "qMode",
      value: (searchParams.get("qMode") ?? "contains").trim().toLowerCase(),
      allowed: ["contains", "prefix"] as const,
      fallback: "contains",
    });
    const mode = parseEnum(bag, {
      path: "mode",
      value: (searchParams.get("mode") ?? "merged").trim().toLowerCase(),
      allowed: ["merged", "integrated"] as const,
      fallback: "merged",
    }) as UnifiedMode;
    const catalogSnapshotActive = catalogFiltersActive
      || (mode === "merged" && sourceId === null && includeSources.length > 1);
    const debugRequested = searchParams.get("debug") === "1";
    const canExposeDiagnostics = process.env.NODE_ENV !== "production" || process.env.UNIFIED_DEBUG_ALLOW_IN_PROD === "1";
    const debug = debugRequested && canExposeDiagnostics;
    const refresh = searchParams.get("refresh") === "1";
    const onlyNew = searchParams.get("onlyNew") === "1";
    const changedSince = searchParams.get("changedSince");
    const includeTimestamps = searchParams.get("includeTimestamps") === "1";
    const enrichSources = parseEnrichSources(searchParams.get("enrichSources"));
    const depositProtection = parseEnum(bag, {
      path: "depositProtection",
      value: (searchParams.get("depositProtection") ?? "any").trim().toLowerCase(),
      allowed: ["any", "prefer", "require"] as const,
      fallback: "any",
    });
    const includeKdbOnly = searchParams.get("includeKdbOnly") === "1";
    const limit = parseIntValue(bag, {
      path: "limit",
      value: searchParams.get("limit"),
      fallback: 200,
      min: 1,
      max: 1000,
    });
    const sortMode = parseEnum(bag, {
      path: "sort",
      value: (searchParams.get("sort") ?? "recent").trim().toLowerCase(),
      allowed: ["recent", "name"] as const,
      fallback: "recent",
    });

    if (mode === "integrated") {
      if (!includeSources.includes("finlife")) {
        addIssue(bag, "mode", "Integrated mode requires finlife as canonical source.");
      }
      if (cursor) {
        addIssue(bag, "cursor", "Cursor pagination is not supported in integrated mode.");
      }
    }
    if ((provider || termMonths !== null || minRate !== null) && (mode !== "merged" || sourceId !== null)) {
      addIssue(bag, "filters", "provider, termMonths, minRate require merged multi-source mode");
    }
    if (cursor && sourceId && (!includeSources.includes(sourceId) || includeSources.length !== 1)) {
      addIssue(bag, "cursor", "Cursor pagination requires single sourceId.");
    }
    if (mode !== "integrated" && enrichSources.length > 0) {
      const singleFinlife = sourceId === "finlife" && includeSources.length === 1 && includeSources[0] === "finlife";
      if (!singleFinlife) {
        addIssue(bag, "enrichSources", "enrichSources requires single sourceId=finlife");
      }
    }

    if (hasIssues(bag)) {
      const message = summarizeIssues(bag.issues);
      const status = statusFromCode("INPUT");
      recordError("INPUT", message, status);
      return withTrace(jsonError("INPUT", message, {
        issues: bag.issues,
        meta: traceMeta(),
      }));
    }

    const singleflightKey = [
      "products-unified",
      kind,
      mode,
      includeSources.join(","),
      sourceId ?? "all",
      cursor ?? "",
      q ?? "",
      provider ?? "all",
      termMonths === null ? "" : String(termMonths),
      minRate === null ? "" : String(minRate),
      refresh ? "1" : "0",
      onlyNew ? "1" : "0",
      changedSince ?? "",
      includeTimestamps ? "1" : "0",
      String(limit),
      sortMode,
      queryMode,
      enrichSources.join(","),
      depositProtection,
      includeKdbOnly ? "1" : "0",
      debug ? "1" : "0",
    ].join("|");
    const unifiedQuery = () => getUnifiedProducts({
      kind,
      mode,
      includeSources,
      sourceId,
      cursor,
      q,
      provider,
      termMonths,
      minRate,
      refresh,
      onlyNew,
      changedSince,
      includeTimestamps,
      limit,
      sort: sortMode,
      qMode: queryMode,
      enrichSources,
      depositProtection,
      includeKdbOnly,
      debug,
      ...(catalogSnapshotActive ? { signal: request.signal } : {}),
    });
    const dataTimed = await withTiming(
      "products.unified.query",
      () => catalogSnapshotActive
        ? unifiedQuery()
        : singleflight(singleflightKey, unifiedQuery),
    );
    const data = dataTimed.value;

    const itemRows = Array.isArray(data.items) ? data.items : [];
    const depositProtectionMatched = itemRows.filter((item) => item.signals?.depositProtection === "matched").length;
    const coverage = {
      totalProducts: itemRows.length,
      kdbBadged: itemRows.filter((item) => Array.isArray(item.badges) && item.badges.includes("KDB_MATCHED")).length,
      depositProtection: {
        matched: depositProtectionMatched,
        unknown: itemRows.length - depositProtectionMatched,
      },
    };

    const generatedAt = new Date().toISOString();
    const freshness = data.provenance?.freshness ?? applyProductSourceIssues(await getProductFreshnessSummary({
      kind,
      sourceIds: sourceId ? [sourceId] : includeSources,
      checkedAt: generatedAt,
    }), data.sourceIssues);
    return withTrace(jsonOk({
      data,
      coverage,
      meta: {
        ...traceMeta({
          generatedAt,
          freshness,
        }),
        ...(debugRequested
          ? {
              debug: {
                timings: timingsToDebugMap([dataTimed.timing]),
              },
            }
          : {}),
      },
      ...(debug ? { diagnostics: data.diagnostics } : {}),
      fetchedAt: generatedAt,
    }));
  } catch (error) {
    if (isAbortError(error)) {
      const reason: UnifiedRequestInterruptionReason = {
        code: "REQUEST_ABORTED",
        message: "상품 조회 요청이 완료되기 전에 취소되었습니다.",
        recovery: "현재 조건으로 다시 조회해 주세요.",
      };
      recordError(reason.code, reason.message, 499);
      return withTrace(jsonError(reason.code, reason.message, {
        status: 499,
        details: { reason },
        meta: traceMeta(),
      }));
    }
    if (error instanceof UnifiedInputError) {
      if (error.code === "CURSOR_INVALID" || error.code === "CURSOR_EXPIRED" || error.code === "CURSOR_MISMATCH") {
        const reason: UnifiedCursorErrorReason = {
          code: error.code,
          message: error.message,
          recovery: "현재 조회 조건으로 첫 페이지부터 다시 조회해 주세요.",
        };
        const status = error.code === "CURSOR_EXPIRED" ? 410 : 400;
        recordError(reason.code, reason.message, status);
        return withTrace(jsonError(reason.code, reason.message, {
          status,
          details: { reason },
          meta: traceMeta(),
        }));
      }
      const status = statusFromCode("INPUT");
      recordError("INPUT", error.message, status);
      return withTrace(jsonError("INPUT", error.message, {
        issues: [error.message],
        meta: traceMeta(),
      }));
    }
    console.error("[products/unified] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    const message = "현재 데이터를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.";
    const status = statusFromCode("UPSTREAM");
    recordError("UPSTREAM", message, status);
    return withTrace(jsonError("UPSTREAM", message, { meta: traceMeta() }));
  }
}
