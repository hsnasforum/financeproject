"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CandidateComparisonSection from "@/app/planning/reports/_components/CandidateComparisonSection";
import ReportAdvancedRaw from "@/app/planning/reports/_components/ReportAdvancedRaw";
import {
  safeBuildReportVMFromRun,
  type ReportVM,
} from "@/app/planning/reports/_lib/reportViewModel";
import { type CandidateRecommendationsPayload } from "@/app/planning/reports/_lib/recommendationSignals";
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

type ReportDetail = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
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
};

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

export default function PlanningReportDetailClient({ id }: PlanningReportDetailClientProps) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [run, setRun] = useState<PlanningRunRecord | null>(null);
  const [recommendations, setRecommendations] = useState<CandidateRecommendationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [recsLoading, setRecommendationsLoading] = useState(false);
  const [error, setError] = useState("");
  const [recsError, setRecommendationsError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAll(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const reportRes = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
        const reportPayload = (await reportRes.json().catch(() => null)) as ApiResponse<ReportDetail> | null;
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
  }, [id]);

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
    };
  }, [vm]);

  return (
    <PageShell className="report-detail-root">
      <PageHeader
        title="리포트 상세 보기"
        description="Run 기반 데이터 해석 및 실행 가이드 대시보드"
        action={(
          <div className="no-print flex items-center gap-4">
            <Button
              onClick={() => typeof window !== "undefined" && window.print()}
              size="sm"
              variant="outline"
              className="rounded-full font-black px-5 h-9"
            >
              PDF 인쇄
            </Button>
            <Link className="text-sm font-black text-slate-400 hover:text-emerald-600 transition-colors" href="/planning/reports">목록으로</Link>
          </div>
        )}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading Report...</p>
        </div>
      ) : error ? (
        <Card className="border-rose-200 bg-rose-50 p-8 text-center rounded-[2rem]">
          <p className="text-sm font-black text-rose-700">{error}</p>
          <Button className="mt-6 rounded-xl font-black h-11 px-8" variant="outline" onClick={() => window.location.reload()}>다시 시도</Button>
        </Card>
      ) : !report ? (
        <Card className="border-slate-200 bg-slate-50 p-12 text-center rounded-[2rem]">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Report Not Found</p>
        </Card>
      ) : (
        <div className="mx-auto max-w-5xl space-y-10">
          <Card className="print-card rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
            <div className="flex flex-wrap items-start justify-between gap-6 mb-8 border-b border-slate-50 pb-8">
              <div>
                <Badge variant="secondary" className="mb-3 px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white border-none">
                  Run-Based Report
                </Badge>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
                  {report.runId ? "플래닝 실행 분석 결과" : "수동 생성 리포트"}
                </h1>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Created At</p>
                <p className="text-sm font-black text-slate-900 tabular-nums">{formatDateTime(report.createdAt)}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Report ID</p>
                <p className="text-xs font-black text-slate-700 font-mono break-all">{report.id}</p>
              </div>
              {report.runId && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Source Run ID</p>
                  <p className="text-xs font-black text-slate-700 font-mono break-all">{report.runId}</p>
                </div>
              )}
            </div>
          </Card>

          {interpretationProps ? (
            <InterpretationGuide {...interpretationProps} />
          ) : (
            <Card className="rounded-[2.5rem] border-amber-100 bg-amber-50/30 p-10 text-center">
              <p className="text-sm font-bold text-amber-800 leading-relaxed">이 리포트는 시뮬레이션 데이터가 포함되지 않은 초기 리포트이거나 데이터가 부족하여 분석 가이드를 생성할 수 없습니다.</p>
            </Card>
          )}

          {report.runId && (
            <CandidateComparisonSection
              runId={report.runId}
              payload={recommendations}
              payloadError={recsError}
              payloadLoading={recsLoading}
            />
          )}

          <div className="no-print space-y-6 pt-10">
            <SubSectionHeader
              title="Advanced Analysis"
              description="데이터의 원본 문문과 원시 JSON 데이터를 확인합니다."
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
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-8 h-12 text-sm font-black text-slate-700 transition-all hover:border-emerald-200 hover:bg-emerald-50 active:scale-95 shadow-sm"
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
