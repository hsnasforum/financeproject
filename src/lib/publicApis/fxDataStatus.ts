import { normalizeExchangeQuoteDate } from "@/lib/publicApis/providers/exchangeNormalization";

export type FxDataStatusMode = "live" | "cache" | "mock" | "unavailable";

export type FxResponseMeta = {
  cache?: string;
  provenance?: {
    mode?: string;
    asOf?: string;
    degraded?: boolean;
  };
};

export type FxDataStatus = {
  mode: FxDataStatusMode;
  label: string;
  cacheHit: boolean;
  asOf: string | null;
  isStale: boolean;
  freshnessLabel: string;
  notice: string;
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VERIFY_ORIGINAL_NOTICE = "실제 환전·결제 전 한국수출입은행 최신 원문 환율과 수수료를 확인해 주세요.";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildFxDataStatus(input: {
  rowCount: number;
  meta: FxResponseMeta | null | undefined;
  now?: Date;
}): FxDataStatus {
  const now = input.now ?? new Date();
  const rawAsOf = readText(input.meta?.provenance?.asOf);
  const asOf = normalizeExchangeQuoteDate(rawAsOf);
  const asOfMs = asOf ? Date.parse(asOf) : Number.NaN;
  const isStale = !Number.isFinite(asOfMs) || now.getTime() - asOfMs > MAX_AGE_MS;
  const cacheHit = readText(input.meta?.cache)?.toLowerCase() === "hit";
  const provenanceMode = readText(input.meta?.provenance?.mode)?.toLowerCase();

  let mode: FxDataStatusMode;
  let label: string;
  if (input.rowCount <= 0) {
    mode = "unavailable";
    label = "사용 가능한 환율 없음";
  } else if (!asOf) {
    mode = "unavailable";
    label = "출처 확인 필요";
  } else if (provenanceMode === "mock") {
    mode = "mock";
    label = "예시 데이터";
  } else if (cacheHit || provenanceMode === "cache") {
    mode = "cache";
    label = "응답 캐시 사용";
  } else if (provenanceMode === "live") {
    mode = "live";
    label = "실시간 원천 조회";
  } else {
    mode = "unavailable";
    label = "출처 확인 필요";
  }

  const freshnessLabel = !rawAsOf
    ? "기준 시점 확인 필요"
    : !asOf
      ? "기준 시점 확인 불가"
      : isStale
      ? "기준 시점 오래됨"
      : "기준 시점 확인됨";
  const prefix = mode === "mock"
    ? "현재 결과는 예시 데이터로 계산했습니다."
    : mode === "cache"
      ? "현재 결과는 저장된 응답으로 계산했습니다."
      : mode === "unavailable"
        ? "환율 출처 또는 기준 시점을 확인하지 못했습니다."
        : "조회한 원천 환율을 기준으로 계산했습니다.";

  return {
    mode,
    label,
    cacheHit,
    asOf,
    isStale,
    freshnessLabel,
    notice: `${prefix} ${VERIFY_ORIGINAL_NOTICE}`,
  };
}
