"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  GOV24_HOUSEHOLD_TRAITS,
  GOV24_PERSONAL_TRAITS,
  type Gov24Gender,
  type Gov24IncomeBracket,
  type Gov24SimpleFindInput,
  type Gov24TargetType,
} from "@/lib/publicApis/gov24SimpleFind/types";
import { MEDIAN_INCOME_2025 } from "@/lib/gov24/medianIncome2025";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import {
  Gov24ServiceDetailModal,
  type Gov24ServiceDetailData,
} from "@/components/Gov24ServiceDetailModal";
import {
  SIDO_ADMIN_2025,
  SIGUNGU_BY_SIDO_CODE_2025,
  getSidoByCode,
  getSigunguByCode,
} from "@/lib/regions/kr_admin_2025";
import { type Gov24OrgType } from "@/lib/gov24/orgClassifier";
import { safeMark, safeMeasure } from "@/lib/perf/safeMeasure";
import { type ApplyLink } from "@/lib/gov24/applyLinks";
import { cn } from "@/lib/utils";

type SyncState = "ready" | "syncing" | "needs_sync";

type ResultItem = BenefitCandidate & {
  orgType?: Exclude<Gov24OrgType, "all">;
  applyLinks?: ApplyLink[];
  primaryApplyUrl?: string | null;
  card?: {
    badge: string;
    department?: string;
    title: string;
    summary: string;
    lines: Array<{ label: string; value: string }>;
    link?: { label: "타사이트 이동"; href: string };
  };
};

type Gov24SearchStatusResponse = {
  ok: boolean;
  meta?: {
    snapshot?: {
      totalItems?: number;
      completionRate?: number;
      generatedAt?: string;
      hardCapPages?: number;
      neededPagesEstimate?: number;
      effectiveMaxPages?: number;
      pagesFetched?: number;
      uniqueCount?: number;
      truncatedByHardCap?: boolean;
    } | null;
    sync?: {
      state?: SyncState;
    };
  };
};

type DetailResponse = {
  ok: boolean;
  data?: Gov24ServiceDetailData;
};

const INCOME_OPTIONS: Array<{ value: Gov24IncomeBracket; label: string }> = [
  { value: "0_50", label: "기준 중위소득 0~50%" },
  { value: "51_75", label: "기준 중위소득 51~75%" },
  { value: "76_100", label: "기준 중위소득 76~100%" },
  { value: "101_200", label: "기준 중위소득 101~200%" },
  { value: "200_plus", label: "기준 중위소득 200% 이상" },
];

const ORG_FILTER_OPTIONS: Array<{ value: Gov24OrgType; label: string }> = [
  { value: "all", label: "전체" },
  { value: "central", label: "중앙부처" },
  { value: "local", label: "지자체" },
  { value: "public", label: "공공기관" },
  { value: "education", label: "교육청" },
];

export function Gov24Client({ initialQuery = "" }: { initialQuery?: string }) {
  const [step, setStep] = useState(1);
  const [targetType, setTargetType] = useState<Gov24TargetType>("individual");
  const [selectedSidoCode, setSelectedSidoCode] = useState("");
  const [selectedSigunguCode, setSelectedSigunguCode] = useState("");
  const [birthYmd, setBirthYmd] = useState("");
  const [gender, setGender] = useState<Gov24Gender>("F");
  const [incomeBracket, setIncomeBracket] = useState<Gov24IncomeBracket>("76_100");
  const [personalTraits, setPersonalTraits] = useState<string[]>(["해당사항 없음"]);
  const [householdTraits, setHouseholdTraits] = useState<string[]>(["해당사항 없음"]);
  const [resultQuery, setResultQuery] = useState(initialQuery);
  const [orgTypeFilter, setOrgTypeFilter] = useState<Gov24OrgType>("all");

  const [items, setItems] = useState<ResultItem[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [orgTypeCounts, setOrgTypeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [syncState, setSyncState] = useState<SyncState>("needs_sync");
  const [syncing, setSyncing] = useState(false);
  const [syncUniqueCount, setSyncUniqueCount] = useState<number | null>(null);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string>("");
  const [syncError, setSyncError] = useState<string>("");
  const [snapshotTotal, setSnapshotTotal] = useState<number | null>(null);
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const [syncMetaNote, setSyncMetaNote] = useState<string>("");

  const [detailData, setDetailData] = useState<Gov24ServiceDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedSido = useMemo(() => getSidoByCode(selectedSidoCode), [selectedSidoCode]);
  const sigunguOptions = useMemo(() => SIGUNGU_BY_SIDO_CODE_2025[selectedSidoCode] ?? [], [selectedSidoCode]);
  const selectedSigungu = useMemo(() => getSigunguByCode(selectedSidoCode, selectedSigunguCode), [selectedSidoCode, selectedSigunguCode]);

  const summaryLine = useMemo(() => {
    const incomeLabel = INCOME_OPTIONS.find((entry) => entry.value === incomeBracket)?.label ?? incomeBracket;
    const regionText = `${selectedSido?.name ?? "-"} ${selectedSigungu?.name ?? "-"}`.trim();
    return `${regionText} · ${incomeLabel} · 개인특성 ${personalTraits.length}개 · 가구특성 ${householdTraits.length}개`;
  }, [incomeBracket, personalTraits.length, householdTraits.length, selectedSido?.name, selectedSigungu?.name]);

  useEffect(() => {
    safeMark("BenefitsPage:start");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(() => {
      safeMark("BenefitsPage:end");
      safeMeasure("BenefitsPage", "BenefitsPage:start", "BenefitsPage:end");
    });
    return () => window.cancelAnimationFrame(id);
  }, [items.length, step]);

  const refreshSnapshotStatus = useCallback(async () => {
    const statusRes = await fetch("/api/gov24/search?q=&cursor=0&pageSize=1", { cache: "no-store" });
    const statusJson = await statusRes.json() as Gov24SearchStatusResponse;
    const snapshot = statusJson.meta?.snapshot ?? null;
    setSnapshotTotal(snapshot?.totalItems ?? null);
    setCompletionRate(typeof snapshot?.completionRate === "number" ? snapshot.completionRate : null);
    setSnapshotGeneratedAt(typeof snapshot?.generatedAt === "string" ? snapshot.generatedAt : "");
    setSyncUniqueCount(typeof snapshot?.uniqueCount === "number" ? snapshot.uniqueCount : null);
    setSyncState(statusJson.meta?.sync?.state ?? "needs_sync");
    setSyncing((statusJson.meta?.sync?.state ?? "needs_sync") === "syncing");
    if (snapshot?.truncatedByHardCap) {
      setSyncMetaNote(`일부 혜택은 순차 반영 중일 수 있습니다. 현재 반영 범위 ${snapshot.completionRate ? `${Math.round(snapshot.completionRate * 1000) / 10}%` : "?"}`);
    } else {
      setSyncMetaNote("");
    }
    return { snapshot };
  }, []);

  const checkSnapshotStatus = useCallback(async () => {
    try {
      await refreshSnapshotStatus();
    } catch {
      setSyncState("needs_sync");
    }
  }, [refreshSnapshotStatus]);

  useEffect(() => {
    void checkSnapshotStatus();
  }, [checkSnapshotStatus]);

  const runManualSync = useCallback(async () => {
    setSyncing(true);
    setSyncState("syncing");
    setSyncError("");
    try {
      const res = await fetch("/api/gov24/sync", { method: "POST" });
      const json = await res.json() as { ok?: boolean; error?: { message?: string } };
      if (!json.ok) {
        setSyncError(json.error?.message ?? "동기화 실패");
      }
    } catch {
      setSyncError("동기화 실패");
    } finally {
      setSyncing(false);
      await checkSnapshotStatus();
    }
  }, [checkSnapshotStatus]);

  const buildInput = useCallback((): Gov24SimpleFindInput => {
    return {
      targetType,
      region: {
        sido: selectedSido?.name ?? "",
        sigungu: selectedSigungu?.name ?? "",
      },
      birth: { yyyymmdd: birthYmd, gender },
      incomeBracket,
      personalTraits,
      householdTraits,
      q: resultQuery.trim(),
    };
  }, [targetType, selectedSido?.name, selectedSigungu?.name, birthYmd, gender, incomeBracket, personalTraits, householdTraits, resultQuery]);

  const searchSimpleFind = useCallback(async (opts?: { cursor?: number; append?: boolean }) => {
    const cursor = Math.max(0, Math.trunc(opts?.cursor ?? 0));
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/gov24/simple-find?cursor=${cursor}&pageSize=50&orgType=${orgTypeFilter}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInput()),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error?.message ?? "보조금24 결과 조회 실패");
        return;
      }
      const nextItems = Array.isArray(json?.data?.items) ? (json.data.items as ResultItem[]) : [];
      setItems((prev) => (opts?.append ? [...prev, ...nextItems] : nextItems));
      setTotalMatched(typeof json?.data?.totalMatched === "number" ? json.data.totalMatched : nextItems.length);
      setNextCursor(typeof json?.data?.page?.nextCursor === "number" ? json.data.page.nextCursor : null);
      setOrgTypeCounts(typeof json?.data?.facets?.orgTypeCounts === "object" && json?.data?.facets?.orgTypeCounts ? json.data.facets.orgTypeCounts : {});
      setStep(7);
    } catch {
      setError("보조금24 결과 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [buildInput, orgTypeFilter]);

  const toggleTrait = useCallback((current: string[], value: string, setter: (next: string[]) => void) => {
    if (value === "해당사항 없음") {
      setter(["해당사항 없음"]);
      return;
    }
    const withoutNone = current.filter((entry) => entry !== "해당사항 없음");
    if (withoutNone.includes(value)) {
      const next = withoutNone.filter((entry) => entry !== value);
      setter(next.length > 0 ? next : ["해당사항 없음"]);
      return;
    }
    setter([...withoutNone, value]);
  }, []);

  const openDetail = useCallback(async (item: ResultItem) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/gov24/detail?svcId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const json = await res.json() as DetailResponse;
      if (json.ok && json.data) {
        setDetailData(json.data);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void checkSnapshotStatus();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [checkSnapshotStatus]);

  useEffect(() => {
    if (step !== 7) return;
    void searchSimpleFind({ cursor: 0, append: false });
  }, [orgTypeFilter, searchSimpleFind, step]);

  return (
    <PageShell>
      <PageHeader
        title="보조금24"
        description="입력한 조건을 기준으로 정부 혜택 후보를 다시 찾고, 신청 전에 무엇을 확인할지 정리하는 화면입니다."
        action={
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border transition-all", syncing ? "bg-emerald-50 text-emerald-600 border-emerald-200 animate-pulse" : "bg-slate-100 text-slate-400 border-slate-200")}>
              {syncing || syncState === "syncing" ? "기준 데이터 갱신 중" : "기준 데이터 확인됨"}
            </span>
            {process.env.NODE_ENV !== "production" && (
              <Button type="button" size="sm" variant="outline" className="rounded-xl font-black h-8" onClick={() => void runManualSync()} disabled={syncing}>
                {syncing ? "갱신 중..." : "수동 갱신"}
              </Button>
            )}
          </div>
        }
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        이 화면은 확정 수급 판정이 아니라, 입력한 조건을 기준으로 다시 읽을 혜택 후보를 찾는 단계입니다.
        결과를 열면 신청 방법과 온라인 신청 가능 여부를 상세에서 다시 확인하세요.
      </p>

      <div className="space-y-6">
        {/* Status Strip */}
        <Card className="rounded-3xl p-4 lg:p-5 shadow-sm bg-slate-50/50 border-slate-100">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              현재 참고 중인 혜택 <span className="text-slate-900 font-black ml-0.5">{snapshotTotal?.toLocaleString() ?? "?"}건</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              반영 범위 <span className="text-slate-900 font-black ml-0.5">{completionRate !== null ? `${Math.round(completionRate * 1000) / 10}%` : "?"}</span>
            </div>
            {syncUniqueCount !== null && (
              <div className="flex items-center gap-2 text-slate-400">
                반영된 항목 <span className="font-black ml-0.5">{syncUniqueCount.toLocaleString()}건</span>
              </div>
            )}
            {snapshotGeneratedAt && (
              <div className="ml-auto text-[10px] text-slate-400 font-medium">
                기준 확인: {new Date(snapshotGeneratedAt).toLocaleString("ko-KR", { hour12: false })}
              </div>
            )}
          </div>
          {syncMetaNote ? (
            <p className="mt-3 text-[10px] font-bold text-amber-600 bg-amber-50/50 p-2 rounded-lg">{syncMetaNote}</p>
          ) : null}
          {syncError ? (
            <p className="mt-3 text-[10px] font-bold text-rose-600 bg-rose-50/50 p-2 rounded-lg">동기화 실패: {syncError}</p>
          ) : null}
        </Card>

        {step <= 6 ? (
          <Card className="rounded-[2rem] p-8 shadow-sm">
            <div className="mb-8 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Step 0{step} / 06</span>
                <SubSectionHeader
                  title={step === 1 ? "혜택 대상을 선택해 주세요" :
                         step === 2 ? "거주하시는 지역을 선택해 주세요" :
                         step === 3 ? "생년월일과 성별을 알려주세요" :
                         step === 4 ? "소득 구간을 선택해 주세요" :
                         step === 5 ? "해당하는 개인 특성을 모두 골라주세요" :
                         "해당하는 가구 특성을 모두 골라주세요"}
                  className="mb-0"
                />
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6].map((s) => (
                  <div key={s} className={cn("h-1 rounded-full transition-all", s === step ? "w-6 bg-emerald-500" : s < step ? "w-2 bg-emerald-200" : "w-2 bg-slate-100")} />
                ))}
              </div>
            </div>

            <div className="min-h-[320px]">
              {step === 1 && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setTargetType("individual")}
                    className={cn(
                      "flex flex-col items-center justify-center gap-4 rounded-3xl border-2 p-8 transition-all active:scale-[0.98]",
                      targetType === "individual" ? "border-emerald-500 bg-emerald-50/30 text-emerald-700" : "border-slate-100 hover:border-slate-200 text-slate-500"
                    )}
                  >
                    <span className="text-3xl">👤</span>
                    <span className="text-sm font-black">개인 / 가구</span>
                  </button>
                  <button type="button" disabled className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-100 p-8 opacity-50 cursor-not-allowed">
                    <span className="text-3xl grayscale">🏪</span>
                    <span className="text-sm font-black text-slate-400">소상공인 (준비중)</span>
                  </button>
                  <button type="button" disabled className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-100 p-8 opacity-50 cursor-not-allowed">
                    <span className="text-3xl grayscale">🏢</span>
                    <span className="text-sm font-black text-slate-400">법인 (준비중)</span>
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">시/도</p>
                    <div className="grid grid-cols-3 gap-2 h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                      {SIDO_ADMIN_2025.map((sido) => (
                        <button
                          key={sido.code}
                          type="button"
                          onClick={() => { setSelectedSidoCode(sido.code); setSelectedSigunguCode(""); }}
                          className={cn("h-10 rounded-xl text-xs font-bold transition-all border shadow-sm", selectedSidoCode === sido.code ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50")}
                        >
                          {sido.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">시/군/구</p>
                    {selectedSidoCode ? (
                      <div className="grid grid-cols-2 gap-2 h-[280px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                        {sigunguOptions.map((sigungu) => (
                          <button
                            key={sigungu.code}
                            type="button"
                            onClick={() => setSelectedSigunguCode(sigungu.code)}
                            className={cn("h-10 rounded-xl text-xs font-bold transition-all border shadow-sm", selectedSigunguCode === sigungu.code ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50")}
                          >
                            {sigungu.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="h-[280px] flex items-center justify-center rounded-2xl border border-dashed border-slate-100 bg-slate-50/30">
                        <p className="text-xs font-bold text-slate-400">먼저 시/도를 선택해 주세요.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">생년월일 (8자리)</p>
                    <input
                      className="h-14 w-full sm:w-[320px] rounded-2xl border border-slate-200 px-6 text-xl font-black text-slate-900 tracking-[0.2em] shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none placeholder:text-slate-200 placeholder:tracking-normal"
                      placeholder="19900101"
                      value={birthYmd}
                      onChange={(e) => setBirthYmd(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                    />
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">성별</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setGender("F")}
                        className={cn("h-12 px-8 rounded-2xl text-sm font-black transition-all border shadow-sm", gender === "F" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50")}
                      >
                        여성
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender("M")}
                        className={cn("h-12 px-8 rounded-2xl text-sm font-black transition-all border shadow-sm", gender === "M" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50")}
                      >
                        남성
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
                  <div className="grid gap-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">소득 구간 선택</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {INCOME_OPTIONS.map((entry) => (
                        <button
                          key={entry.value}
                          type="button"
                          onClick={() => setIncomeBracket(entry.value)}
                          className={cn("h-12 px-4 rounded-2xl text-xs font-black transition-all border shadow-sm text-left", incomeBracket === entry.value ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50")}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 overflow-x-auto">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">2025년 기준 중위소득 참고 (단위: 원)</p>
                    <table className="min-w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-400 font-black">
                          <th className="pb-3 text-left">구간</th>
                          {[1, 2, 3, 4].map((n) => <th key={n} className="pb-3 text-right">{n}인</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {MEDIAN_INCOME_2025.brackets.map((row) => (
                          <tr key={row.key} className="text-slate-600 font-bold">
                            <td className="py-2.5 pr-4 whitespace-nowrap">{row.label}</td>
                            {[1, 2, 3, 4].map((n) => (
                              <td key={n} className="py-2.5 text-right tabular-nums">
                                {row.households[n as 1 | 2 | 3 | 4].toLocaleString()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">개인 특성 (중복 선택 가능)</p>
                  <div className="flex flex-wrap gap-2">
                    {GOV24_PERSONAL_TRAITS.map((trait) => (
                      <button
                        key={trait}
                        type="button"
                        onClick={() => toggleTrait(personalTraits, trait, setPersonalTraits)}
                        className={cn("h-10 px-4 rounded-full text-xs font-black transition-all border shadow-sm", personalTraits.includes(trait) ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-900/10" : "bg-white text-slate-500 border-slate-100 hover:bg-slate-50")}
                      >
                        {trait}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">가구 특성 (중복 선택 가능)</p>
                  <div className="flex flex-wrap gap-2">
                    {GOV24_HOUSEHOLD_TRAITS.map((trait) => (
                      <button
                        key={trait}
                        type="button"
                        onClick={() => toggleTrait(householdTraits, trait, setHouseholdTraits)}
                        className={cn("h-10 px-4 rounded-full text-xs font-black transition-all border shadow-sm", householdTraits.includes(trait) ? "bg-emerald-600 text-white border-emerald-600 shadow-emerald-900/10" : "bg-white text-slate-500 border-slate-100 hover:bg-slate-50")}
                      >
                        {trait}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-12 flex items-center justify-between border-t border-slate-50 pt-8">
              <Button type="button" variant="outline" className="rounded-2xl font-black h-12 px-8" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1}>
                이전 단계
              </Button>
              {step < 6 ? (
                <Button
                  type="button"
                  variant="primary"
                  className="rounded-2xl font-black h-12 px-12 shadow-md"
                  onClick={() => setStep((prev) => Math.min(6, prev + 1))}
                  disabled={(step === 2 && (!selectedSidoCode || !selectedSigunguCode)) || (step === 3 && !/^\d{8}$/.test(birthYmd))}
                >
                  다음 단계
                </Button>
              ) : (
                <Button type="button" variant="primary" className="rounded-2xl font-black h-12 px-12 shadow-md" onClick={() => void searchSimpleFind({ cursor: 0 })} disabled={loading}>
                  {loading ? "검색 중..." : "지금 기준으로 보기"}
                </Button>
              )}
            </div>
          </Card>
        ) : null}

        {step === 7 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="rounded-[2rem] p-8 shadow-sm">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">검색 조건 요약</p>
                  <SubSectionHeader title={summaryLine} className="mb-0" />
                  <p className="text-xs font-medium leading-relaxed text-slate-500">
                    조건을 바꾸면 결과도 함께 달라집니다. 상세에서 신청 방법과 제한 조건을 다시 확인하세요.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <input
                      className="h-11 min-w-[280px] rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all"
                      placeholder="결과 내 재검색 (예: 장학금, 의료비)"
                      value={resultQuery}
                      onChange={(e) => setResultQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void searchSimpleFind({ cursor: 0 })}
                    />
                    <Button type="button" variant="primary" className="h-11 px-6 rounded-2xl font-black shadow-sm" onClick={() => void searchSimpleFind({ cursor: 0 })} disabled={loading}>지금 기준으로 다시 찾기</Button>
                    <Button type="button" variant="outline" className="h-11 px-6 rounded-2xl font-black" onClick={() => { setStep(1); setItems([]); setTotalMatched(0); setNextCursor(null); }}>조건 변경</Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-w-[180px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">기관별 필터</p>
                  <select 
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none shadow-sm focus:ring-1 focus:ring-emerald-500" 
                    value={orgTypeFilter} 
                    onChange={(e) => setOrgTypeFilter(e.target.value as Gov24OrgType)}
                  >
                    {ORG_FILTER_OPTIONS.map((entry) => (
                      <option key={entry.value} value={entry.value}>{entry.label} ({orgTypeCounts[entry.value] ?? 0})</option>
                    ))}
                  </select>
                </div>
              </div>
              {error ? (
                <p className="mt-4 text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl">검색 오류: {error}</p>
              ) : null}
            </Card>

            {loading && items.length === 0 ? (
              <LoadingState title="현재 조건에 맞는 혜택 후보를 찾고 있습니다" description="오픈 API에서 최신 데이터를 가져오는 중입니다." />
            ) : items.length === 0 ? (
              <Card className="rounded-[2rem] p-20 text-center border-dashed border-slate-200 bg-slate-50/30">
                <p className="text-lg font-black text-slate-900">검색된 혜택이 없습니다</p>
                <p className="mt-2 text-sm font-medium text-slate-500">조건이나 키워드를 조금 바꿔서 혜택 후보를 다시 찾아보세요.</p>
                <Button variant="outline" className="mt-8 rounded-2xl font-black" onClick={() => { setStep(1); setItems([]); }}>다시 찾기</Button>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <p className="text-sm font-bold text-slate-500">현재 조건 기준 <span className="text-slate-900 font-black">{totalMatched.toLocaleString()}건</span>의 혜택 후보를 읽는 중입니다.</p>
                </div>
                <div className="grid gap-4">
                  {items.map((item) => {
                    const quickUrl = item.primaryApplyUrl;
                    return (
                      <Card key={item.id} className="rounded-[2rem] p-6 lg:p-8 shadow-sm hover:border-emerald-200 transition-all group">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          {item.card?.badge && (
                            <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 uppercase tracking-wider">{item.card.badge}</span>
                          )}
                          {item.card?.department && (
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">관할: {item.card.department}</span>
                          )}
                        </div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">{item.card?.title ?? item.title}</h3>
                        <p className="mt-3 line-clamp-2 text-sm font-medium leading-relaxed text-slate-600">{item.card?.summary ?? item.summary}</p>
                        
                        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {(item.card?.lines ?? []).map((line) => (
                            <div key={`${item.id}-${line.label}`} className="rounded-xl bg-slate-50 p-3">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{line.label}</p>
                              <p className="mt-1 text-xs font-bold text-slate-700">{line.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-8 flex items-center gap-3">
                          <Button variant="primary" className="h-11 px-8 rounded-2xl font-black shadow-md" onClick={() => void openDetail(item)} disabled={detailLoading}>
                            상세에서 다시 확인
                          </Button>
                          {quickUrl ? (
                            <a 
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]" 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              href={quickUrl}
                            >
                              정부24 신청하기
                            </a>
                          ) : (
                            <span className="text-xs font-bold text-slate-300 ml-2 italic">※ 이 혜택은 온라인 신청 정보가 없습니다.</span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {nextCursor !== null && (
                  <div className="flex justify-center pt-8">
                    <Button variant="outline" className="rounded-2xl font-black h-12 px-12" onClick={() => void searchSimpleFind({ cursor: nextCursor, append: true })} disabled={loading}>
                      {loading ? "혜택을 더 불러오는 중..." : "혜택 후보 더 보기"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {detailData ? <Gov24ServiceDetailModal data={detailData} onClose={() => setDetailData(null)} /> : null}
    </PageShell>
  );
}
