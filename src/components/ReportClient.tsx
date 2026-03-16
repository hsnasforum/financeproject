"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Gov24ServiceDetailModal,
  type Gov24ServiceDetailData,
} from "@/components/Gov24ServiceDetailModal";
import { downloadText } from "@/lib/browser/download";
import { extractApplyLinks } from "@/lib/gov24/applyLinks";
import { getRun, listRuns, type SavedRecommendRun } from "@/lib/recommend/savedRunsStore";
import { scoreBenefits, type ScoredBenefit } from "@/lib/recommend/scoreBenefits";
import { BENEFIT_TOPICS, type BenefitTopicKey } from "@/lib/publicApis/benefitsTopics";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import type { DailyBrief } from "@/lib/dart/dailyBriefBuilder";
import {
  buildReportModel,
  type ReportDisclosureDigest,
  toJson,
  toMarkdown,
  type PlannerLastSnapshot,
} from "@/lib/report/reportBuilder";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

const PLANNER_LAST_SNAPSHOT_KEY = "planner_last_snapshot_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePlannerSnapshot(raw: string | null): PlannerLastSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.savedAt !== "string") return null;
    if (!isRecord(parsed.input)) return null;
    if (!isRecord(parsed.result)) return null;
    return parsed as PlannerLastSnapshot;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { 
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false 
  });
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

function formatTerm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value)}월`;
}

function formatMetricValue(value: number | null, unit?: "KRW" | "PCT" | "MONTHS" | "COUNT"): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
  if (unit === "KRW") return `${formatted}원`;
  if (unit === "PCT") return `${formatted}%`;
  if (unit === "MONTHS") return `${formatted}월`;
  return formatted;
}

function digestLevel(item: {
  representativeLevel?: "high" | "mid" | "low";
  classification?: { level?: "high" | "mid" | "low" };
}): string {
  return (item.representativeLevel ?? item.classification?.level ?? "low").toUpperCase();
}

function digestTitle(item: {
  representativeTitle?: string;
  reportName?: string;
}): string {
  return item.representativeTitle ?? item.reportName ?? "(제목 없음)";
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function deriveLegacyBenefitTopics(snapshot: PlannerLastSnapshot | null): BenefitTopicKey[] {
  if (!snapshot) return ["housing", "job"];
  const corpus = [
    ...snapshot.input.goals.map((goal) => goal.name),
    ...snapshot.result.actions.map((action) => `${action.title} ${action.action} ${action.reason}`),
    ...snapshot.result.warnings,
  ].join(" ").toLowerCase();

  const topics: BenefitTopicKey[] = [];
  if (containsAny(corpus, ["주거", "주택", "청약", "집"])) topics.push("housing");
  if (containsAny(corpus, ["전세", "임차", "보증금"])) {
    topics.push("housing");
    topics.push("jeonse");
  }
  if (containsAny(corpus, ["월세", "임대료", "주거급여"])) {
    topics.push("housing");
    topics.push("wolse");
  }
  if (containsAny(corpus, ["청년", "사회초년", "청년도약", "청년내일"])) topics.push("youth");
  if (containsAny(corpus, ["취업", "구직", "실업", "직업훈련"])) topics.push("job");
  if (containsAny(corpus, ["교육", "학자금", "등록금"])) topics.push("education");
  if (containsAny(corpus, ["의료", "건강", "병원", "치료"])) topics.push("medical");
  if (containsAny(corpus, ["출산", "육아", "양육", "임신"])) topics.push("birth");
  return topics.length > 0 ? [...new Set(topics)] : ["housing", "job"];
}

function deriveLegacyBenefitQuery(snapshot: PlannerLastSnapshot | null): string {
  if (!snapshot) return "";
  const goalName = snapshot.input.goals[0]?.name?.trim() ?? "";
  if (goalName.length > 0) return goalName;
  const actionTitle = snapshot.result.actions[0]?.title?.trim() ?? "";
  return actionTitle;
}

function benefitRegionLabel(item: BenefitCandidate): string {
  if (item.region.scope === "REGIONAL") {
    if (item.region.sido && item.region.sigungu) return `${item.region.sido} ${item.region.sigungu}`;
    if (item.region.sido) return item.region.sido;
    return "지역형";
  }
  if (item.region.scope === "NATIONWIDE") return "전국";
  return "지역 미상";
}

function resolveBenefitCtas(item: BenefitCandidate): {
  applyUrl: string | null;
} {
  const { links } = extractApplyLinks({
    serviceId: item.id,
    applyHow: item.applyHow,
    link: item.link,
    title: item.title,
    orgName: item.org,
  });
  const applyLink = links.find((entry) => entry.label.includes("온라인신청"));
  return {
    applyUrl: applyLink?.url ?? null,
  };
}

export function ReportClient({
  runId,
  disclosureDigest,
  dailyBrief,
}: {
  runId: string | null;
  disclosureDigest: ReportDisclosureDigest | null;
  dailyBrief: DailyBrief | null;
}) {
  const [includeDisclosuresFromDigest, setIncludeDisclosuresFromDigest] = useState(false);
  const [includeDailyBrief, setIncludeDailyBrief] = useState(false);
  const [recommendationPage, setRecommendationPage] = useState(1);
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const [benefitsError, setBenefitsError] = useState("");
  const [benefitItems, setBenefitItems] = useState<BenefitCandidate[]>([]);
  const [benefitDetailData, setBenefitDetailData] = useState<Gov24ServiceDetailData | null>(null);
  const [benefitDetailLoadingId, setBenefitDetailLoadingId] = useState("");
  const [benefitDetailError, setBenefitDetailError] = useState("");
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const runResolution = useMemo(() => {
    if (!hydrated) {
      return {
        requestedRunId: (runId ?? "").trim(),
        savedRun: null,
        source: "none" as const,
      };
    }

    const requestedRunId = (runId ?? "").trim();
    const requestedRun = requestedRunId ? getRun(requestedRunId) : null;
    if (requestedRun) {
      return {
        requestedRunId,
        savedRun: requestedRun,
        source: "query" as const,
      };
    }

    const latestRun = listRuns()[0] ?? null;
    if (latestRun) {
      return {
        requestedRunId,
        savedRun: latestRun,
        source: requestedRunId ? "fallback_latest" as const : "latest" as const,
      };
    }

    return {
      requestedRunId,
      savedRun: null,
      source: requestedRunId ? "missing_query" as const : "none" as const,
    };
  }, [hydrated, runId]);
  const savedRun: SavedRecommendRun | null = runResolution.savedRun;

  const plannerSnapshot: PlannerLastSnapshot | null = useMemo(() => {
    if (!hydrated || typeof window === "undefined") return null;
    return parsePlannerSnapshot(window.localStorage.getItem(PLANNER_LAST_SNAPSHOT_KEY));
  }, [hydrated]);
  const benefitTopics = useMemo(() => deriveLegacyBenefitTopics(plannerSnapshot), [plannerSnapshot]);
  const benefitQuery = useMemo(() => deriveLegacyBenefitQuery(plannerSnapshot), [plannerSnapshot]);
  const scoredBenefits = useMemo<ScoredBenefit[]>(
    () => scoreBenefits(benefitItems, {
      topics: benefitTopics,
      query: benefitQuery,
      includeNationwide: true,
      includeUnknown: true,
      topN: 5,
    }),
    [benefitItems, benefitQuery, benefitTopics],
  );

  const digestHasData = useMemo(() => {
    const top = Array.isArray(disclosureDigest?.topHighlights) ? disclosureDigest.topHighlights : [];
    const companies = Array.isArray(disclosureDigest?.companies) ? disclosureDigest.companies : [];
    return top.length > 0 || companies.length > 0;
  }, [disclosureDigest]);

  const digestError = includeDisclosuresFromDigest && !digestHasData
    ? "로컬 digest를 찾지 못했거나 데이터가 비어 있습니다. 먼저 `pnpm dart:watch`를 실행하세요."
    : "";

  const reportModel = useMemo(() => buildReportModel({
    plannerSnapshot,
    savedRun,
    includeDisclosuresFromDigest,
    disclosureDigest,
    disclosuresError: digestError || null,
  }), [plannerSnapshot, savedRun, includeDisclosuresFromDigest, disclosureDigest, digestError]);

  useEffect(() => {
    setRecommendationPage(1);
  }, [savedRun?.runId]);

  useEffect(() => {
    let active = true;

    async function loadBenefits(): Promise<void> {
      if (!plannerSnapshot) {
        setBenefitItems([]);
        setBenefitsError("");
        setBenefitsLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.set("pageSize", "20");
      params.set("includeFacets", "0");
      params.set("includeNationwide", "1");
      params.set("includeUnknown", "1");
      if (benefitTopics.length > 0) params.set("topics", benefitTopics.join(","));
      if (benefitQuery) params.set("query", benefitQuery);

      setBenefitsLoading(true);
      setBenefitsError("");
      try {
        const response = await fetch(`/api/public/benefits/search?${params.toString()}`, { cache: "no-store" });
        const json = await response.json().catch(() => null) as { ok?: boolean; data?: { items?: BenefitCandidate[] }; error?: { message?: string } } | null;
        if (!active) return;
        if (!response.ok || !json?.ok) {
          setBenefitItems([]);
          setBenefitsError(json?.error?.message ?? "혜택 후보를 불러오지 못했습니다.");
          return;
        }
        setBenefitItems(Array.isArray(json.data?.items) ? json.data.items : []);
      } catch (error) {
        if (!active) return;
        setBenefitItems([]);
        setBenefitsError(error instanceof Error ? error.message : "혜택 후보를 불러오지 못했습니다.");
      } finally {
        if (active) setBenefitsLoading(false);
      }
    }

    void loadBenefits();
    return () => {
      active = false;
    };
  }, [benefitQuery, benefitTopics, plannerSnapshot]);

  const recommendationPageSize = 5;
  const recommendationItems = reportModel.recommendation.run?.items ?? [];
  const recommendationTotalPages = Math.max(1, Math.ceil(recommendationItems.length / recommendationPageSize));
  const recommendationCurrentPage = Math.min(recommendationPage, recommendationTotalPages);
  const recommendationPageItems = recommendationItems.slice(
    (recommendationCurrentPage - 1) * recommendationPageSize,
    recommendationCurrentPage * recommendationPageSize,
  );
  const recommendationStart = recommendationItems.length < 1 ? 0 : (recommendationCurrentPage - 1) * recommendationPageSize + 1;
  const recommendationEnd = recommendationItems.length < 1 ? 0 : Math.min(recommendationItems.length, recommendationCurrentPage * recommendationPageSize);

  async function openBenefitDetail(serviceId: string): Promise<void> {
    const safeServiceId = serviceId.trim();
    if (!safeServiceId) return;
    setBenefitDetailLoadingId(safeServiceId);
    setBenefitDetailError("");
    try {
      const response = await fetch(`/api/gov24/detail?svcId=${encodeURIComponent(safeServiceId)}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: Gov24ServiceDetailData;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error?.message ?? "혜택 상세를 불러오지 못했습니다.");
      }
      setBenefitDetailData(body.data);
    } catch (error) {
      setBenefitDetailError(error instanceof Error ? error.message : "혜택 상세를 불러오지 못했습니다.");
    } finally {
      setBenefitDetailLoadingId("");
    }
  }

  function exportMarkdown() {
    const content = toMarkdown(reportModel);
    const name = reportModel.overview.runId ?? "no-run";
    downloadText(`report-${name}.md`, content, "text/markdown;charset=utf-8");
  }

  function exportJson() {
    const content = toJson(reportModel);
    const name = reportModel.overview.runId ?? "no-run";
    downloadText(`report-${name}.json`, content, "application/json;charset=utf-8");
  }

  return (
    <PageShell className="report-root">
      <PageHeader
        title="재무설계 & 추천 종합 리포트"
        description="입력하신 재무 현황과 AI 추천 결과를 종합하여 분석한 맞춤형 보고서입니다."
        action={(
          <div className="no-print flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded-full border border-slate-200 transition-all hover:border-emerald-200 shadow-sm">
              <input
                type="checkbox"
                checked={includeDisclosuresFromDigest}
                onChange={(event) => setIncludeDisclosuresFromDigest(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">공시 Digest</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded-full border border-slate-200 transition-all hover:border-emerald-200 shadow-sm">
              <input
                type="checkbox"
                checked={includeDailyBrief}
                onChange={(event) => setIncludeDailyBrief(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Daily Brief</span>
            </label>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-full font-black px-5 h-9">
              PDF 인쇄
            </Button>
            <div className="flex gap-1 ml-2 pl-3 border-l border-slate-200">
              <Button variant="ghost" size="sm" onClick={exportMarkdown} className="h-9 px-3 text-[10px] font-black text-slate-400 hover:text-slate-900 rounded-full">MD</Button>
              <Button variant="ghost" size="sm" onClick={exportJson} className="h-9 px-3 text-[10px] font-black text-slate-400 hover:text-slate-900 rounded-full">JSON</Button>
            </div>
          </div>
        )}
      />

      <div className="space-y-10">
        <section className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <div className="mb-8 rounded-2xl border border-amber-100 bg-amber-50/50 px-6 py-4 text-sm font-bold text-amber-800 flex items-center gap-3 shadow-inner">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black shrink-0">!</span>
            <p>
              이 화면은 legacy `/report`입니다. 공식 대시보드는 <Link className="text-amber-900 underline underline-offset-4 decoration-amber-200" href="/planning/reports">/planning/reports</Link>를 이용하세요.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">보고서 생성</p>
              <p className="text-sm font-black text-slate-900 tabular-nums">{formatDateTime(reportModel.generatedAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">추천 상품</p>
              <p className="text-sm font-black text-slate-900 tabular-nums">{reportModel.overview.recommendationCount}개</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">플래너 갱신</p>
              <p className="text-sm font-black text-slate-900 tabular-nums">{formatDateTime(reportModel.overview.plannerSavedAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">데이터 갱신</p>
              <p className="text-sm font-black text-slate-900 tabular-nums">{formatDateTime(reportModel.overview.recommendSavedAt)}</p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50/20 p-6 shadow-inner">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2 px-1">Disclaimer & Context</p>
            <p className="text-sm font-bold text-slate-700 leading-relaxed mb-1">{reportModel.disclaimer}</p>
            <p className="text-xs font-medium text-slate-500 italic">※ {reportModel.dataAsOfNote}</p>
          </div>
        </section>

        <section className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <SubSectionHeader title="재무설계 진단 결과" description="입력하신 소득과 지출을 기반으로 분석한 핵심 지표입니다." />
          
          {!reportModel.planner.available || !reportModel.planner.snapshot ? (
            <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
              <p className="text-sm font-bold text-slate-400 italic">{reportModel.planner.message}</p>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="grid gap-4 md:grid-cols-3">
                 <div className="rounded-[1.5rem] bg-emerald-600 p-6 text-white shadow-xl shadow-emerald-900/20">
                   <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1">월 순소득</p>
                   <p className="text-2xl font-black tabular-nums tracking-tight">{reportModel.planner.snapshot.input.monthlyIncomeNet.toLocaleString()}원</p>
                 </div>
                 <div className="rounded-[1.5rem] bg-slate-50 p-6 border border-slate-100">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">고정 지출</p>
                   <p className="text-xl font-black text-rose-600 tabular-nums tracking-tight">{reportModel.planner.snapshot.input.monthlyFixedExpenses.toLocaleString()}원</p>
                 </div>
                 <div className="rounded-[1.5rem] bg-slate-50 p-6 border border-slate-100">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">변동 지출</p>
                   <p className="text-xl font-black text-rose-600 tabular-nums tracking-tight">{reportModel.planner.snapshot.input.monthlyVariableExpenses.toLocaleString()}원</p>
                 </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">핵심 지표 분석</p>
                <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-400">
                      <tr>
                        <th className="py-4 px-6 text-left font-black uppercase tracking-widest text-[10px]">지표 명칭</th>
                        <th className="py-4 px-6 text-right font-black uppercase tracking-widest text-[10px]">산출 값</th>
                        <th className="py-4 px-6 text-left font-black uppercase tracking-widest text-[10px] w-1/2">산출 근거</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                      {reportModel.planner.snapshot.result.metrics.map((metric) => (
                        <tr key={metric.key} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6 font-black text-slate-900">{metric.label}</td>
                          <td className="py-4 px-6 text-right font-black text-emerald-600 tabular-nums text-lg">
                            {formatMetricValue(metric.value, metric.unit)}
                          </td>
                          <td className="py-4 px-6 text-[11px] font-bold text-slate-400 font-mono leading-relaxed">{metric.formula ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">우선 실행 액션</p>
                {reportModel.planner.snapshot.result.actions.length === 0 ? (
                  <p className="text-sm font-bold text-slate-300 italic py-8 text-center">추천된 행동이 없습니다.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {reportModel.planner.snapshot.result.actions.map((action, index) => (
                      <div key={`${action.title}-${index}`} className="flex gap-4 p-6 rounded-[1.5rem] border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-md transition-all shadow-sm">
                        <Badge variant={action.priority === "high" ? "destructive" : action.priority === "mid" ? "warning" : "success"} className="h-6 rounded-lg px-2 text-[9px] font-black border-none uppercase tracking-widest shrink-0">
                          {action.priority}
                        </Badge>
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 mb-1 leading-snug">{action.title}</p>
                          <p className="text-xs font-bold text-slate-500 leading-relaxed line-clamp-2">{action.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <SubSectionHeader title="AI 최적 상품 추천" description="사용자 성향과 재무 목표에 가장 적합한 금융상품을 제안합니다." />

          {!reportModel.recommendation.available || !reportModel.recommendation.run ? (
            <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
              <p className="text-sm font-bold text-slate-400 italic">{reportModel.recommendation.message}</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 px-5 py-4 text-sm font-bold text-emerald-800 flex items-center gap-3">
                 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black shrink-0">!</span>
                 <p>고객님의 <strong>&quot;{reportModel.recommendation.run.profile.purpose}&quot;</strong> 목적에 최적화된 상위 결과입니다.</p>
              </div>
              
              <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400">
                    <tr>
                      <th className="py-4 px-6 text-center font-black uppercase tracking-widest text-[10px] w-16">순위</th>
                      <th className="py-4 px-6 text-left font-black uppercase tracking-widest text-[10px]">상품명 및 금융사</th>
                      <th className="py-4 px-6 text-right font-black uppercase tracking-widest text-[10px]">적용 금리</th>
                      <th className="py-4 px-6 text-right font-black uppercase tracking-widest text-[10px]">납입 기간</th>
                      <th className="py-4 px-6 text-right font-black uppercase tracking-widest text-[10px]">매칭 점수</th>
                      <th className="py-4 px-6 text-center font-black uppercase tracking-widest text-[10px] no-print">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 bg-white">
                    {recommendationPageItems.map((item) => (
                      <tr key={item.unifiedId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 text-center">
                          <span className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow-sm",
                            item.rank === 1 ? "bg-emerald-500 text-white" :
                            item.rank === 2 ? "bg-slate-200 text-slate-700" :
                            item.rank === 3 ? "bg-slate-100 text-slate-500" : "bg-white text-slate-300 border border-slate-100"
                          )}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-black text-slate-900 text-base leading-tight">{item.productName}</p>
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1.5">{item.providerName}</p>
                        </td>
                        <td className="py-4 px-6 text-right font-black text-emerald-600 text-xl tabular-nums tracking-tight">{formatRate(item.appliedRate)}</td>
                        <td className="py-4 px-6 text-right font-bold text-slate-500 tabular-nums">{formatTerm(item.termMonths)}</td>
                        <td className="py-4 px-6 text-right">
                           <Badge variant="outline" className="bg-slate-50 text-[10px] font-black border-slate-200 text-slate-600 tabular-nums px-2 py-0.5">
                             {formatScore(item.finalScore)}
                           </Badge>
                        </td>
                        <td className="py-4 px-6 text-center no-print">
                          <Link href={`/products/catalog/${encodeURIComponent(item.unifiedId)}`}>
                             <Button variant="ghost" size="sm" className="h-10 w-10 p-0 rounded-xl text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                             </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-5 py-3 text-xs font-bold text-slate-500">
                <p>
                  Showing <span className="text-slate-900 font-black">{recommendationStart}-{recommendationEnd}</span> of <span className="text-slate-900 font-black">{recommendationItems.length}</span>
                  {" · "}
                  Page <span className="text-slate-900 font-black">{recommendationCurrentPage}</span> / {recommendationTotalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRecommendationPage((prev) => Math.max(1, prev - 1))}
                    disabled={recommendationCurrentPage <= 1}
                    className="rounded-full px-4 h-8 font-black"
                  >
                    이전
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRecommendationPage((prev) => Math.min(recommendationTotalPages, prev + 1))}
                    disabled={recommendationCurrentPage >= recommendationTotalPages}
                    className="rounded-full px-4 h-8 font-black"
                  >
                    다음
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <SubSectionHeader title="보조금24 · 정부지원 혜택" description="현재 재무 계획과 목적에 부합하는 주요 공공 혜택을 선별했습니다." />

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 px-5 py-4 text-sm font-bold text-emerald-800 mb-8 shadow-inner">
            분석 키워드: <strong>{benefitTopics.map((topic) => BENEFIT_TOPICS[topic].label).join(", ")}</strong>
            {benefitQuery ? <span className="text-emerald-600/60 ml-2"> (Context: &quot;{benefitQuery}&quot;)</span> : ""}
          </div>

          {benefitsLoading ? (
            <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
              <p className="text-sm font-bold text-slate-400 italic">혜택 정보를 탐색하는 중입니다.</p>
            </div>
          ) : benefitsError ? (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 p-6 rounded-[1.5rem] text-sm font-black text-center">
              {benefitsError}
            </div>
          ) : scoredBenefits.length < 1 ? (
            <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
              <p className="text-sm font-bold text-slate-400 italic">현재 조건에서 바로 보여줄 혜택이 없습니다. `/benefits`에서 상세 검색을 시도해 보세요.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {scoredBenefits.map((row, index) => (
                <article key={row.item.id} className="group flex flex-col rounded-[2rem] border border-slate-100 bg-slate-50/30 p-6 hover:bg-white hover:shadow-lg transition-all shadow-sm">
                  {(() => {
                    const ctas = resolveBenefitCtas(row.item);
                    const isDetailLoading = benefitDetailLoadingId === row.item.id;
                    return (
                      <>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top {index + 1} · Recommendation</p>
                      <h3 className="mt-1 text-lg font-black text-slate-900 group-hover:text-emerald-600 transition-colors leading-snug line-clamp-2">{row.item.title}</h3>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">{row.item.org ?? "기관 정보 미상"}</p>
                    </div>
                    <Badge variant="outline" className="bg-white text-[10px] font-black tabular-nums border-slate-200 text-slate-600 shrink-0">
                      {row.explain.finalPoints.toFixed(1)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    <Badge variant="secondary" className="bg-white text-slate-500 border-slate-100 text-[10px] font-black px-2">{benefitRegionLabel(row.item)}</Badge>
                    {(row.explain.matched.topics.length > 0 ? row.explain.matched.topics : ["일반"]).map((topic) => (
                      <Badge key={`${row.item.id}-${topic}`} variant="secondary" className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-black px-2">{topic}</Badge>
                    ))}
                  </div>

                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-bold text-slate-700 leading-relaxed border-l-4 border-emerald-500 pl-3 bg-white/50 py-2 rounded-r-lg shadow-sm">{row.explain.why.summary}</p>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed line-clamp-3">{row.item.summary}</p>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl h-10 px-5 font-black border-slate-200"
                      disabled={isDetailLoading}
                      onClick={() => void openBenefitDetail(row.item.id)}
                    >
                      {isDetailLoading ? "불러오는 중..." : "상세보기"}
                    </Button>
                    {ctas.applyUrl ? (
                      <a href={ctas.applyUrl} rel="noopener noreferrer" target="_blank" className="flex-1">
                        <Button variant="primary" size="sm" className="w-full rounded-xl h-10 font-black shadow-md shadow-emerald-900/10">바로 신청하기</Button>
                      </a>
                    ) : null}
                  </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          )}
          {benefitDetailError ? (
            <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs font-black text-rose-700 text-center">
              {benefitDetailError}
            </div>
          ) : null}
        </section>

        {includeDailyBrief && dailyBrief && (
          <section className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
            <SubSectionHeader title="DART 공시 브리핑" description="시장 주요 공시를 요약하여 브리핑해 드립니다." />
            
            {(!Array.isArray(dailyBrief.lines) || dailyBrief.lines.length === 0) ? (
              <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
                <p className="text-sm font-bold text-slate-400 italic">브리핑 데이터가 준비되지 않았습니다.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-2 border border-slate-100 w-fit">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Update</span>
                  <span className="text-[11px] font-black text-slate-700 tabular-nums">{formatDateTime(dailyBrief.generatedAt)}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {dailyBrief.lines.slice(0, 10).map((line, index) => (
                    <div key={`daily-brief-${index}`} className="flex items-start gap-4 p-5 rounded-2xl bg-slate-50/30 border border-slate-100/50 shadow-sm">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-700 shrink-0 shadow-sm">{index + 1}</span>
                      <p className="text-sm font-bold text-slate-700 leading-snug">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {reportModel.disclosures.included && (
          <section className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
            <SubSectionHeader 
              title={reportModel.disclosures.source === "digest" ? "공시 핵심 변화 요약" : "관심 기업 공시 현황"} 
              description="공시 데이터 기반의 주요 지표와 변화를 요약합니다."
            />

            {!reportModel.disclosures.available ? (
              <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
                 <p className="text-sm font-bold text-slate-400 italic">{reportModel.disclosures.message}</p>
              </div>
            ) : reportModel.disclosures.source === "digest" && reportModel.disclosures.digest ? (
              <div className="space-y-10">
                <div className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-8 shadow-inner">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-6 flex items-center gap-2 px-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Market Highlights
                  </p>
                  {Array.isArray(reportModel.disclosures.digest.topHighlights) && reportModel.disclosures.digest.topHighlights.length > 0 ? (
                    <ul className="space-y-3">
                      {reportModel.disclosures.digest.topHighlights.slice(0, 10).map((item, index) => (
                        <li key={`${item.receiptNo ?? index}-${item.corpCode ?? index}`} className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
                          <Badge variant={digestLevel(item) === "HIGH" ? "destructive" : "warning"} className="px-2 py-0.5 text-[9px] font-black shrink-0 border-none h-5">
                            {digestLevel(item)}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-slate-900 leading-tight">
                              <span className="text-emerald-600 mr-2">[{item.corpName ?? item.corpCode ?? "-"}]</span>
                              {digestTitle(item)}
                              {typeof item.count === "number" ? <span className="text-slate-400 font-bold ml-2">({item.count}건)</span> : ""}
                            </p>
                            <p className="text-[10px] font-black text-slate-300 mt-2 uppercase tracking-widest tabular-nums">{item.receiptDate ?? "-"}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm font-bold text-slate-400 italic px-1">탐지된 주요 공시 변화가 없습니다.</p>
                  )}
                </div>

                {Array.isArray(reportModel.disclosures.digest.companies) && reportModel.disclosures.digest.companies.length > 0 && (
                  <div className="space-y-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">기업별 상세 요약</p>
                    <div className="grid gap-6 md:grid-cols-2">
                      {reportModel.disclosures.digest.companies.map((company) => (
                        <Card key={company.corpCode} className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm hover:shadow-lg transition-all">
                          <div className="flex justify-between items-start mb-4 border-b border-slate-50 pb-4">
                            <div>
                              <p className="text-lg font-black text-slate-900 leading-tight">{company.corpName ?? company.corpCode}</p>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest tabular-nums">{company.corpCode}</p>
                            </div>
                            <Badge variant="outline" className="bg-slate-50 text-[10px] font-black border-slate-200 text-slate-500 h-6 px-2">
                              New {company.newCount ?? 0}
                            </Badge>
                          </div>
                          {company.error ? (
                            <p className="text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl">{company.error}</p>
                          ) : (
                            <ul className="space-y-3">
                              {(Array.isArray(company.summaryLines) ? company.summaryLines : ["요약 정보 없음"])
                                .slice(0, 5)
                                .map((line, index) => (
                                  <li key={`${company.corpCode}-summary-${index}`} className="flex items-start gap-3 text-[13px] font-bold text-slate-600 leading-relaxed">
                                    <span className="text-emerald-500 font-black mt-0.5">•</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {reportModel.disclosures.entries.map((entry) => (
                  <Card key={entry.corpCode} className="rounded-[2rem] border border-slate-100 bg-slate-50/30 p-6 transition-all hover:bg-white hover:shadow-lg shadow-sm">
                    <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-base font-black text-slate-900">{entry.corpName ?? entry.corpCode}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest tabular-nums">{entry.corpCode}</p>
                      </div>
                      <Badge variant="outline" className="bg-white text-[10px] font-black border-slate-200 text-slate-500 h-6 px-2">New {entry.newCount ?? 0}</Badge>
                    </div>
                    {entry.items.length === 0 ? (
                      <p className="text-xs font-bold text-slate-300 text-center py-6 italic">새로운 공시 정보가 없습니다.</p>
                    ) : (
                      <ul className="space-y-4">
                        {entry.items.map((item, index) => (
                          <li key={`${entry.corpCode}-${item.receiptNo ?? index}`} className="space-y-1">
                            <p className="text-sm font-black text-slate-700 leading-snug line-clamp-2">{item.reportName ?? "(제목 없음)"}</p>
                            <p className="text-[10px] font-bold text-slate-400 tabular-nums uppercase tracking-widest">
                              {item.receiptDate ?? "-"} {item.receiptNo ? `[${item.receiptNo}]` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="no-print space-y-4">
          {(runResolution.source === "fallback_latest" || runResolution.source === "none" || runResolution.source === "missing_query") && (
            <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/50 p-6 text-center shadow-inner">
              <p className="text-sm font-black text-amber-800 leading-relaxed">
                {runResolution.source === "fallback_latest" 
                  ? "요청한 세션을 찾지 못해 저장된 최신 결과로 대체했습니다." 
                  : "저장된 추천 결과가 없습니다. 먼저 추천을 실행한 뒤 다시 확인해 주세요."}
              </p>
            </div>
          )}
        </div>
      </div>
      {benefitDetailData ? <Gov24ServiceDetailModal data={benefitDetailData} onClose={() => setBenefitDetailData(null)} /> : null}
    </PageShell>
  );
}
