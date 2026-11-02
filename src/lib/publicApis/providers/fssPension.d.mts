export type FssPensionArea = { readonly code: number; readonly label: string };

export const FSS_PENSION_API_BASE_URL: string;
export const FSS_PENSION_SOURCE: Readonly<{ id: string; name: string; attribution: string; url: string }>;
export const FSS_PENSION_PAGES: Readonly<{ products: string; guaranteed: string }>;
export const FSS_PENSION_PRODUCTS_SNAPSHOT: string;
export const FSS_PENSION_GUARANTEED_SNAPSHOT: string;
export const FSS_PENSION_SCHEMA_VERSION: number;
export const FSS_PENSION_SNAPSHOT_MAX_AGE_DAYS: number;
export const FSS_PENSION_PRODUCT_AREAS: ReadonlyArray<FssPensionArea>;
export const FSS_PENSION_GUARANTEED_AREAS: ReadonlyArray<FssPensionArea>;

export class FssPensionError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}

/** psProdList2 row after normalization (launchDate is YYYY-MM-DD). */
export type FssPensionProductItem = {
  areaCode: number;
  area: string;
  company: string;
  product: string;
  launchDate: string;
  productType: string;
  rcvMethod: string | null;
  feeType: string;
  sells: "Y" | "N";
  guarantees: "Y" | "N";
  reserve: number | null;
  reserve1: number | null;
  reserve2: number | null;
  reserve3: number | null;
  earnRate3: number | null;
  earnRate5: number | null;
  earnRate7: number | null;
  earnRate10: number | null;
  avgTotalEarRate: number | null;
  avgFeeRate: number | null;
};

/** psGuaranteedProdList row after normalization (reportMonth is YYYY-MM; fee texts keep the "|" separator). */
export type FssPensionGuaranteedItem = {
  areaCode: number;
  area: string;
  reportMonth: string;
  company: string;
  product: string;
  publishedInterestRate: number;
  guaranteedInterestRate: string | null;
  fpFeeDesc: string | null;
  agentFeeDesc: string | null;
  onlineFeeDesc: string | null;
  tel: string | null;
};

export function classifyFssPensionResult(payload: unknown): { code: string; status: string; message: string };
export function normalizeFssPensionProductRows(payload: unknown, area: FssPensionArea): {
  items: FssPensionProductItem[];
  sourceRows: number;
  excludedRowsWithoutProductInfo: number;
  exactDuplicateRowsRemoved: number;
};
export function normalizeFssPensionGuaranteedRows(payload: unknown, area: FssPensionArea): {
  items: FssPensionGuaranteedItem[];
  reportMonth: string | null;
  sourceRows: number;
  exactDuplicateRowsRemoved: number;
};
export function listRecentCompletedQuarters(now?: Date, count?: number): Array<{ year: number; quarter: number }>;
