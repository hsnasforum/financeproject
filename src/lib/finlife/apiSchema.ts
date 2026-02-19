import { type FinlifeSourceResult, type NormalizedOption, type NormalizedProduct } from "@/lib/finlife/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function parseOption(value: unknown): NormalizedOption | null {
  if (!isRecord(value)) return null;
  const raw = isRecord(value.raw) ? value.raw : {};

  const saveTrm = typeof value.save_trm === "string" ? value.save_trm : undefined;
  const intrRate = asOptionalNumber(value.intr_rate);
  const intrRate2 = asOptionalNumber(value.intr_rate2);

  return {
    save_trm: saveTrm,
    intr_rate: intrRate ?? null,
    intr_rate2: intrRate2 ?? null,
    raw,
  };
}

function parseProduct(value: unknown): NormalizedProduct | null {
  if (!isRecord(value)) return null;
  if (typeof value.fin_prdt_cd !== "string") return null;

  const optionsRaw = Array.isArray(value.options) ? value.options : [];
  const options = optionsRaw.map(parseOption).filter((v): v is NormalizedOption => Boolean(v));

  const bestRaw = isRecord(value.best) ? value.best : undefined;
  const best = bestRaw
    ? {
        save_trm: typeof bestRaw.save_trm === "string" ? bestRaw.save_trm : undefined,
        intr_rate: asOptionalNumber(bestRaw.intr_rate) ?? null,
        intr_rate2: asOptionalNumber(bestRaw.intr_rate2) ?? null,
      }
    : undefined;

  return {
    fin_prdt_cd: value.fin_prdt_cd,
    kor_co_nm: typeof value.kor_co_nm === "string" ? value.kor_co_nm : undefined,
    fin_prdt_nm: typeof value.fin_prdt_nm === "string" ? value.fin_prdt_nm : undefined,
    options,
    best,
    raw: isRecord(value.raw) ? value.raw : {},
  };
}

export function parseFinlifeApiResponse(raw: unknown): FinlifeSourceResult {
  if (!isRecord(raw)) {
    throw new Error("API 응답 형식이 올바르지 않습니다.");
  }

  const ok = raw.ok;
  if (typeof ok !== "boolean") {
    throw new Error("API 응답에 ok 필드가 없습니다.");
  }

  const mode = raw.mode;
  if (mode !== "mock" && mode !== "live") {
    throw new Error("API 응답 mode 값이 올바르지 않습니다.");
  }

  const metaRaw = isRecord(raw.meta) ? raw.meta : null;
  if (!metaRaw) {
    throw new Error("API 응답 meta 형식이 올바르지 않습니다.");
  }

  const meta = {
    kind: metaRaw.kind === "deposit" || metaRaw.kind === "saving" ? metaRaw.kind : "deposit",
    pageNo: typeof metaRaw.pageNo === "number" ? metaRaw.pageNo : 1,
    topFinGrpNo: typeof metaRaw.topFinGrpNo === "string" ? metaRaw.topFinGrpNo : "020000",
    fallbackUsed: Boolean(metaRaw.fallbackUsed),
    message: typeof metaRaw.message === "string" ? metaRaw.message : undefined,
    hasNext: typeof metaRaw.hasNext === "boolean" ? metaRaw.hasNext : undefined,
    nextPage: typeof metaRaw.nextPage === "number" ? metaRaw.nextPage : null,
  };

  const data = Array.isArray(raw.data) ? raw.data.map(parseProduct).filter((v): v is NormalizedProduct => Boolean(v)) : [];

  const errorRaw = isRecord(raw.error) ? raw.error : undefined;
  const error = errorRaw
    ? {
        code: typeof errorRaw.code === "string" ? errorRaw.code : "UNKNOWN",
        message: typeof errorRaw.message === "string" ? errorRaw.message : "요청을 처리하지 못했습니다.",
      }
    : undefined;

  return {
    ok,
    mode,
    meta,
    data,
    error,
    raw: raw,
  };
}
