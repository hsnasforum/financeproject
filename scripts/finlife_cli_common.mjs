import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

await Promise.resolve();

export function ensureFetchAvailable() {
  if (typeof fetch !== "function") {
    console.error("[finlife-cli] Node 18+ 환경이 필요합니다(fetch 미지원).");
    process.exit(2);
  }
}

export function getFinlifeConfig() {
  const baseUrl = (process.env.FINLIFE_BASE_URL || "https://finlife.fss.or.kr/finlifeapi").trim().replace(/\/+$/, "");
  const apiKey = (process.env.FINLIFE_API_KEY || "").trim();
  if (!apiKey) {
    console.error("[finlife-cli] FINLIFE_API_KEY가 없습니다(.env.local 확인).");
    process.exit(2);
  }
  return { baseUrl, apiKey };
}

export function maskUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.searchParams.has("auth")) url.searchParams.set("auth", "***");
    return url.toString();
  } catch {
    return String(urlStr || "").replace(/([?&]auth=)[^&]+/gi, "$1***");
  }
}

export function parsePositiveInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeLookupKey(value) {
  return String(value || "").toLowerCase().replace(/[\s_\-:/()[\].]/g, "");
}

function pickValue(obj, keys) {
  const map = new Map();
  for (const [k, v] of Object.entries(obj || {})) {
    map.set(normalizeLookupKey(k), v);
  }
  for (const key of keys) {
    const hit = map.get(normalizeLookupKey(key));
    if (hit === undefined || hit === null || String(hit).trim() === "") continue;
    return hit;
  }
  return undefined;
}

function parseNumber(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

function parseNullableNumber(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseFinlifePaging(raw) {
  const root = (raw && typeof raw === "object") ? raw : {};
  const result = (root.result && typeof root.result === "object") ? root.result : {};
  return {
    totalCount: parseNumber(pickValue(result, ["total_count", "totalCount", "total_cnt", "tot_cnt", "list_total_count"])),
    nowPage: parseNumber(pickValue(result, ["now_page_no", "nowPageNo", "page_no", "pageNo", "current_page_no"])),
    maxPage: parseNumber(pickValue(result, ["max_page_no", "maxPageNo", "total_page_no", "totalPageNo", "last_page_no"])),
  };
}

function safePreview(value, max = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchJsonWithDiag(url, opts = {}) {
  const timeoutMs = parsePositiveInt(opts.timeoutMs, 10_000, 500, 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout(${timeoutMs}ms)`)), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const rawText = await res.text();
    const json = parseJsonText(rawText);
    const errCd = json?.result?.err_cd ?? json?.result?.errCd ?? null;
    const errMsg = json?.result?.err_msg ?? json?.result?.errMsg ?? null;

    return {
      ok: res.ok,
      status: res.status,
      contentType,
      json,
      textPreview: safePreview(rawText),
      errCd: errCd == null ? null : String(errCd),
      errMsg: errMsg == null ? null : String(errMsg),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const aborted = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
    return {
      ok: false,
      status: null,
      contentType: null,
      json: null,
      textPreview: safePreview(msg),
      errCd: aborted ? "TIMEOUT" : "FETCH_ERROR",
      errMsg: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

function pickTotalCount(json) {
  const result = json?.result && typeof json.result === "object" ? json.result : {};
  return parseNumber(
    result?.total_count
      ?? result?.totalCount
      ?? result?.totalCnt
      ?? json?.totalCount
      ?? json?.matchCount,
  );
}

function pickBaseListLen(json) {
  const baseListTop = Array.isArray(json?.baseList) ? json.baseList : null;
  if (baseListTop) return baseListTop.length;
  const baseListResult = Array.isArray(json?.result?.baseList) ? json.result.baseList : null;
  if (baseListResult) return baseListResult.length;
  return 0;
}

export function extractFinlifeCounts(json) {
  return {
    totalCount: pickTotalCount(json),
    baseListLen: pickBaseListLen(json),
  };
}

export function isFinlifeSuccess(diag) {
  const statusOk = typeof diag?.status === "number" && diag.status >= 200 && diag.status < 300;
  if (!statusOk) return false;
  const errCd = diag?.errCd == null ? "" : String(diag.errCd).trim();
  if (!errCd) return true;
  return errCd === "000";
}

export function extractBaseAndOption(raw) {
  const result = (raw && typeof raw === "object" && raw.result && typeof raw.result === "object") ? raw.result : {};
  const baseList = Array.isArray(result.baseList) ? result.baseList : [];
  const optionList = Array.isArray(result.optionList) ? result.optionList : [];
  const dataList = Array.isArray(result.data) ? result.data : [];
  return { baseList, optionList, dataList };
}

export async function fetchFinlifePage({ baseUrl, apiKey, kind, topFinGrpNo, pageNo, pageSize }) {
  const endpointMap = {
    deposit: "depositProductsSearch.json",
    saving: "savingProductsSearch.json",
    pension: "annuitySavingProductsSearch.json",
    "mortgage-loan": "mortgageLoanProductsSearch.json",
    "rent-house-loan": "rentHouseLoanProductsSearch.json",
    "credit-loan": "creditLoanProductsSearch.json",
  };
  const endpoint = endpointMap[kind];
  if (!endpoint) {
    const err = new Error(`Unsupported FINLIFE kind: ${String(kind)}`);
    err.status = 400;
    throw err;
  }
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set("auth", apiKey);
  url.searchParams.set("topFinGrpNo", topFinGrpNo);
  url.searchParams.set("pageNo", String(pageNo));
  if (Number.isFinite(Number(pageSize)) && Number(pageSize) > 0) {
    url.searchParams.set("pageSize", String(Math.trunc(Number(pageSize))));
  }
  const diag = await fetchJsonWithDiag(url.toString(), { timeoutMs: 10_000 });
  if (!isFinlifeSuccess(diag)) {
    const statusText = typeof diag.status === "number" ? `HTTP ${diag.status}` : "HTTP ERR";
    const codeText = diag.errCd ? ` err_cd=${diag.errCd}` : "";
    const messageText = diag.errMsg ? ` msg=${diag.errMsg}` : "";
    const err = new Error(`${statusText}${codeText}${messageText}`);
    err.status = diag.status;
    err.errCd = diag.errCd;
    throw err;
  }
  if (!diag.json || typeof diag.json !== "object") {
    const err = new Error("Invalid JSON response from FINLIFE");
    err.status = diag.status;
    throw err;
  }
  return diag.json;
}

export function parseProbeCandidates(raw) {
  const value = (raw || "").trim();
  if (value) {
    return [...new Set(value.split(",").map((v) => v.replace(/\D/g, "").padStart(6, "0").slice(0, 6)).filter((v) => /^\d{6}$/.test(v)))].sort();
  }
  const out = [];
  for (let n = 10000; n <= 90000; n += 10000) {
    out.push(String(n).padStart(6, "0"));
  }
  return out;
}

export function parseStatusFromError(error) {
  if (error && typeof error === "object" && Number.isFinite(error.status)) return Number(error.status);
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/HTTP\s*(\d{3})/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function deriveBestFromOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return null;

  let bestOpt = null;
  let bestVal = -Infinity;

  for (const opt of options) {
    const candidate = opt?.intr_rate2 ?? opt?.intr_rate;
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) continue;
    if (candidate > bestVal) {
      bestVal = candidate;
      bestOpt = opt;
    }
  }

  if (!bestOpt) return null;

  const intrRate = (typeof bestOpt.intr_rate === "number" && Number.isFinite(bestOpt.intr_rate)) ? bestOpt.intr_rate : null;
  const intrRate2Raw = (typeof bestOpt.intr_rate2 === "number" && Number.isFinite(bestOpt.intr_rate2)) ? bestOpt.intr_rate2 : null;

  return {
    save_trm: bestOpt.save_trm ?? undefined,
    intr_rate: intrRate,
    intr_rate2: intrRate2Raw ?? intrRate,
  };
}

function ensureProductBest(item) {
  if (!item || !Array.isArray(item.options)) return;
  const derived = deriveBestFromOptions(item.options);
  if (derived) {
    item.best = derived;
    return;
  }
  if (
    item.best
    && item.best.intr_rate2 == null
    && typeof item.best.intr_rate === "number"
    && Number.isFinite(item.best.intr_rate)
  ) {
    item.best.intr_rate2 = item.best.intr_rate;
  }
}

export function mergeProducts(baseRows, optionRows, topFinGrpNo) {
  const byCode = new Map();
  for (const base of baseRows) {
    const row = (base && typeof base === "object") ? base : {};
    const code = String(row.fin_prdt_cd ?? "").trim();
    if (!code) continue;
    byCode.set(code, {
      fin_prdt_cd: code,
      fin_co_no: row.fin_co_no == null ? undefined : String(row.fin_co_no),
      kor_co_nm: row.kor_co_nm == null ? undefined : String(row.kor_co_nm),
      fin_prdt_nm: row.fin_prdt_nm == null ? undefined : String(row.fin_prdt_nm),
      options: [],
      raw: { ...(row || {}), top_fin_grp_no: topFinGrpNo },
    });
  }
  for (const option of optionRows) {
    const row = (option && typeof option === "object") ? option : {};
    const code = String(row.fin_prdt_cd ?? "").trim();
    if (!code || !byCode.has(code)) continue;
    byCode.get(code).options.push({
      save_trm: row.save_trm == null ? undefined : String(row.save_trm),
      intr_rate: parseNullableNumber(row.intr_rate),
      intr_rate2: parseNullableNumber(row.intr_rate2),
      raw: row,
    });
  }
  for (const item of byCode.values()) ensureProductBest(item);
  return [...byCode.values()];
}

export function mergeAcrossGroups(groupRows) {
  const byCode = new Map();
  let duplicateAcrossGroupsCount = 0;

  for (const group of groupRows) {
    for (const item of group.items) {
      const existing = byCode.get(item.fin_prdt_cd);
      if (!existing) {
        byCode.set(item.fin_prdt_cd, { ...item, options: [...item.options], __group: group.group });
        continue;
      }
      if (existing.__group !== group.group) duplicateAcrossGroupsCount += 1;
      const optMap = new Map(existing.options.map((opt) => [`${opt.save_trm ?? ""}:${opt.intr_rate ?? ""}:${opt.intr_rate2 ?? ""}`, opt]));
      for (const opt of item.options) {
        const key = `${opt.save_trm ?? ""}:${opt.intr_rate ?? ""}:${opt.intr_rate2 ?? ""}`;
        if (!optMap.has(key)) optMap.set(key, opt);
      }
      existing.options = [...optMap.values()];
      ensureProductBest(existing);
    }
  }

  for (const item of byCode.values()) ensureProductBest(item);

  return {
    items: [...byCode.values()].map((entry) => {
      const copy = { ...entry };
      delete copy.__group;
      return copy;
    }),
    duplicateAcrossGroupsCount,
  };
}

export function snapshotFilePath(kind) {
  return path.join(process.cwd(), ".data", `finlife_${kind}_snapshot.json`);
}

export function writeSnapshot(kind, payload) {
  const filePath = snapshotFilePath(kind);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (payload && Array.isArray(payload.items)) {
    for (const item of payload.items) ensureProductBest(item);
  }
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function readSnapshot(kind) {
  const filePath = snapshotFilePath(kind);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function runShouldSync(meta, ttlMs) {
  if (!meta || typeof meta.generatedAt !== "string") return true;
  const generatedMs = Date.parse(meta.generatedAt);
  if (!Number.isFinite(generatedMs)) return true;
  if (Date.now() - generatedMs > ttlMs) return true;
  const completionRate = typeof meta.completionRate === "number" ? meta.completionRate : 0;
  return completionRate < 0.95;
}
