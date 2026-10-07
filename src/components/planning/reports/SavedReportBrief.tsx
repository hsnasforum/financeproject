"use client";

import { useEffect } from "react";
import type { ReportVM } from "@/lib/planning/reports/reportViewModel";
import type { PlanningRunRecord } from "@/lib/planning/store/types";
import { buildInterpretationVM } from "@/lib/planning/v2/insights/interpretationVm";
import { toInterpretationInputFromReportVM } from "@/lib/planning/reports/reportInterpretationAdapter";
import { cn } from "@/lib/utils";

export const SAVED_REPORT_DETAILS_ID = "saved-report-interpretation";

type SavedReportBriefProps = {
  run: PlanningRunRecord;
  vm: ReportVM | null;
};

function formatSavedAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "확인 불가";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(time));
}

function openInterpretation(): void {
  const details = document.getElementById(SAVED_REPORT_DETAILS_ID);
  if (!(details instanceof HTMLDetailsElement)) return;
  details.open = true;
  details.querySelector("summary")?.focus({ preventScroll: true });
  details.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

export function isSavedReportInterpretable(run: PlanningRunRecord | null, vm: ReportVM | null): boolean {
  if (!run || !vm || run.overallStatus === "FAILED" || run.overallStatus === "RUNNING") return false;
  const simulateStatus = vm.stage.byId.simulate?.status;
  return simulateStatus === undefined || simulateStatus === "SUCCESS";
}

export default function SavedReportBrief({ run, vm }: SavedReportBriefProps) {
  useEffect(() => {
    let printState: Array<[HTMLDetailsElement, boolean]> | null = null;
    const beforePrint = () => {
      if (printState) return;
      const details = document.getElementById(SAVED_REPORT_DETAILS_ID);
      if (!(details instanceof HTMLDetailsElement)) return;
      printState = [details, ...details.querySelectorAll<HTMLDetailsElement>("details")].map((item) => [item, item.open]);
      for (const [item] of printState) item.open = true;
    };
    const afterPrint = () => {
      if (!printState) return;
      for (const [item, open] of printState) item.open = open;
      printState = null;
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      afterPrint();
    };
  }, [run.id]);
  const unavailable = !isSavedReportInterpretable(run, vm);
  const interpretation = unavailable || !vm ? null : buildInterpretationVM(toInterpretationInputFromReportVM(vm));
  const badge = interpretation?.verdict;
  const action = interpretation?.nextActions[0];
  const statusLabel = badge?.label || "해석 확인 필요";
  const stageFailures = run.stages?.filter((stage) => stage.status === "FAILED").length ?? 0;
  const partial = run.overallStatus === "PARTIAL_SUCCESS" || stageFailures > 0;

  return (
    <section aria-labelledby="saved-report-brief-heading" className="space-y-5 border-y border-slate-200 py-6" data-testid="saved-report-brief">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">저장된 진단</p>
          <h2 id="saved-report-brief-heading" className="mt-1 break-words text-2xl font-bold tracking-tight text-navy">{run.title?.trim() || "재무 진단 결과"}</h2>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", badge?.code === "RISK" ? "bg-rose-50 text-rose-800" : badge?.code === "CAUTION" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700")}>{statusLabel}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm leading-6 text-slate-600" data-testid="saved-report-basis">
        <p>계산·저장 {formatSavedAt(run.createdAt)} (한국 시간)</p>
        <p>분석 기간 {Number.isFinite(run.input.horizonMonths) ? `${run.input.horizonMonths}개월` : "미확인"}</p>
        <p>기준일 {vm?.snapshot.asOf || "미확인"}</p>
      </div>
      <p className="text-sm leading-6 text-slate-600">저장 당시 입력과 가정으로 계산한 결과입니다. 현재 잔액이나 보장된 수익이 아니며, 화면을 열어도 새로 계산하거나 저장하지 않습니다.</p>
      {vm?.snapshot.missing ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">계산 기준 데이터가 없어 대체 가정이 사용된 결과입니다. 상세 해석에서 적용된 가정을 확인하세요.</p> : null}
      {partial ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">일부 계산 단계가 완료되지 않았습니다. 저장된 결과만 표시하며, 누락된 단계의 결과는 확인할 수 없습니다.</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-slate-600">핵심 상태</p>
          <p className="mt-2 text-lg font-bold leading-8 text-navy">{badge?.headline || "이 실행의 결과를 해석할 수 없습니다. 기록 상태와 원본을 확인해 주세요."}</p>
          {interpretation?.diagnostics.filter((item) => item.severity !== "info").map((item) => (
            <p key={item.id} className={cn("mt-3 border-l-2 pl-3 text-sm leading-6", item.severity === "risk" ? "border-rose-300 text-rose-800" : "border-amber-300 text-amber-800")}>
              <span className="font-semibold">{item.title} · {item.evidence}</span><br />{item.description}
            </p>
          ))}
        </div>
        <div className="rounded-xl bg-slate-100 p-5">
          <p className="text-sm font-semibold text-primary">먼저 검토할 행동</p>
          <p className="mt-2 text-lg font-bold leading-7 text-navy">{action?.title || (unavailable ? "결과와 저장 상태 확인" : "목표와 주의 신호 확인")}</p>
          {action?.steps.length ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
              {action.steps.slice(0, 3).map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}
            </ol>
          ) : <p className="mt-2 text-sm leading-6 text-slate-600">{unavailable ? "확인하지 못한 결과를 정상 진단으로 판단하지 않습니다." : "저장된 실행 계획이 없습니다. 아래 목표와 경고를 먼저 살펴보세요."}</p>}
          {!unavailable ? <button type="button" onClick={openInterpretation} className="no-print mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">상세 해석과 근거 보기</button> : null}
        </div>
      </div>
    </section>
  );
}
