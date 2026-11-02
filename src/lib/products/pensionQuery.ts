import { z } from "zod";
import { formatKstIsoDate } from "@/lib/format/kstCalendarDate";
import {
  FSS_PENSION_SNAPSHOT_MAX_AGE_DAYS,
  listRecentCompletedQuarters,
} from "@/lib/publicApis/providers/fssPension.mjs";
import {
  PENSION_GUARANTEED_AREA_OPTIONS,
  PENSION_GUARANTEED_CHANNELS,
  PENSION_GUARANTEED_SORTS,
  PENSION_PRODUCT_AREA_OPTIONS,
  PENSION_PRODUCT_SORTS,
  PENSION_PRODUCTS_PAGE_SIZE,
  type PensionGuaranteedChannel,
  type PensionGuaranteedSort,
  type PensionProductSort,
} from "./pensionOptions";
import type {
  PensionGuaranteedItem,
  PensionGuaranteedSnapshot,
  PensionProductItem,
  PensionProductsSnapshot,
} from "./pensionSnapshots";

// Pure query and view helpers for the 연금저축 screen. The defaults favour cost control over chasing past returns.

const DAY_MS = 24 * 60 * 60 * 1000;
// A disclosure period this far behind the newest completed one is flagged even if the collection is recent.
const STALE_PRODUCT_QUARTERS = 2;
const STALE_GUARANTEED_MONTHS = 6;

const productAreaValues = ["all", ...PENSION_PRODUCT_AREA_OPTIONS.map((area) => area.value)] as [string, ...string[]];
const guaranteedAreaValues = ["all", ...PENSION_GUARANTEED_AREA_OPTIONS.map((area) => area.value)] as [string, ...string[]];

const textParam = (max: number) => z.string().trim().max(max);

const guaranteedQuerySchema = z.object({
  dataset: z.literal("guaranteed"),
  area: z.enum(guaranteedAreaValues).default("all"),
  channel: z.enum(["all", ...PENSION_GUARANTEED_CHANNELS.map((channel) => channel.id)] as [string, ...string[]]).default("all"),
  sort: z.enum(PENSION_GUARANTEED_SORTS.map((sort) => sort.id) as [PensionGuaranteedSort, ...PensionGuaranteedSort[]]).default("nameAsc"),
  q: textParam(50).default(""),
}).strict();

const productsQuerySchema = z.object({
  dataset: z.literal("products"),
  area: z.enum(productAreaValues).default("all"),
  sells: z.enum(["Y", "all"]).default("Y"),
  guarantees: z.enum(["all", "Y", "N"]).default("all"),
  productType: textParam(40).default("all"),
  sort: z.enum(PENSION_PRODUCT_SORTS.map((sort) => sort.id) as [PensionProductSort, ...PensionProductSort[]]).default("feeAsc"),
  q: textParam(50).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
}).strict();

export type PensionGuaranteedQuery = z.infer<typeof guaranteedQuerySchema>;
export type PensionProductsQuery = z.infer<typeof productsQuerySchema>;
export type PensionQuery = PensionGuaranteedQuery | PensionProductsQuery;

export class PensionQueryError extends Error {}

/** Parses URL search params; unknown keys or values are rejected rather than ignored. */
export function parsePensionQuery(searchParams: URLSearchParams): PensionQuery {
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key === "debug") continue;
    if (Object.hasOwn(raw, key)) throw new PensionQueryError(`${key}는 한 번만 지정할 수 있습니다.`);
    raw[key] = value;
  }
  raw.dataset ??= "guaranteed";
  const schema = raw.dataset === "products" ? productsQuerySchema : raw.dataset === "guaranteed" ? guaranteedQuerySchema : null;
  if (!schema) throw new PensionQueryError("dataset은 guaranteed 또는 products여야 합니다.");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PensionQueryError(`${issue?.path.join(".") || "query"} 값이 올바르지 않습니다.`);
  }
  return parsed.data;
}

export type PensionFreshness = {
  collectedAt: string;
  collectionAgeDays: number;
  maxAgeDays: number;
  collectionStale: boolean;
  asOfLabel: string;
  periodsBehind: number;
  periodUnit: "quarter" | "month";
  periodStale: boolean;
  /** Newer periods the collection found unpublished (products only). */
  unpublishedPeriods: string[];
};

function collectionAge(generatedAt: string, now: Date) {
  const ageMs = Math.max(0, now.getTime() - Date.parse(generatedAt));
  return {
    collectedAt: generatedAt,
    collectionAgeDays: Math.floor(ageMs / DAY_MS),
    maxAgeDays: FSS_PENSION_SNAPSHOT_MAX_AGE_DAYS,
    // Same boundary as freshness:release: stale only once the age exceeds the limit.
    collectionStale: ageMs > FSS_PENSION_SNAPSHOT_MAX_AGE_DAYS * DAY_MS,
  };
}

export function evaluateProductsFreshness(snapshot: PensionProductsSnapshot, now: Date): PensionFreshness {
  const [latest] = listRecentCompletedQuarters(now, 1);
  const periodsBehind = Math.max(0, (latest.year * 4 + latest.quarter) - (snapshot.asOf.year * 4 + snapshot.asOf.quarter));
  return {
    ...collectionAge(snapshot.generatedAt, now),
    asOfLabel: snapshot.asOf.label,
    periodsBehind,
    periodUnit: "quarter",
    periodStale: periodsBehind >= STALE_PRODUCT_QUARTERS,
    unpublishedPeriods: snapshot.selection.attempts
      .filter((attempt) => attempt.status === "not_published")
      .map((attempt) => `${attempt.year}년 ${attempt.quarter}분기`),
  };
}

export function evaluateGuaranteedFreshness(snapshot: PensionGuaranteedSnapshot, now: Date): PensionFreshness {
  const [currentYear, currentMonth] = formatKstIsoDate(now).split("-").map(Number);
  const [reportYear, reportMonth] = snapshot.asOf.reportMonth.split("-").map(Number);
  const periodsBehind = Math.max(0, (currentYear * 12 + currentMonth) - (reportYear * 12 + reportMonth));
  return {
    ...collectionAge(snapshot.generatedAt, now),
    asOfLabel: snapshot.asOf.label,
    periodsBehind,
    periodUnit: "month",
    periodStale: periodsBehind >= STALE_GUARANTEED_MONTHS,
    unpublishedPeriods: [],
  };
}

function normalizeSearch(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function matchesSearch(item: { company: string; product: string }, q: string): boolean {
  if (!q) return true;
  const needle = normalizeSearch(q);
  return normalizeSearch(item.company).includes(needle) || normalizeSearch(item.product).includes(needle);
}

const collator = new Intl.Collator("ko");

function compareNames(left: { company: string; product: string }, right: { company: string; product: string }): number {
  return collator.compare(left.company, right.company) || collator.compare(left.product, right.product);
}

/** Missing values always sort last, whatever the direction. */
function compareNullable(left: number | null, right: number | null, direction: "asc" | "desc"): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

export type PensionFeeStructure = {
  channel: PensionGuaranteedChannel;
  label: string;
  /** 계약체결비용 and 계약관리비용 as published ("|" separates them); null when the channel discloses none. */
  acquisition: string | null;
  maintenance: string | null;
};

export function splitPensionFeeDescription(value: string | null): { acquisition: string | null; maintenance: string | null } {
  if (!value) return { acquisition: null, maintenance: null };
  const separator = value.indexOf("|");
  if (separator < 0) return { acquisition: value.trim() || null, maintenance: null };
  return {
    acquisition: value.slice(0, separator).trim() || null,
    maintenance: value.slice(separator + 1).trim() || null,
  };
}

export type PensionGuaranteedRow = {
  area: string;
  company: string;
  product: string;
  publishedInterestRate: number;
  guaranteedInterestRate: string | null;
  tel: string | null;
  fees: PensionFeeStructure[];
  channels: string[];
};

function toGuaranteedRow(item: PensionGuaranteedItem): PensionGuaranteedRow {
  const fees = PENSION_GUARANTEED_CHANNELS.map((channel) => ({
    channel: channel.id,
    label: channel.label,
    ...splitPensionFeeDescription(item[channel.field]),
  }));
  return {
    area: item.area,
    company: item.company,
    product: item.product,
    publishedInterestRate: item.publishedInterestRate,
    guaranteedInterestRate: item.guaranteedInterestRate,
    tel: item.tel,
    fees,
    channels: fees.filter((fee) => fee.acquisition || fee.maintenance).map((fee) => fee.label),
  };
}

export function queryGuaranteed(snapshot: PensionGuaranteedSnapshot, query: PensionGuaranteedQuery) {
  const channel = PENSION_GUARANTEED_CHANNELS.find((entry) => entry.id === query.channel);
  const rows = snapshot.items
    .filter((item) => query.area === "all" || String(item.areaCode) === query.area)
    .filter((item) => !channel || Boolean(item[channel.field]))
    .filter((item) => matchesSearch(item, query.q))
    .sort((left, right) => (
      query.sort === "publishedRateDesc"
        ? right.publishedInterestRate - left.publishedInterestRate || compareNames(left, right)
        : compareNames(left, right)
    ))
    .map(toGuaranteedRow);
  return { total: rows.length, items: rows };
}

export type PensionProductRow = Pick<
  PensionProductItem,
  | "area" | "company" | "product" | "launchDate" | "productType" | "rcvMethod" | "feeType"
  | "earnRate3" | "earnRate5" | "earnRate7" | "earnRate10" | "avgTotalEarRate" | "avgFeeRate" | "reserve"
> & { selling: boolean; principalGuaranteed: boolean };

function toProductRow(item: PensionProductItem): PensionProductRow {
  return {
    area: item.area,
    company: item.company,
    product: item.product,
    launchDate: item.launchDate,
    productType: item.productType,
    rcvMethod: item.rcvMethod,
    feeType: item.feeType,
    earnRate3: item.earnRate3,
    earnRate5: item.earnRate5,
    earnRate7: item.earnRate7,
    earnRate10: item.earnRate10,
    avgTotalEarRate: item.avgTotalEarRate,
    avgFeeRate: item.avgFeeRate,
    reserve: item.reserve,
    selling: item.sells === "Y",
    principalGuaranteed: item.guarantees === "Y",
  };
}

const PRODUCT_SORT_FIELD: Record<Exclude<PensionProductSort, "nameAsc">, { field: keyof PensionProductItem; direction: "asc" | "desc" }> = {
  feeAsc: { field: "avgFeeRate", direction: "asc" },
  earn3Desc: { field: "earnRate3", direction: "desc" },
  earn5Desc: { field: "earnRate5", direction: "desc" },
  earn10Desc: { field: "earnRate10", direction: "desc" },
};

export function queryProducts(snapshot: PensionProductsSnapshot, query: PensionProductsQuery) {
  const inScope = snapshot.items
    .filter((item) => query.area === "all" || String(item.areaCode) === query.area)
    .filter((item) => query.sells === "all" || item.sells === "Y")
    .filter((item) => query.guarantees === "all" || item.guarantees === query.guarantees)
    .filter((item) => matchesSearch(item, query.q));
  // Product types are offered from the current scope so a choice never leads to an empty list by itself.
  const typeCounts = new Map<string, number>();
  for (const item of inScope) typeCounts.set(item.productType, (typeCounts.get(item.productType) ?? 0) + 1);
  const sortSpec = query.sort === "nameAsc" ? null : PRODUCT_SORT_FIELD[query.sort];
  const matched = inScope
    .filter((item) => query.productType === "all" || item.productType === query.productType)
    .sort((left, right) => {
      if (!sortSpec) return compareNames(left, right) || left.launchDate.localeCompare(right.launchDate);
      return compareNullable(left[sortSpec.field] as number | null, right[sortSpec.field] as number | null, sortSpec.direction)
        || compareNames(left, right)
        || left.launchDate.localeCompare(right.launchDate);
    });
  const pageCount = Math.max(1, Math.ceil(matched.length / PENSION_PRODUCTS_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * PENSION_PRODUCTS_PAGE_SIZE;
  return {
    total: matched.length,
    page,
    pageCount,
    pageSize: PENSION_PRODUCTS_PAGE_SIZE,
    productTypes: [...typeCounts.entries()]
      .sort(([left], [right]) => collator.compare(left, right))
      .map(([value, count]) => ({ value, count })),
    missingSortValueCount: sortSpec ? matched.filter((item) => item[sortSpec.field] === null).length : 0,
    items: matched.slice(start, start + PENSION_PRODUCTS_PAGE_SIZE).map(toProductRow),
  };
}

export type PensionAreaSummary = { code: number; label: string; rowCount: number | null; excludedRowsWithoutProductInfo: number };

type PensionDatasetResponseBase = {
  source: { name: string; attribution: string; pageUrl: string };
  freshness: PensionFreshness;
  areas: PensionAreaSummary[];
};

export type PensionGuaranteedResponseData = PensionDatasetResponseBase & ReturnType<typeof queryGuaranteed> & {
  dataset: "guaranteed";
  asOf: PensionGuaranteedSnapshot["asOf"];
  query: PensionGuaranteedQuery;
};

export type PensionProductsResponseData = PensionDatasetResponseBase & ReturnType<typeof queryProducts> & {
  dataset: "products";
  asOf: PensionProductsSnapshot["asOf"];
  query: PensionProductsQuery;
};
