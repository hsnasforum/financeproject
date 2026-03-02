export type CorpIndexItem = {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
};

export type DartCompany = {
  corp_code: string;
  corp_name: string;
  corp_name_eng?: string;
  stock_name?: string;
  stock_code?: string;
  ceo_nm?: string;
  corp_cls?: string;
  adres?: string;
  hm_url?: string;
  induty_code?: string;
  est_dt?: string;
  acc_mt?: string;
  raw: { status: string; message?: string };
  [key: string]: unknown;
};

export type DartApiErrorCode = "CONFIG" | "INPUT" | "AUTH" | "FORBIDDEN" | "NO_DATA" | "RATE_LIMIT" | "MAINTENANCE" | "UPSTREAM" | "INTERNAL";

export type DartApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: DartApiErrorCode; message: string; debug?: Record<string, unknown> } };

export type DartApiError = Extract<DartApiResult<unknown>, { ok: false }>["error"];
