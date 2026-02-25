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
  eligibilityExcerpt?: string;
  eligibilityText?: string;
  isEligibilityTruncated?: boolean;
  eligibilityChips?: string[];
  contact?: string;
  link?: string;
  region: {
    scope: "NATIONWIDE" | "REGIONAL" | "UNKNOWN";
    confidence?: "HIGH" | "LOW";
    tags: string[];
    sido?: string;
    sigungu?: string;
    unknownReason?: "NO_REGION_INFO" | "UNPARSED_REGION";
    sourceKeys?: string[];
  };
  applyHow?: string;
  org?: string;
  lastUpdated?: string;
  source: string;
  fetchedAt: string;
  topicMatch?: {
    matchedTopics: string[];
    evidence: Array<{
      topic: string;
      synonym: string;
      field: string;
    }>;
  };
  simpleFindMatch?: {
    score: number;
    evidence: Array<{
      keyword: string;
      field: string;
    }>;
  };
};

export type SubscriptionNotice = {
  id: string;
  title: string;
  region: string;
  applyStart?: string;
  applyEnd?: string;
  supplyType?: string;
  sizeHints?: string;
  address?: string;
  totalHouseholds?: string;
  contact?: string;
  details?: Record<string, string>;
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

export type PublicApiErrorCode =
  | "CONFIG"
  | "INPUT"
  | "UPSTREAM"
  | "INTERNAL"
  | "NO_SAMPLE"
  | "ENV_MISSING"
  | "ENV_INVALID_URL"
  | "ENV_INCOMPLETE_URL"
  | "ENV_DOC_URL"
  | "FETCH_FAILED"
  | "UPSTREAM_ERROR"
  | "AUTH_FAILED"
  | "NO_DATA"
  | "SCHEMA_MISMATCH";

export type PublicApiError = {
  code: PublicApiErrorCode;
  message: string;
  diagnostics?: Record<string, unknown>;
};

export type PublicApiResult<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: PublicApiError };
