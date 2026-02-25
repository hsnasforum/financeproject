"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SourceBadge } from "@/components/debug/SourceBadge";
import { DataFreshnessBanner } from "@/components/data/DataFreshnessBanner";
import { type FreshnessSourceSpec } from "@/components/data/freshness";
import {
  buildRecommendResultSnapshot,
  computeRecommendResultDelta,
  parseRecommendResultDelta,
  parseRecommendResultSnapshot,
  type RecommendResultDelta,
} from "@/lib/recommend/resultHistory";
import {
  DEFAULT_TOP_N,
  DEFAULT_WEIGHTS,
  type CandidateSource,
  type DepositProtectionMode,
  type RecommendPurpose,
  type UserRecommendProfile,
} from "@/lib/recommend/types";

type RecommendResponse = {
  ok: boolean;
  meta?: {
    kind: "deposit" | "saving";
    topN: number;
    rateMode: "max" | "base" | "simple";
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
  };
  message?: string;
  items?: Array<{
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
    signals?: {
      depositProtection?: "matched" | "unknown";
    };
    badges?: string[];
  }>;
  debug?: {
    candidateCount: number;
    rateMin: number;
    rateMax: number;
  };
  error?: {
    code: string;
    message: string;
  };
};

type StoredProfile = {
  purpose: RecommendPurpose;
  kind: UserRecommendProfile["kind"];
  preferredTerm: UserRecommendProfile["preferredTerm"];
  liquidityPref: UserRecommendProfile["liquidityPref"];
  rateMode: UserRecommendProfile["rateMode"];
  topN: number;
  candidateSources: CandidateSource[];
  depositProtection: DepositProtectionMode;
  weights: {
    rate: number;
    term: number;
    liquidity: number;
  };
};

const STORAGE_KEY = "recommend_profile_v1";
const RESULT_STORAGE_KEY = "recommend_last_result_v1";
const RESULT_DELTA_STORAGE_KEY = "recommend_last_delta_v1";

const defaultProfile: StoredProfile = {
  purpose: "seed-money",
  kind: "deposit",
  preferredTerm: 12,
  liquidityPref: "mid",
  rateMode: "max",
  topN: DEFAULT_TOP_N,
  candidateSources: ["finlife"],
  depositProtection: "any",
  weights: DEFAULT_WEIGHTS,
};

function isPreferredTerm(value: number): value is UserRecommendProfile["preferredTerm"] {
  return value === 3 || value === 6 || value === 12 || value === 24 || value === 36;
}

function applyQueryProfile(base: StoredProfile, searchParams: ReturnType<typeof useSearchParams>): {
  profile: StoredProfile;
  autoRun: boolean;
  source: string | null;
} {
  const next = { ...base };

  const purpose = searchParams.get("purpose");
  if (purpose === "emergency" || purpose === "seed-money" || purpose === "long-term") {
    next.purpose = purpose;
  }

  const kind = searchParams.get("kind");
  if (kind === "deposit" || kind === "saving") {
    next.kind = kind;
  }

  const preferredTerm = Number(searchParams.get("preferredTerm"));
  if (Number.isFinite(preferredTerm) && isPreferredTerm(preferredTerm)) {
    next.preferredTerm = preferredTerm;
  }

  const liquidityPref = searchParams.get("liquidityPref");
  if (liquidityPref === "low" || liquidityPref === "mid" || liquidityPref === "high") {
    next.liquidityPref = liquidityPref;
  }

  const rateMode = searchParams.get("rateMode");
  if (rateMode === "max" || rateMode === "base" || rateMode === "simple") {
    next.rateMode = rateMode;
  }

  const topN = Number(searchParams.get("topN"));
  if (Number.isFinite(topN) && topN >= 1 && topN <= 50) {
    next.topN = Math.trunc(topN);
  }

  const autorunRaw = (searchParams.get("autorun") ?? "").toLowerCase();
  const autoRun = autorunRaw === "1" || autorunRaw === "true" || autorunRaw === "yes";
  const source = searchParams.get("from");

  return { profile: next, autoRun, source };
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

export default function RecommendPage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<StoredProfile>(defaultProfile);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resultDelta, setResultDelta] = useState<RecommendResultDelta | null>(null);
  const [entrySource, setEntrySource] = useState<string | null>(null);
  const [readyToPersist, setReadyToPersist] = useState(false);

  useEffect(() => {
    let nextProfile: StoredProfile = defaultProfile;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredProfile>;
        nextProfile = {
          ...nextProfile,
          ...parsed,
          candidateSources: ["finlife"],
          weights: {
            rate: Number(parsed.weights?.rate ?? nextProfile.weights.rate),
            term: Number(parsed.weights?.term ?? nextProfile.weights.term),
            liquidity: Number(parsed.weights?.liquidity ?? nextProfile.weights.liquidity),
          },
        };
      }
    } catch {
      // ignore malformed localStorage
    }

    const queryApplied = applyQueryProfile(nextProfile, searchParams);
    nextProfile = queryApplied.profile;
    setResultDelta(parseRecommendResultDelta(localStorage.getItem(RESULT_DELTA_STORAGE_KEY)));
    setEntrySource(queryApplied.source);
    setProfile(nextProfile);
    setReadyToPersist(true);

    if (queryApplied.autoRun) {
      void submitWithProfile(nextProfile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readyToPersist) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, readyToPersist]);

  async function submitWithProfile(profileInput: StoredProfile) {
    setLoading(true);
    setError("");
    try {
      const requestProfile: StoredProfile = {
        ...profileInput,
        candidateSources: ["finlife"],
      };
      const res = await fetch(`/api/recommend?topN=${requestProfile.topN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestProfile),
      });
      const json = (await res.json()) as RecommendResponse;
      if (!res.ok || !json.ok) {
        setResult(null);
        setError(json.error?.message ?? "추천 결과를 불러오지 못했습니다.");
        return;
      }

      const previousSnapshot = parseRecommendResultSnapshot(localStorage.getItem(RESULT_STORAGE_KEY));
      const currentSnapshot = buildRecommendResultSnapshot({
        profile: {
          purpose: requestProfile.purpose,
          kind: requestProfile.kind,
          preferredTerm: requestProfile.preferredTerm,
          liquidityPref: requestProfile.liquidityPref,
          rateMode: requestProfile.rateMode,
          topN: requestProfile.topN,
        },
        meta: json.meta
          ? {
              kind: json.meta.kind,
              topN: json.meta.topN,
              rateMode: json.meta.rateMode,
              candidateSources: json.meta.candidateSources ?? requestProfile.candidateSources ?? ["finlife"],
              depositProtection: json.meta.depositProtection ?? requestProfile.depositProtection ?? "any",
              weights: {
                rate: json.meta.weights.rate,
                term: json.meta.weights.term,
                liquidity: json.meta.weights.liquidity,
              },
              assumptions: {
                rateSelectionPolicy: json.meta.assumptions.rateSelectionPolicy,
                liquidityPolicy: json.meta.assumptions.liquidityPolicy,
                normalizationPolicy: json.meta.assumptions.normalizationPolicy,
                kdbParsingPolicy: json.meta.assumptions.kdbParsingPolicy,
                depositProtectionPolicy: json.meta.assumptions.depositProtectionPolicy,
              },
            }
          : undefined,
        items: json.items ?? [],
      });
      const delta = computeRecommendResultDelta(previousSnapshot, currentSnapshot);
      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(currentSnapshot));
      localStorage.setItem(RESULT_DELTA_STORAGE_KEY, JSON.stringify(delta));

      setResultDelta(delta);
      setResult(json);
    } catch {
      setError("네트워크 오류로 추천 요청에 실패했습니다.");
    } finally {
      setLoading(false);
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

  const notableChanges = useMemo(() => {
    if (!resultDelta?.hasPrevious) return [];

    const optionRows = resultDelta.optionChanges.map((change) => ({
      key: `opt:${change.key}`,
      changeType: "옵션/금리",
      productName: change.productName,
      finPrdtCd: change.finPrdtCd,
      sourceId: change.sourceId,
      summary: `${change.previousOption ?? "-"}개월/${change.previousRate?.toFixed(2) ?? "-"}% → ${change.currentOption ?? "-"}개월/${change.currentRate?.toFixed(2) ?? "-"}%`,
      delta: fmtDeltaRate(change.rateDiffPct),
      impact: Math.abs(change.rateDiffPct ?? 0),
    }));
    const rankRows = resultDelta.rankChanges.map((change) => ({
      key: `rank:${change.key}`,
      changeType: "순위",
      productName: change.productName,
      finPrdtCd: change.finPrdtCd,
      sourceId: change.sourceId,
      summary: `${change.previousRank}위 → ${change.currentRank}위`,
      delta: fmtRankShift(change.shift),
      impact: Math.abs(change.shift),
    }));
    const newRows = resultDelta.newItems.map((change) => ({
      key: `new:${change.key}`,
      changeType: "신규",
      productName: change.productName,
      finPrdtCd: change.finPrdtCd,
      sourceId: change.sourceId,
      summary: "이번 실행에 새로 진입",
      delta: "+",
      impact: 99,
    }));
    const droppedRows = resultDelta.droppedItems.map((change) => ({
      key: `drop:${change.key}`,
      changeType: "이탈",
      productName: change.productName,
      finPrdtCd: change.finPrdtCd,
      sourceId: change.sourceId,
      summary: "지난 실행 대비 목록에서 이탈",
      delta: "-",
      impact: 99,
    }));

    return [...newRows, ...droppedRows, ...optionRows, ...rankRows]
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 8);
  }, [resultDelta]);

  async function submit() {
    await submitWithProfile(profile);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <DataFreshnessBanner sources={freshnessSources} infoDisplay="compact" />
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">설명가능 예적금 추천</h1>
        <p className="mt-2 text-sm text-slate-600">후보군 내 상대 비교 점수이며 확정 수익을 의미하지 않습니다.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            목적
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.purpose}
              onChange={(e) => setProfile((prev) => ({ ...prev, purpose: e.target.value as StoredProfile["purpose"] }))}
            >
              <option value="emergency">단기 비상금</option>
              <option value="seed-money">목돈 마련</option>
              <option value="long-term">장기 저축</option>
            </select>
          </label>

          <label className="text-sm">
            상품 유형
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.kind}
              onChange={(e) => setProfile((prev) => ({ ...prev, kind: e.target.value as StoredProfile["kind"] }))}
            >
              <option value="deposit">예금</option>
              <option value="saving">적금</option>
            </select>
          </label>

          <label className="text-sm">
            선호 기간
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.preferredTerm}
              onChange={(e) => setProfile((prev) => ({ ...prev, preferredTerm: Number(e.target.value) as StoredProfile["preferredTerm"] }))}
            >
              <option value={3}>3개월</option>
              <option value={6}>6개월</option>
              <option value={12}>12개월</option>
              <option value={24}>24개월</option>
              <option value={36}>36개월</option>
            </select>
          </label>

          <label className="text-sm">
            유동성 선호
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.liquidityPref}
              onChange={(e) => setProfile((prev) => ({ ...prev, liquidityPref: e.target.value as StoredProfile["liquidityPref"] }))}
            >
              <option value="low">낮음</option>
              <option value="mid">중간</option>
              <option value="high">높음</option>
            </select>
          </label>

          <label className="text-sm">
            금리 선택 정책
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.rateMode}
              onChange={(e) => setProfile((prev) => ({ ...prev, rateMode: e.target.value as StoredProfile["rateMode"] }))}
            >
              <option value="max">최고금리 우선</option>
              <option value="base">기본금리 우선</option>
              <option value="simple">단순조건 선호</option>
            </select>
          </label>

          <label className="text-sm">
            Top N
            <input
              type="number"
              min={1}
              max={50}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3"
              value={profile.topN}
              onChange={(e) => setProfile((prev) => ({ ...prev, topN: Math.max(1, Math.min(50, Number(e.target.value) || DEFAULT_TOP_N)) }))}
            />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            className="text-sm font-semibold text-slate-700"
            onClick={() => setAdvancedOpen((prev) => !prev)}
          >
            고급 옵션 {advancedOpen ? "접기" : "열기"}
          </button>
          {advancedOpen ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="deposit-protection"
                    checked={profile.depositProtection === "any"}
                    onChange={() => setProfile((prev) => ({ ...prev, depositProtection: "any" }))}
                  />
                  보호신호 any
                </label>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="deposit-protection"
                    checked={profile.depositProtection === "prefer"}
                    onChange={() => setProfile((prev) => ({ ...prev, depositProtection: "prefer" }))}
                  />
                  보호신호 prefer
                </label>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="deposit-protection"
                    checked={profile.depositProtection === "require"}
                    onChange={() => setProfile((prev) => ({ ...prev, depositProtection: "require" }))}
                  />
                  보호신호 require
                </label>
              </div>
              <p className="text-xs text-slate-500">보호신호 필터(any/prefer/require)는 현재 비활성화되어 추천 점수에 영향을 주지 않습니다.</p>

              <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs">
                금리 가중치 {profile.weights.rate.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={profile.weights.rate}
                  onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, rate: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="text-xs">
                기간 가중치 {profile.weights.term.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={profile.weights.term}
                  onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, term: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="text-xs">
                유동성 가중치 {profile.weights.liquidity.toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={profile.weights.liquidity}
                  onChange={(e) => setProfile((prev) => ({ ...prev, weights: { ...prev.weights, liquidity: Number(e.target.value) } }))}
                  className="mt-1 w-full"
                />
              </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void submit()}
            disabled={loading}
          >
            {loading ? "추천 계산 중..." : "추천 실행"}
          </button>
          <span className="text-sm text-slate-500">현재 목적: {purposeLabel}</span>
          {entrySource ? <span className="text-xs text-slate-500">유입: {entrySource}</span> : null}
        </div>
      </section>

      {error ? <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</section> : null}

      {result?.message ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{result.message}</section>
      ) : null}

      {resultDelta ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">지난 실행 대비 변화</h2>
          {!resultDelta.hasPrevious ? (
            <p className="mt-2 text-sm text-slate-600">비교 기준이 없어 이번 실행 결과를 기준점으로 저장했습니다.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                기준 시점: {resultDelta.previousSavedAt ? new Date(resultDelta.previousSavedAt).toLocaleString("ko-KR") : "-"}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-900">금리 변화(상위 1개)</p>
                  <p className="mt-1 text-slate-700">
                    {resultDelta.currentTopRate?.toFixed(2) ?? "-"}% / 변화 {fmtDeltaRate(resultDelta.rateDiffPct)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-900">옵션 변경</p>
                  <p className="mt-1 text-slate-700">{resultDelta.optionChanges.length}건</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-900">순위 변동</p>
                  <p className="mt-1 text-slate-700">{resultDelta.rankChanges.length}건</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-900">신규 / 이탈</p>
                  <p className="mt-1 text-slate-700">신규 {resultDelta.newItems.length}건 / 이탈 {resultDelta.droppedItems.length}건</p>
                </div>
              </div>

              {notableChanges.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <p className="text-sm font-semibold text-slate-900">변화 큰 항목</p>
                  <table className="mt-2 min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="py-2 pr-3">구분</th>
                        <th className="py-2 pr-3">상품</th>
                        <th className="py-2 pr-3">변화</th>
                        <th className="py-2 pr-3">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notableChanges.map((row) => (
                        <tr key={row.key} className="border-b border-slate-100 align-top text-slate-700">
                          <td className="py-2 pr-3">{row.changeType}</td>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-slate-900">{row.productName}</p>
                            <p className="text-xs text-slate-500">{row.sourceId} / {row.finPrdtCd}</p>
                          </td>
                          <td className="py-2 pr-3">{row.delta}</td>
                          <td className="py-2 pr-3">{row.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {result?.meta ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">가정값 및 메타</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <p>kind: {result.meta.kind} / topN: {result.meta.topN} / rateMode: {result.meta.rateMode}</p>
            <p>sources: {(result.meta.candidateSources ?? ["finlife"]).join(", ")} / depositProtection: {result.meta.depositProtection ?? "any"}</p>
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

      <section className="grid gap-4">
        {(result?.items ?? []).length === 0 && result?.ok ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            추천 후보가 없어 표시할 항목이 없습니다. 조건을 바꿔 다시 실행하거나 상품 탐색에서 직접 확인해보세요.
            <div className="mt-4">
              <Link href={profile.kind === "saving" ? "/products/saving" : "/products/deposit"} className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                상품 탐색으로 이동
              </Link>
            </div>
          </article>
        ) : null}

        {(result?.items ?? []).map((item, index) => (
          <article key={`${item.sourceId}-${item.finPrdtCd}`} className="rounded-2xl border border-slate-200 bg-white p-5">
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
            <p className="mt-1 text-sm text-slate-700">선택 옵션: {item.selectedOption.saveTrm ?? "-"}개월 / 적용금리 {item.selectedOption.appliedRate.toFixed(2)}%</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">최종 점수: {item.finalScore.toFixed(4)}</p>
            <div className="mt-3">
              <Link
                href={profile.kind === "saving" ? `/products/saving?from=recommend` : `/products/deposit?from=recommend`}
                className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                상품 페이지에서 보기
              </Link>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {item.breakdown.map((part) => (
                <div key={part.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
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
          </article>
        ))}
      </section>
    </main>
  );
}
