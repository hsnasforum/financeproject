"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecommendOwner } from "@/lib/recommend/RecommendOwnerContext";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { RecommendResultsPanel } from "@/components/recommend/RecommendResultsPanel";
import { LegacyRecommendMigrationCard } from "@/components/recommend/LegacyRecommendMigrationCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { downloadText } from "@/lib/browser/download";
import { createLatestRequestCoordinator } from "@/lib/browser/latestRequest";
import { announce, focusFirstError, scrollToErrorSummary } from "@/lib/forms/a11y";
import { pathToId } from "@/lib/forms/ids";
import { firstError, issuesToFieldMap } from "@/lib/forms/issueMap";
import { addCompareIdToStorage, compareStoreConfig, loadCompareIdsFromStorage } from "@/lib/products/compareStore";
import { describeCompareAdd, type CompareAddResult } from "@/components/recommend/CompareAddNotice";
import {
  buildRecommendHistoryHref,
  buildRecommendInitialProfileState,
  isRecommendResultProfileStale,
  resolveRecommendAutorunContinuation,
} from "@/lib/recommend/recommendPageController";
import {
  buildRunFromRecommend,
  exportRunCsv,
  exportRunJson,
  saveRunFromRecommend,
  type SavedRecommendRun,
  type SavedRunProfile,
} from "@/lib/recommend/savedRunsStore";
import {
  buildRecommendAutorunSignature,
  buildRecommendRequest,
  buildStoredRecommendProfile,
  buildStoredRecommendResult,
  parseStoredRecommendProfile,
  parseStoredRecommendResult,
  readRecommendAutorunSessionPayload,
  recommendProfileStorageKey,
  recommendResultStorageKey,
  type StoredRecommendResultV2,
  writeRecommendAutorunSessionPayload,
} from "@/lib/recommend/recommendStorageAdapter";
import {
  isRecommendOwner,
  type RecommendOwnerId,
} from "@/lib/recommend/ownerNamespace";
import {
  hasLegacyRecommendStorage,
  LEGACY_RECOMMEND_RESOLVED_EVENT,
  legacyRecommendDismissSessionKey,
} from "@/lib/recommend/legacyStorageMigration";
import {
  attachUnifiedIds,
  formatKoreanDateTime,
  readPlanningActionContext,
  type RecommendResponse,
} from "@/lib/recommend/recommendResultsViewModel";
import {
  formatRecommendWeightNormalizationNotice,
} from "@/lib/recommend/weights";
import {
  defaults as recommendProfileDefaults,
  parseRecommendProfile,
  type RecommendProfileNormalized,
} from "@/lib/schemas/recommendProfile";
import { parseStringIssues, type Issue } from "@/lib/schemas/issueTypes";
import { type SourceStatusRow } from "@/lib/sources/types";

type StoredProfile = RecommendProfileNormalized;
type StoredRecommendResult = StoredRecommendResultV2<StoredProfile, RecommendResponse["meta"]>;
type RecommendResultSnapshot = Readonly<{
  profile: StoredProfile;
  response: RecommendResponse;
}>;

type StatusApiResponse = {
  ok: boolean;
  data?: SourceStatusRow[];
};

const ERROR_SUMMARY_ID = "recommend_error_summary";

const defaultProfile: StoredProfile = recommendProfileDefaults();

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
    ...(profile.planning ? { planning: profile.planning } : {}),
    ...(profile.planningContext ? { planningContext: profile.planningContext } : {}),
  };
}

function formatStoredPurposeLabel(purpose: StoredProfile["purpose"]): string {
  if (purpose === "emergency") return "단기 비상금";
  if (purpose === "long-term") return "장기 저축";
  return "목돈 마련";
}

function buildExportRun(
  ownerId: RecommendOwnerId,
  snapshot: RecommendResultSnapshot,
): SavedRecommendRun | null {
  if (!Array.isArray(snapshot.response.items)) return null;
  return buildRunFromRecommend(ownerId, toSavedRunProfile(snapshot.profile), snapshot.response, {
    runId: `adhoc_${Date.now()}`,
    savedAt: new Date().toISOString(),
  });
}

function RecommendPageOwned({ ownerId }: { ownerId: RecommendOwnerId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<StoredProfile>(defaultProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [compareAddResult, setCompareAddResult] = useState<CompareAddResult | null>(null);
  const [resultSnapshot, setResultSnapshot] = useState<RecommendResultSnapshot | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastStored, setLastStored] = useState<StoredRecommendResult | null>(null);
  const [readyToPersist, setReadyToPersist] = useState(false);
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const [formIssues, setFormIssues] = useState<Issue[]>([]);
  const [sourceStatusRows, setSourceStatusRows] = useState<SourceStatusRow[]>([]);
  const [sourceStatusReady, setSourceStatusReady] = useState(false);
  const [deletedStoredResult, setDeletedStoredResult] = useState<StoredRecommendResult | null>(null);
  const [recentHistoryNotice, setRecentHistoryNotice] = useState("");
  const [weightNormalizationNotice, setWeightNormalizationNotice] = useState("");
  const lastStoredRef = useRef<StoredRecommendResult | null>(null);
  const autoRunTriggeredRef = useRef(false);
  const sourceStatusAbortRef = useRef<AbortController | null>(null);
  const [requestCoordinator] = useState(() => createLatestRequestCoordinator());
  const result = resultSnapshot?.response ?? null;

  const showValidationIssues = useCallback((
    issues: Issue[],
    isCurrent: () => boolean = () => true,
  ) => {
    if (!isCurrent()) return;
    setFormIssues(issues);
    setError(firstError(issues) ?? "입력값을 확인해 주세요.");
    setTimeout(() => {
      if (!isCurrent()) return;
      scrollToErrorSummary(ERROR_SUMMARY_ID);
      focusFirstError(issues.map((entry) => entry.path));
      announce(`입력 오류 ${issues.length}건이 있습니다.`);
    }, 0);
  }, []);

  useEffect(() => () => {
    requestCoordinator.cancel();
  }, [requestCoordinator]);

  const submitWithProfile = useCallback(async (
    profileInput: StoredProfile,
    options?: {
      autoSave?: boolean;
      goHistory?: boolean;
      autorunSig?: string;
    },
  ) => {
    const lease = requestCoordinator.start();
    const parsedProfile = parseRecommendProfile(profileInput);
    setWeightNormalizationNotice(formatRecommendWeightNormalizationNotice(parsedProfile.weightNormalization));
    if (!parsedProfile.ok) {
      setLoading(false);
      setResultSnapshot(null);
      showValidationIssues(parsedProfile.issues, lease.isCurrent);
      return;
    }

    const requestProfile = parsedProfile.value;
    setLoading(true);
    setError("");
    setFormIssues([]);
    setOpenDetailKey(null);
    setProfile(requestProfile);
    let keepLeaseForValidationFocus = false;
    try {
      const request = buildRecommendRequest({ profile: requestProfile });
      const res = await fetch(request.url, {
        ...request.init,
        signal: lease.signal,
      });
      const rawJson = (await res.json()) as RecommendResponse;
      if (!lease.isCurrent()) return;
      if (!res.ok || !rawJson.ok) {
        const apiIssues = parseStringIssues(rawJson.error?.issues ?? []);
        setResultSnapshot(null);
        if (apiIssues.length > 0) {
          keepLeaseForValidationFocus = true;
          showValidationIssues(apiIssues, lease.isCurrent);
          return;
        } else {
          setError(rawJson.error?.message ?? "추천 결과를 불러오지 못했습니다.");
          announce(rawJson.error?.message ?? "추천 결과를 불러오지 못했습니다.");
        }
        return;
      }
      if (!isRecommendOwner(ownerId, rawJson.meta?.userId)) {
        setResultSnapshot(null);
        setError("현재 로그인 사용자와 추천 결과의 소유자가 일치하지 않아 결과를 저장하지 않았습니다.");
        announce("추천 결과의 사용자 정보를 확인하지 못해 결과를 저장하지 않았습니다.");
        return;
      }
      const json = attachUnifiedIds(rawJson);
      const resultProfile = parseRecommendProfile(requestProfile).value;

      const currStored = buildStoredRecommendResult<StoredProfile, RecommendResponse["meta"]>({
        ownerId,
        profile: resultProfile,
        meta: json.meta,
        items: json.items,
      });
      localStorage.setItem(recommendResultStorageKey(ownerId), JSON.stringify(currStored));
      setLastStored(currStored);
      setDeletedStoredResult(null);
      setRecentHistoryNotice("");
      lastStoredRef.current = currStored;
      setResultSnapshot({ profile: resultProfile, response: json });
      setFormIssues([]);

      if (options?.autoSave) {
        const sig = options.autorunSig ?? buildRecommendAutorunSignature(resultProfile);
        const previous = readRecommendAutorunSessionPayload(ownerId);
        const continuation = resolveRecommendAutorunContinuation({
          signature: sig,
          previous,
          goHistory: options.goHistory === true,
        });
        // Only the autorun link reaches here. Replace the autorun entry with history so Back leaves the
        // flow instead of re-running it (the reuse branch would push history again and trap Back).
        if (continuation.kind === "reuse") {
          if (continuation.historyHref) router.replace(continuation.historyHref);
        } else {
          const runId = saveRunFromRecommend(ownerId, toSavedRunProfile(resultProfile), json);
          writeRecommendAutorunSessionPayload(ownerId, { sig: continuation.signature, runId });
          if (continuation.goHistory) router.replace(buildRecommendHistoryHref(runId));
        }
      }
    } catch (requestError) {
      if (!lease.isCurrent()) return;
      if (requestError instanceof Error && requestError.name === "AbortError") return;
      setError("네트워크 오류로 추천 요청에 실패했습니다.");
      announce("네트워크 오류로 추천 요청에 실패했습니다.");
    } finally {
      if (keepLeaseForValidationFocus) setLoading(false);
      else if (lease.finish()) setLoading(false);
    }
  }, [ownerId, requestCoordinator, router, showValidationIssues]);

  useEffect(() => {
    let active = true;
    let storedProfileRaw: string | null = null;
    try {
      const storedProfile = parseStoredRecommendProfile<StoredProfile>(
        ownerId,
        localStorage.getItem(recommendProfileStorageKey(ownerId)),
      );
      storedProfileRaw = storedProfile ? JSON.stringify(storedProfile.profile) : null;
    } catch {
      // ignore
    }

    const initialState = buildRecommendInitialProfileState({ searchParams, storedProfileRaw });
    const nextProfile = initialState.profile;
    const queryOverrides = initialState.queryOverrides;
    const stored = parseStoredRecommendResult<StoredProfile, RecommendResponse["meta"]>(
      ownerId,
      localStorage.getItem(recommendResultStorageKey(ownerId)),
    );
    const ownedStored = stored && isRecommendOwner(ownerId, stored.meta?.userId) ? stored : null;

    async function applyInitialState() {
      await Promise.resolve();
      if (!active) return;
      if (queryOverrides.issues.length > 0) {
        showValidationIssues(queryOverrides.issues);
      } else {
        setFormIssues([]);
      }
      setLastStored(ownedStored);
      lastStoredRef.current = ownedStored;
      setProfile(nextProfile);
      setWeightNormalizationNotice(formatRecommendWeightNormalizationNotice(initialState.weightNormalization));
      let legacyMigrationPending = false;
      try {
        legacyMigrationPending = hasLegacyRecommendStorage(localStorage)
          && sessionStorage.getItem(legacyRecommendDismissSessionKey(ownerId)) !== "1";
      } catch {
        legacyMigrationPending = false;
      }
      setReadyToPersist(!legacyMigrationPending);

      if (queryOverrides.autoRun && !autoRunTriggeredRef.current) {
        autoRunTriggeredRef.current = true;
        void submitWithProfile(nextProfile, {
          autoSave: queryOverrides.autoSave,
          goHistory: queryOverrides.goHistory,
          autorunSig: buildRecommendAutorunSignature(nextProfile),
        });
      }
    }

    void applyInitialState();

    return () => {
      active = false;
    };
  }, [ownerId, searchParams, showValidationIssues, submitWithProfile]);

  useEffect(() => {
    const continueWithOwnedStorage = () => setReadyToPersist(true);
    window.addEventListener(LEGACY_RECOMMEND_RESOLVED_EVENT, continueWithOwnedStorage);
    return () => {
      window.removeEventListener(LEGACY_RECOMMEND_RESOLVED_EVENT, continueWithOwnedStorage);
    };
  }, []);

  useEffect(() => {
    if (!readyToPersist) return;
    localStorage.setItem(
      recommendProfileStorageKey(ownerId),
      JSON.stringify(buildStoredRecommendProfile(ownerId, profile)),
    );
  }, [ownerId, profile, readyToPersist]);

  useEffect(() => {
    if (!result?.items?.length) {
      let active = true;
      sourceStatusAbortRef.current?.abort();

      async function clearSourceStatus() {
        await Promise.resolve();
        if (!active) return;
        setSourceStatusRows([]);
        setSourceStatusReady(false);
      }

      void clearSourceStatus();

      return () => {
        active = false;
      };
    }

    if (result.meta?.freshness) {
      sourceStatusAbortRef.current?.abort();
      let active = true;
      void Promise.resolve().then(() => {
        if (!active) return;
        setSourceStatusRows([]);
        setSourceStatusReady(true);
      });
      return () => {
        active = false;
      };
    }

    sourceStatusAbortRef.current?.abort();
    const controller = new AbortController();
    sourceStatusAbortRef.current = controller;
    let active = true;

    void (async () => {
      await Promise.resolve();
      if (!active || controller.signal.aborted) return;
      setSourceStatusReady(false);
      try {
        const response = await fetch("/api/sources/status", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await response.json()) as StatusApiResponse;
        if (!response.ok || !json.ok || !Array.isArray(json.data)) {
          if (active && !controller.signal.aborted) {
            setSourceStatusRows([]);
            setSourceStatusReady(false);
          }
          return;
        }
        if (active && !controller.signal.aborted) {
          setSourceStatusRows(json.data);
          setSourceStatusReady(true);
        }
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        if (active && !controller.signal.aborted) {
          setSourceStatusRows([]);
          setSourceStatusReady(false);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [result]);

  const purposeLabel = useMemo(() => {
    if (profile.purpose === "emergency") return "단기 비상금";
    if (profile.purpose === "long-term") return "장기 저축";
    return "목돈 마련";
  }, [profile.purpose]);

  const fieldIssueMap = useMemo(() => issuesToFieldMap(formIssues), [formIssues]);
  const planningActionContext = useMemo(
    () => readPlanningActionContext(searchParams),
    [searchParams],
  );
  const resultIsStale = useMemo(
    () => resultSnapshot
      ? isRecommendResultProfileStale(profile, resultSnapshot.profile)
      : false,
    [profile, resultSnapshot],
  );

  async function submit() {
    if (loading) return;
    await submitWithProfile(profile);
  }

  function saveCurrentRun() {
    if (!resultSnapshot || resultIsStale) return;
    if (!isRecommendOwner(ownerId, resultSnapshot.response.meta?.userId)) return;
    saveRunFromRecommend(ownerId, toSavedRunProfile(resultSnapshot.profile), resultSnapshot.response);
    setFeedback("결과가 히스토리에 저장되었습니다.");
    setTimeout(() => setFeedback(""), 3000);
  }

  function exportCurrentRunJson() {
    if (!resultSnapshot || resultIsStale) return;
    if (!isRecommendOwner(ownerId, resultSnapshot.response.meta?.userId)) return;
    const run = buildExportRun(ownerId, resultSnapshot);
    if (!run) return;
    const content = exportRunJson(ownerId, run);
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}.json`, content, "application/json;charset=utf-8");
    setFeedback("JSON 파일이 다운로드되었습니다.");
    setTimeout(() => setFeedback(""), 3000);
  }

  function exportCurrentRunCsv() {
    if (!resultSnapshot || resultIsStale) return;
    if (!isRecommendOwner(ownerId, resultSnapshot.response.meta?.userId)) return;
    const run = buildExportRun(ownerId, resultSnapshot);
    if (!run) return;
    const content = exportRunCsv(ownerId, run);
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}.csv`, content, "text/csv;charset=utf-8");
    setFeedback("CSV 파일이 다운로드되었습니다.");
    setTimeout(() => setFeedback(""), 3000);
  }

  function addItemToCompare(unifiedId: string) {
    const before = loadCompareIdsFromStorage(compareStoreConfig.max);
    const after = addCompareIdToStorage(unifiedId, compareStoreConfig.max);
    const items = resultSnapshot?.response.items ?? [];
    setCompareAddResult(describeCompareAdd({
      before,
      after,
      id: unifiedId,
      max: compareStoreConfig.max,
      labelFor: (id) => items.find((item) => item.unifiedId === id)?.productName,
    }));
  }

  function deleteRecentHistory() {
    const stored = parseStoredRecommendResult<StoredProfile, RecommendResponse["meta"]>(
      ownerId,
      localStorage.getItem(recommendResultStorageKey(ownerId)),
    );
    const ownedStored = stored && isRecommendOwner(ownerId, stored.meta?.userId) ? stored : null;
    if (!ownedStored) {
      setLastStored(null);
      lastStoredRef.current = null;
      setDeletedStoredResult(null);
      setRecentHistoryNotice("현재 계정에서 삭제할 최근 추천 결과를 찾지 못했습니다.");
      return;
    }
    setDeletedStoredResult(ownedStored);
    localStorage.removeItem(recommendResultStorageKey(ownerId));
    setLastStored(null);
    lastStoredRef.current = null;
    setRecentHistoryNotice("현재 계정의 최근 추천 결과를 삭제했습니다. 한 번 되돌릴 수 있습니다.");
  }

  function undoRecentHistoryDelete() {
    if (!deletedStoredResult) return;
    const ownedStored = parseStoredRecommendResult<StoredProfile, RecommendResponse["meta"]>(
      ownerId,
      JSON.stringify(deletedStoredResult),
    );
    if (!ownedStored || !isRecommendOwner(ownerId, ownedStored.meta?.userId)) {
      setDeletedStoredResult(null);
      setRecentHistoryNotice("삭제한 최근 추천 결과의 사용자 정보를 확인하지 못해 복원하지 않았습니다.");
      return;
    }
    localStorage.setItem(recommendResultStorageKey(ownerId), JSON.stringify(ownedStored));
    setLastStored(ownedStored);
    lastStoredRef.current = ownedStored;
    setDeletedStoredResult(null);
    setRecentHistoryNotice("현재 계정의 최근 추천 결과를 복원했습니다.");
  }

  function updateWeight(key: keyof StoredProfile["weights"], value: number) {
    setWeightNormalizationNotice("");
    setProfile((prev) => ({
      ...prev,
      weights: { ...prev.weights, [key]: value },
    }));
  }

  function resetWeights() {
    setProfile((prev) => ({
      ...prev,
      weights: { ...defaultProfile.weights },
    }));
    setWeightNormalizationNotice("가중치를 기본값(금리 55% · 기간 30% · 유동성 15%)으로 복원했습니다.");
  }

  const weightSum = profile.weights.rate + profile.weights.term + profile.weights.liquidity;
  const weightSumPct = Math.round(weightSum * 10_000) / 100;

  return (
    <PageShell>
      <PageHeader
        title="상품 추천 비교"
        description="지금 입력한 조건과 플래닝 연동 정보를 기준으로 예적금 후보를 먼저 비교해 보는 화면입니다."
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        먼저 비교 후보 보기로 현재 조건의 후보를 확인하고, 결과 순서가 아쉬울 때만 가중치 설정으로 점수 기준을 조정해 보세요.{" "}
        이 화면은 확정 답안을 고르는 곳이 아니라, 현재 조건 기준으로 비교할 후보와 다음 확인 포인트를 정리하는 단계입니다.{" "}
        데이터 신뢰 및 연동 상태는{" "}
        <Link href="/settings/data-sources" className="font-black text-primary hover:text-navy">
          내 설정 &gt; 데이터 신뢰 및 연동 상태
        </Link>
        에서 확인할 수 있습니다.
      </p>

      <LegacyRecommendMigrationCard />

      <div className="mb-8 space-y-6" data-testid="recommend-root">
        <Card className="rounded-[2.5rem] p-8 shadow-sm">
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

            <div className="flex flex-col justify-between rounded-[2rem] bg-surface-muted p-6 border border-slate-100 shadow-inner">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">비교 시작 요약</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">대상</span>
                    <span className="text-xs font-black text-navy">{purposeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">결과</span>
                    <span className="text-xs font-black text-navy">Top {profile.topN}</span>
                  </div>
                </div>
                <p className="text-[11px] font-bold leading-relaxed text-slate-500">
                  먼저 현재 조건으로 비교 후보를 열고, 순서를 더 조정하고 싶을 때만 가중치 설정을 열어 보세요.
                </p>
              </div>
              
              <div className="mt-8 space-y-3">
                <Button
                  variant="primary"
                  data-testid="recommend-submit"
                  className="w-full rounded-2xl h-14 text-sm font-black shadow-lg shadow-navy/20"
                  onClick={() => void submit()}
                  disabled={loading}
                >
                  {loading ? "후보 정리 중" : "비교 후보 보기"}
                </Button>
                <button
                  className="w-full text-[10px] font-bold text-slate-400 hover:text-primary transition-colors uppercase tracking-widest"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                >
                  {advancedOpen ? "설정 닫기" : "가중치 설정"}
                </button>
              </div>
            </div>
          </div>

          {advancedOpen && (
            <div className="mt-8 border-t border-slate-100 pt-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="mb-6 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">가중치 설정</p>
                  <Button type="button" size="sm" variant="outline" onClick={resetWeights}>기본값 복원</Button>
                </div>
                <p className="text-xs font-medium leading-relaxed text-slate-500">
                  비교 후보를 먼저 본 뒤, 금리·기간·유동성 중 어떤 기준을 더 앞에 둘지만 조정하는 보조 설정입니다.
                </p>
                <p className="text-xs font-bold text-slate-600">
                  현재 합계 {weightSumPct}%
                  {weightSum === 1 ? "" : " · 비교 요청 시 각 비율을 유지해 100%로 정규화합니다."}
                </p>
                {weightNormalizationNotice ? (
                  <p role="status" aria-live="polite" className="text-xs font-bold text-primary">
                    {weightNormalizationNotice}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-8 md:grid-cols-3">
                <label className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs font-bold text-slate-500">금리 가중치</span>
                    <span className="text-xs font-black text-primary">{Math.round(profile.weights.rate * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={profile.weights.rate}
                    onChange={(e) => updateWeight("rate", Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </label>
                <label className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs font-bold text-slate-500">기간 가중치</span>
                    <span className="text-xs font-black text-primary">{Math.round(profile.weights.term * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={profile.weights.term}
                    onChange={(e) => updateWeight("term", Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </label>
                <label className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs font-bold text-slate-500">유동성 가중치</span>
                    <span className="text-xs font-black text-primary">{Math.round(profile.weights.liquidity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={profile.weights.liquidity}
                    onChange={(e) => updateWeight("liquidity", Number(e.target.value))}
                    className="w-full accent-primary"
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

      {resultSnapshot && (
        <RecommendResultsPanel
          result={resultSnapshot.response}
          resultProfile={resultSnapshot.profile}
          isStale={resultIsStale}
          feedback={feedback}
          planningActionContext={planningActionContext}
          sourceStatusRows={sourceStatusRows}
          sourceStatusReady={sourceStatusReady}
          openDetailKey={openDetailKey}
          onOpenDetailKeyChange={setOpenDetailKey}
          onSave={saveCurrentRun}
          onExportJson={exportCurrentRunJson}
          onExportCsv={exportCurrentRunCsv}
          onAddCompare={addItemToCompare}
          compareAddResult={compareAddResult}
          onCloseCompareNotice={() => setCompareAddResult(null)}
        />
      )}
      {!loading && !resultSnapshot && (
        <div className="py-20">
          <EmptyState
            title="아직 추천 결과가 없습니다"
            description="상단 조건을 고르면 현재 기준으로 비교할 후보와 확인 포인트를 보여줍니다."
            icon="search"
          />
        </div>
      )}

      {loading && (
        <div className="py-20">
          <LoadingState description="현재 조건에 맞는 비교 후보를 정리하고 있습니다." />
        </div>
      )}

      {(lastStored || deletedStoredResult || recentHistoryNotice) && (
        <Card className="mt-12 rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <SubSectionHeader title="지난 추천 히스토리" className="mb-0" />
            {lastStored ? (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className="text-xs text-slate-400 font-bold hover:text-rose-500"
                onClick={deleteRecentHistory}
                aria-label={`${formatKoreanDateTime(lastStored.savedAt)} ${formatStoredPurposeLabel(lastStored.profile.purpose)} 최근 추천 결과 삭제`}
              >
                기록 삭제
              </Button>
            ) : null}
          </div>
          {lastStored ? (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              마지막 저장일: <span className="text-slate-600 ml-1 tabular-nums">{formatKoreanDateTime(lastStored.savedAt)}</span>
            </p>
          ) : null}
          <p className="mt-3 text-xs">
            <Link href="/recommend/history" className="font-black text-primary hover:text-navy">
              추천 비교 기록 보기
            </Link>
          </p>
          {recentHistoryNotice ? (
            <div role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-primary">
              <span>{recentHistoryNotice}</span>
              {deletedStoredResult ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={undoRecentHistoryDelete}
                  aria-label="최근 추천 결과 삭제 되돌리기"
                >
                  되돌리기
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      )}
    </PageShell>
  );
}

export default function RecommendPage() {
  const ownerId = useRecommendOwner();
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-surface-muted"><LoadingState /></div>}>
      <RecommendPageOwned key={ownerId} ownerId={ownerId} />
    </Suspense>
  );
}
