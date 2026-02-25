export type FinlifeKind =
  | "deposit"
  | "saving"
  | "pension"
  | "mortgage-loan"
  | "rent-house-loan"
  | "credit-loan";

export type FinlifeMode = "mock" | "live" | "fixture";

export type FinlifeParams = {
  pageNo?: number;
  topFinGrpNo?: string;
  scan?: "page" | "all";
  scanMaxPages?: number | "auto";
};

export type NormalizedOption = {
  save_trm?: string;
  intr_rate?: number | null;
  intr_rate2?: number | null;
  raw: Record<string, unknown>;
};

export type NormalizedProduct = {
  fin_prdt_cd: string;
  fin_co_no?: string;
  kor_co_nm?: string;
  fin_prdt_nm?: string;
  options: NormalizedOption[];
  best?: {
    save_trm?: string;
    intr_rate2?: number | null;
    intr_rate?: number | null;
  };
  raw: Record<string, unknown>;
};

export type FinlifeSourceResult = {
  ok: boolean;
  mode: FinlifeMode;
  meta: {
    kind: FinlifeKind;
    pageNo: number;
    topFinGrpNo: string;
    fallbackUsed: boolean;
    message?: string;
    hasNext?: boolean;
    nextPage?: number | null;
    totalCount?: number;
    nowPage?: number;
    maxPage?: number;
    errCd?: string;
    errMsg?: string;
    pagesFetched?: number;
    totalProducts?: number;
    totalOptions?: number;
    truncatedByMaxPages?: boolean;
    optionsMissingCount?: number;
    source?: "snapshot" | "live_partial" | "mock";
    groupsScanned?: string[];
    truncatedByHardCap?: boolean;
    completionRate?: number;
    configuredGroups?: string[];
    note?: string;
    snapshot?: {
      generatedAt?: string;
      ageMs?: number;
      completionRate?: number;
      totalProducts?: number;
      totalOptions?: number;
    };
    debug?: {
      cacheKey?: string;
      upstreamStatus?: number;
      upstreamMs?: number;
      pageNo?: number;
      pageSize?: number;
      baseListLen?: number;
      optionListLen?: number;
      totalCount?: number;
      maxPage?: number;
    };
  };
  data: NormalizedProduct[];
  raw?: unknown;
  error?: {
    code: string;
    message: string;
    diagnostics?: Record<string, unknown>;
  };
};

export type FinlifeCompany = {
  companyId: string;
  companyName: string;
  groupCode?: string;
  homepage?: string;
  callCenter?: string;
  raw: Record<string, unknown>;
};

export type FinlifeCompanyResult = {
  ok: boolean;
  mode: FinlifeMode;
  meta: {
    pageNo: number;
    topFinGrpNo: string;
    fallbackUsed: boolean;
    message?: string;
    hasNext?: boolean;
    nextPage?: number | null;
    totalCount?: number;
    nowPage?: number;
    maxPage?: number;
    errCd?: string;
    errMsg?: string;
  };
  data: FinlifeCompany[];
  raw?: unknown;
  error?: {
    code: string;
    message: string;
    diagnostics?: Record<string, unknown>;
  };
};
