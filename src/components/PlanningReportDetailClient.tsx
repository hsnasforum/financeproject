"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SavedReportBrief, { SAVED_REPORT_DETAILS_ID, isSavedReportInterpretable } from "@/components/planning/reports/SavedReportBrief";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import CandidateComparisonSection from "@/components/planning/reports/CandidateComparisonSection";
import ReportAdvancedRaw from "@/components/planning/reports/ReportAdvancedRaw";
import {
  safeBuildReportVMFromRun,
  type ReportVM,
} from "@/lib/planning/reports/reportViewModel";
import { type CandidateRecommendationsPayload } from "@/lib/planning/reports/recommendationSignals";
import {
  DEFAULT_PLANNING_POLICY,
  type InterpretationGuideProps,
  type InterpretationInput,
} from "@/components/planning/InterpretationGuide";
import InterpretationGuide from "@/components/planning/InterpretationGuide";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import { Badge } from "@/components/ui/Badge";

export type PlanningReportDetail = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
  recommendRunId?: string;
  markdown: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type PlanningReportDetailClientProps = {
  id: string;
  initialReport?: PlanningReportDetail | null;
  initialRun?: PlanningRunRecord | null;
  initialError?: string;
};

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function buildRecommendHistoryHref(recommendRunId?: string): string {
  const normalized = typeof recommendRunId === "string" ? recommendRunId.trim() : "";
  return normalized ? `/recommend/history?open=${encodeURIComponent(normalized)}` : "";
}

export default function PlanningReportDetailClient({
  id,
  initialReport = null,
  initialRun = null,
  initialError = "",
}: PlanningReportDetailClientProps) {
  const hasInitialReport = initialReport?.id === id;
  const [report, setReport] = useState<PlanningReportDetail | null>(hasInitialReport ? initialReport : null);
  const [run, setRun] = useState<PlanningRunRecord | null>(hasInitialReport ? initialRun : null);
  const [recommendations, setRecommendations] = useState<CandidateRecommendationsPayload | null>(null);
  const [loading, setLoading] = useState(!hasInitialReport && !initialError);
  const [recsLoading, setRecommendationsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [recsError, setRecommendationsError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (hasInitialReport || initialError) {
      setReport(hasInitialReport ? initialReport : null);
      setRun(hasInitialReport ? initialRun : null);
      setError(initialError);
      setLoading(false);
      return;
    }

    let active = true;

    async function loadAll(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const reportRes = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
        const reportPayload = (await reportRes.json().catch(() => null)) as ApiResponse<PlanningReportDetail> | null;
        if (!reportPayload?.ok || !reportPayload.data) {
          throw new Error(reportPayload?.error?.message ?? "리포트를 불러오지 못했습니다.");
        }
        if (!active) return;
        const reportData = reportPayload.data;
        setReport(reportData);

        if (reportData.runId) {
          const runRes = await fetch(`/api/planning/v2/runs/${encodeURIComponent(reportData.runId)}`, { cache: "no-store" });
          const runPayload = (await runRes.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
          if (runPayload?.ok && runPayload.data) {
            setRun(runPayload.data);
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "데이터 로드 중 오류가 발생했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAll();
    return () => {
      active = false;
    };
  }, [hasInitialReport, id, initialError, initialReport, initialRun]);

  const handleLoadMoreAdvancedRaw = async (): Promise<void> => {
    if (!report?.runId || recommendations || recsLoading) return;
    setRecommendationsLoading(true);
    setRecommendationsError("");
    try {
      const res = await fetch(`/api/products/candidates?runId=${encodeURIComponent(report.runId)}&kind=all&limit=80`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as ApiResponse<CandidateRecommendationsPayload> | null;
      if (!res.ok || !body?.ok || !body.data) {
        throw new Error(body?.error?.message ?? "추가 데이터를 불러오지 못했습니다.");
      }
      setRecommendations(body.data);
    } catch (err) {
      setRecommendationsError(err instanceof Error ? err.message : "추가 데이터 로드 실패");
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const vmResult = useMemo(() => {
    if (!run) return { vm: null, error: null };
    return safeBuildReportVMFromRun(run, report ? {
      id: report.id,
      runId: report.runId,
      createdAt: report.createdAt,
    } : undefined);
  }, [report, run]);

  const vm: ReportVM | null = vmResult.vm;
  const recommendHistoryHref = useMemo(
    () => buildRecommendHistoryHref(report?.recommendRunId),
    [report?.recommendRunId],
  );

  const interpretationProps = useMemo<InterpretationGuideProps | null>(() => {
    if (!vm) return null;
    const input: InterpretationInput = {
      summary: vm.insight.summaryMetrics,
      aggregatedWarnings: vm.insight.aggregatedWarnings,
      goals: vm.insight.goals.map((goal) => ({
        goalId: goal.name,
        name: goal.name,
        achieved: goal.achieved,
        targetMonth: goal.targetMonth,
        progressPct: goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0,
        shortfallKrw: goal.shortfall,
        interpretation: goal.comment,
      })),
      outcomes: {
        ...vm.insight.outcomes,
        runId: vm.header.runId,
      },
      summaryEvidence: vm.evidence?.items ?? [],
    };
    return {
      summaryMetrics: input.summary,
      aggregatedWarnings: input.aggregatedWarnings,
      goals: input.goals,
      outcomes: input.outcomes,
      summaryEvidence: input.summaryEvidence,
      monthlyOperatingGuide: vm.monthlyOperatingGuide,
      policy: vm.reproducibility?.policy,
    };
  }, [vm]);

  const resultHref = report?.runId
    ? appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(report.runId)}${report.recommendRunId ? `&recommendRunId=${encodeURIComponent(report.recommendRunId)}` : ""}`, run?.profileId || "")
    : "/planning/reports";

  return (
    <PageShell className="report-detail-root">
      <PageHeader
        title="플래닝 리포트 상세"
        description="따로 보관한 리포트입니다. 원본 실행의 결과와 보관 당시 원문을 확인할 수 있습니다."
        action={(
          <div className="no-print flex max-w-full flex-wrap items-center gap-3">
            {recommendHistoryHref ? (
              <Link className="text-sm font-black text-primary hover:text-navy transition-colors" href={recommendHistoryHref}>
                추천 비교 기록으로 돌아가기
              </Link>
            ) : null}
            <Button
              onClick={() => typeof window !== "undefined" && window.print()}
              size="sm"
              variant="outline"
              className="rounded-full font-black px-5 h-9"
            >
              PDF 인쇄
            </Button>
            <Link className="text-sm font-black text-slate-400 hover:text-primary transition-colors" href="/planning/reports">리포트 목록으로</Link>
          </div>
        )}
      />
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">리포트를 불러오는 중입니다</p>
        </div>
      ) : error ? (
        <Card className="border-rose-200 bg-rose-50 p-8 text-center rounded-[2rem]">
          <p className="text-sm font-black text-rose-700">{error}</p>
          <Button className="mt-6 rounded-xl font-black h-11 px-8" variant="outline" onClick={() => window.location.reload()}>다시 시도</Button>
        </Card>
      ) : !report ? (
        <Card className="border-slate-200 bg-surface-muted p-12 text-center rounded-[2rem]">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">리포트를 찾을 수 없습니다</p>
        </Card>
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="space-y-4 border-b border-slate-200 pb-5" data-testid="saved-report-record">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary">{report.kind === "manual" ? "수동 보관 리포트" : "실행 기반 리포트"}</Badge>
              <p className="text-sm text-slate-600">보관 시각 {formatDateTime(report.createdAt)}</p>
            </div>
            {report.runId ? <Link href={resultHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">원본 진단 결과로 돌아가기</Link> : null}
            <details className="rounded-lg border border-slate-200 p-4" data-testid="saved-report-identifiers">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">보관 식별 정보</summary>
              <dl className="mt-3 space-y-3 break-all text-sm text-slate-600">
                <div><dt>리포트 ID</dt><dd className="font-mono">{report.id}</dd></div>
                {report.runId ? <div><dt>원본 실행 ID</dt><dd className="font-mono">{report.runId}</dd></div> : null}
                {report.recommendRunId ? <div><dt>추천 실행 ID</dt><dd className="font-mono">{report.recommendRunId}</dd></div> : null}
              </dl>
            </details>
          </section>
          {run ? <SavedReportBrief run={run} vm={vm} /> : null}

          {interpretationProps && isSavedReportInterpretable(run, vm) ? (
            <details id={SAVED_REPORT_DETAILS_ID} className="scroll-mt-28 rounded-xl border border-slate-200 bg-white p-5" data-testid="report-interpretation-details">
              <summary className="cursor-pointer py-1 text-base font-semibold text-navy">상세 해석·월급 운영안·계산 근거</summary>
              <div className="mt-6"><InterpretationGuide {...interpretationProps} /></div>
            </details>
          ) : (
            <Card className="rounded-[2.5rem] border-amber-100 bg-amber-50/30 p-10 text-center">
              <p className="text-sm font-bold text-amber-800 leading-relaxed">이 리포트는 시뮬레이션 데이터가 포함되지 않은 초기 리포트이거나 데이터가 부족하여 분석 가이드를 생성할 수 없습니다.</p>
            </Card>
          )}

          {report.runId && (recommendations || recsLoading || recsError) ? (
            <CandidateComparisonSection runId={report.runId} payload={recommendations} payloadError={recsError} payloadLoading={recsLoading} />
          ) : null}

          <div className="no-print space-y-6 pt-10">
            <SubSectionHeader
              title="고급 원본 분석"
              description="데이터 원문과 원시 JSON 데이터를 확인합니다."
            />
            
            <div className="flex flex-wrap gap-3">
              <Button
                variant={advancedOpen ? "primary" : "outline"}
                className="rounded-2xl h-12 px-8 font-black shadow-sm"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                {advancedOpen ? "고급 도구 닫기" : "고급 원본 보기"}
              </Button>
              <a
                href={`/api/planning/v2/reports/${encodeURIComponent(report.id)}/download`}
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-8 h-12 text-sm font-black text-slate-700 transition-all hover:border-primary/20 hover:bg-primary/5 active:scale-95 shadow-sm"
              >
                마크다운 원문 다운로드
              </a>
            </div>

            {advancedOpen ? (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <ReportAdvancedRaw
                  raw={{
                    reportMarkdown: report.markdown,
                  }}
                  reproducibility={run ? {
                    runId: run.id,
                    createdAt: run.createdAt,
                    appVersion: run.reproducibility?.appVersion ?? "1.0.0",
                    engineVersion: run.reproducibility?.engineVersion ?? "2.0.0",
                    profileHash: run.reproducibility?.profileHash ?? "none",
                    appliedOverrides: run.reproducibility?.appliedOverrides ?? [],
                    policy: run.reproducibility?.policy ?? DEFAULT_PLANNING_POLICY,
                  } : undefined}
                  onLoadMoreRunJson={() => void handleLoadMoreAdvancedRaw()}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </PageShell>
  );
}
