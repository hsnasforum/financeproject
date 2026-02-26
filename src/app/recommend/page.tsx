"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { NumberField } from "@/components/forms/NumberField";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { SourceBadge } from "@/components/debug/SourceBadge";
import { DataFreshnessBanner } from "@/components/data/DataFreshnessBanner";
import { type FreshnessSourceSpec } from "@/components/data/freshness";
import { FallbackBanner } from "@/components/FallbackBanner";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
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
import { Button } from "@/components/ui/Button";

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

type RecommendDiffChangedItem = {
  key: string;
  sourceId: string;
  finPrdtCd: string;
  productName: string;
  providerName: string;
  previousRank: number;
  currentRank: number;
  previousRate: number | null;
  currentRate: number | null;
  previousTerm: string | null;
  currentTerm: string | null;
  changedFields: Array<"rank" | "rate" | "term">;
};

type RecommendDiff = {
  previousSavedAt: string;
  currentSavedAt: string;
  changed: RecommendDiffChangedItem[];
  added: StoredRecommendItemV1[];
  removed: StoredRecommendItemV1[];
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

function computeDiff(prev: StoredRecommendResultV1, curr: StoredRecommendResultV1): RecommendDiff {
  const prevMap = new Map(prev.items.map((item) => [item.key, item]));
  const currMap = new Map(curr.items.map((item) => [item.key, item]));

  const changed: RecommendDiffChangedItem[] = [];
  const added: StoredRecommendItemV1[] = [];
  const removed: StoredRecommendItemV1[] = [];

  for (const item of curr.items) {
    const prevItem = prevMap.get(item.key);
    if (!prevItem) {
      added.push(item);
      continue;
    }

    const changedFields: Array<"rank" | "rate" | "term"> = [];
    if (prevItem.rank !== item.rank) changedFields.push("rank");
    if (
      (prevItem.appliedRate === null) !== (item.appliedRate === null) ||
      (prevItem.appliedRate !== null && item.appliedRate !== null && Math.abs(prevItem.appliedRate - item.appliedRate) >= 0.0001)
    ) {
      changedFields.push("rate");
    }
    if ((prevItem.saveTrm ?? null) !== (item.saveTrm ?? null)) changedFields.push("term");

    if (changedFields.length > 0) {
      changed.push({
        key: item.key,
        sourceId: item.sourceId,
        finPrdtCd: item.finPrdtCd,
        productName: item.productName,
        providerName: item.providerName,
        previousRank: prevItem.rank,
        currentRank: item.rank,
        previousRate: prevItem.appliedRate,
        currentRate: item.appliedRate,
        previousTerm: prevItem.saveTrm,
        currentTerm: item.saveTrm,
        changedFields,
      });
    }
  }

  for (const item of prev.items) {
    if (!currMap.has(item.key)) removed.push(item);
  }

  changed.sort((a, b) => {
    const bWeight = b.changedFields.length + Math.abs(b.previousRank - b.currentRank);
    const aWeight = a.changedFields.length + Math.abs(a.previousRank - a.currentRank);
    if (bWeight !== aWeight) return bWeight - aWeight;
    return a.currentRank - b.currentRank;
  });

  return {
    previousSavedAt: prev.savedAt,
    currentSavedAt: curr.savedAt,
    changed,
    added,
    removed,
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

function fmtDeltaRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%p`;
}

function fmtRankShift(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value > 0) return `+${value}`;
  return String(value);
}

function fmtRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
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

export default function RecommendPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<StoredProfile>(defaultProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastStored, setLastStored] = useState<StoredRecommendResultV1 | null>(null);
  const [diff, setDiff] = useState<RecommendDiff | null>(null);
  const [entrySource, setEntrySource] = useState<string | null>(null);
  const [readyToPersist, setReadyToPersist] = useState(false);
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [formIssues, setFormIssues] = useState<Issue[]>([]);
  const lastStoredRef = useRef<StoredRecommendResultV1 | null>(null);
  const autoRunTriggeredRef = useRef(false);
  const submitInFlightRef = useRef(false);

  function showValidationIssues(issues: Issue[]) {
    setFormIssues(issues);
    setError(firstError(issues) ?? "입력값을 확인해 주세요.");
    setTimeout(() => {
      scrollToErrorSummary(ERROR_SUMMARY_ID);
      focusFirstError(issues.map((entry) => entry.path));
      announce(`입력 오류 ${issues.length}건이 있습니다.`);
    }, 0);
  }

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
      // ignore malformed localStorage
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
    setDiff(null);
    setEntrySource(queryOverrides.source);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readyToPersist) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, readyToPersist]);

  async function submitWithProfile(
    profileInput: StoredProfile,
    options?: {
      autoSave?: boolean;
      goHistory?: boolean;
      autorunSig?: string;
    },
  ) {
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

      const prevStored = lastStoredRef.current;
      const currStored = buildStoredResult(requestProfile, json);
      if (prevStored) {
        setDiff(computeDiff(prevStored, currStored));
      } else {
        setDiff(null);
      }
      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(currStored));
      setLastStored(currStored);
      lastStoredRef.current = currStored;
      setResult(json);
      setActionNotice("");
      setFormIssues([]);

      if (options?.autoSave) {
        const sig = options.autorunSig ?? buildAutorunSignature(requestProfile);
        const previous = readAutorunSessionPayload();
        if (previous?.sig === sig && previous.runId) {
          setActionNotice("같은 세션에서 동일 자동 실행은 이미 저장되어 저장을 건너뛰었습니다.");
          if (options.goHistory) {
            router.push(`/recommend/history?open=${encodeURIComponent(previous.runId)}`);
          }
        } else {
          const runId = saveRunFromRecommend(toSavedRunProfile(requestProfile), json);
          writeAutorunSessionPayload({ sig, runId });
          setActionNotice("자동 실행 결과를 저장했습니다.");
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
  }

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

  const changedPreview = (diff?.changed ?? []).slice(0, 12);
  const addedPreview = (diff?.added ?? []).slice(0, 8);
  const removedPreview = (diff?.removed ?? []).slice(0, 8);
  const fieldIssueMap = useMemo(() => issuesToFieldMap(formIssues), [formIssues]);

  async function submit() {
    if (loading) return;
    await submitWithProfile(profile);
  }

  function saveCurrentRun() {
    if (!result) return;
    const runId = saveRunFromRecommend(toSavedRunProfile(profile), result);
    setActionNotice(`실행을 저장했습니다. (${runId})`);
  }

  function exportCurrentRunJson() {
    if (!result) return;
    const run = buildExportRun(profile, result);
    if (!run) return;
    const content = exportRunJson(run);
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}.json`, content, "application/json;charset=utf-8");
    setActionNotice("JSON 파일을 내보냈습니다.");
  }

  function exportCurrentRunCsv() {
    if (!result) return;
    const run = buildExportRun(profile, result);
    if (!run) return;
    const content = exportRunCsv(run);
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}.csv`, content, "text/csv;charset=utf-8");
    setActionNotice("CSV 파일을 내보냈습니다.");
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 md:py-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4">
      <DataFreshnessBanner sources={freshnessSources} infoDisplay="compact" />
      <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">설명가능 예적금 추천</h1>
        <p className="mt-2 text-sm text-slate-600">후보군 내 상대 비교 점수이며 확정 수익을 의미하지 않습니다.</p>
        <ErrorSummary issues={formIssues} id={ERROR_SUMMARY_ID} className="mt-4" />
        <ErrorAnnouncer />

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            목적
            <select
              id={pathToId("purpose")}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.purpose}
              onChange={(e) => setProfile((prev) => ({ ...prev, purpose: e.target.value as StoredProfile["purpose"] }))}
              aria-invalid={Boolean(fieldIssueMap.purpose?.[0])}
              aria-describedby={fieldIssueMap.purpose?.[0] ? `${pathToId("purpose")}_error` : undefined}
            >
              <option value="emergency">단기 비상금</option>
              <option value="seed-money">목돈 마련</option>
              <option value="long-term">장기 저축</option>
            </select>
            <FieldError id={`${pathToId("purpose")}_error`} message={fieldIssueMap.purpose?.[0]} />
          </label>

          <label className="text-sm">
            상품 유형
            <select
              id={pathToId("kind")}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.kind}
              onChange={(e) => setProfile((prev) => ({ ...prev, kind: e.target.value as StoredProfile["kind"] }))}
              aria-invalid={Boolean(fieldIssueMap.kind?.[0])}
              aria-describedby={fieldIssueMap.kind?.[0] ? `${pathToId("kind")}_error` : undefined}
            >
              <option value="deposit">예금</option>
              <option value="saving">적금</option>
            </select>
            <FieldError id={`${pathToId("kind")}_error`} message={fieldIssueMap.kind?.[0]} />
          </label>

          <label className="text-sm">
            선호 기간
            <select
              id={pathToId("preferredTerm")}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.preferredTerm}
              onChange={(e) => setProfile((prev) => ({ ...prev, preferredTerm: Number(e.target.value) as StoredProfile["preferredTerm"] }))}
              aria-invalid={Boolean(fieldIssueMap.preferredTerm?.[0])}
              aria-describedby={fieldIssueMap.preferredTerm?.[0] ? `${pathToId("preferredTerm")}_error` : undefined}
            >
              <option value={3}>3개월</option>
              <option value={6}>6개월</option>
              <option value={12}>12개월</option>
              <option value={24}>24개월</option>
              <option value={36}>36개월</option>
            </select>
            <FieldError id={`${pathToId("preferredTerm")}_error`} message={fieldIssueMap.preferredTerm?.[0]} />
          </label>

          <label className="text-sm">
            유동성 선호
            <select
              id={pathToId("liquidityPref")}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.liquidityPref}
              onChange={(e) => setProfile((prev) => ({ ...prev, liquidityPref: e.target.value as StoredProfile["liquidityPref"] }))}
              aria-invalid={Boolean(fieldIssueMap.liquidityPref?.[0])}
              aria-describedby={fieldIssueMap.liquidityPref?.[0] ? `${pathToId("liquidityPref")}_error` : undefined}
            >
              <option value="low">낮음</option>
              <option value="mid">중간</option>
              <option value="high">높음</option>
            </select>
            <FieldError id={`${pathToId("liquidityPref")}_error`} message={fieldIssueMap.liquidityPref?.[0]} />
          </label>

          <label className="text-sm">
            금리 선택 정책
            <select
              id={pathToId("rateMode")}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.rateMode}
              onChange={(e) => setProfile((prev) => ({ ...prev, rateMode: e.target.value as StoredProfile["rateMode"] }))}
              aria-invalid={Boolean(fieldIssueMap.rateMode?.[0])}
              aria-describedby={fieldIssueMap.rateMode?.[0] ? `${pathToId("rateMode")}_error` : undefined}
            >
              <option value="max">최고금리 우선</option>
              <option value="base">기본금리 우선</option>
              <option value="simple">단순조건 선호</option>
            </select>
            <FieldError id={`${pathToId("rateMode")}_error`} message={fieldIssueMap.rateMode?.[0]} />
          </label>

          <label className="text-sm">
            Top N
            <NumberField
              id={pathToId("topN")}
              min={1}
              max={50}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.topN}
              onValueChange={(value) => setProfile((prev) => ({ ...prev, topN: value === null ? 0 : Math.trunc(value) }))}
              aria-invalid={Boolean(fieldIssueMap.topN?.[0])}
              aria-describedby={fieldIssueMap.topN?.[0] ? `${pathToId("topN")}_error` : undefined}
            />
            <FieldError id={`${pathToId("topN")}_error`} message={fieldIssueMap.topN?.[0]} />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <Button
            size="sm"
            variant="ghost"
            className="font-semibold"
            onClick={() => setAdvancedOpen((prev) => !prev)}
          >
            고급 옵션 {advancedOpen ? "접기" : "열기"}
          </Button>
          {advancedOpen ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    id={pathToId("candidatePool")}
                    type="radio"
                    name="candidate-pool"
                    checked={profile.candidatePool === "legacy"}
                    onChange={() => setProfile((prev) => ({ ...prev, candidatePool: "legacy", candidateSources: ["finlife"] }))}
                  />
                  후보풀 legacy
                </label>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    id={pathToId("candidatePool_unified")}
                    type="radio"
                    name="candidate-pool"
                    checked={profile.candidatePool === "unified"}
                    onChange={() => setProfile((prev) => ({ ...prev, candidatePool: "unified", candidateSources: ["finlife"] }))}
                  />
                  후보풀 unified(merged)
                </label>
              </div>
              <FieldError id={`${pathToId("candidatePool")}_error`} message={fieldIssueMap.candidatePool?.[0]} />
              <p className="text-xs text-slate-500">unified 모드는 merged만 사용하며 integrated는 사용자 화면에 노출하지 않습니다.</p>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    id={pathToId("depositProtection")}
                    type="radio"
                    name="deposit-protection"
                    checked={profile.depositProtection === "any"}
                    onChange={() => setProfile((prev) => ({ ...prev, depositProtection: "any" }))}
                  />
                  보호신호 any
                </label>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    id={pathToId("depositProtection_prefer")}
                    type="radio"
                    name="deposit-protection"
                    checked={profile.depositProtection === "prefer"}
                    onChange={() => setProfile((prev) => ({ ...prev, depositProtection: "prefer" }))}
                  />
                  보호신호 prefer
                </label>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    id={pathToId("depositProtection_require")}
                    type="radio"
                    name="deposit-protection"
                    checked={profile.depositProtection === "require"}
                    onChange={() => setProfile((prev) => ({ ...prev, depositProtection: "require" }))}
                  />
                  보호신호 require
                </label>
              </div>
              <FieldError id={`${pathToId("depositProtection")}_error`} message={fieldIssueMap.depositProtection?.[0]} />
              <p className="text-xs text-slate-500">보호신호 필터(any/prefer/require)는 현재 비활성화되어 추천 점수에 영향을 주지 않습니다.</p>

              <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs">
                금리 가중치 {profile.weights.rate.toFixed(2)}
                <input
                  id={pathToId("weights.rate")}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={profile.weights.rate}
                  onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, rate: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
                <FieldError id={`${pathToId("weights.rate")}_error`} message={fieldIssueMap["weights.rate"]?.[0]} />
              </label>
              <label className="text-xs">
                기간 가중치 {profile.weights.term.toFixed(2)}
                <input
                  id={pathToId("weights.term")}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={profile.weights.term}
                  onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, term: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
                <FieldError id={`${pathToId("weights.term")}_error`} message={fieldIssueMap["weights.term"]?.[0]} />
              </label>
              <label className="text-xs">
                유동성 가중치 {profile.weights.liquidity.toFixed(2)}
                <input
                  id={pathToId("weights.liquidity")}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={profile.weights.liquidity}
                  onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, liquidity: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
                <FieldError id={`${pathToId("weights.liquidity")}_error`} message={fieldIssueMap["weights.liquidity"]?.[0]} />
              </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={loading}
          >
            {loading ? "추천 계산 중..." : "추천 실행"}
          </Button>
          <span className="text-sm text-slate-500">현재 목적: {purposeLabel}</span>
          {entrySource ? <span className="text-xs text-slate-500">유입: {entrySource}</span> : null}
        </div>
      </section>

      {error ? <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</section> : null}

      {result?.message ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{result.message}</section>
      ) : null}

      <FallbackBanner fallback={result?.meta?.fallback} />

      {result?.meta ? (
        <section className="rounded-[2rem] shadow-sm border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">가정값 및 메타</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <p>kind: {result.meta.kind} / topN: {result.meta.topN} / rateMode: {result.meta.rateMode}</p>
            <p>candidatePool: {result.meta.candidatePool ?? "legacy"} / sources: {(result.meta.candidateSources ?? ["finlife"]).join(", ")} / depositProtection: {result.meta.depositProtection ?? "any"}</p>
            <p>weights: rate {result.meta.weights.rate.toFixed(2)}, term {result.meta.weights.term.toFixed(2)}, liquidity {result.meta.weights.liquidity.toFixed(2)}</p>
            <p>{result.meta.assumptions.rateSelectionPolicy}</p>
            <p>{result.meta.assumptions.liquidityPolicy}</p>
            <p>{result.meta.assumptions.normalizationPolicy}</p>
            {result.meta.assumptions.kdbParsingPolicy ? <p>{result.meta.assumptions.kdbParsingPolicy}</p> : null}
            {result.meta.assumptions.depositProtectionPolicy ? <p>{result.meta.assumptions.depositProtectionPolicy}</p> : null}
            {result.debug ? <p>debug: 후보 {result.debug.candidateCount}개 / 금리범위 {result.debug.rateMin.toFixed(2)}~{result.debug.rateMax.toFixed(2)}%</p> : null}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-[2rem] shadow-sm border border-slate-100 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={saveCurrentRun}
              disabled={(result.items ?? []).length === 0}
            >
              이번 실행 저장
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCurrentRunJson}
              disabled={(result.items ?? []).length === 0}
            >
              JSON 내보내기
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCurrentRunCsv}
              disabled={(result.items ?? []).length === 0}
            >
              CSV 내보내기
            </Button>
            <Link href="/recommend/history"><Button size="sm" variant="secondary">히스토리 보기</Button></Link>
          </div>
          {actionNotice ? <p className="mt-2 text-xs text-slate-600">{actionNotice}</p> : null}
        </section>
      ) : null}

      <section className="rounded-[2rem] shadow-sm border border-slate-100 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">지난 추천 기록</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              localStorage.removeItem(RESULT_STORAGE_KEY);
              setLastStored(null);
              lastStoredRef.current = null;
              setDiff(null);
            }}
            disabled={!lastStored}
          >
            기록 삭제
          </Button>
        </div>

        {!lastStored ? (
          <p className="mt-2 text-sm text-slate-600">저장된 추천 기록이 없습니다. 추천 실행 후 비교 기록이 생성됩니다.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              마지막 저장: {formatKoreanDateTime(lastStored.savedAt)} / 항목 {lastStored.items.length}건
            </p>

            {!diff ? (
              <p className="mt-3 text-sm text-slate-600">아직 직전 실행 대비 변화가 없습니다. 한 번 더 실행하면 순위/금리/기간 변화가 표시됩니다.</p>
            ) : (
              <>
                <p className="mt-3 text-sm text-slate-700">
                  비교 기준: {formatKoreanDateTime(diff.previousSavedAt)} → {formatKoreanDateTime(diff.currentSavedAt)}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-semibold text-slate-900">변경</p>
                    <p className="mt-1 text-slate-700">{diff.changed.length}건</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-semibold text-slate-900">신규</p>
                    <p className="mt-1 text-slate-700">{diff.added.length}건</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-semibold text-slate-900">제외</p>
                    <p className="mt-1 text-slate-700">{diff.removed.length}건</p>
                  </div>
                </div>

                {changedPreview.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <p className="text-sm font-semibold text-slate-900">변경 항목 (최대 12)</p>
                    <table className="mt-2 min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-slate-600">
                          <th className="py-2 pr-3">상품</th>
                          <th className="py-2 pr-3">순위</th>
                          <th className="py-2 pr-3">금리</th>
                          <th className="py-2 pr-3">기간</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedPreview.map((item) => (
                          <tr key={item.key} className="border-b border-slate-100 align-top text-slate-700">
                            <td className="py-2 pr-3">
                              <p className="font-medium text-slate-900">{item.productName}</p>
                              <p className="text-xs text-slate-500">{item.sourceId} / {item.finPrdtCd}</p>
                            </td>
                            <td className="py-2 pr-3">
                              {item.previousRank}위 → {item.currentRank}위
                              {item.changedFields.includes("rank") ? (
                                <span className="ml-1 text-xs text-slate-500">({fmtRankShift(item.previousRank - item.currentRank)})</span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">
                              {fmtRate(item.previousRate)} → {fmtRate(item.currentRate)}
                              {item.changedFields.includes("rate") ? (
                                <span className="ml-1 text-xs text-slate-500">({fmtDeltaRate((item.currentRate ?? 0) - (item.previousRate ?? 0))})</span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">{item.previousTerm ?? "-"} → {item.currentTerm ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">신규 항목 (최대 8)</p>
                    {addedPreview.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-600">없음</p>
                    ) : (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {addedPreview.map((item) => (
                          <li key={`added-${item.key}`}>{item.productName} ({item.sourceId})</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">제외 항목 (최대 8)</p>
                    {removedPreview.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-600">없음</p>
                    ) : (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {removedPreview.map((item) => (
                          <li key={`removed-${item.key}`}>{item.productName} ({item.sourceId})</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="grid gap-4">
        {(result?.items ?? []).length === 0 && result?.ok ? (
          <article className="rounded-[2rem] shadow-sm border border-slate-100 bg-white p-6 text-sm text-slate-600">
            추천 후보가 없어 표시할 항목이 없습니다. 조건을 바꿔 다시 실행하거나 상품 탐색에서 직접 확인해보세요.
            <div className="mt-4">
              <Link href={profile.kind === "saving" ? "/products/saving" : "/products/deposit"} className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                상품 탐색으로 이동
              </Link>
            </div>
          </article>
        ) : null}

        {(result?.items ?? []).map((item, index) => {
          const itemKey = `${item.sourceId}-${item.finPrdtCd}-${index}`;
          const detailProduct = buildDetailProduct(item);
          return (
            <article key={itemKey} className="rounded-[2rem] shadow-sm border border-slate-100 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">#{index + 1}</span>
                <SourceBadge sourceId={item.sourceId} />
                {Array.from(
                  new Set((item.badges ?? []).map((badge) => badge.trim()).filter((badge) => badge.length > 0)),
                ).map((badge) => (
                  <span key={`${item.sourceId}-${item.finPrdtCd}-${badge}`} className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    {badge}
                  </span>
                ))}
                <span className="text-slate-500">{item.providerName}</span>
              </div>

              <h3 className="mt-2 text-lg font-semibold text-slate-900">{item.productName}</h3>
              <p className="mt-1 text-sm text-slate-600">상품코드: {item.finPrdtCd}</p>
              <p className="mt-1 text-xs text-slate-500">unifiedId: {item.unifiedId}</p>
              <p className="mt-1 text-sm text-slate-700">선택 옵션: {item.selectedOption.saveTrm ?? "-"}개월 / 적용금리 {item.selectedOption.appliedRate.toFixed(2)}%</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">최종 점수: {item.finalScore.toFixed(4)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenDetailKey(itemKey)}
                >
                  상세보기
                </Button>
                <Link href={`/products/catalog/${encodeURIComponent(item.unifiedId)}`}>
                  <Button size="sm" variant="outline">통합 상세 보기</Button>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const next = addCompareIdToStorage(item.unifiedId, compareStoreConfig.max);
                    setActionNotice(`비교함에 담았습니다. (${next.length}/${compareStoreConfig.max})`);
                  }}
                >
                  비교 담기
                </Button>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {item.breakdown.map((part) => (
                  <div key={part.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-semibold text-slate-900">{part.label}</p>
                    <p>raw: {part.raw.toFixed(4)}</p>
                    <p>weight: {part.weight.toFixed(2)}</p>
                    <p>contribution: {part.contribution.toFixed(4)}</p>
                    <p className="mt-1 text-xs text-slate-600">{part.reason}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900">왜 추천됐는지</p>
                {item.signals?.depositProtection ? (
                  <p className="mt-1 text-xs text-slate-500">예금자보호 신호: {item.signals.depositProtection}</p>
                ) : null}
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {item.reasons.map((line, i) => <li key={`${item.finPrdtCd}-${i}`}>{line}</li>)}
                </ul>
              </div>
              <ProductDetailDrawer
                open={openDetailKey === itemKey}
                onOpenChange={(next) => setOpenDetailKey(next ? itemKey : null)}
                kind={item.kind}
                product={detailProduct}
                amountWonDefault={item.kind === "saving" ? 500_000 : 10_000_000}
              />
            </article>
          );
        })}
      </section>
      </div>
    </main>
  );
}
