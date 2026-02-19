export type FinlifeKind = "deposit" | "saving";

export type FinlifeParams = {
  pageNo?: number;
  topFinGrpNo?: string;
};

export type NormalizedOption = {
  save_trm?: string;
  intr_rate?: number | null;
  intr_rate2?: number | null;
  raw: Record<string, unknown>;
};

export type NormalizedProduct = {
  fin_prdt_cd: string;
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
  mode: "mock" | "live";
  meta: {
    kind: FinlifeKind;
    pageNo: number;
    topFinGrpNo: string;
    fallbackUsed: boolean;
    message?: string;
    hasNext?: boolean;
    nextPage?: number | null;
  };
  data: NormalizedProduct[];
  raw?: unknown;
  error?: {
    code: string;
    message: string;
  };
};
