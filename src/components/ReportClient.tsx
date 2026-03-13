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
import { AssumptionsCallout } from "@/components/ui/AssumptionsCallout";
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
    <div data-testid="report-root" className="report-root bg-surface-muted min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12 space-y-6">
        <section className="print-card rounded-[2rem] border-none bg-surface p-8 shadow-card no-break">
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="font-bold">Legacy report route</p>
            <p className="mt-1">
              이 화면은 `planner_last_snapshot_v1` 및 추천 저장 결과를 사용하는 legacy `/report` 입니다.
              planning 공식 리포트는 <Link className="font-semibold underline underline-offset-2" href="/planning/reports">/planning/reports</Link> 경로를 사용합니다.
            </p>
          </div>
          <div className="no-print flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 border-b border-border/50 pb-6">
            <div>
              <Badge variant="outline" className="mb-3 text-[10px] uppercase tracking-widest text-amber-700 border-amber-300 bg-amber-100/70">Legacy Report</Badge>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">재무설계 & 추천 종합 리포트</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer bg-surface-muted px-4 py-2 rounded-full border border-border transition-colors hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={includeDisclosuresFromDigest}
                  onChange={(event) => setIncludeDisclosuresFromDigest(event.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-[11px] font-bold text-slate-700">공시 변화 (Digest)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-surface-muted px-4 py-2 rounded-full border border-border transition-colors hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={includeDailyBrief}
                  onChange={(event) => setIncludeDailyBrief(event.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span className="text-[11px] font-bold text-slate-700">일일 브리핑</span>
              </label>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 rounded-full px-4 border-border hover:bg-slate-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect width="12" height="8" x="6" y="14" rx="1"/></svg>
                PDF 인쇄
              </Button>
              <div className="flex gap-1 ml-2 pl-3 border-l border-border">
                <Button variant="ghost" size="sm" onClick={exportMarkdown} className="h-9 px-3 text-[11px] text-slate-500 hover:text-slate-900 rounded-full" title="Markdown 내보내기">MD</Button>
                <Button variant="ghost" size="sm" onClick={exportJson} className="h-9 px-3 text-[11px] text-slate-500 hover:text-slate-900 rounded-full" title="JSON 내보내기">JSON</Button>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 bg-surface-muted p-6 rounded-2xl border border-border">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">보고서 생성 시각</p>
              <p className="text-sm font-black text-slate-900">{formatDateTime(reportModel.generatedAt)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">추천 상품 수</p>
              <p className="text-sm font-black text-slate-900">{reportModel.overview.recommendationCount}개</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">재무설계 갱신 시각</p>
              <p className="text-sm font-black text-slate-900">{formatDateTime(reportModel.overview.plannerSavedAt)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">추천 데이터 갱신 시각</p>
              <p className="text-sm font-black text-slate-900">{formatDateTime(reportModel.overview.recommendSavedAt)}</p>
            </div>
          </div>

          <AssumptionsCallout className="mt-6 bg-surface border-border">
            <p className="font-bold text-slate-700 mb-1">{reportModel.disclaimer}</p>
            <p>{reportModel.dataAsOfNote}</p>
          </AssumptionsCallout>
        </section>

        <section className="print-card rounded-[2rem] border-none bg-surface p-8 shadow-card no-break">
          <div className="flex items-center gap-3 mb-8">
             <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
             </div>
             <h2 className="text-xl font-black text-slate-900 tracking-tight">재무설계 진단 결과</h2>
          </div>
          
          {!reportModel.planner.available || !reportModel.planner.snapshot ? (
            <div className="bg-surface-muted p-8 rounded-2xl text-center border border-dashed border-border/50">
              <p className="text-sm font-bold text-slate-500">{reportModel.planner.message}</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-wrap gap-4 bg-slate-900 text-white p-5 rounded-2xl">
                 <div className="flex-1">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">입력 기준: 월 소득</p>
                   <p className="text-xl font-black tabular-nums">{reportModel.planner.snapshot.input.monthlyIncomeNet.toLocaleString()}원</p>
                 </div>
                 <div className="w-px bg-white/20 hidden md:block" />
                 <div className="flex-1">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">고정 지출</p>
                   <p className="text-xl font-black text-red-400 tabular-nums">{reportModel.planner.snapshot.input.monthlyFixedExpenses.toLocaleString()}원</p>
                 </div>
                 <div className="w-px bg-white/20 hidden md:block" />
                 <div className="flex-1">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">변동 지출</p>
                   <p className="text-xl font-black text-red-400 tabular-nums">{reportModel.planner.snapshot.input.monthlyVariableExpenses.toLocaleString()}원</p>
                 </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-widest">핵심 지표 분석</h3>
                <div data-testid="report-recommend-table" className="overflow-x-auto rounded-2xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-muted">
                      <tr className="text-left text-slate-500">
                        <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest">지표 명칭</th>
                        <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest text-right">산출 값</th>
                        <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest w-1/2">산출 근거 (계산식)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {reportModel.planner.snapshot.result.metrics.map((metric) => (
                        <tr key={metric.key} className="hover:bg-slate-50 transition-colors">
                          <td className="py-4 px-5 font-bold text-slate-800">{metric.label}</td>
                          <td className="py-4 px-5 text-right font-black text-primary tabular-nums">
                            {formatMetricValue(metric.value, metric.unit)}
                          </td>
                          <td className="py-4 px-5 text-[11px] text-slate-500 font-mono tracking-tight">{metric.formula ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-widest">우선 실행 액션</h3>
                {reportModel.planner.snapshot.result.actions.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-surface-muted p-4 rounded-xl text-center">추천된 행동이 없습니다.</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {reportModel.planner.snapshot.result.actions.map((action, index) => (
                      <div key={`${action.title}-${index}`} className="flex gap-4 p-5 rounded-2xl border border-border hover:border-primary/30 transition-colors shadow-sm bg-surface">
                        <div className={cn(
                          "h-6 px-2 rounded font-black text-[10px] flex items-center justify-center uppercase tracking-wider",
                          action.priority === "high" ? "bg-red-100 text-red-700" :
                          action.priority === "mid" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {action.priority}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 mb-1 leading-snug">{action.title}</p>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{action.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="print-card rounded-[2rem] border-none bg-surface p-8 shadow-card no-break">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
               <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
               </div>
               <h2 className="text-xl font-black text-slate-900 tracking-tight">AI 최적 상품 추천</h2>
            </div>
            {reportModel.recommendation.run && (
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-border">
                TOP {reportModel.recommendation.run.profile.topN} / {reportModel.recommendation.run.profile.kind}
              </Badge>
            )}
          </div>

          {!reportModel.recommendation.available || !reportModel.recommendation.run ? (
            <div className="bg-surface-muted p-8 rounded-2xl text-center border border-dashed border-border/50">
              <p className="text-sm font-bold text-slate-500">{reportModel.recommendation.message}</p>
            </div>
          ) : (
            <>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 text-sm text-primary font-medium flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                 고객님의 <strong>&quot;{reportModel.recommendation.run.profile.purpose}&quot;</strong> 목적에 최적화된 결과입니다.
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-muted">
                    <tr className="text-left text-slate-500">
                      <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest w-16 text-center">순위</th>
                      <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest">상품명 및 금융사</th>
                      <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest text-right">금리</th>
                      <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest text-right">기간</th>
                      <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest text-right">매칭 점수</th>
                      <th className="py-3 px-5 font-bold text-xs uppercase tracking-widest text-center no-print">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {recommendationPageItems.map((item) => (
                      <tr key={item.unifiedId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-5 text-center">
                          <span className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black",
                            item.rank === 1 ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200" :
                            item.rank === 2 ? "bg-emerald-100 text-emerald-800" :
                            item.rank === 3 ? "bg-slate-200 text-slate-700" : "bg-surface-muted text-slate-400"
                          )}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <p className="font-bold text-slate-900 text-base">{item.productName}</p>
                          <p className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] uppercase">{item.providerName}</span>
                          </p>
                        </td>
                        <td className="py-4 px-5 text-right font-black text-emerald-600 text-lg tabular-nums">{formatRate(item.appliedRate)}</td>
                        <td className="py-4 px-5 text-right font-bold text-slate-700 tabular-nums">{formatTerm(item.termMonths)}</td>
                        <td className="py-4 px-5 text-right">
                           <Badge variant="outline" className="text-[10px] font-black border-slate-200 text-slate-600 bg-white tabular-nums px-2">
                             {formatScore(item.finalScore)}
                           </Badge>
                        </td>
                        <td className="py-4 px-5 text-center no-print">
                          <Link href={`/products/catalog/${encodeURIComponent(item.unifiedId)}`}>
                             <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-primary hover:bg-primary/10">
                               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                             </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3 text-xs text-slate-700">
                <p>
                  총 <span className="font-bold">{recommendationItems.length}</span>개 중
                  {" "}
                  <span className="font-bold">{recommendationStart}-{recommendationEnd}</span>개 표시
                  {" · "}
                  페이지 <span className="font-bold">{recommendationCurrentPage}</span>/<span className="font-bold">{recommendationTotalPages}</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRecommendationPage((prev) => Math.max(1, prev - 1))}
                    disabled={recommendationCurrentPage <= 1}
                    className="rounded-full"
                  >
                    이전 5개
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRecommendationPage((prev) => Math.min(recommendationTotalPages, prev + 1))}
                    disabled={recommendationCurrentPage >= recommendationTotalPages}
                    className="rounded-full"
                  >
                    다음 5개
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="print-card rounded-[2rem] border-none bg-surface p-8 shadow-card no-break">
          <div className="flex items-center gap-3 mb-8">
             <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
             </div>
             <h2 className="text-xl font-black text-slate-900 tracking-tight">보조금24 · 정부지원 혜택</h2>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 text-sm text-primary font-medium">
            현재 플래너 목표/액션에서 추론한 주제:
            {" "}
            <strong>{benefitTopics.map((topic) => BENEFIT_TOPICS[topic].label).join(", ")}</strong>
            {benefitQuery ? ` · 검색어 보조: "${benefitQuery}"` : ""}
          </div>

          {benefitsLoading ? (
            <div className="bg-surface-muted p-8 rounded-2xl text-center border border-dashed border-border/50">
              <p className="text-sm font-bold text-slate-500">혜택 후보를 불러오는 중입니다.</p>
            </div>
          ) : benefitsError ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-sm font-bold">
              {benefitsError}
            </div>
          ) : scoredBenefits.length < 1 ? (
            <div className="bg-surface-muted p-8 rounded-2xl text-center border border-dashed border-border/50">
              <p className="text-sm font-bold text-slate-500">현재 조건에서 바로 보여줄 혜택 후보가 없습니다. `/benefits`에서 범위를 넓혀 확인해 주세요.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {scoredBenefits.map((row, index) => (
                <article key={row.item.id} className="rounded-2xl border border-border bg-surface-muted p-5 hover:bg-surface hover:shadow-sm transition-all">
                  {(() => {
                    const ctas = resolveBenefitCtas(row.item);
                    const isDetailLoading = benefitDetailLoadingId === row.item.id;
                    return (
                      <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top {index + 1} · Gov24</p>
                      <h3 className="mt-1 text-base font-black text-slate-900">{row.item.title}</h3>
                      <p className="mt-1 text-[11px] text-slate-500">{row.item.org ?? "기관 정보 미상"}</p>
                    </div>
                    <Badge variant="outline" className="bg-white text-[10px] font-bold tabular-nums">
                      {row.explain.finalPoints.toFixed(1)}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-white text-slate-600 border-none text-[10px] font-bold">{benefitRegionLabel(row.item)}</Badge>
                    {(row.explain.matched.topics.length > 0 ? row.explain.matched.topics : ["주제 일반"]).map((topic) => (
                      <Badge key={`${row.item.id}-${topic}`} variant="secondary" className="bg-white text-slate-600 border-none text-[10px] font-bold">{topic}</Badge>
                    ))}
                  </div>

                  <p className="mt-4 text-sm font-bold text-slate-700 leading-relaxed">{row.explain.why.summary}</p>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">{row.item.summary}</p>
                  {row.item.applyHow ? (
                    <p className="mt-2 text-[11px] text-slate-500">신청방법: {row.item.applyHow}</p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={isDetailLoading}
                      onClick={() => void openBenefitDetail(row.item.id)}
                    >
                      {isDetailLoading ? "불러오는 중..." : "내용 상세보기"}
                    </Button>
                    {ctas.applyUrl ? (
                      <a href={ctas.applyUrl} rel="noopener noreferrer" target="_blank">
                        <Button variant="ghost" size="sm" className="rounded-full">신청하기</Button>
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
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {benefitDetailError}
            </div>
          ) : null}
        </section>

        {includeDailyBrief ? (
          <section className="print-card rounded-[2rem] border-none bg-surface p-8 shadow-card no-break">
            <div className="flex items-center gap-3 mb-6">
               <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
               </div>
               <h2 className="text-xl font-black text-slate-900 tracking-tight">DART 공시 브리핑 <span className="text-sm font-medium text-slate-400 ml-2">(주요 10건)</span></h2>
            </div>
            {!dailyBrief || !Array.isArray(dailyBrief.lines) || dailyBrief.lines.length === 0 ? (
              <div className="bg-surface-muted p-8 rounded-2xl text-center border border-dashed border-border/50">
                <p className="text-sm font-bold text-slate-500">브리핑 파일이 없습니다. 공시 모니터링 데몬이 실행 중인지 확인하세요.</p>
              </div>
            ) : (
              <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2">기준 시각: {formatDateTime(dailyBrief.generatedAt)}</p>
                <div className="space-y-3">
                  {dailyBrief.lines.slice(0, 10).map((line, index) => (
                    <div key={`daily-brief-${index}`} className="flex items-start gap-3">
                      <span className="text-primary font-black tabular-nums mt-0.5">{index + 1}.</span>
                      <p className="text-sm font-medium text-slate-700 leading-snug">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {reportModel.disclosures.included ? (
          <section className="print-card rounded-[2rem] border-none bg-surface p-8 shadow-card no-break">
            <div className="flex items-center gap-3 mb-8">
               <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
               </div>
               <h2 className="text-xl font-black text-slate-900 tracking-tight">
                 {reportModel.disclosures.source === "digest" ? "공시 핵심 변화 요약" : "관심 기업 공시 현황"}
               </h2>
            </div>

            {!reportModel.disclosures.available ? (
              <div className="bg-surface-muted p-8 rounded-2xl text-center border border-dashed border-border/50">
                 <p className="text-sm font-bold text-slate-500">{reportModel.disclosures.message}</p>
              </div>
            ) : reportModel.disclosures.source === "digest" && reportModel.disclosures.digest ? (
              <div className="space-y-8">
                <div className="rounded-2xl border border-border bg-surface-muted p-6">
                  <p className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    시장 주요 변화 (Top Highlights)
                  </p>
                  {Array.isArray(reportModel.disclosures.digest.topHighlights) &&
                  reportModel.disclosures.digest.topHighlights.length > 0 ? (
                    <ul className="space-y-2.5">
                      {reportModel.disclosures.digest.topHighlights.slice(0, 10).map((item, index) => (
                        <li key={`${item.receiptNo ?? index}-${item.corpCode ?? index}`} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm text-sm">
                          <Badge variant="secondary" className={cn(
                            "px-2 py-0.5 text-[9px] font-black shrink-0 border-none",
                            digestLevel(item) === "HIGH" ? "bg-red-100 text-red-700" :
                            digestLevel(item) === "MID" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                          )}>
                            {digestLevel(item)}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 leading-tight">
                              <span className="text-primary mr-1">[{item.corpName ?? item.corpCode ?? "-"}]</span>
                              {digestTitle(item)}
                              {typeof item.count === "number" ? <span className="text-slate-400 font-normal ml-1">({item.count}건)</span> : ""}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1 font-mono">{item.receiptDate ?? "-"}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic">특별한 핵심 공시가 탐지되지 않았습니다.</p>
                  )}
                </div>

                {Array.isArray(reportModel.disclosures.digest.companies) && reportModel.disclosures.digest.companies.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest px-2">기업별 상세 요약</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {reportModel.disclosures.digest.companies.map((company) => (
                        <div key={company.corpCode} className="rounded-2xl border border-border bg-surface p-5 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="text-base font-black text-slate-900">{company.corpName ?? company.corpCode}</p>
                              <p className="text-[10px] font-mono text-slate-400 mt-0.5">{company.corpCode}</p>
                            </div>
                            <Badge variant="outline" className="bg-slate-50 text-[10px] font-bold">신규 {company.newCount ?? 0}건</Badge>
                          </div>
                          {company.error ? (
                            <p className="mt-3 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg font-bold">{company.error}</p>
                          ) : (
                            <ul className="mt-4 space-y-2">
                              {(Array.isArray(company.summaryLines) ? company.summaryLines : ["요약 없음"])
                                .slice(0, 5)
                                .map((line, index) => (
                                  <li key={`${company.corpCode}-summary-${index}`} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                                    <span className="text-slate-300 mt-1">•</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportModel.disclosures.entries.map((entry) => (
                  <div key={entry.corpCode} className="rounded-2xl border border-border bg-surface-muted p-5 hover:bg-surface hover:shadow-sm transition-all">
                    <div className="flex justify-between items-start mb-4 border-b border-border/50 pb-3">
                      <div>
                        <p className="text-base font-black text-slate-900">{entry.corpName ?? entry.corpCode}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">{entry.corpCode}</p>
                      </div>
                      <Badge variant="outline" className="bg-white text-[10px] font-bold">신규 {entry.newCount ?? 0}건</Badge>
                    </div>
                    {entry.items.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4 italic">새로운 공시가 없습니다.</p>
                    ) : (
                      <ul className="space-y-3">
                        {entry.items.map((item, index) => (
                          <li key={`${entry.corpCode}-${item.receiptNo ?? index}`} className="text-xs">
                            <p className="font-bold text-slate-700 leading-snug line-clamp-2">{item.reportName ?? "(제목 없음)"}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-mono">
                              {item.receiptDate ?? "-"} {item.receiptNo ? `[${item.receiptNo}]` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {runResolution.source === "fallback_latest" ? (
          <div className="no-print bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm font-bold text-center">
            요청한 세션을 찾지 못해 저장된 최신 추천 결과로 대체했습니다.
          </div>
        ) : null}

        {runResolution.source === "none" || runResolution.source === "missing_query" ? (
          <div className="no-print bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm font-bold text-center">
            저장된 추천 결과가 없습니다. 먼저 추천을 실행한 뒤 다시 확인해 주세요.
          </div>
        ) : null}
      </div>
      {benefitDetailData ? <Gov24ServiceDetailModal data={benefitDetailData} onClose={() => setBenefitDetailData(null)} /> : null}
    </div>
  );
}
