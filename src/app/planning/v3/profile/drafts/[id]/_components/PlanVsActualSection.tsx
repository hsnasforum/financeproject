"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BodySectionHeading, BodyTableFrame } from "@/components/ui/BodyTone";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";
import { comparePlanVsActual, loadPlanVsActualRuns, type CashflowMetrics, type PlanVsActual } from "@/lib/planning/v3/service/planVsActual";

const unavailable = {
  "no-evidence": "거래의 월별 관측 근거가 없어 실제 현금흐름을 비교할 수 없습니다.",
  "invalid-evidence": "거래의 월별 관측 근거를 확인할 수 없어 비교할 수 없습니다.",
  "no-plan": "이 프로필의 비교 가능한 완료 플랜이 없습니다. 시나리오 플랜은 자동 비교에서 제외합니다.",
  "no-post-plan-months": "플랜 이후 관측 데이터가 아직 없습니다",
  "missing-plan-metrics": "저장 플랜에 첫 계획월의 수입·생활지출·부채상환 정보가 부족해 비교할 수 없습니다.",
};
const metrics: Array<[keyof CashflowMetrics, string]> = [
  ["incomeKrw", "월 수입"], ["livingExpenseKrw", "생활지출(부채 제외)"],
  ["debtPaymentKrw", "부채상환"], ["operatingCashflowKrw", "운영 잉여현금"],
];
const krw = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function PlanVsActualComparison({ comparison }: { comparison: PlanVsActual }) {
  if (comparison.status !== "ready") return <p className="text-sm text-slate-600">{unavailable[comparison.status]}</p>;
  const delta = comparison.delta.operatingCashflowKrw;
  return <div className="space-y-3">
    <p className="text-sm text-slate-700">저장 당시 첫 계획월 vs 최근 거래 {comparison.months.length}개월 중앙값</p>
    <p className="text-xs text-slate-500">플랜 저장일(UTC): {comparison.createdAt.slice(0, 10)} · 관측월: {comparison.months.join(", ")}</p>
    <BodyTableFrame>
      <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
        <caption className="sr-only">저장 플랜과 거래 관측 현금흐름 비교</caption>
        <thead className="bg-surface-muted"><tr>
          <th className="px-3 py-2 text-left" scope="col">지표</th>
          <th className="px-3 py-2 text-right" scope="col">계획 기준</th>
          <th className="px-3 py-2 text-right" scope="col">최근 실제 중앙값</th>
          <th className="px-3 py-2 text-right" scope="col">차이 (실제 − 계획)</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{metrics.map(([key, label]) => <tr key={key}>
          <th className="px-3 py-2 text-left" scope="row">{label}</th>
          <td className="px-3 py-2 text-right tabular-nums">{krw(comparison.plan[key])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{krw(comparison.actual[key])}</td>
          <td className="px-3 py-2 text-right tabular-nums">{comparison.delta[key] > 0 ? "+" : ""}{krw(comparison.delta[key])}</td>
        </tr>)}</tbody>
      </table>
    </BodyTableFrame>
    <p className="text-sm font-semibold text-navy">{delta === 0
      ? "최근 관측 잉여현금은 계획 기준과 같습니다."
      : `최근 관측 잉여현금은 계획 기준보다 ${krw(Math.abs(delta))} ${delta < 0 ? "낮습니다." : "높습니다."}`}</p>
    <p className="text-xs text-slate-500">거래 초안의 월별 근거만 사용하며, 플랜을 저장한 달은 제외합니다. 운영 잉여현금도 월별로 계산한 뒤 중앙값을 구하므로 수입·지출·부채 차이의 합과 일치하지 않을 수 있습니다. 월별 계획 변화나 차이의 원인을 분석한 결과는 아닙니다.</p>
  </div>;
}

export function PlanVsActualSection({ profileId, evidence }: { profileId: string; evidence: unknown }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ profileId: string; evidence: unknown; result?: PlanVsActual; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!profileId) return;
    const controller = new AbortController();
    const validation = comparePlanVsActual(profileId, evidence, []);
    async function load() {
      try {
        const result = validation.status === "no-evidence" || validation.status === "invalid-evidence" ? validation
          : comparePlanVsActual(profileId, evidence, await loadPlanVsActualRuns(profileId, controller.signal, readDevCsrfToken()));
        if (!controller.signal.aborted) setState({ profileId, evidence, result });
      } catch {
        if (!controller.signal.aborted) setState({ profileId, evidence, failed: true });
      }
    }
    void load();
    return () => controller.abort();
  }, [profileId, evidence, attempt]);
  if (!profileId) return null;
  const current = state?.profileId === profileId && state.evidence === evidence ? state : null;
  return <Card className="space-y-3" data-testid="v3-plan-vs-actual" aria-live="polite">
    <BodySectionHeading title="계획과 실제 거래 비교" />
    {current?.result ? <PlanVsActualComparison comparison={current.result} /> : current?.failed ? <>
      <p className="text-sm text-slate-600">저장 플랜을 불러오지 못했습니다. 비교 없이도 기존 초안 검토를 계속할 수 있습니다.</p>
      <Button type="button" variant="outline" onClick={() => { setState(null); setAttempt((value) => value + 1); }}>비교 다시 불러오기</Button>
    </> : <p className="text-sm text-slate-600">저장 플랜과 거래 근거를 비교하는 중...</p>}
  </Card>;
}
