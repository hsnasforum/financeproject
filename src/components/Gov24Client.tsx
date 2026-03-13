"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  BodyInset,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
  bodyFieldClassName,
  bodyInlineActionLinkClassName,
  bodyMetaChipClassName,
} from "@/components/ui/BodyTone";
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
import { Gov24ServiceDetailModal } from "@/components/Gov24ServiceDetailModal";
import { type EligibilityItem } from "@/lib/gov24/eligibilityNormalize";
import {
  SIDO_ADMIN_2025,
  SIGUNGU_BY_SIDO_CODE_2025,
  getSidoByCode,
  getSigunguByCode,
} from "@/lib/regions/kr_admin_2025";
import { type Gov24OrgType } from "@/lib/gov24/orgClassifier";
import { safeMark, safeMeasure } from "@/lib/perf/safeMeasure";
import { type ApplyLink } from "@/lib/gov24/applyLinks";

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
  data?: {
    id: string;
    title: string;
    org?: string;
    applyHow?: string;
    contact?: string;
    link?: string;
    source: "official" | "openapi" | "fallback";
    tabs: {
      overview: string[];
      target: string[];
      benefit: string[];
      apply: string[];
      contact: string[];
    };
    supportTarget?: {
      items: EligibilityItem[];
      raw: string[];
    };
    applyLinks?: ApplyLink[];
    primaryApplyUrl?: string | null;
  };
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
  const [syncPagesFetched, setSyncPagesFetched] = useState<number | null>(null);
  const [syncEffectiveMaxPages, setSyncEffectiveMaxPages] = useState<number | null>(null);
  const [syncUniqueCount, setSyncUniqueCount] = useState<number | null>(null);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string>("");
  const [syncError, setSyncError] = useState<string>("");
  const [snapshotTotal, setSnapshotTotal] = useState<number | null>(null);
  const [completionRate, setCompletionRate] = useState<number | null>(null);
  const [syncMetaNote, setSyncMetaNote] = useState<string>("");

  const [detailData, setDetailData] = useState<DetailResponse["data"] | null>(null);
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
    setSyncPagesFetched(typeof snapshot?.pagesFetched === "number" ? snapshot.pagesFetched : null);
    setSyncEffectiveMaxPages(typeof snapshot?.effectiveMaxPages === "number" ? snapshot.effectiveMaxPages : null);
    setSyncUniqueCount(typeof snapshot?.uniqueCount === "number" ? snapshot.uniqueCount : null);
    setSyncState(statusJson.meta?.sync?.state ?? "needs_sync");
    setSyncing((statusJson.meta?.sync?.state ?? "needs_sync") === "syncing");
    if (snapshot?.truncatedByHardCap) {
      setSyncMetaNote(`완주율 ${snapshot.completionRate ? `${Math.round(snapshot.completionRate * 1000) / 10}%` : "?"} (hard cap ${snapshot.hardCapPages ?? "?"}, needed ${snapshot.neededPagesEstimate ?? "?"})`);
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
    <main className="py-8">
      <Container>
        <SectionHeader title="보조금24" subtitle="간편 찾기" />
        <Card>
          <div className={`mb-4 ${bodyDenseActionRowClassName}`}>
            <span className={bodyMetaChipClassName}>
              동기화 상태: {syncing || syncState === "syncing" ? "동기화 중" : syncState === "ready" ? "준비됨" : "동기화 필요"}
            </span>
            <span className={bodyMetaChipClassName}>스냅샷 {snapshotTotal ?? "?"}건</span>
            <span className={bodyMetaChipClassName}>완주율 {completionRate !== null ? `${Math.round(completionRate * 1000) / 10}%` : "?"}</span>
            {syncPagesFetched !== null ? <span className={bodyMetaChipClassName}>페이지 {syncPagesFetched}/{syncEffectiveMaxPages ?? "?"}</span> : null}
            {syncUniqueCount !== null ? <span className={bodyMetaChipClassName}>수집 {syncUniqueCount}건</span> : null}
            {snapshotGeneratedAt ? <span className={bodyMetaChipClassName}>최근 갱신 {new Date(snapshotGeneratedAt).toLocaleString("ko-KR", { hour12: false })}</span> : null}
            {process.env.NODE_ENV !== "production" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void runManualSync()} disabled={syncing}>
                {syncing ? "동기화 중..." : "동기화 실행"}
              </Button>
            ) : null}
          </div>

          {syncMetaNote ? (
            <BodyStatusInset className="mb-4 text-sm" tone="warning">
              {syncMetaNote}
            </BodyStatusInset>
          ) : null}

          {syncError ? (
            <BodyStatusInset className="mb-4 text-sm" tone="danger">
              동기화 실패: {syncError}
            </BodyStatusInset>
          ) : null}

          {syncing ? (
            <BodyStatusInset className="mb-4 p-6 text-sm" tone="default">
              오픈 API 전체 데이터를 동기화 중입니다.
            </BodyStatusInset>
          ) : null}

          {step <= 6 ? (
            <div className="space-y-5">
              <span className={bodyMetaChipClassName}>STEP {step} / 6</span>

              {step === 1 ? (
                <BodyInset className="space-y-3 bg-white">
                  <BodySectionHeading title="대상 선택" />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button type="button" variant={targetType === "individual" ? "primary" : "outline"} onClick={() => setTargetType("individual")}>개인/가구</Button>
                    <Button type="button" variant="outline" disabled>소상공인 (준비중)</Button>
                    <Button type="button" variant="outline" disabled>법인 (준비중)</Button>
                  </div>
                </BodyInset>
              ) : null}

              {step === 2 ? (
                <BodyInset className="space-y-3 bg-white">
                  <BodySectionHeading title="거주 지역" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <BodyInset className="max-h-64 overflow-auto bg-white">
                      <div className="flex flex-wrap gap-2">
                        {SIDO_ADMIN_2025.map((sido) => (
                          <Button
                            key={sido.code}
                            size="sm"
                            type="button"
                            variant={selectedSidoCode === sido.code ? "primary" : "outline"}
                            onClick={() => {
                              setSelectedSidoCode(sido.code);
                              setSelectedSigunguCode("");
                            }}
                          >
                            {sido.name}
                          </Button>
                        ))}
                      </div>
                    </BodyInset>
                    <BodyInset className="max-h-64 overflow-auto bg-white">
                      <div className="flex flex-wrap gap-2">
                        {sigunguOptions.map((sigungu) => (
                          <Button
                            key={sigungu.code}
                            size="sm"
                            type="button"
                            variant={selectedSigunguCode === sigungu.code ? "primary" : "outline"}
                            onClick={() => setSelectedSigunguCode(sigungu.code)}
                          >
                            {sigungu.name}
                          </Button>
                        ))}
                      </div>
                    </BodyInset>
                  </div>
                </BodyInset>
              ) : null}

              {step === 3 ? (
                <BodyInset className="space-y-3 bg-white">
                  <BodySectionHeading title="생년월일 / 성별" />
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={`${bodyFieldClassName.replace("mt-1 ", "")} h-10 w-auto min-w-44`}
                      placeholder="YYYYMMDD"
                      value={birthYmd}
                      onChange={(e) => setBirthYmd(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                    />
                    <Button type="button" size="sm" variant={gender === "F" ? "primary" : "outline"} onClick={() => setGender("F")}>여성</Button>
                    <Button type="button" size="sm" variant={gender === "M" ? "primary" : "outline"} onClick={() => setGender("M")}>남성</Button>
                  </div>
                </BodyInset>
              ) : null}

              {step === 4 ? (
                <BodyInset className="space-y-3 bg-white">
                  <BodySectionHeading title="소득금액 구간" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {INCOME_OPTIONS.map((entry) => (
                      <Button key={entry.value} type="button" variant={incomeBracket === entry.value ? "primary" : "outline"} onClick={() => setIncomeBracket(entry.value)}>{entry.label}</Button>
                    ))}
                  </div>
                  <BodyTableFrame>
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-2 py-2 text-left">구간</th>
                          {[1, 2, 3, 4, 5, 6].map((n) => <th key={n} className="px-2 py-2 text-right">{n}인</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {MEDIAN_INCOME_2025.brackets.map((row) => (
                          <tr key={row.key} className="border-t border-border">
                            <td className="px-2 py-2">{row.label}</td>
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                              <td key={n} className="px-2 py-2 text-right">
                                {row.isUpperBound ? `${row.households[n as 1 | 2 | 3 | 4 | 5 | 6].toLocaleString()} 초과` : row.households[n as 1 | 2 | 3 | 4 | 5 | 6].toLocaleString()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </BodyTableFrame>
                </BodyInset>
              ) : null}

              {step === 5 ? (
                <BodyInset className="space-y-3 bg-white">
                  <BodySectionHeading title="개인 특성" />
                  <div className="flex flex-wrap gap-2">
                    {GOV24_PERSONAL_TRAITS.map((trait) => (
                      <Button key={trait} type="button" size="sm" variant={personalTraits.includes(trait) ? "primary" : "outline"} onClick={() => toggleTrait(personalTraits, trait, setPersonalTraits)}>{trait}</Button>
                    ))}
                  </div>
                </BodyInset>
              ) : null}

              {step === 6 ? (
                <BodyInset className="space-y-3 bg-white">
                  <BodySectionHeading title="가구 특성" />
                  <div className="flex flex-wrap gap-2">
                    {GOV24_HOUSEHOLD_TRAITS.map((trait) => (
                      <Button key={trait} type="button" size="sm" variant={householdTraits.includes(trait) ? "primary" : "outline"} onClick={() => toggleTrait(householdTraits, trait, setHouseholdTraits)}>{trait}</Button>
                    ))}
                  </div>
                </BodyInset>
              ) : null}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1}>이전</Button>
                {step < 6 ? (
                  <Button
                    type="button"
                    onClick={() => setStep((prev) => Math.min(6, prev + 1))}
                    disabled={(step === 2 && (!selectedSidoCode || !selectedSigunguCode)) || (step === 3 && !/^\d{8}$/.test(birthYmd))}
                  >
                    다음
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void searchSimpleFind({ cursor: 0 })}>결과 보기</Button>
                )}
              </div>
            </div>
          ) : null}

          {step === 7 ? (
            <div className="space-y-4">
              <BodyInset>
                <BodySectionHeading title="조건 요약" description={summaryLine} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className={`${bodyCompactFieldClassName} h-9 min-w-56`}
                    placeholder="결과 내 재검색(선택)"
                    value={resultQuery}
                    onChange={(e) => setResultQuery(e.target.value)}
                  />
                  <Button type="button" size="sm" onClick={() => void searchSimpleFind({ cursor: 0 })}>검색</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setStep(1); setItems([]); setTotalMatched(0); setNextCursor(null); }}>다시 찾기</Button>
                </div>
              </BodyInset>

              <div className={`text-sm ${bodyDenseActionRowClassName}`}>
                <span className={bodyMetaChipClassName}>총 {totalMatched}건</span>
                <select className={`${bodyCompactFieldClassName} h-9 text-xs`} value={orgTypeFilter} onChange={(e) => setOrgTypeFilter(e.target.value as Gov24OrgType)}>
                  {ORG_FILTER_OPTIONS.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label} ({orgTypeCounts[entry.value] ?? 0})</option>
                  ))}
                </select>
              </div>

              {error ? (
                <BodyStatusInset className="text-sm" tone="danger">
                  {error}
                </BodyStatusInset>
              ) : null}

              <ul className="space-y-2">
                {items.map((item) => {
                  const quickUrl = item.primaryApplyUrl;
                  return (
                    <li key={item.id}>
                      <BodyInset className="bg-white">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.card?.badge ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-white">{item.card.badge}</span> : null}
                        {item.card?.department ? <span className="text-[11px] text-slate-500">관할: {item.card.department}</span> : null}
                      </div>
                      <p className="mt-1 font-semibold">{item.card?.title ?? item.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.card?.summary ?? item.summary}</p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {(item.card?.lines ?? []).map((line) => (
                          <li key={`${item.id}-${line.label}`}>• {line.label}: {line.value}</li>
                        ))}
                      </ul>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void openDetail(item)} disabled={detailLoading}>상세 보기</Button>
                        {quickUrl ? (
                          <a className={bodyInlineActionLinkClassName} target="_blank" rel="noopener noreferrer" href={quickUrl}>
                            바로가기
                          </a>
                        ) : null}
                      </div>
                      </BodyInset>
                    </li>
                  );
                })}
              </ul>

              {nextCursor !== null ? (
                <Button type="button" variant="outline" onClick={() => void searchSimpleFind({ cursor: nextCursor, append: true })} disabled={loading}>
                  {loading ? "로딩..." : "더 보기"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      </Container>

      {detailData ? <Gov24ServiceDetailModal data={detailData} onClose={() => setDetailData(null)} /> : null}
    </main>
  );
}
