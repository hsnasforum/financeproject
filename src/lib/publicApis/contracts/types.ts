export type ExchangeRateQuote = {
  asOfDate: string;
  currency: string;
  base: "KRW";
  rate: number;
  source: string;
  fetchedAt: string;
};

export type HousingBenchmark = {
  regionCode: string;
  month: string;
  areaBand: string;
  dealType: "SALE" | "RENT";
  count: number;
  min: number;
  median: number;
  p75: number;
  max: number;
  unit: "KRW";
  rentType?: "JEONSE" | "WOLSE" | "ALL";
  monthlyMin?: number;
  monthlyMedian?: number;
  monthlyP75?: number;
  monthlyMax?: number;
  source: string;
  fetchedAt: string;
};

export type BenefitCandidate = {
  id: string;
  title: string;
  summary: string;
  eligibilityHints: string[];
  applyHow?: string;
  org?: string;
  lastUpdated?: string;
  source: string;
  fetchedAt: string;
};

export type SubscriptionNotice = {
  id: string;
  title: string;
  region: string;
  applyStart?: string;
  applyEnd?: string;
  supplyType?: string;
  sizeHints?: string;
  link?: string;
  source: string;
  fetchedAt: string;
};

export type CompanyProfile = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
  industry?: string;
  ceo?: string;
  homepage?: string;
  address?: string;
  updatedAt?: string;
  source: string;
  fetchedAt: string;
};

export type PublicApiErrorCode = "CONFIG" | "INPUT" | "UPSTREAM" | "INTERNAL" | "NO_SAMPLE";

export type PublicApiError = {
  code: PublicApiErrorCode;
  message: string;
};

export type PublicApiResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: PublicApiError };
