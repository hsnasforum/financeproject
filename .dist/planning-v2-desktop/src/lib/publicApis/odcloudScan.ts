import crypto from "node:crypto";
import { summarizeSchemaShape } from "./schemaDrift";

type ObjRow = Record<string, unknown>;

type ExtractOk = {
  rows: ObjRow[];
  meta: {
    totalCount?: number;
    totalCountKey?: string;
    page?: number;
    pageKey?: string;
    perPage?: number;
    perPageKey?: string;
  };
};

type ExtractErr = {
  error: {
    code: "SCHEMA_MISMATCH" | "AUTH_FAILED" | "UPSTREAM_ERROR";
    message: string;
    diagnostics?: Record<string, unknown>;
  };
};

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asObjectArray(value: unknown): ObjRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((item): item is ObjRow => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  return rows;
}

function pickNumberWithKey(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): { value?: number; key?: string } {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = asFiniteNumber(source[key]);
      if (value !== undefined) return { value, key };
    }
  }
  return {};
}

export function extractOdcloudRows(json: unknown): ExtractOk | ExtractErr {
  const detected = detectOdcloudError(json);
  if (detected) return { error: detected };

  const candidates: unknown[] = [];
  if (json && typeof json === "object") {
    const root = json as Record<string, unknown>;
    candidates.push(root.data);
    if (root.data && typeof root.data === "object") {
      candidates.push((root.data as Record<string, unknown>).data);
    }
    candidates.push(root.rows);
    if (root.result && typeof root.result === "object") {
      candidates.push((root.result as Record<string, unknown>).data);
    }
    candidates.push(root.items);
  }
  candidates.push(json);

  for (const candidate of candidates) {
    const rows = asObjectArray(candidate);
    if (rows && rows.length >= 0) {
      const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
      const rootData = rec?.data && typeof rec.data === "object" && !Array.isArray(rec.data) ? (rec.data as Record<string, unknown>) : null;
      const rootResult = rec?.result && typeof rec.result === "object" ? (rec.result as Record<string, unknown>) : null;
      const rootResponse = rec?.response && typeof rec.response === "object" ? (rec.response as Record<string, unknown>) : null;
      const sources = [rec, rootData, rootResult, rootResponse];
      const totalCountPicked = pickNumberWithKey(sources, [
        "totalCount",
        "total_count",
        "count",
        "matchCount",
        "match_count",
        "totalCnt",
        "total_cnt",
        "total",
        "totalElements",
      ]);
      const pagePicked = pickNumberWithKey(sources, [
        "page",
        "nowPage",
        "now_page_no",
        "pageNo",
        "page_no",
      ]);
      const perPagePicked = pickNumberWithKey(sources, [
        "perPage",
        "per_page",
        "pageSize",
        "numOfRows",
        "rows",
      ]);
      return {
        rows,
        meta: {
          totalCount: totalCountPicked.value,
          totalCountKey: totalCountPicked.key,
          page: pagePicked.value,
          pageKey: pagePicked.key,
          perPage: perPagePicked.value,
          perPageKey: perPagePicked.key,
        },
      };
    }
  }

  return {
    error: {
      code: "SCHEMA_MISMATCH",
      message: "ODcloud 응답에서 배열 데이터를 찾지 못했습니다.",
      diagnostics: {
        shape: summarizeSchemaShape(json, {
          rowPathHints: [
            "data",
            "rows",
            "items",
            "result.data",
            "result.rows",
            "result.items",
            "response.data",
            "response.rows",
            "response.items",
          ],
        }),
      },
    },
  };
}

function detectOdcloudError(
  json: unknown,
): { code: "AUTH_FAILED" | "UPSTREAM_ERROR"; message: string } | null {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;

  const codeCandidates = [
    rec.resultCode,
    rec.code,
    rec.errCd,
    (rec.response as Record<string, unknown> | undefined)?.header
      ? ((rec.response as Record<string, unknown>).header as Record<string, unknown>).resultCode
      : undefined,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const msgCandidates = [
    rec.resultMsg,
    rec.message,
    rec.errMsg,
    (rec.response as Record<string, unknown> | undefined)?.header
      ? ((rec.response as Record<string, unknown>).header as Record<string, unknown>).resultMsg
      : undefined,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const merged = `${codeCandidates.join(" ")} ${msgCandidates.join(" ")}`.toLowerCase();
  if (!merged) return null;

  const authHint =
    merged.includes("service_key") ||
    merged.includes("api key") ||
    merged.includes("auth") ||
    merged.includes("인증") ||
    merged.includes("권한") ||
    merged.includes("등록") ||
    merged.includes("access denied");
  if (authHint) {
    return { code: "AUTH_FAILED", message: "ODcloud 인증 또는 권한 오류가 감지되었습니다." };
  }

  const upstreamHint = merged.includes("error") || merged.includes("요청인자") || merged.includes("invalid");
  if (upstreamHint) {
    return { code: "UPSTREAM_ERROR", message: "ODcloud 응답에서 업스트림 오류 신호가 감지되었습니다." };
  }
  return null;
}

function collectPrimitives(value: unknown, depth: number, out: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (depth <= 0) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPrimitives(item, depth - 1, out);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectPrimitives(entry, depth - 1, out);
    }
  }
}

export function buildSearchText(row: ObjRow): string {
  const parts: string[] = [];
  collectPrimitives(row, 1, parts);
  return parts.join(" ").toLowerCase();
}

type FetchPageResult =
  | { ok: true; rows: ObjRow[]; totalCount?: number; page?: number; perPage?: number }
  | { ok: false; error: { code: string; message: string; diagnostics?: Record<string, unknown> } };

function normalizeRowKey(rawKey: string): string {
  return rawKey.toLowerCase().replace(/[\s_\-:/()[\].]/g, "");
}

const GOV24_ID_KEYS = [
  "serviceid",
  "svcid",
  "srvid",
  "servid",
  "s_id",
  "pblancno",
  "서비스id",
  "서비스아이디",
  "서비스아이디값",
  "id",
];

function fallbackGov24Hash(row: ObjRow): string | null {
  const preferred = ["서비스명", "serviceName", "servNm", "svcNm", "title", "소관기관명", "org", "applyHow", "applyMethod", "link", "url"];
  const values: string[] = [];
  for (const key of preferred) {
    const hit = row[key];
    if (hit === undefined || hit === null) continue;
    const text = String(hit).trim();
    if (text) values.push(`${key}:${text}`);
  }
  if (values.length === 0) {
    const compact = Object.entries(row)
      .filter(([, v]) => v !== null && v !== undefined && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
      .map(([k, v]) => `${k}:${String(v).trim()}`)
      .filter((entry) => entry.length > 2)
      .sort();
    if (compact.length === 0) return null;
    values.push(...compact.slice(0, 12));
  }
  const hash = crypto.createHash("sha1").update(values.join("|")).digest("hex").slice(0, 16);
  return `fh:${hash}`;
}

export function pickGov24ServiceId(row: ObjRow): { id: string | null; usedFallback: boolean } {
  const entries = Object.entries(row);
  const normalized = new Map<string, unknown>();
  for (const [k, v] of entries) normalized.set(normalizeRowKey(k), v);
  for (const key of GOV24_ID_KEYS) {
    const hit = normalized.get(normalizeRowKey(key));
    if (hit === undefined || hit === null) continue;
    const text = String(hit).trim();
    if (text) return { id: text, usedFallback: false };
  }
  return { id: fallbackGov24Hash(row), usedFallback: true };
}

function firstRowFingerprint(row: ObjRow | undefined): string | null {
  if (!row) return null;
  const id = pickGov24ServiceId(row).id;
  if (id) return id;
  const pairs = Object.entries(row)
    .slice(0, 6)
    .map(([k, v]) => `${k}:${String(v ?? "").slice(0, 48)}`);
  if (!pairs.length) return null;
  return pairs.join("|");
}

export async function scanPagedOdcloud(params: {
  fetchPage: (pageNo: number) => Promise<FetchPageResult>;
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
    rowsMatched: ObjRow[];
  }) => void;
  queryText?: string;
  deep?: boolean;
  mode?: "search" | "all";
  maxPages?: number | "auto";
  maxMatches?: number;
  requestedPerPage?: number;
  extraSearchParams?: Record<string, string | undefined>;
}) {
  const mode = params.mode ?? "search";
  const queryText = (params.queryText ?? "").trim().toLowerCase();
  const maxPagesHardCapEnv = Number(process.env.BENEFITS_SCAN_HARD_CAP_PAGES ?? process.env.BENEFITS_SCAN_HARD_CAP ?? "");
  const maxPagesHardCap = Number.isFinite(maxPagesHardCapEnv) && maxPagesHardCapEnv > 0
    ? Math.trunc(maxPagesHardCapEnv)
    : 200;
  const isAutoMaxPages = params.maxPages === "auto";
  const requestedMaxPages: number | "auto" = params.maxPages === "auto"
    ? "auto"
    : typeof params.maxPages === "number" && params.maxPages > 0
      ? Math.trunc(params.maxPages)
      : params.deep
        ? 10
        : 3;
  const maxPagesCandidate = isAutoMaxPages
    ? maxPagesHardCap
    : typeof params.maxPages === "number" && params.maxPages > 0
      ? params.maxPages
      : params.deep
        ? 10
        : 3;
  const maxPages = Math.max(1, maxPagesCandidate);
  const maxMatches = Number.isFinite(params.maxMatches) && (params.maxMatches ?? 0) > 0
    ? Number(params.maxMatches)
    : mode === "all"
      ? 20
      : 200;

  const matched: ObjRow[] = [];
  let scannedRows = 0;
  let scannedPages = 0;
  let upstreamTotalCount: number | undefined;
  let perPageObserved: number | undefined;
  let effectivePerPage: number | undefined;
  let neededPagesEstimate: number | undefined;
  let paginationSuspected = false;
  let consecutiveNoNewUnique = 0;
  const rawUniqueIds = new Set<string>();
  let idFallbackUsedCount = 0;
  const firstRowByPage = new Map<number, string>();
  let truncated = false;

  let effectiveMaxPages = maxPages;
  for (let pageNo = 1; pageNo <= effectiveMaxPages; pageNo += 1) {
    let page = await params.fetchPage(pageNo);
    if (page.ok && page.rows.length === 0 && pageNo > 1) {
      const retry = await params.fetchPage(pageNo);
      if (retry.ok) page = retry;
    }
    if (!page.ok) return page;
    scannedPages += 1;
    scannedRows += page.rows.length;
    if (upstreamTotalCount === undefined && page.totalCount !== undefined) {
      upstreamTotalCount = page.totalCount;
    }
    if (perPageObserved === undefined && page.perPage !== undefined && page.perPage > 0) {
      perPageObserved = page.perPage;
    }
    if (perPageObserved === undefined && page.rows.length > 0) {
      perPageObserved = page.rows.length;
    }
    if (effectivePerPage === undefined) {
      if (perPageObserved !== undefined && perPageObserved > 0) {
        const canUseActualPageSize =
          pageNo === 1 &&
          page.rows.length >= 50 &&
          page.rows.length < Math.floor(perPageObserved * 0.75);
        effectivePerPage = canUseActualPageSize ? page.rows.length : perPageObserved;
      } else if (page.rows.length > 0) {
        effectivePerPage = page.rows.length;
      }
    }
    const estimatePerPage = effectivePerPage ?? perPageObserved ?? params.requestedPerPage;
    if (neededPagesEstimate === undefined && upstreamTotalCount !== undefined && estimatePerPage !== undefined && estimatePerPage > 0) {
      neededPagesEstimate = Math.max(1, Math.ceil(upstreamTotalCount / estimatePerPage));
      effectiveMaxPages = Math.min(maxPages, neededPagesEstimate);
    }

    const firstFingerprint = firstRowFingerprint(page.rows[0]);
    if (firstFingerprint) {
      firstRowByPage.set(pageNo, firstFingerprint);
      if (pageNo === 2 && firstRowByPage.get(1) === firstFingerprint) {
        paginationSuspected = true;
      }
    }

    let newUniqueThisPage = 0;
    for (const row of page.rows) {
      const picked = pickGov24ServiceId(row);
      const id = picked.id;
      if (!id) continue;
      if (picked.usedFallback) idFallbackUsedCount += 1;
      if (!rawUniqueIds.has(id)) {
        rawUniqueIds.add(id);
        newUniqueThisPage += 1;
      }
    }
    if (pageNo > 1) {
      if (newUniqueThisPage === 0 && page.rows.length > 0) consecutiveNoNewUnique += 1;
      else consecutiveNoNewUnique = 0;
      if (consecutiveNoNewUnique >= 2) paginationSuspected = true;
    }

    for (const row of page.rows) {
      const include = mode === "all" || !queryText || buildSearchText(row).includes(queryText);
      if (!include) continue;
      matched.push(row);
      if (matched.length >= maxMatches) {
        truncated = true;
        break;
      }
    }

    params.onPage?.({
      pageNo,
      pageRows: page.rows.length,
      pagesFetched: scannedPages,
      rowsFetched: scannedRows,
      upstreamTotalCount,
      neededPagesEstimate,
      effectiveMaxPages,
      uniqueIds: rawUniqueIds.size,
      matchedRows: matched.length,
      rowsMatched: matched,
    });
    if (truncated) break;
    if (page.rows.length === 0) break;
  }

  return {
    ok: true as const,
    rowsMatched: matched,
    meta: {
      scannedPages,
      scannedRows,
      pagesFetched: scannedPages,
      rowsFetched: scannedRows,
      upstreamTotalCount,
      neededPagesEstimate,
      effectivePerPage,
      requestedPerPage: params.requestedPerPage,
      autoMaxPagesApplied: isAutoMaxPages,
      requestedMaxPages,
      effectiveMaxPages,
      truncatedByMaxPages: Boolean(neededPagesEstimate && neededPagesEstimate > maxPages),
      truncatedByHardCap: Boolean(isAutoMaxPages && neededPagesEstimate && neededPagesEstimate > maxPagesHardCap),
      matchedRows: matched.length,
      uniqueIds: rawUniqueIds.size || undefined,
      idFallbackUsedCount,
      paginationSuspected,
      truncated,
    },
  };
}
