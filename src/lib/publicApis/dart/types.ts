export type DartApiErrorCode = "CONFIG" | "INPUT" | "UPSTREAM" | "NO_INDEX" | "NO_DATA" | "RATE_LIMIT" | "AUTH" | "FORBIDDEN" | "MAINTENANCE" | "INTERNAL";

export type DartApiError = {
  code: DartApiErrorCode;
  message: string;
};

export type DartCompany = {
  corp_code: string;
  corp_name?: string;
  corp_name_eng?: string;
  stock_name?: string;
  stock_code?: string;
  ceo_nm?: string;
  corp_cls?: string;
  jurir_no?: string;
  bizr_no?: string;
  adres?: string;
  hm_url?: string;
  ir_url?: string;
  phn_no?: string;
  fax_no?: string;
  induty_code?: string;
  est_dt?: string;
  acc_mt?: string;
  raw: Record<string, unknown>;
};

export type DartApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DartApiError };

export type DartCompanyRawResponse = {
  status?: string;
  message?: string;
  [key: string]: unknown;
};

export type CorpIndexItem = {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
};

export type CorpIndex = {
  generatedAt: string;
  count: number;
  items: CorpIndexItem[];
};
