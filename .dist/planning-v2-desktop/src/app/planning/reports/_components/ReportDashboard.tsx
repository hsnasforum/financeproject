import { Card } from "@/components/ui/Card";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type ReportVM } from "../_lib/reportViewModel";

type Props = {
  vm: ReportVM;
};

function formatMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatKrw("ko-KR", value);
}

function severityText(severity: "info" | "warn" | "critical"): string {
  if (severity === "critical") return "치명";
  if (severity === "warn") return "경고";
  return "정보";
}

function isStageSuccess(vm: ReportVM, id: keyof ReportVM["stage"]["byId"]): boolean {
  const stage = vm.stage.byId[id];
  if (!stage) return true;
  return stage.status === "SUCCESS";
}

function stageMessage(vm: ReportVM, id: keyof ReportVM["stage"]["byId"], fallback: string): string {
  const stage = vm.stage.byId[id];
  if (!stage) return fallback;
  if (stage.status === "FAILED") {
    return stage.errorSummary || "단계 실패로 섹션을 표시할 수 없습니다.";
  }
  if (stage.status === "SKIPPED") {
    return stage.errorSummary || `단계가 생략되었습니다(${stage.reason ?? "UNKNOWN"}).`;
  }
  if (stage.status === "RUNNING" || stage.status === "PENDING") {
    return "단계 진행 중입니다.";
  }
  return fallback;
}

export default function ReportDashboard({ vm }: Props) {
  const topWarnings = vm.warningAgg.slice(0, 10);
  const extraWarnings = vm.warningAgg.slice(10);
  const simulateReady = isStageSuccess(vm, "simulate");
  const actionsReady = isStageSuccess(vm, "actions");
  const monteReady = isStageSuccess(vm, "monteCarlo");
  const debtReady = isStageSuccess(vm, "debt");
  const monteStageKnown = Boolean(vm.stage.byId.monteCarlo);
  const debtStageKnown = Boolean(vm.stage.byId.debt);
  const appliedOverrides = vm.reproducibility?.appliedOverrides ?? [];

  return (
    <div className="space-y-5" data-testid="report-dashboard">
      {simulateReady ? (
        <Card className="space-y-3 p-5" data-testid="report-summary-cards">
          <h2 className="text-base font-bold text-slate-900">요약 지표</h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">월 잉여현금</p>
              <p className="text-sm font-semibold text-slate-900">{formatMoney(vm.summaryCards.monthlySurplusKrw)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">DSR</p>
              <p className="text-sm font-semibold text-slate-900">{typeof vm.summaryCards.dsrPct === "number" ? formatPct("ko-KR", vm.summaryCards.dsrPct) : "-"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">비상금(개월)</p>
              <p className="text-sm font-semibold text-slate-900">
                {typeof vm.summaryCards.emergencyFundMonths === "number" ? formatMonths("ko-KR", vm.summaryCards.emergencyFundMonths) : "-"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">총부채</p>
              <p className="text-sm font-semibold text-slate-900">{formatMoney(vm.summaryCards.debtTotalKrw)}</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-sm text-slate-700">
          Summary 섹션은 simulate 단계가 성공해야 표시됩니다. ({stageMessage(vm, "simulate", "simulate 단계 미완료")})
        </Card>
      )}

      <Card className="space-y-2 p-5">
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            적용된 가정 오버라이드 ({appliedOverrides.length})
          </summary>
          {appliedOverrides.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {appliedOverrides.map((override) => (
                <li key={`${override.key}:${override.updatedAt}`}>
                  <span className="font-semibold">{override.key}</span>
                  {" = "}
                  {override.value}
                  {override.reason ? ` · ${override.reason}` : ""}
                  {" · "}
                  {override.updatedAt}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">적용된 오버라이드가 없습니다.</p>
          )}
        </details>
      </Card>

      {simulateReady ? (
        <Card className="space-y-3 p-5" data-testid="planning-reports-warnings-section">
          <h2 className="text-base font-bold text-slate-900">Warnings (중복 월 집계)</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="report-warnings-table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">경고</th>
                  <th className="px-3 py-2 text-left">심각도</th>
                  <th className="px-3 py-2 text-left">발생</th>
                  <th className="px-3 py-2 text-left">설명</th>
                  <th className="px-3 py-2 text-left">권장 액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {topWarnings.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-600" colSpan={5}>
                      경고가 없습니다.
                    </td>
                  </tr>
                ) : topWarnings.map((warning) => (
                  <tr key={`${warning.code}:${warning.subjectKey ?? "-"}`}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900">{warning.title}</p>
                      <p className="text-[11px] text-slate-500">{warning.code}{warning.subjectLabel ? ` · ${warning.subjectLabel}` : ""}</p>
                    </td>
                    <td className="px-3 py-2">{severityText(warning.severityMax)}</td>
                    <td className="px-3 py-2">{warning.count}회 · {warning.periodMinMax}</td>
                    <td className="px-3 py-2 text-slate-700">{warning.plainDescription}</td>
                    <td className="px-3 py-2 text-[12px] text-slate-600">{warning.suggestedActionId ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {extraWarnings.length > 0 ? (
            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold">+ {extraWarnings.length}개 더 보기</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {extraWarnings.map((warning) => (
                  <li key={`${warning.code}:${warning.subjectKey ?? "-"}:extra`}>
                    [{severityText(warning.severityMax)}] {warning.title} ({warning.count}회)
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {simulateReady ? (
        <Card className="space-y-3 p-5" data-testid="report-goals-table">
          <h2 className="text-base font-bold text-slate-900">Goals</h2>
          {vm.goalsTable.length === 0 ? (
            <p className="text-sm text-slate-600">목표 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">목표명</th>
                    <th className="px-3 py-2 text-right">목표액</th>
                    <th className="px-3 py-2 text-right">현재</th>
                    <th className="px-3 py-2 text-right">부족액</th>
                    <th className="px-3 py-2 text-right">기한</th>
                    <th className="px-3 py-2 text-left">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {vm.goalsTable.map((goal, index) => (
                    <tr key={`${goal.name}-${index}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{goal.name}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(goal.targetAmount)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(goal.currentAmount)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(goal.shortfall)}</td>
                      <td className="px-3 py-2 text-right">{goal.targetMonth > 0 ? `M${goal.targetMonth}` : "-"}</td>
                      <td className="px-3 py-2">{goal.achieved ? "달성" : "진행 중"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {actionsReady ? (
        <Card className="space-y-3 p-5" data-testid="report-top-actions">
          <h2 className="text-base font-bold text-slate-900">Top Actions (3)</h2>
          {vm.topActions.length === 0 ? (
            <p className="text-sm text-slate-600">권장 액션이 없습니다.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {vm.topActions.map((action) => (
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={action.code}>
                  <p className="text-xs font-semibold text-slate-500">{severityText(action.severity)}</p>
                  <h3 className="mt-1 text-sm font-bold text-slate-900">{action.title}</h3>
                  <p className="mt-2 text-xs text-slate-700">{action.summary}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                    {action.steps.slice(0, 3).map((step, index) => (
                      <li key={`${action.code}-step-${index}`}>{step}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-5 text-sm text-slate-700">
          Action Plan 섹션은 actions 단계가 성공해야 표시됩니다. ({stageMessage(vm, "actions", "actions 단계 미완료")})
        </Card>
      )}

      {monteReady && vm.monteCarloSummary ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-bold text-slate-900">Monte Carlo</h2>
          {vm.monteCarloSummary.keyProbs.map((item) => (
            <p className="text-sm text-slate-700" key={item.key}>
              {item.label}: <span className="font-semibold text-slate-900">{formatPct("ko-KR", item.probability * 100)}</span>
            </p>
          ))}
        </Card>
      ) : monteStageKnown && !monteReady ? (
        <Card className="p-5 text-sm text-slate-700">
          Monte Carlo 섹션은 monteCarlo 단계 성공 시에만 표시됩니다. ({stageMessage(vm, "monteCarlo", "데이터 없음")})
        </Card>
      ) : null}

      {debtReady && vm.debtSummary ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-bold text-slate-900">Debt / Refi</h2>
          <p className="text-sm text-slate-700">월 상환액: <span className="font-semibold text-slate-900">{formatMoney(vm.debtSummary.meta.totalMonthlyPaymentKrw)}</span></p>
          <p className="text-sm text-slate-700">DSR: <span className="font-semibold text-slate-900">{formatPct("ko-KR", vm.debtSummary.meta.debtServiceRatio * 100)}</span></p>
          <p className="text-sm text-slate-700">대환 비교: <span className="font-semibold text-slate-900">{vm.debtSummary.refinance?.length ?? 0}건</span></p>
        </Card>
      ) : debtStageKnown && !debtReady ? (
        <Card className="p-5 text-sm text-slate-700">
          Debt/Refi 섹션은 debt 단계 성공 시에만 표시됩니다. ({stageMessage(vm, "debt", "데이터 없음")})
        </Card>
      ) : null}
    </div>
  );
}
