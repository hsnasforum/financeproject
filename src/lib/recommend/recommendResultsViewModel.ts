import type { NormalizedProduct } from "@/lib/finlife/types";
import type {
  CandidatePool,
  CandidateSource,
  DepositProtectionMode,
  RecommendDetailProduct,
  RecommendPlanningContext,
  RecommendPlanningHandoff,
} from "@/lib/recommend/types";
import type { RecommendProfileNormalized } from "@/lib/schemas/recommendProfile";
import type { SourceStatusRow } from "@/lib/sources/types";

export type RecommendItem = {
  unifiedId: string;
  sourceId: string;
  kind: "deposit" | "saving";
  finPrdtCd: string;
  providerName: string;
  productName: string;
  finalScore: number;
  selectedOption: {
    saveTrm: string | null;
    termMonths: number | null;
    appliedRate: number;
    baseRate: number | null;
    maxRate: number | null;
    rateSource: "intr_rate2" | "intr_rate" | "none";
    reasons: string[];
  };
  breakdown: Array<{
    key: "rate" | "term" | "liquidity";
    label: string;
    raw: number;
    weight: number;
    contribution: number;
    reason: string;
  }>;
  reasons: string[];
  detailProduct?: RecommendDetailProduct;
  signals?: {
    depositProtection?: "matched" | "unknown";
  };
  badges?: string[];
};

export type RecommendResponse = {
  ok: boolean;
  meta?: {
    userId?: string;
    authSource?: string;
    kind: "deposit" | "saving";
    topN: number;
    rateMode: "max" | "base" | "simple";
    candidatePool?: CandidatePool;
    candidateSources?: CandidateSource[];
    depositProtection?: DepositProtectionMode;
    weights: { rate: number; term: number; liquidity: number };
    assumptions: {
      rateSelectionPolicy: string;
      liquidityPolicy: string;
      normalizationPolicy: string;
      kdbParsingPolicy?: string;
      depositProtectionPolicy?: string;
    };
    fallback?: {
      mode?: string;
      reason?: string;
      generatedAt?: string;
      nextRetryAt?: string;
    };
    planning?: RecommendPlanningHandoff | null;
    planningContext?: RecommendPlanningContext | null;
    planningLinkage?: {
      readiness?: "none" | "partial" | "ready";
      metricsCount?: number;
      stageInference?: RecommendPlanningHandoff["summary"]["stage"] | "disabled";
      inferenceSource?: "planning-summary" | "planning-context" | "none";
    };
  };
  message?: string;
  items?: RecommendItem[];
  debug?: {
    candidateCount: number;
    rateMin: number;
    rateMax: number;
  };
  error?: {
    code: string;
    message: string;
    issues?: string[];
  };
};

export type PlanningActionContext = {
  code: "BUILD_EMERGENCY_FUND" | "COVER_LUMP_SUM_GOAL";
  label: string;
};

export type ActionReasonContext = {
  sectionLabel: string;
  helper: string;
};

export type PlanningContextStrip = {
  title: string;
  description: string;
  actionLabel?: string;
  stageLabel?: string;
  sourceLabel?: string;
  runId?: string;
  overallStatusLabel?: string;
};

export type TrustCue = {
  tone: "emerald" | "amber" | "slate";
  label: string;
  helper: string;
};

export type RecommendFreshnessStatus = "ok" | "stale" | "error" | "empty";

export type RecommendCardFreshnessMeta = {
  sourceId: string;
  kind: RecommendItem["kind"];
  lastSyncedAt?: string | null;
  freshnessStatus?: RecommendFreshnessStatus;
  fallbackMode?: string | null;
  assumptionNotes: string[];
};

type SearchParamsReader = {
  get(name: string): string | null;
};

type PlanningInferenceSource = "planning-summary" | "planning-context" | "none" | undefined;

function formatPlanningStageLabel(
  stage: RecommendPlanningHandoff["summary"]["stage"] | "disabled" | undefined,
): string | null {
  switch (stage) {
    case "DEFICIT":
      return "적자 관리 단계";
    case "DEBT":
      return "부채 관리 단계";
    case "EMERGENCY":
      return "비상금 보강 단계";
    case "INVEST":
      return "여유자금 활용 단계";
    case "disabled":
      return "단계 판정 없음";
    default:
      return null;
  }
}

function formatPlanningOverallStatusLabel(
  status: RecommendPlanningHandoff["summary"]["overallStatus"] | undefined,
): string | null {
  switch (status) {
    case "RUNNING":
      return "실행 중";
    case "SUCCESS":
      return "성공";
    case "PARTIAL_SUCCESS":
      return "부분 성공";
    case "FAILED":
      return "실패";
    default:
      return null;
  }
}

function formatInferenceSourceLabel(source: PlanningInferenceSource): string | null {
  switch (source) {
    case "planning-summary":
      return "플래닝 요약 참고";
    case "planning-context":
      return "이전 플래닝 입력 참고";
    case "none":
      return "연결 정보 없음";
    default:
      return null;
  }
}

export function readPlanningActionContext(searchParams: SearchParamsReader): PlanningActionContext | null {
  if (searchParams.get("from") !== "planning-report") return null;
  const actionCode = searchParams.get("planning.actionCode");
  if (actionCode === "BUILD_EMERGENCY_FUND") {
    return { code: actionCode, label: "비상금 보강" };
  }
  if (actionCode === "COVER_LUMP_SUM_GOAL") {
    return { code: actionCode, label: "목표자금 점검" };
  }
  return null;
}

export function buildPlanningContextStrip(
  storedProfile: RecommendProfileNormalized | null,
  result: RecommendResponse,
  actionContext?: PlanningActionContext | null,
): PlanningContextStrip | null {
  const planning = result.meta?.planning ?? storedProfile?.planning;
  const linkage = result.meta?.planningLinkage;
  const inferenceSource = linkage?.inferenceSource;
  const stageLabel = formatPlanningStageLabel(planning?.summary.stage ?? linkage?.stageInference);
  const sourceLabel = formatInferenceSourceLabel(inferenceSource);
  const overallStatusLabel = formatPlanningOverallStatusLabel(planning?.summary.overallStatus);
  const runId = planning?.runId;
  const metricsCount = typeof linkage?.metricsCount === "number" ? linkage.metricsCount : 0;
  const hasStrip = Boolean(runId || stageLabel || (inferenceSource && inferenceSource !== "none") || metricsCount > 0);
  const actionLabel = actionContext?.label;

  if (!hasStrip) return null;

  if (inferenceSource === "planning-summary") {
    return {
      title: actionLabel ? `${actionLabel} 흐름에서 함께 보는 추천입니다` : "현재 플래닝 결과 흐름에서 함께 보는 추천입니다",
      description: actionLabel
        ? `플래닝 리포트의 ${actionLabel} 액션에서 바로 열었고, 실행 요약을 참고로 넘겨 현재 플래닝 맥락과 함께 지금 조건의 비교 후보를 읽게 돕습니다.`
        : "플래닝 리포트에서 넘긴 실행 요약을 참고해 현재 플래닝 맥락과 함께 지금 조건의 비교 후보를 읽게 돕습니다.",
      ...(actionLabel ? { actionLabel } : {}),
      ...(stageLabel ? { stageLabel } : {}),
      ...(sourceLabel ? { sourceLabel } : {}),
      ...(runId ? { runId } : {}),
      ...(overallStatusLabel ? { overallStatusLabel } : {}),
    };
  }

  if (inferenceSource === "planning-context") {
    return {
      title: actionLabel ? `${actionLabel} 흐름에서 참고하는 추천입니다` : "현재 플래닝 입력 흐름을 참고한 추천입니다",
      description: actionLabel
        ? `플래닝 리포트의 ${actionLabel} 액션에서 열었고, 기존 planningContext ${metricsCount}개 입력을 참고해 현재 단계를 읽고 지금 조건의 비교 후보를 함께 확인하게 돕습니다.`
        : `기존 planningContext ${metricsCount}개 입력을 참고해 현재 단계를 읽고 지금 조건의 비교 후보를 함께 확인하게 돕습니다.`,
      ...(actionLabel ? { actionLabel } : {}),
      ...(stageLabel ? { stageLabel } : {}),
      ...(sourceLabel ? { sourceLabel } : {}),
      ...(runId ? { runId } : {}),
      ...(overallStatusLabel ? { overallStatusLabel } : {}),
    };
  }

  return {
    title: actionLabel ? `${actionLabel} 흐름에서 함께 열린 추천입니다` : "플래닝 연동 참고 흐름과 함께 열린 추천입니다",
    description: actionLabel
      ? `플래닝 리포트의 ${actionLabel} 액션에서 열렸지만, 단계 판정은 아직 충분하지 않을 수 있어 연결 맥락을 참고하는 보조 정보로 읽어 주세요.`
      : "이번 추천은 플래닝 결과와 함께 열렸지만, 단계 판정은 아직 충분하지 않을 수 있어 연결 맥락을 참고하는 보조 정보로 읽어 주세요.",
    ...(actionLabel ? { actionLabel } : {}),
    ...(stageLabel ? { stageLabel } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(runId ? { runId } : {}),
    ...(overallStatusLabel ? { overallStatusLabel } : {}),
  };
}

export function buildActionReasonContext(
  actionContext?: PlanningActionContext | null,
): ActionReasonContext | null {
  if (actionContext?.code === "BUILD_EMERGENCY_FUND") {
    return {
      sectionLabel: "비상금 보강에 맞는 이유",
      helper: "상단 플래닝 연동 정보와 함께 보면, 이 추천이 비상금 보강 흐름에서 먼저 비교해 볼 후보인지 빠르게 읽을 수 있습니다.",
    };
  }

  if (actionContext?.code === "COVER_LUMP_SUM_GOAL") {
    return {
      sectionLabel: "목표자금 점검에 맞는 이유",
      helper: "상단 플래닝 연동 정보와 함께 보면, 이 추천이 목표자금 점검 흐름에서 기간과 금리 균형을 비교할 때 참고할 후보인지 빠르게 읽을 수 있습니다.",
    };
  }

  return null;
}

export function buildTrustCues(input: {
  item: RecommendItem;
  depositProtectionPolicy?: string;
}): TrustCue[] {
  const cues: TrustCue[] = [];
  const { item, depositProtectionPolicy } = input;

  if (item.signals?.depositProtection === "matched") {
    cues.push({
      tone: "emerald",
      label: "예금자 보호 신호 확인",
      helper: "현재 결과 기준으로 예금자 보호 신호가 함께 확인됐습니다. 가입 전 실제 적용 범위를 다시 확인해 주세요.",
    });
  }

  if (item.signals?.depositProtection === "unknown") {
    cues.push({
      tone: "amber",
      label: "예금자 보호 여부 추가 확인 필요",
      helper: depositProtectionPolicy
        ? `현재 결과만으로는 예금자 보호 여부가 확실하지 않습니다. ${depositProtectionPolicy} 기준과 상품 설명서를 함께 확인해 주세요.`
        : "현재 결과만으로는 예금자 보호 여부가 확실하지 않습니다. 가입 전 상품 설명서와 보호 기준을 함께 확인해 주세요.",
    });
  }

  if (item.selectedOption.rateSource === "intr_rate2") {
    cues.push({
      tone: "amber",
      label: "우대금리 포함 가능성",
      helper: "지금 보이는 금리는 우대조건이 반영된 값일 수 있습니다. 실제로 받을 수 있는 조건인지 한 번 더 확인해 주세요.",
    });
  } else if (item.selectedOption.rateSource === "intr_rate") {
    cues.push({
      tone: "slate",
      label: "기본 금리 기준",
      helper: "현재 카드는 기본 금리 기준으로 읽으면 됩니다. 우대조건이 따로 붙는지 비교해서 보세요.",
    });
  }

  if ((item.badges ?? []).some((badge) => badge.trim().length > 0)) {
    cues.push({
      tone: "slate",
      label: "상품 메모 확인",
      helper: "카드에 붙은 메모 배지도 함께 보세요. 가입 조건이나 비교 포인트를 빠르게 읽는 데 도움이 됩니다.",
    });
  }

  cues.push({
    tone: "slate",
    label: "데이터 최신성 읽기",
    helper: "이 카드의 결과 기준 메타와 함께 읽어 주세요. 자세한 연결 상태는 데이터 신뢰 및 연동 상태에서 확인할 수 있습니다.",
  });

  return cues;
}

export function buildSourceStatusKey(input: { sourceId: string; kind: RecommendItem["kind"] }): string {
  return `${input.sourceId}:${input.kind}`;
}

function deriveFreshnessStatus(row: SourceStatusRow | null): RecommendFreshnessStatus {
  if (!row) return "empty";
  if (row.lastError?.message) return "error";
  if (row.counts <= 0) return "empty";
  if (!row.isFresh) return "stale";
  return "ok";
}

export function formatFreshnessStatusLabel(status: RecommendFreshnessStatus): string {
  switch (status) {
    case "ok":
      return "최신";
    case "stale":
      return "기준 지남";
    case "error":
      return "최근 확인 실패";
    case "empty":
      return "기준 정보 없음";
    default:
      return "기준 정보 없음";
  }
}

function formatFallbackModeLabel(mode?: string | null): string | null {
  if (!mode) return null;
  const normalized = mode.trim().toUpperCase();
  if (normalized === "CACHE") return "캐시 기준";
  if (normalized === "REPLAY") return "재생 데이터 기준";
  if (normalized === "MOCK") return "예시 데이터 기준";
  return `${mode} 기준`;
}

function buildAssumptionNotes(
  item: RecommendItem,
  meta: RecommendResponse["meta"] | undefined,
): string[] {
  const notes: string[] = [];
  const assumptions = meta?.assumptions;

  if (item.selectedOption.rateSource === "intr_rate2" && assumptions?.rateSelectionPolicy) {
    notes.push(assumptions.rateSelectionPolicy);
  }

  if (item.signals?.depositProtection && assumptions?.depositProtectionPolicy) {
    notes.push(assumptions.depositProtectionPolicy);
  }

  return [...new Set(notes.filter((note) => note.trim().length > 0))].slice(0, 2);
}

export function buildCardFreshnessMeta(input: {
  item: RecommendItem;
  meta: RecommendResponse["meta"] | undefined;
  sourceStatusReady: boolean;
  sourceStatusRow: SourceStatusRow | null;
}): RecommendCardFreshnessMeta | null {
  const { item, meta, sourceStatusReady, sourceStatusRow } = input;
  const fallbackMode = formatFallbackModeLabel(meta?.fallback?.mode);
  const assumptionNotes = buildAssumptionNotes(item, meta);
  const freshnessStatus = sourceStatusReady ? deriveFreshnessStatus(sourceStatusRow) : undefined;
  const lastSyncedAt = sourceStatusReady ? sourceStatusRow?.lastSyncedAt ?? null : undefined;

  if (!sourceStatusReady && !fallbackMode && assumptionNotes.length === 0) return null;

  return {
    sourceId: item.sourceId,
    kind: item.kind,
    ...(typeof lastSyncedAt !== "undefined" ? { lastSyncedAt } : {}),
    ...(freshnessStatus ? { freshnessStatus } : {}),
    ...(fallbackMode ? { fallbackMode } : {}),
    assumptionNotes,
  };
}

function buildUnifiedId(sourceId: string, finPrdtCd: string): string {
  return `${sourceId}:${finPrdtCd}`;
}

export function attachUnifiedIds(response: RecommendResponse): RecommendResponse {
  if (!Array.isArray(response.items)) return response;
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      unifiedId: buildUnifiedId(item.sourceId, item.finPrdtCd),
    })),
  };
}

export function formatKoreanDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function normalizeRate(value: number | null | undefined, fallback: number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.isFinite(fallback) ? fallback : null;
}

function optionTerm(saveTrm: string | null, termMonths: number | null): string | undefined {
  const normalized = typeof saveTrm === "string" ? saveTrm.trim() : "";
  if (normalized.length > 0) return normalized;
  if (typeof termMonths === "number" && Number.isFinite(termMonths) && termMonths > 0) {
    return String(Math.trunc(termMonths));
  }
  return undefined;
}

function parseTermMonths(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function optionRateForCompare(option: { intr_rate?: number | null; intr_rate2?: number | null }): number | null {
  if (typeof option.intr_rate2 === "number" && Number.isFinite(option.intr_rate2)) return option.intr_rate2;
  if (typeof option.intr_rate === "number" && Number.isFinite(option.intr_rate)) return option.intr_rate;
  return null;
}

function preferredOptionIndex(
  options: Array<{ save_trm?: string; intr_rate?: number | null; intr_rate2?: number | null }>,
  selected: RecommendItem["selectedOption"],
): number {
  if (options.length === 0) return -1;

  const selectedText = typeof selected.saveTrm === "string" ? selected.saveTrm.trim() : "";
  if (selectedText.length > 0) {
    const exact = options.findIndex((option) => (option.save_trm ?? "").trim() === selectedText);
    if (exact >= 0) return exact;
  }

  const selectedMonths = parseTermMonths(selectedText)
    ?? (selected.termMonths && Number.isFinite(selected.termMonths) ? Math.trunc(selected.termMonths) : null);
  if (selectedMonths !== null) {
    const termMatch = options.findIndex((option) => parseTermMonths(option.save_trm) === selectedMonths);
    if (termMatch >= 0) return termMatch;
  }

  if (Number.isFinite(selected.appliedRate)) {
    const byRate = options.findIndex((option) => {
      const rate = optionRateForCompare(option);
      return rate !== null && Math.abs(rate - selected.appliedRate) < 0.0001;
    });
    if (byRate >= 0) return byRate;
  }

  return 0;
}

function prioritizeRecommendedOption(
  options: Array<{ save_trm?: string; intr_rate?: number | null; intr_rate2?: number | null; raw: Record<string, unknown> }>,
  selected: RecommendItem["selectedOption"],
): Array<{ save_trm?: string; intr_rate?: number | null; intr_rate2?: number | null; raw: Record<string, unknown> }> {
  const index = preferredOptionIndex(options, selected);
  if (index <= 0) return options;
  return [options[index], ...options.slice(0, index), ...options.slice(index + 1)];
}

export function buildDetailProduct(item: RecommendItem): NormalizedProduct {
  if (item.detailProduct) {
    const mappedOptions = (item.detailProduct.options ?? []).map((option) => ({
      save_trm: option.save_trm,
      intr_rate: option.intr_rate ?? null,
      intr_rate2: option.intr_rate2 ?? null,
      raw: option.raw ?? {},
    }));
    const options = prioritizeRecommendedOption(mappedOptions, item.selectedOption);

    return {
      fin_prdt_cd: item.detailProduct.fin_prdt_cd,
      fin_co_no: item.detailProduct.fin_co_no,
      kor_co_nm: item.detailProduct.kor_co_nm,
      fin_prdt_nm: item.detailProduct.fin_prdt_nm,
      options,
      best: item.detailProduct.best
        ? {
            save_trm: item.detailProduct.best.save_trm,
            intr_rate: item.detailProduct.best.intr_rate ?? null,
            intr_rate2: item.detailProduct.best.intr_rate2 ?? null,
          }
        : undefined,
      raw: item.detailProduct.raw ?? {},
    };
  }

  const fallbackRate = Number.isFinite(item.selectedOption.appliedRate) ? item.selectedOption.appliedRate : 0;
  const baseRate = normalizeRate(item.selectedOption.baseRate, fallbackRate);
  const maxRate = normalizeRate(item.selectedOption.maxRate, fallbackRate);
  const saveTerm = optionTerm(item.selectedOption.saveTrm, item.selectedOption.termMonths);

  return {
    fin_prdt_cd: item.finPrdtCd,
    kor_co_nm: item.providerName,
    fin_prdt_nm: item.productName,
    options: [
      {
        save_trm: saveTerm,
        intr_rate: baseRate,
        intr_rate2: maxRate,
        raw: {},
      },
    ],
    best: {
      save_trm: saveTerm,
      intr_rate: baseRate,
      intr_rate2: maxRate,
    },
    raw: {},
  };
}
