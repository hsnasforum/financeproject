import { resolveOdcloudEndpoint, setSearchParams, odcloudFetchWithAuth } from "../odcloud";
import { extractOdcloudRows, scanPagedOdcloud } from "../odcloudScan";
import { type BenefitCandidate, type PublicApiResult, type PublicApiErrorCode, type PublicApiError } from "../contracts/types";
import { buildSchemaMismatchError } from "../schemaDrift";
import { extractRegionTagsFromTexts } from "../../regions/kr";
import { getSnapshotOrNull } from "../benefitsSnapshot";

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[\s_\-:/()[\].]/g, "");
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  const keyMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    keyMap.set(normalizeLookupKey(k), v);
  }
  for (const key of keys) {
    const hit = keyMap.get(normalizeLookupKey(key));
    if (hit === undefined || hit === null) continue;
    const value = String(hit).trim();
    if (value) return value;
  }
  return undefined;
}

type NormalizeDropStats = {
  missingTitle: number;
  generatedId: number;
  unknownRegionNoText: number;
  unknownRegionUnparsed: number;
};

const REGION_VALUE_KEYWORDS = [
  "지역",
  "관할",
  "주소",
  "소재",
  "지역범위",
  "지원권역",
  "region",
  "area",
  "address",
  "jurisdiction",
];

function toFlatString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text || null;
  }
  if (Array.isArray(value)) {
    const text = value.map((entry) => toFlatString(entry)).filter((entry): entry is string => Boolean(entry)).join(" ");
    return text || null;
  }
  return null;
}

function extractConditionTexts(record: Record<string, unknown>): string[] {
  const candidates = [
    "지원대상",
    "선정기준",
    "신청자격",
    "제외대상",
    "조건",
    "자격",
    "비고",
    "trgterIndvdlArray",
    "trgterNm",
    "eligibility",
    "criteria",
    "condition",
    "hint",
  ]
    .map((key) => firstString(record, [key]))
    .filter((v): v is string => Boolean(v))
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const unique = new Set<string>();
  for (const text of candidates) unique.add(text);
  return [...unique].slice(0, 10);
}

function buildEligibilityPreview(input: { summary: string; hints: string[]; applyHow?: string; org?: string }): { fullText: string; excerpt: string; chips: string[]; truncated: boolean } {
  const blocks: string[] = [];
  for (const hint of input.hints) {
    const normalized = hint.replace(/\s+/g, " ").trim();
    if (normalized) blocks.push(normalized);
  }
  if (input.summary.trim()) blocks.push(input.summary.replace(/\s+/g, " ").trim());
  if (input.applyHow?.trim()) blocks.push(`신청방법: ${input.applyHow.replace(/\s+/g, " ").trim()}`);
  if (input.org?.trim()) blocks.push(`소관기관: ${input.org.replace(/\s+/g, " ").trim()}`);
  const fullText = blocks.join(" · ").replace(/[·|]{2,}/g, "·").trim();

  const bulletSegments = fullText
    .split(/\s*(?:\d+\.\s*|[-•]\s*)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  let excerpt = bulletSegments.slice(0, 3).join(" · ");
  if (!excerpt) {
    const sentenceSegments = fullText.split(/(?<=[.!?다])\s+/).map((segment) => segment.trim()).filter(Boolean);
    excerpt = sentenceSegments.slice(0, 2).join(" ");
  }
  if (!excerpt) excerpt = fullText;
  let truncated = fullText.length > excerpt.length;
  if (excerpt.length > 320) {
    excerpt = `${excerpt.slice(0, 320).trim()}...`;
    truncated = true;
  } else if (truncated) {
    excerpt = `${excerpt.trim()}...`;
  }

  const chipRules: Array<{ label: string; pattern: RegExp }> = [
    { label: "연령", pattern: /만\s*\d{1,2}\s*세/ },
    { label: "중위소득", pattern: /중위\s*소득/ },
    { label: "기초생활", pattern: /기초\s*생활/ },
    { label: "다자녀", pattern: /다자녀/ },
    { label: "신혼", pattern: /신혼/ },
    { label: "무주택", pattern: /무주택/ },
  ];
  const chips: string[] = [];
  for (const rule of chipRules) {
    if (rule.pattern.test(fullText)) chips.push(rule.label);
    if (chips.length >= 3) break;
  }
  return { fullText, excerpt, chips, truncated };
}

function extractRegionContext(record: Record<string, unknown>): {
  explicitTexts: string[];
  inferredTexts: string[];
  sourceKeys: string[];
  hasRegionLikeText: boolean;
} {
  const explicitTexts = new Set<string>();
  const inferredTexts = new Set<string>();
  const sourceKeys: string[] = [];
  let hasRegionLikeText = false;

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeLookupKey(key);
    const isRegionKey = REGION_VALUE_KEYWORDS.some((token) => normalizedKey.includes(normalizeLookupKey(token)));
    if (!isRegionKey) continue;
    hasRegionLikeText = true;
    const text = toFlatString(value);
    if (!text) continue;
    explicitTexts.add(text);
    sourceKeys.push(key);
  }

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeLookupKey(key);
    const isRegionKey = REGION_VALUE_KEYWORDS.some((token) => normalizedKey.includes(normalizeLookupKey(token)));
    if (isRegionKey) continue;
    const text = toFlatString(value);
    if (!text) continue;
    inferredTexts.add(text);
  }

  return {
    explicitTexts: [...explicitTexts].map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean),
    inferredTexts: [...inferredTexts].map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean),
    sourceKeys,
    hasRegionLikeText,
  };
}

function normalizeBenefits(rows: Record<string, unknown>[]): { items: BenefitCandidate[]; dropStats: NormalizeDropStats } {
  const now = new Date().toISOString();
  const items: BenefitCandidate[] = [];
  const dropStats: NormalizeDropStats = { missingTitle: 0, generatedId: 0, unknownRegionNoText: 0, unknownRegionUnparsed: 0 };

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const rec = row as Record<string, unknown>;
    const title = firstString(rec, [
      "서비스명",
      "serviceName",
      "servNm",
      "svcNm",
      "bizNm",
      "title",
      "svcNmKr",
      "srvNm",
    ]);
    if (!title) {
      dropStats.missingTitle += 1;
      return;
    }

    const rawId = firstString(rec, ["서비스ID", "serviceId", "svcId", "srvId", "id", "service_id"]);
    if (!rawId) dropStats.generatedId += 1;

    const summary =
      firstString(rec, [
        "서비스목적요약",
        "서비스설명",
        "서비스요약",
        "summary",
        "description",
        "svcDtlCn",
        "content",
        "desc",
      ]) ?? "세부 조건은 공고문에서 확인하세요.";

    const hints = extractConditionTexts(rec);
    const applyHow = firstString(rec, ["신청방법", "applyHow", "applyMethod", "apply"]) ?? undefined;
    const org = firstString(rec, ["소관기관명", "org", "organization", "provider", "insttNm"]) ?? undefined;
    const preview = buildEligibilityPreview({ summary, hints, applyHow, org });
    const regionContext = extractRegionContext(rec);
    const extractedRegion = extractRegionTagsFromTexts(regionContext.explicitTexts);
    const unknownReason =
      extractedRegion.scope === "UNKNOWN" ? (regionContext.hasRegionLikeText ? "UNPARSED_REGION" : "NO_REGION_INFO") : undefined;
    if (unknownReason === "NO_REGION_INFO") dropStats.unknownRegionNoText += 1;
    if (unknownReason === "UNPARSED_REGION") dropStats.unknownRegionUnparsed += 1;

    items.push({
      id: rawId ?? `benefit-${index}-${title.slice(0, 12)}`,
      title,
      summary,
      eligibilityHints: hints,
      eligibilityText: preview.fullText || undefined,
      eligibilityExcerpt: preview.excerpt || undefined,
      isEligibilityTruncated: preview.truncated,
      eligibilityChips: preview.chips.length ? preview.chips : undefined,
      contact: firstString(rec, ["문의처", "연락처", "전화번호", "contact", "callCenter", "telNo"]) ?? undefined,
      link: firstString(rec, ["관련링크", "신청URL", "상세URL", "홈페이지", "url", "link", "hmUrl"]) ?? undefined,
      region: {
        ...extractedRegion,
        unknownReason,
        sourceKeys: regionContext.sourceKeys.length > 0 ? regionContext.sourceKeys : undefined,
        confidence: extractedRegion.scope === "UNKNOWN" ? "LOW" : "HIGH",
      },
      applyHow,
      org,
      lastUpdated: firstString(rec, ["수정일시", "lastUpdated", "updtDt", "updatedAt"]) ?? undefined,
      source: "행정안전부 보조금24",
      fetchedAt: now,
    } as BenefitCandidate);
  });

  return { items, dropStats };
}

function pickRicherBenefit(a: BenefitCandidate, b: BenefitCandidate): BenefitCandidate {
  const score = (item: BenefitCandidate) =>
    (item.eligibilityText?.length ?? 0) +
    (item.summary?.length ?? 0) +
    ((item.eligibilityHints?.length ?? 0) * 20) +
    (item.applyHow ? 30 : 0) +
    (item.org ? 20 : 0);
  return score(b) > score(a) ? b : a;
}

function dedupeBenefitsById(items: BenefitCandidate[]): { items: BenefitCandidate[]; dedupedCount: number } {
  const byId = new Map<string, BenefitCandidate>();
  for (const item of items) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? pickRicherBenefit(prev, item) : item);
  }
  return { items: [...byId.values()], dedupedCount: Math.max(0, items.length - byId.size) };
}

export function normalizeDedupedBenefits(rows: Record<string, unknown>[]): {
  items: BenefitCandidate[];
  dedupedCount: number;
  dropStats: NormalizeDropStats;
} {
  const normalized = normalizeBenefits(rows);
  const deduped = dedupeBenefitsById(normalized.items);
  return {
    items: deduped.items,
    dedupedCount: deduped.dedupedCount,
    dropStats: normalized.dropStats,
  };
}

function filterByQuery(items: BenefitCandidate[], query: string): BenefitCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.title, item.summary, item.org, ...(item.eligibilityHints ?? [])]
      .filter((entry): entry is string => Boolean(entry))
      .some((entry) => entry.toLowerCase().includes(q)),
  );
}

function buildBenefitsConds(query: string, scope: "name" | "field"): Record<string, string> {
  const trimmed = query.trim();
  if (!trimmed) return {};
  if (scope === "name") {
    return { "cond[서비스명::LIKE]": trimmed };
  }
  return { "cond[서비스분야::LIKE]": trimmed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scanBenefitsPages(params: {
  endpoint: URL;
  apiKey: string;
  deep?: boolean;
  mode?: "search" | "all";
  scanPages?: number | "auto";
  rows?: number;
  maxMatches?: number;
  conds?: Record<string, string>;
  queryText?: string;
  onPage?: (meta: {
    pageNo: number;
    pageRows: number;
    pagesFetched: number;
    rowsFetched: number;
    upstreamTotalCount?: number;
    neededPagesEstimate?: number;
    effectiveMaxPages: number;
    uniqueIds: number;
    matchedRows: number;
    rowsMatched: Record<string, unknown>[];
  }) => void;
}) {
  let authMode: "query" | "header-fallback" = "query";
  const scan = await scanPagedOdcloud({
    deep: params.deep,
    mode: params.mode ?? "all",
    queryText: params.queryText ?? "",
    maxPages: params.scanPages,
    maxMatches: params.maxMatches,
    requestedPerPage: params.rows ?? 200,
    onPage: params.onPage,
    fetchPage: async (pageNo) => {
      const retry429 = [2000, 4000, 8000];
      const retry5xx = [1000, 2000, 4000];
      for (let attempt = 0; attempt <= 3; attempt += 1) {
        const url = new URL(params.endpoint.toString());
        setSearchParams(url, { page: pageNo, perPage: params.rows ?? 200, returnType: "JSON", ...(params.conds ?? {}) });
        const fetched = await odcloudFetchWithAuth(url, params.apiKey, undefined, { allowServiceKeyFallback: true });
        authMode = fetched.authMode;
        if (fetched.response.status === 401 || fetched.response.status === 403) {
          return {
            ok: false as const,
            error: {
              code: "UPSTREAM_ERROR" as PublicApiErrorCode,
              message: `보조금24 인증에 실패했습니다.(${fetched.response.status})`,
            },
          };
        }
        if (fetched.response.status === 429 && attempt < retry429.length) {
          await sleep(retry429[attempt]);
          continue;
        }
        if (fetched.response.status >= 500 && fetched.response.status <= 599 && attempt < retry5xx.length) {
          await sleep(retry5xx[attempt]);
          continue;
        }
        if (!fetched.response.ok) {
          return { ok: false as const, error: { code: "UPSTREAM_ERROR" as PublicApiErrorCode, message: `보조금24 API 응답 오류(${fetched.response.status})` } };
        }
        const text = await fetched.response.text();
        const contentType = fetched.response.headers.get("content-type") ?? "";
        if (contentType.toLowerCase().includes("html") || text.trim().toLowerCase().startsWith("<html")) {
          const mismatch = buildSchemaMismatchError({
            source: "gov24",
            stage: "http_html",
            message: "보조금24 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다. 잠시 후 다시 시도하세요.",
            raw: { textLength: text.length, pageNo },
            endpoint: url.toString(),
            contentType,
            note: `page=${pageNo};textLength=${text.length}`,
          });
          return { ok: false as const, error: mismatch as PublicApiError };
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          const mismatch = buildSchemaMismatchError({
            source: "gov24",
            stage: "json_parse",
            message: "보조금24 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다. 잠시 후 다시 시도하세요.",
            raw: { textLength: text.length, pageNo },
            endpoint: url.toString(),
            contentType,
            note: `page=${pageNo};textLength=${text.length}`,
          });
          return { ok: false as const, error: mismatch as PublicApiError };
        }
        const extracted = extractOdcloudRows(parsed);
        if ("error" in extracted) {
          if (extracted.error.code === "SCHEMA_MISMATCH") {
            const mismatch = buildSchemaMismatchError({
              source: "gov24",
              stage: "extract_rows",
              message: "보조금24 응답 형식이 예상과 달라 데이터를 해석하지 못했습니다. 잠시 후 다시 시도하세요.",
              raw: parsed,
              endpoint: url.toString(),
              contentType,
              note: `page=${pageNo}`,
            });
            return {
              ok: false as const,
              error: {
                ...mismatch,
                diagnostics: {
                  ...mismatch.diagnostics,
                  ...(extracted.error.diagnostics ?? {}),
                },
              } as PublicApiError,
            };
          }
          return { ok: false as const, error: extracted.error as PublicApiError };
        }
        return {
          ok: true as const,
          rows: extracted.rows,
          totalCount: extracted.meta.totalCount,
          page: extracted.meta.page,
          perPage: extracted.meta.perPage,
        };
      }
      return { ok: false as const, error: { code: "FETCH_FAILED" as PublicApiErrorCode, message: "보조금24 API 호출 재시도에 실패했습니다." } };
    },
  });

  if (!scan.ok) return scan;
  return {
    ok: true as const,
    rows: scan.rowsMatched,
    meta: {
      ...scan.meta,
      authMode,
    },
  };
}

export async function searchBenefits(
  query: string,
  options?: {
    deep?: boolean;
    mode?: "search" | "all";
    scanPages?: number | "auto";
    scope?: "auto" | "name" | "field";
    limit?: number;
    rows?: number;
    maxMatches?: number;
  },
): Promise<PublicApiResult<BenefitCandidate[]>> {
  const apiKey = (process.env.MOIS_BENEFITS_API_KEY ?? "").trim();
  if (!apiKey) {
    return { ok: false, error: { code: "ENV_MISSING", message: "MOIS 보조금24 API 설정이 필요합니다." } };
  }

  const resolved = resolveOdcloudEndpoint(process.env.MOIS_BENEFITS_API_URL ?? "", "/gov24/v3/serviceList", {
    allowBaseOnly: true,
    allowDirOnly: true,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error as PublicApiError };

  try {
    const mode = options?.mode ?? "search";
    const limit = Math.min(50000, Math.max(1, Math.trunc(options?.limit ?? 20)));
    const scope = options?.scope ?? "auto";
    const rows = Math.min(300, Math.max(50, Math.trunc(options?.rows ?? 200)));
    const queryTrimmed = query.trim();
    let usedStrategy: "all_unfiltered" | "upstream_cond_name" | "upstream_cond_field" | "local_scan_fallback" = "all_unfiltered";
    let scanResult:
      | Awaited<ReturnType<typeof scanBenefitsPages>>
      | null = null;

    if (mode === "all" || !queryTrimmed) {
      usedStrategy = "all_unfiltered";
      scanResult = await scanBenefitsPages({
        endpoint: resolved.url,
        apiKey,
        deep: options?.deep,
        mode: "all",
        scanPages: options?.scanPages,
        rows,
        maxMatches: options?.maxMatches ?? Math.max(limit * 5, 1000),
      });
    } else {
      const tryName = scope === "auto" || scope === "name";
      const tryField = scope === "auto" || scope === "field";

      if (tryName) {
        usedStrategy = "upstream_cond_name";
        scanResult = await scanBenefitsPages({
          endpoint: resolved.url,
          apiKey,
          deep: options?.deep,
          mode: "all",
          scanPages: options?.scanPages,
          rows,
          maxMatches: options?.maxMatches ?? Math.max(limit * 5, 1000),
          conds: buildBenefitsConds(queryTrimmed, "name"),
        });
      }
      if (scanResult && scanResult.ok && scanResult.rows.length === 0 && tryField) {
        usedStrategy = "upstream_cond_field";
        scanResult = await scanBenefitsPages({
          endpoint: resolved.url,
          apiKey,
          deep: options?.deep,
          mode: "all",
          scanPages: options?.scanPages,
          rows,
          maxMatches: options?.maxMatches ?? Math.max(limit * 5, 1000),
          conds: buildBenefitsConds(queryTrimmed, "field"),
        });
      }
      if (scanResult && scanResult.ok && scanResult.rows.length === 0) {
        usedStrategy = "local_scan_fallback";
        scanResult = await scanBenefitsPages({
          endpoint: resolved.url,
          apiKey,
          deep: options?.deep,
          mode: "search",
          queryText: queryTrimmed,
          scanPages: options?.scanPages,
          rows,
          maxMatches: options?.maxMatches ?? 1000,
        });
      }
    }

    if (!scanResult) {
      return { ok: false, error: { code: "INTERNAL", message: "보조금24 검색 전략 초기화 실패" } };
    }
    if (!scanResult.ok) return { ok: false, error: scanResult.error as PublicApiError };

    const normalized = normalizeBenefits(scanResult.rows);
    const deduped = dedupeBenefitsById(normalized.items);
    const totalNormalized = deduped.items.length;
    const normalizedItems =
      mode === "all"
        ? deduped.items.slice(0, limit)
        : usedStrategy === "local_scan_fallback"
          ? filterByQuery(deduped.items, queryTrimmed)
          : deduped.items;
    const regionDiagnostics = {
      nationwide: normalizedItems.filter((item) => item.region.scope === "NATIONWIDE").length,
      regional: normalizedItems.filter((item) => item.region.scope === "REGIONAL").length,
      unknownNoRegionInfo: normalizedItems.filter((item) => item.region.unknownReason === "NO_REGION_INFO").length,
      unknownUnparsed: normalizedItems.filter((item) => item.region.unknownReason === "UNPARSED_REGION").length,
    };
    return {
      ok: true,
      data: normalizedItems,
      meta: {
        ...scanResult.meta,
        scannedPages: scanResult.meta.pagesFetched ?? scanResult.meta.scannedPages,
        scannedRows: scanResult.meta.rowsFetched ?? scanResult.meta.scannedRows,
        rawMatched: scanResult.meta.matchedRows,
        totalNormalizedAll: totalNormalized,
        uniqueCount: totalNormalized,
        dedupedCount: deduped.dedupedCount,
        normalizedCount: normalizedItems.length,
        dropStats: normalized.dropStats,
        truncatedByLimit: mode === "all" ? totalNormalized > limit : false,
        truncatedByMaxPages: Boolean(scanResult.meta.truncatedByMaxPages),
        paginationSuspected: Boolean(scanResult.meta.paginationSuspected),
        truncated: mode === "all" ? totalNormalized > limit : Boolean(scanResult.meta.truncated),
        resolvedFrom: resolved.resolvedFrom,
        endpointPath: resolved.endpointPath,
        searchStrategy: usedStrategy,
        upstreamReturnedEmpty: (scanResult.meta.upstreamTotalCount ?? 0) === 0,
        regionDiagnostics,
      },
    };
  } catch {
    return { ok: false, error: { code: "FETCH_FAILED", message: "보조금24 API 호출에 실패했습니다." } };
  }
}

export async function getBenefitItem(serviceId: string): Promise<PublicApiResult<{ item: BenefitCandidate; conditions: string[] }>> {
  const id = serviceId.trim();
  if (!id) return { ok: false, error: { code: "INPUT", message: "serviceId를 입력하세요." } };
  const fromSnapshot = getSnapshotOrNull();
  let found = fromSnapshot
    ? findBenefitCandidateByServiceId(fromSnapshot.snapshot.items, id)
    : null;
  if (!found) {
    const searched = await searchBenefits("", {
      mode: "all",
      scanPages: "auto",
      limit: 50_000,
      maxMatches: 50_000,
    });
    if (!searched.ok) return searched as PublicApiResult<{ item: BenefitCandidate; conditions: string[] }>;
    found = findBenefitCandidateByServiceId(searched.data, id);
  }
  if (!found) return { ok: false, error: { code: "NO_DATA", message: "상세 대상 서비스를 찾지 못했습니다." } };

  const apiKey = (process.env.MOIS_BENEFITS_API_KEY ?? "").trim();
  const canQueryDetail = apiKey && !id.startsWith("benefit-");
  const conditions = new Set<string>(found.eligibilityHints ?? []);

  async function fetchConditionRows(defaultPath: string, conds: Record<string, string>) {
    const resolved = resolveOdcloudEndpoint(process.env.MOIS_BENEFITS_API_URL ?? "", defaultPath, {
      allowBaseOnly: true,
      allowDirOnly: true,
    });
    if (!resolved.ok || !apiKey) return;
    const url = new URL(resolved.url.toString());
    setSearchParams(url, { page: 1, perPage: 50, returnType: "JSON", ...conds });
    const fetched = await odcloudFetchWithAuth(url, apiKey, undefined, { allowServiceKeyFallback: true });
    if (!fetched.response.ok) return;
    const text = await fetched.response.text();
    if (text.trim().startsWith("<")) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const extracted = extractOdcloudRows(parsed);
    if ("error" in extracted) return;
    for (const row of extracted.rows) {
      for (const line of extractConditionTexts(row)) {
        conditions.add(line);
      }
    }
  }

  if (canQueryDetail) {
    await fetchConditionRows("/gov24/v3/serviceDetail", { "cond[서비스ID::EQ]": id });
    await fetchConditionRows("/gov24/v3/supportConditions", { "cond[서비스ID::EQ]": id });
  }

  const resultConditions = [...conditions].slice(0, 20);
  return {
    ok: true,
    data: {
      item: found,
      conditions: resultConditions,
    },
  };
}

function findBenefitCandidateByServiceId(items: BenefitCandidate[], id: string): BenefitCandidate | null {
  return items.find((item) => item.id === id) ?? items.find((item) => item.title.includes(id)) ?? null;
}

export const __test__ = {
  buildBenefitsConds,
  normalizeBenefits,
  extractConditionTexts,
  extractRegionContext,
  findBenefitCandidateByServiceId,
};
