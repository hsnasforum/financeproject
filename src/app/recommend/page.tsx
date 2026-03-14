"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { SourceBadge } from "@/components/debug/SourceBadge";
import { DataFreshnessBanner } from "@/components/data/DataFreshnessBanner";
import { type FreshnessSourceSpec } from "@/components/data/freshness";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { downloadText } from "@/lib/browser/download";
import { type NormalizedProduct } from "@/lib/finlife/types";
import { announce, focusFirstError, scrollToErrorSummary } from "@/lib/forms/a11y";
import { pathToId } from "@/lib/forms/ids";
import { firstError, issuesToFieldMap } from "@/lib/forms/issueMap";
import { addCompareIdToStorage, compareStoreConfig } from "@/lib/products/compareStore";
import {
  buildRunFromRecommend,
  exportRunCsv,
  exportRunJson,
  saveRunFromRecommend,
  type SavedRecommendRun,
  type SavedRunProfile,
} from "@/lib/recommend/savedRunsStore";
import {
  type CandidatePool,
  type CandidateSource,
  type DepositProtectionMode,
  type RecommendDetailProduct,
} from "@/lib/recommend/types";
import {
  defaults as recommendProfileDefaults,
  fromSearchParams as recommendProfileFromSearchParams,
  parseRecommendProfile,
  type RecommendProfileNormalized,
} from "@/lib/schemas/recommendProfile";
import { parseStringIssues, type Issue } from "@/lib/schemas/issueTypes";

type RecommendItem = {
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

type RecommendResponse = {
  ok: boolean;
  meta?: {
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

type StoredProfile = RecommendProfileNormalized;

type StoredRecommendItemV1 = {
  key: string;
  sourceId: string;
  finPrdtCd: string;
  productName: string;
  providerName: string;
  rank: number;
  appliedRate: number | null;
  saveTrm: string | null;
};

type StoredRecommendResultV1 = {
  version: 1;
  savedAt: string;
  profile: StoredProfile;
  meta?: RecommendResponse["meta"];
  items: StoredRecommendItemV1[];
};

const STORAGE_KEY = "recommend_profile_v1";
const RESULT_STORAGE_KEY = "recommend_last_result_v1";
const AUTORUN_SIG_SESSION_KEY = "recommend_autorun_sig";
const ERROR_SUMMARY_ID = "recommend_error_summary";

type QueryOverrides = {
  profilePatch: Partial<StoredProfile>;
  hasQuery: boolean;
  autoRun: boolean;
  autoSave: boolean;
  goHistory: boolean;
  source: string | null;
  issues: Issue[];
};

type AutorunSessionPayload = {
  sig: string;
  runId: string | null;
};

const defaultProfile: StoredProfile = recommendProfileDefaults();

function parseQueryOverrides(searchParams: ReturnType<typeof useSearchParams>): QueryOverrides {
  const parsedPatch = recommendProfileFromSearchParams(searchParams);
  const patch = parsedPatch.value;

  const autorunRaw = (searchParams.get("autorun") ?? "").toLowerCase();
  const autoRun = autorunRaw === "1" || autorunRaw === "true" || autorunRaw === "yes";
  const saveRaw = (searchParams.get("save") ?? "").toLowerCase();
  const autoSave = saveRaw === "1" || saveRaw === "true" || saveRaw === "yes";
  const goRaw = (searchParams.get("go") ?? "").toLowerCase();
  const goHistory = goRaw === "history";
  const source = searchParams.get("from");
  const hasQuery = Object.keys(patch).length > 0;

  return {
    profilePatch: patch,
    hasQuery,
    autoRun,
    autoSave,
    goHistory,
    source,
    issues: parsedPatch.issues,
  };
}

function buildAutorunSignature(profile: StoredProfile): string {
  return JSON.stringify({
    purpose: profile.purpose,
    kind: profile.kind,
    preferredTerm: profile.preferredTerm,
    liquidityPref: profile.liquidityPref,
    rateMode: profile.rateMode,
    topN: profile.topN,
    candidatePool: profile.candidatePool,
    candidateSources: profile.candidateSources,
    depositProtection: profile.depositProtection,
    weights: profile.weights,
  });
}

function readAutorunSessionPayload(): AutorunSessionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTORUN_SIG_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutorunSessionPayload>;
    if (typeof parsed.sig !== "string" || !parsed.sig) return null;
    return {
      sig: parsed.sig,
      runId: typeof parsed.runId === "string" && parsed.runId ? parsed.runId : null,
    };
  } catch {
    return null;
  }
}

function writeAutorunSessionPayload(payload: AutorunSessionPayload): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTORUN_SIG_SESSION_KEY, JSON.stringify(payload));
}

function buildUnifiedId(sourceId: string, finPrdtCd: string): string {
  return `${sourceId}:${finPrdtCd}`;
}

function attachUnifiedIds(response: RecommendResponse): RecommendResponse {
  if (!Array.isArray(response.items)) return response;
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      unifiedId: buildUnifiedId(item.sourceId, item.finPrdtCd),
    })),
  };
}

function toSavedRunProfile(profile: StoredProfile): SavedRunProfile {
  return {
    purpose: profile.purpose,
    kind: profile.kind,
    preferredTerm: profile.preferredTerm,
    liquidityPref: profile.liquidityPref,
    rateMode: profile.rateMode,
    topN: profile.topN,
    candidatePool: profile.candidatePool,
    candidateSources: profile.candidateSources,
    depositProtection: profile.depositProtection,
    weights: {
      rate: profile.weights.rate,
      term: profile.weights.term,
      liquidity: profile.weights.liquidity,
    },
  };
}

function buildExportRun(profile: StoredProfile, response: RecommendResponse): SavedRecommendRun | null {
  if (!Array.isArray(response.items)) return null;
  return buildRunFromRecommend(toSavedRunProfile(profile), response, {
    runId: `adhoc_${Date.now()}`,
    savedAt: new Date().toISOString(),
  });
}

function normalizeStoredTerm(value: string | null | undefined, termMonths: number | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.length > 0) return raw;
  if (typeof termMonths === "number" && Number.isFinite(termMonths) && termMonths > 0) return String(Math.trunc(termMonths));
  return null;
}

function buildStoredResult(profile: StoredProfile, res: RecommendResponse): StoredRecommendResultV1 {
  const items = (res.items ?? []).map((item, index) => ({
    key: `${item.sourceId}::${item.finPrdtCd}`,
    sourceId: item.sourceId,
    finPrdtCd: item.finPrdtCd,
    productName: item.productName,
    providerName: item.providerName,
    rank: index + 1,
    appliedRate: Number.isFinite(item.selectedOption.appliedRate) ? item.selectedOption.appliedRate : null,
    saveTrm: normalizeStoredTerm(item.selectedOption.saveTrm, item.selectedOption.termMonths),
  }));

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    profile,
    meta: res.meta,
    items,
  };
}

function formatKoreanDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function parseStoredResult(raw: string | null): StoredRecommendResultV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRecommendResultV1>;
    if (parsed.version !== 1) return null;
    if (typeof parsed.savedAt !== "string") return null;
    if (!parsed.profile || typeof parsed.profile !== "object") return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed as StoredRecommendResultV1;
  } catch {
    return null;
  }
}

function normalizeRate(value: number | null | undefined, fallback: number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.isFinite(fallback) ? fallback : null;
}

function optionTerm(saveTrm: string | null, termMonths: number | null): string | undefined {
  const normalized = typeof saveTrm === "string" ? saveTrm.trim() : "";
  if (normalized.length > 0) return normalized;
  if (typeof termMonths === "number" && Number.isFinite(termMonths) && termMonths > 0) return String(Math.trunc(termMonths));
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

  const selectedMonths = parseTermMonths(selectedText) ?? (selected.termMonths && Number.isFinite(selected.termMonths) ? Math.trunc(selected.termMonths) : null);
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

function buildDetailProduct(item: RecommendItem): NormalizedProduct {
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

function RecommendPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<StoredProfile>(defaultProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastStored, setLastStored] = useState<StoredRecommendResultV1 | null>(null);
  const [readyToPersist, setReadyToPersist] = useState(false);
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const [formIssues, setFormIssues] = useState<Issue[]>([]);
  const lastStoredRef = useRef<StoredRecommendResultV1 | null>(null);
  const autoRunTriggeredRef = useRef(false);
  const submitInFlightRef = useRef(false);

  const showValidationIssues = useCallback((issues: Issue[]) => {
    setFormIssues(issues);
    setError(firstError(issues) ?? "입력값을 확인해 주세요.");
    setTimeout(() => {
      scrollToErrorSummary(ERROR_SUMMARY_ID);
      focusFirstError(issues.map((entry) => entry.path));
      announce(`입력 오류 ${issues.length}건이 있습니다.`);
    }, 0);
  }, []);

  const submitWithProfile = useCallback(async (
    profileInput: StoredProfile,
    options?: {
      autoSave?: boolean;
      goHistory?: boolean;
      autorunSig?: string;
    },
  ) => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setLoading(true);
    setError("");
    setFormIssues([]);
    setOpenDetailKey(null);
    try {
      const parsedProfile = parseRecommendProfile(profileInput);
      if (!parsedProfile.ok) {
        showValidationIssues(parsedProfile.issues);
        return;
      }
      const requestProfile = parsedProfile.value;
      setProfile(requestProfile);
      const res = await fetch(`/api/recommend?topN=${requestProfile.topN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestProfile),
      });
      const rawJson = (await res.json()) as RecommendResponse;
      if (!res.ok || !rawJson.ok) {
        const apiIssues = parseStringIssues(rawJson.error?.issues ?? []);
        setResult(null);
        if (apiIssues.length > 0) {
          showValidationIssues(apiIssues);
        } else {
          setError(rawJson.error?.message ?? "추천 결과를 불러오지 못했습니다.");
          announce(rawJson.error?.message ?? "추천 결과를 불러오지 못했습니다.");
        }
        return;
      }
      const json = attachUnifiedIds(rawJson);

      const currStored = buildStoredResult(requestProfile, json);
      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(currStored));
      setLastStored(currStored);
      lastStoredRef.current = currStored;
      setResult(json);
      setFormIssues([]);

      if (options?.autoSave) {
        const sig = options.autorunSig ?? buildAutorunSignature(requestProfile);
        const previous = readAutorunSessionPayload();
        if (previous?.sig === sig && previous.runId) {
          if (options.goHistory) {
            router.push(`/recommend/history?open=${encodeURIComponent(previous.runId)}`);
          }
        } else {
          const runId = saveRunFromRecommend(toSavedRunProfile(requestProfile), json);
          writeAutorunSessionPayload({ sig, runId });
          if (options.goHistory) {
            router.push(`/recommend/history?open=${encodeURIComponent(runId)}`);
          }
        }
      }
    } catch {
      setError("네트워크 오류로 추천 요청에 실패했습니다.");
      announce("네트워크 오류로 추천 요청에 실패했습니다.");
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
    }
  }, [router, showValidationIssues]);

  useEffect(() => {
    let nextProfile: StoredProfile = recommendProfileDefaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        const normalized = parseRecommendProfile({
          ...nextProfile,
          ...(typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {}),
        });
        nextProfile = normalized.value;
      }
    } catch {
      // ignore
    }

    const queryOverrides = parseQueryOverrides(searchParams);
    if (queryOverrides.issues.length > 0) {
      showValidationIssues(queryOverrides.issues);
    } else {
      setFormIssues([]);
    }
    if (queryOverrides.hasQuery) {
      nextProfile = parseRecommendProfile({ ...nextProfile, ...queryOverrides.profilePatch }).value;
    }
    const stored = parseStoredResult(localStorage.getItem(RESULT_STORAGE_KEY));
    setLastStored(stored);
    lastStoredRef.current = stored;
    setProfile(nextProfile);
    setReadyToPersist(true);

    if (queryOverrides.autoRun && !autoRunTriggeredRef.current) {
      autoRunTriggeredRef.current = true;
      void submitWithProfile(nextProfile, {
        autoSave: queryOverrides.autoSave,
        goHistory: queryOverrides.goHistory,
        autorunSig: buildAutorunSignature(nextProfile),
      });
    }
  }, [searchParams, showValidationIssues, submitWithProfile]);

  useEffect(() => {
    if (!readyToPersist) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, readyToPersist]);

  const purposeLabel = useMemo(() => {
    if (profile.purpose === "emergency") return "단기 비상금";
    if (profile.purpose === "long-term") return "장기 저축";
    return "목돈 마련";
  }, [profile.purpose]);

  const freshnessSources = useMemo<FreshnessSourceSpec[]>(() => {
    if (profile.kind === "saving") {
      return [{ sourceId: "finlife", kind: "saving", label: "FINLIFE 적금", importance: "required" }];
    }
    return [{ sourceId: "finlife", kind: "deposit", label: "FINLIFE 예금", importance: "required" }];
  }, [profile.kind]);

  const fieldIssueMap = useMemo(() => issuesToFieldMap(formIssues), [formIssues]);

  async function submit() {
    if (loading) return;
    await submitWithProfile(profile);
  }

  function saveCurrentRun() {
    if (!result) return;
    saveRunFromRecommend(toSavedRunProfile(profile), result);
    setFeedback("결과가 히스토리에 저장되었습니다.");
    setTimeout(() => setFeedback(""), 3000);
  }

  function exportCurrentRunJson() {
    if (!result) return;
    const run = buildExportRun(profile, result);
    if (!run) return;
    const content = exportRunJson(run);
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}.json`, content, "application/json;charset=utf-8");
    setFeedback("JSON 파일이 다운로드되었습니다.");
    setTimeout(() => setFeedback(""), 3000);
  }

  function exportCurrentRunCsv() {
    if (!result) return;
    const run = buildExportRun(profile, result);
    if (!run) return;
    const content = exportRunCsv(run);
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}.csv`, content, "text/csv;charset=utf-8");
    setFeedback("CSV 파일이 다운로드되었습니다.");
    setTimeout(() => setFeedback(""), 3000);
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader
          title="스마트 상품 추천"
          description="내 저축 목적과 성향에 딱 맞는 예적금 상품을 AI가 분석하여 추천해 드립니다."
        />

        <div className="mb-8 flex flex-col gap-6">
          <DataFreshnessBanner sources={freshnessSources} infoDisplay="compact" />
          
          <Card className="rounded-[2.5rem] border-slate-200/60 p-8 shadow-sm">
            <ErrorSummary issues={formIssues} id={ERROR_SUMMARY_ID} className="mb-6" />
            <ErrorAnnouncer />

            <div className="grid gap-8 lg:grid-cols-4">
              <div className="space-y-6 lg:col-span-3">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <FilterSelect
                      size="md"
                      id={pathToId("purpose")}
                      label="저축 목적"
                      value={profile.purpose}
                      onChange={(e) => setProfile((prev) => ({ ...prev, purpose: e.target.value as StoredProfile["purpose"] }))}
                    >
                      <option value="emergency">단기 비상금 (안정성 중시)</option>
                      <option value="seed-money">목돈 마련 (수익성 중시)</option>
                      <option value="long-term">장기 저축 (복리 효과)</option>
                    </FilterSelect>
                    <FieldError id={`${pathToId("purpose")}_error`} message={fieldIssueMap.purpose?.[0]} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <FilterSelect
                      size="md"
                      id={pathToId("kind")}
                      label="상품 유형"
                      value={profile.kind}
                      onChange={(e) => setProfile((prev) => ({ ...prev, kind: e.target.value as StoredProfile["kind"] }))}
                    >
                      <option value="deposit">정기 예금</option>
                      <option value="saving">정기 적금</option>
                    </FilterSelect>
                    <FieldError id={`${pathToId("kind")}_error`} message={fieldIssueMap.kind?.[0]} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <FilterSelect
                      size="md"
                      id={pathToId("preferredTerm")}
                      label="희망 기간"
                      value={profile.preferredTerm}
                      onChange={(e) => setProfile((prev) => ({ ...prev, preferredTerm: Number(e.target.value) as StoredProfile["preferredTerm"] }))}
                    >
                      <option value={3}>3개월</option>
                      <option value={6}>6개월</option>
                      <option value={12}>12개월</option>
                      <option value={24}>24개월</option>
                      <option value={36}>36개월</option>
                    </FilterSelect>
                    <FieldError id={`${pathToId("preferredTerm")}_error`} message={fieldIssueMap.preferredTerm?.[0]} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <FilterSelect
                      size="md"
                      id={pathToId("rateMode")}
                      label="금리 정책"
                      value={profile.rateMode}
                      onChange={(e) => setProfile((prev) => ({ ...prev, rateMode: e.target.value as StoredProfile["rateMode"] }))}
                    >
                      <option value="max">최고 금리 높은 상품 우선</option>
                      <option value="base">기본 금리 높은 상품 우선</option>
                      <option value="simple">우대 조건 없는 단순 상품</option>
                    </FilterSelect>
                    <FieldError id={`${pathToId("rateMode")}_error`} message={fieldIssueMap.rateMode?.[0]} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-[2.5rem] bg-slate-50 p-6 border border-slate-100 shadow-inner">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">분석 요약</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">대상</span>
                      <span className="text-xs font-black text-slate-900">{purposeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">결과</span>
                      <span className="text-xs font-black text-slate-900">Top {profile.topN}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 space-y-3">
                  <Button
                    variant="primary"
                    className="w-full rounded-2xl h-14 text-sm shadow-emerald-600/20"
                    onClick={() => void submit()}
                    disabled={loading}
                  >
                    {loading ? "분석 중" : "추천 시작하기"}
                  </Button>
                  <button
                    className="w-full text-[10px] font-bold text-slate-400 hover:text-emerald-600 transition-colors uppercase tracking-widest"
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                  >
                    {advancedOpen ? "설정 닫기" : "가중치 설정"}
                  </button>
                </div>
              </div>
            </div>

            {advancedOpen && (
              <div className="mt-8 border-t border-slate-100 pt-8 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="grid gap-8 md:grid-cols-3">
                  <label className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-500">금리 가중치</span>
                      <span className="text-xs font-black text-emerald-600">{Math.round(profile.weights.rate * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={profile.weights.rate}
                      onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, rate: Number(e.target.value) } }))}
                      className="w-full accent-emerald-600"
                    />
                  </label>
                  <label className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-500">기간 가중치</span>
                      <span className="text-xs font-black text-emerald-600">{Math.round(profile.weights.term * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={profile.weights.term}
                      onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, term: Number(e.target.value) } }))}
                      className="w-full accent-emerald-600"
                    />
                  </label>
                  <label className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-slate-500">유동성 가중치</span>
                      <span className="text-xs font-black text-emerald-600">{Math.round(profile.weights.liquidity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={profile.weights.liquidity}
                      onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, liquidity: Number(e.target.value) } }))}
                      className="w-full accent-emerald-600"
                    />
                  </label>
                </div>
              </div>
            )}
          </Card>
        </div>

        {error && (
          <ErrorState message={error} className="mb-8" />
        )}

        {result && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 px-2">
              <h2 className="text-xl font-black text-slate-900">추천 결과 <span className="ml-1 text-emerald-600">{result.items?.length}</span></h2>
              <div className="flex items-center gap-3">
                {feedback && (
                  <span className="text-xs font-bold text-emerald-600 animate-in fade-in duration-300">{feedback}</span>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={saveCurrentRun}>결과 저장</Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={exportCurrentRunJson}>JSON</Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={exportCurrentRunCsv}>CSV</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {(result.items ?? []).map((item, index) => {
                const itemKey = `${item.sourceId}-${item.finPrdtCd}-${index}`;
                const detailProduct = buildDetailProduct(item);
                return (
                  <Card key={itemKey} className="group relative overflow-hidden rounded-[2.5rem] border-slate-200/60 bg-white p-8 shadow-sm transition-all hover:shadow-md">
                    <div className="mb-6 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                          {index + 1}
                        </span>
                        <SourceBadge sourceId={item.sourceId} />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">매칭 점수</span>
                        <span className="text-lg font-black text-emerald-600">{item.finalScore.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="mb-8">
                      <p className="text-[11px] font-bold text-slate-400">{item.providerName}</p>
                      <h3 className="mt-1 text-xl font-black leading-snug text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {item.productName}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div className="rounded-2xl bg-slate-50 p-4 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">선택 기간</p>
                        <p className="mt-1 font-black text-slate-700">{item.selectedOption.saveTrm || item.selectedOption.termMonths || "-"}개월</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/50 p-4 text-center">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">적용 금리</p>
                        <p className="mt-1 font-black text-emerald-700">{item.selectedOption.appliedRate.toFixed(2)}%</p>
                      </div>
                    </div>

                    <div className="mb-8 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">추천 사유</p>
                      <ul className="space-y-2">
                        {item.reasons.slice(0, 3).map((reason, i) => (
                          <li key={i} className="flex gap-2 text-xs font-medium text-slate-600">
                            <span className="text-emerald-500">•</span>
                            <span className="line-clamp-1">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" className="flex-1 rounded-2xl h-12" onClick={() => setOpenDetailKey(itemKey)}>
                        상세 분석
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1 rounded-2xl h-12"
                        onClick={() => {
                          addCompareIdToStorage(item.unifiedId, compareStoreConfig.max);
                          setFeedback("상품이 비교함에 담겼습니다.");
                          setTimeout(() => setFeedback(""), 3000);
                        }}
                      >
                        비교 담기
                      </Button>
                    </div>

                    <ProductDetailDrawer
                      open={openDetailKey === itemKey}
                      onOpenChange={(next) => setOpenDetailKey(next ? itemKey : null)}
                      kind={item.kind}
                      product={detailProduct}
                      amountWonDefault={item.kind === "saving" ? 500_000 : 10_000_000}
                    />
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {!loading && !result && (
          <div className="py-20">
            <EmptyState
              title="아직 추천 결과가 없습니다"
              description="상단의 옵션을 선택하고 '추천 결과 보기' 버튼을 눌러보세요."
              icon="search"
            />
          </div>
        )}

        {loading && (
          <div className="py-20">
            <LoadingState description="최적의 금융 상품을 분석하고 있습니다." />
          </div>
        )}

        {lastStored && (
          <Card className="mt-12 rounded-[2.5rem] border-slate-100 bg-slate-50/30 p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-slate-900">지난 추천 히스토리</h3>
              <Button size="sm" variant="ghost" onClick={() => {
                localStorage.removeItem(RESULT_STORAGE_KEY);
                setLastStored(null);
              }}>기록 삭제</Button>
            </div>
            <p className="text-sm font-medium text-slate-500">마지막 저장일: {formatKoreanDateTime(lastStored.savedAt)}</p>
          </Card>
        )}
      </Container>
    </main>
  );
}

export default function RecommendPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-50"><LoadingState /></main>}>
      <RecommendPageInner />
    </Suspense>
  );
}
