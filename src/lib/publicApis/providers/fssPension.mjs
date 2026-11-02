// FSS 통합연금포털 OpenAPI (연금저축 비교공시) contract helpers shared by the sync CLI and the app.
// Checked against captured responses on 2026-10-15. The official guide differs from real payloads:
// guaranteedInterestRate is free text, product rows expose earnRate3/5/7/10, and fund responses
// mix product rows with rows that carry only company/product/reserves.

export const FSS_PENSION_API_BASE_URL = "https://www.fss.or.kr/openapi/api";

export const FSS_PENSION_SOURCE = Object.freeze({
  id: "fss-lifeplan-openapi",
  name: "통합연금포털(금융감독원) OpenAPI",
  attribution: "통합연금포털(금융감독원) 콘텐츠",
  url: "https://www.fss.or.kr/fss/lifeplan/goodsCmpr/list4.do?menuNo=201274",
});

// The portal pages that publish each dataset (checked 2026-10-15); screens link here as the original source.
export const FSS_PENSION_PAGES = Object.freeze({
  products: "https://www.fss.or.kr/fss/lifeplan/goodsCmpr/list4.do?menuNo=201274",
  guaranteed: "https://www.fss.or.kr/fss/lifeplan/svingsInsrnc/list.do?menuNo=200971",
});

export const FSS_PENSION_PRODUCTS_SNAPSHOT = "fss_pension_products_snapshot.json";
export const FSS_PENSION_GUARANTEED_SNAPSHOT = "fss_pension_guaranteed_snapshot.json";
export const FSS_PENSION_SCHEMA_VERSION = 1;
// Quarterly/monthly disclosures: a collection receipt older than this no longer proves the newest period was checked.
export const FSS_PENSION_SNAPSHOT_MAX_AGE_DAYS = 7;

export const FSS_PENSION_PRODUCT_AREAS = Object.freeze([
  Object.freeze({ code: 1, label: "은행" }),
  Object.freeze({ code: 3, label: "자산운용" }),
  Object.freeze({ code: 4, label: "생명보험" }),
  Object.freeze({ code: 5, label: "손해보험" }),
]);

export const FSS_PENSION_GUARANTEED_AREAS = Object.freeze([
  Object.freeze({ code: 4, label: "생명보험" }),
  Object.freeze({ code: 5, label: "손해보험" }),
]);

const RATE_BOUNDS = Object.freeze({ min: -100, max: 100_000 });
const FEE_RATE_BOUNDS = Object.freeze({ min: -100, max: 100 });

const RESULT_STATUS_BY_CODE = Object.freeze({
  "000": "ok",
  "001": "no_data",
  "100": "invalid_key",
  "101": "daily_limit",
  "102": "ip_mismatch",
  "200": "service_missing",
  "500": "server_error",
  "501": "server_unavailable",
  "600": "approval_required",
  "700": "invalid_params",
  "900": "undefined_error",
});

const ERROR_CODE_BY_STATUS = Object.freeze({
  no_data: "NO_DATA",
  invalid_key: "AUTH",
  ip_mismatch: "AUTH",
  approval_required: "AUTH",
  daily_limit: "RATE_LIMIT",
  invalid_params: "BAD_REQUEST",
});

export class FssPensionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FssPensionError";
    this.code = code;
    this.details = details;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function classifyFssPensionResult(payload) {
  const code = isRecord(payload) && typeof payload.code === "string" ? payload.code.trim() : "";
  const message = isRecord(payload) && typeof payload.message === "string" ? payload.message.trim() : "";
  return { code, status: RESULT_STATUS_BY_CODE[code] ?? "unknown", message };
}

function contractError(label, reason) {
  return new FssPensionError("CONTRACT", `${label}: ${reason}`);
}

function readResultList(payload, label) {
  const result = classifyFssPensionResult(payload);
  if (result.status !== "ok") {
    throw new FssPensionError(
      ERROR_CODE_BY_STATUS[result.status] ?? "UPSTREAM",
      `${label}: result ${result.code || "missing"} ${result.message}`.trim(),
      { resultCode: result.code, resultStatus: result.status },
    );
  }
  if (!Array.isArray(payload.list) || payload.list.length === 0) {
    throw contractError(label, "list is missing or empty");
  }
  if (payload.count !== undefined && payload.count !== payload.list.length) {
    throw contractError(label, `count ${String(payload.count)} does not match ${payload.list.length} rows`);
  }
  return payload.list;
}

function requiredText(row, key, label) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw contractError(label, `${key} must be non-empty text`);
  return value.trim();
}

function optionalText(row, key, label) {
  if (!Object.hasOwn(row, key) || row[key] === null) return null;
  if (typeof row[key] !== "string") throw contractError(label, `${key} must be text`);
  return row[key].trim() || null;
}

function optionalNumber(row, key, label, { min, max }) {
  if (!Object.hasOwn(row, key) || row[key] === null) return null;
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw contractError(label, `${key} must be a number in [${min}, ${max}]`);
  }
  return value;
}

function yesNo(row, key, label) {
  const value = requiredText(row, key, label);
  if (value !== "Y" && value !== "N") throw contractError(label, `${key} must be Y or N`);
  return value;
}

function calendarDate(text, label) {
  const matched = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!matched) throw contractError(label, "launchDate must be YYYY/MM/DD");
  const [year, month, day] = [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw contractError(label, "launchDate is not a calendar date");
  }
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

function dropExactDuplicates(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { items: unique, removed: items.length - unique.length };
}

/**
 * psProdList2 (상품별 수익률·수수료율, '25.4분기 이후) for one area.
 * Rows without product attributes (no `sells`) are excluded and counted, never treated as products.
 */
export function normalizeFssPensionProductRows(payload, area) {
  const label = `psProdList2 area ${area.code}`;
  const rows = readResultList(payload, label);
  const items = [];
  let excludedRowsWithoutProductInfo = 0;
  rows.forEach((row, index) => {
    const rowLabel = `${label} row ${index}`;
    if (!isRecord(row)) throw contractError(rowLabel, "row must be an object");
    if (requiredText(row, "area", rowLabel) !== area.label) {
      throw contractError(rowLabel, `area must be ${area.label}`);
    }
    const company = requiredText(row, "company", rowLabel);
    const product = requiredText(row, "product", rowLabel);
    if (!Object.hasOwn(row, "sells")) {
      excludedRowsWithoutProductInfo += 1;
      return;
    }
    // Bounds only reject corrupt values; published outliers (a -0.106% fee, a 744% 3-year return) are kept as-is.
    items.push({
      areaCode: area.code,
      area: area.label,
      company,
      product,
      launchDate: calendarDate(requiredText(row, "launchDate", rowLabel), rowLabel),
      productType: requiredText(row, "productType", rowLabel),
      rcvMethod: optionalText(row, "rcvMethod", rowLabel),
      feeType: requiredText(row, "feeType", rowLabel),
      sells: yesNo(row, "sells", rowLabel),
      guarantees: yesNo(row, "guarantees", rowLabel),
      reserve: optionalNumber(row, "reserve", rowLabel, { min: 0, max: Number.MAX_SAFE_INTEGER }),
      reserve1: optionalNumber(row, "reserve1", rowLabel, { min: 0, max: Number.MAX_SAFE_INTEGER }),
      reserve2: optionalNumber(row, "reserve2", rowLabel, { min: 0, max: Number.MAX_SAFE_INTEGER }),
      reserve3: optionalNumber(row, "reserve3", rowLabel, { min: 0, max: Number.MAX_SAFE_INTEGER }),
      earnRate3: optionalNumber(row, "earnRate3", rowLabel, RATE_BOUNDS),
      earnRate5: optionalNumber(row, "earnRate5", rowLabel, RATE_BOUNDS),
      earnRate7: optionalNumber(row, "earnRate7", rowLabel, RATE_BOUNDS),
      earnRate10: optionalNumber(row, "earnRate10", rowLabel, RATE_BOUNDS),
      avgTotalEarRate: optionalNumber(row, "avgTotalEarRate", rowLabel, RATE_BOUNDS),
      avgFeeRate: optionalNumber(row, "avgFeeRate", rowLabel, FEE_RATE_BOUNDS),
    });
  });
  if (items.length === 0) throw contractError(label, "no rows carry product information");
  const deduplicated = dropExactDuplicates(items);
  return {
    items: deduplicated.items,
    sourceRows: rows.length,
    excludedRowsWithoutProductInfo,
    exactDuplicateRowsRemoved: deduplicated.removed,
  };
}

/** psGuaranteedProdList (원리금보장 연금저축보험) for one area; all rows must share one report month. */
export function normalizeFssPensionGuaranteedRows(payload, area) {
  const label = `psGuaranteedProdList area ${area.code}`;
  const rows = readResultList(payload, label);
  let reportMonth = null;
  const items = rows.map((row, index) => {
    const rowLabel = `${label} row ${index}`;
    if (!isRecord(row)) throw contractError(rowLabel, "row must be an object");
    const matched = requiredText(row, "reportDate", rowLabel).match(/^(\d{4})\/(0[1-9]|1[0-2])$/);
    if (!matched) throw contractError(rowLabel, "reportDate must be YYYY/MM");
    const rowMonth = `${matched[1]}-${matched[2]}`;
    if (reportMonth !== null && reportMonth !== rowMonth) throw contractError(label, "rows have different report months");
    reportMonth = rowMonth;
    return {
      areaCode: area.code,
      area: area.label,
      reportMonth: rowMonth,
      company: requiredText(row, "company", rowLabel),
      product: requiredText(row, "product", rowLabel),
      publishedInterestRate: (() => {
        const value = optionalNumber(row, "publishedInterestRate", rowLabel, { min: 0, max: 20 });
        if (value === null) throw contractError(rowLabel, "publishedInterestRate is required");
        return value;
      })(),
      guaranteedInterestRate: optionalText(row, "guaranteedInterestRate", rowLabel),
      fpFeeDesc: optionalText(row, "fpFeeDesc", rowLabel),
      agentFeeDesc: optionalText(row, "agentFeeDesc", rowLabel),
      onlineFeeDesc: optionalText(row, "onlineFeeDesc", rowLabel),
      tel: optionalText(row, "tel", rowLabel),
    };
  });
  const deduplicated = dropExactDuplicates(items);
  return {
    items: deduplicated.items,
    reportMonth,
    sourceRows: rows.length,
    exactDuplicateRowsRemoved: deduplicated.removed,
  };
}

/** The most recent completed quarters in KST, newest first (the current quarter is never included). */
export function listRecentCompletedQuarters(now = new Date(), count = 3) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  let year = Number(parts.find((part) => part.type === "year")?.value);
  let quarter = Math.floor((Number(parts.find((part) => part.type === "month")?.value) - 1) / 3) + 1;
  const out = [];
  for (let index = 0; index < count; index += 1) {
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
    out.push({ year, quarter });
  }
  return out;
}
