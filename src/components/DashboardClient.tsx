"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { withDevCsrf, writeDevCsrfToken } from "@/lib/dev/clientCsrf";
import {
  postPlanningRun,
  resolvePlanningRunIdempotencyRequest,
  type PendingPlanningRunRequest,
} from "@/components/planning/workspace/useWorkspaceRunExecutionActions";
import { PageShell } from "@/components/ui/PageShell";
import { cn } from "@/lib/utils";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import {
  DASHBOARD_REQUEST_TIMEOUT_ERROR_NAME,
  DASHBOARD_REQUEST_TIMEOUT_MESSAGE,
  INITIAL_DASHBOARD_STATE as INITIAL_STATE,
  asDashboardNumber as asNumber,
  asDashboardString as asString,
  fetchDashboardJson,
  formatDashboardDate as formatDate,
  formatDashboardDateTime as formatDateTime,
  formatDashboardKrw as formatKrw,
  formatDashboardPct as formatPct,
  formatDashboardRunStatus as formatRunStatus,
  getDashboardResourceLoadCopy,
  getDashboardRunActions as runActions,
  getDashboardRunCandidates as runCandidates,
  getDashboardRunSummary as runSummary,
  isDashboardRecord as isRecord,
  parseDashboardBenefits as parseBenefits,
  parseDashboardDataSources as parseDataSources,
  parseDashboardFxItems as parseFxItems,
  parseDashboardSourceStatuses as parseSourceStatuses,
  truncateDashboardText as truncate,
  type DashboardInitialViewModel,
  type DashboardState,
} from "@/components/dashboard/dashboardClientModel";

export {
  DASHBOARD_REQUEST_TIMEOUT_MESSAGE,
  DASHBOARD_REQUEST_TIMEOUT_MS,
  fetchDashboardJson,
  getDashboardResourceLoadCopy,
} from "@/components/dashboard/dashboardClientModel";
export type {
  DashboardCurrentPlan,
  DashboardCurrentProfile,
  DashboardInitialViewModel,
  DashboardRun,
  DashboardRunsLoadState,
} from "@/components/dashboard/dashboardClientModel";
type DashboardClientProps = {
  initialViewModel: DashboardInitialViewModel;
  csrf?: string;
};

const dashboardTextLinkClassName = "inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
const dashboardPrimaryButtonClassName = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
const dashboardSecondaryButtonClassName = "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function DashboardMetric({ label, value, description, emphasis = false, negative = false }: {
  label: string;
  value: string | number;
  description?: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="min-w-0" role="group" aria-label={label}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={cn("mt-2 break-words font-bold tracking-tight tabular-nums", emphasis ? "text-4xl sm:text-5xl" : "text-xl", negative ? "text-rose-800" : "text-navy")}>{value}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}

export function DashboardClient({ initialViewModel, csrf = "" }: DashboardClientProps) {
  const [state, setState] = useState<DashboardState>({
    ...INITIAL_STATE,
    runs: initialViewModel.runs,
    runsLoadState: initialViewModel.runsLoadState,
    runsErrorMessage: initialViewModel.runsErrorMessage,
  });
  const [loading, setLoading] = useState(true);
  const [hasOpenedSecondaryTools, setHasOpenedSecondaryTools] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState("");
  const rerunInFlight = useRef(false);
  const pendingRerun = useRef<PendingPlanningRunRequest | null>(null);

  useEffect(() => {
    if (!hasOpenedSecondaryTools) return;

    let cancelled = false;
    const controller = new AbortController();

    async function loadDashboard(): Promise<void> {
      setRefreshing(true);

      const nextState: DashboardState = {
        ...INITIAL_STATE,
        runs: initialViewModel.runs,
        runsLoadState: initialViewModel.runsLoadState,
        runsErrorMessage: initialViewModel.runsErrorMessage,
      };

      const results = await Promise.allSettled([
        fetchDashboardJson("/api/data-sources/status", { signal: controller.signal }),
        fetchDashboardJson("/api/sources/status", { signal: controller.signal }),
        fetchDashboardJson("/api/public/fx?pairs=USD:1000,JPY:100000,EUR:1000", { signal: controller.signal }),
        fetchDashboardJson("/api/public/exchange", { signal: controller.signal }),
        fetchDashboardJson("/api/public/benefits/search?limit=3&includeFacets=0", { signal: controller.signal }),
      ]);

      const labels = [
        "데이터 연결",
        "상품 소스",
        "환율 계산",
        "기준 환율",
        "혜택 탐색",
      ];
      const failedCount = results.filter((result) => result.status === "rejected").length;
      nextState.resourceLoadState = failedCount === 0
        ? "loaded"
        : failedCount === results.length
          ? "failed"
          : "partial";

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const timedOut = result.reason instanceof Error
            && result.reason.name === DASHBOARD_REQUEST_TIMEOUT_ERROR_NAME;
          nextState.warnings.push(
            timedOut
              ? `${labels[index]} ${DASHBOARD_REQUEST_TIMEOUT_MESSAGE}`
              : `${labels[index]} 정보를 불러오지 못했습니다.`,
          );
          return;
        }

        if (index === 0) nextState.dataSources = parseDataSources(result.value);
        if (index === 1) nextState.sourceStatuses = parseSourceStatuses(result.value);
        if (index === 2) nextState.fxItems = parseFxItems(result.value);
        if (index === 3) {
          const payload = isRecord(result.value) ? result.value : {};
          const data = isRecord(payload.data) ? payload.data : {};
          const rates = isRecord(data.rates) ? data.rates : {};
          nextState.exchangeAsOf = asString(data.asOf);
          nextState.exchangeUsdRate = asNumber(rates.USD);
        }
        if (index === 4) nextState.benefits = parseBenefits(result.value);
      });

      if (!cancelled) {
        setState(nextState);
        setLoading(false);
        setRefreshing(false);
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasOpenedSecondaryTools, initialViewModel]);

  const latestRun = state.runs[0] ?? null;
  const currentProfile = initialViewModel.currentProfile;
  const currentPlan = initialViewModel.currentPlan;
  const currentRun = "run" in currentPlan ? currentPlan.run : null;
  const currentSummary = useMemo(() => runSummary(currentRun), [currentRun]);
  const currentPlanningHref = currentProfile.state === "loaded"
    ? `/planning?profileId=${encodeURIComponent(currentProfile.id)}`
    : "/planning";
  const currentReportHref = currentRun
    ? `/planning/reports?runId=${encodeURIComponent(currentRun.id)}`
    : "/planning/reports";
  const currentPlanMessage = currentPlan.state === "current"
    ? "현재 저장 프로필과 같은 조건으로 계산된 플랜입니다."
    : currentPlan.state === "stale"
      ? "현재 프로필이 이 플랜 이후 변경되었습니다. 미래 결과를 다시 계산해야 합니다."
      : currentPlan.state === "unverified"
        ? "과거 실행이라 현재 프로필과 일치 여부를 자동 확인할 수 없습니다."
        : currentPlan.state === "failed"
          ? currentPlan.message
          : "현재 프로필로 저장한 플랜이 없습니다.";
  const runsLoadFailed = state.runsLoadState === "failed";

  async function rerunCurrentPlan(): Promise<void> {
    if (
      rerunInFlight.current
      || currentPlan.state !== "stale"
      || currentProfile.state !== "loaded"
      || currentPlan.run.profileId !== currentProfile.id
    ) return;

    setRerunError("");
    const snapshotId = currentPlan.rerunInput.snapshotId?.trim();
    // An omitted/latest snapshot would resolve today's conditions in the existing create API.
    if (!snapshotId || snapshotId.toLowerCase() === "latest") {
      setRerunError("이전 플랜의 기준 자료를 특정할 수 없습니다. 계산 조건을 검토해 주세요.");
      return;
    }

    rerunInFlight.current = true;
    setRerunning(true);
    try {
      const pending = resolvePlanningRunIdempotencyRequest({
        body: {
          profileId: currentProfile.id,
          rerunOfRunId: currentPlan.run.id,
          input: currentPlan.rerunInput,
        },
        pending: pendingRerun.current,
        createKey: () => crypto.randomUUID(),
      });
      // Keep the same key after uncertain responses and explicit retries, including after success until navigation.
      pendingRerun.current = pending;
      writeDevCsrfToken(csrf);
      const response = await postPlanningRun(
        withDevCsrf(JSON.parse(pending.bodyText)),
        pending.idempotencyKey,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (
        !response.ok
        || !isRecord(payload)
        || payload.ok !== true
        || !isRecord(payload.data)
        || !asString(payload.data.id)
        || payload.data.profileId !== currentProfile.id
      ) {
        const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
        throw new Error(
          error.code === "SNAPSHOT_NOT_FOUND"
            ? "이전 플랜의 기준 자료를 찾을 수 없습니다. 계산 조건을 검토해 주세요."
            : "다시 계산하지 못했습니다. 잠시 뒤 재시도하거나 계산 조건을 검토해 주세요.",
        );
      }
      window.location.assign(
        `/planning/reports?runId=${encodeURIComponent(asString(payload.data.id))}&profileId=${encodeURIComponent(currentProfile.id)}`,
      );
    } catch (error) {
      setRerunError(
        error instanceof Error
          ? error.message
          : "다시 계산하지 못했습니다. 잠시 뒤 재시도해 주세요.",
      );
      rerunInFlight.current = false;
      setRerunning(false);
    }
  }

  const latestActions = useMemo(() => runActions(latestRun), [latestRun]);
  const latestCandidates = useMemo(() => runCandidates(latestRun), [latestRun]);
  const configuredP0 = useMemo(
    () => state.dataSources.filter((row) => row.priority === "P0" && row.status?.state === "configured").length,
    [state.dataSources],
  );
  const totalP0 = useMemo(
    () => state.dataSources.filter((row) => row.priority === "P0").length,
    [state.dataSources],
  );
  const freshSources = useMemo(
    () => state.sourceStatuses.filter((row) => row.isFresh).length,
    [state.sourceStatuses],
  );
  const latestRunReportHref = latestRun ? `/planning/reports?runId=${encodeURIComponent(latestRun.id)}` : "/planning/reports";
  const nextActionRun = currentRun ?? latestRun;
  const nextActionRunSummary = useMemo(() => runSummary(nextActionRun), [nextActionRun]);
  const nextActionTarget = currentRun
    ? currentProfile.state === "loaded" ? `현재 프로필 ${currentProfile.name}` : "현재 프로필"
    : latestRun
      ? `최근 실행 ${truncate(latestRun.title || latestRun.id, 24)} · 프로필 ${truncate(latestRun.profileId, 24)}`
      : "";
  const nextActionSummary = nextActionRun
    ? nextActionRunSummary.topAction
      ? `${nextActionTarget}의 ${truncate(nextActionRunSummary.topAction, 48)} 항목을 먼저 확인하세요.`
      : `${nextActionTarget} 리포트를 다시 열어 재무 상태와 주의 신호부터 확인하세요.`
    : runsLoadFailed
      ? "최근 플랜을 다시 불러와 저장된 기록의 현재 상태부터 확인하세요."
      : "재무 상태 진단을 시작해 현재 입력 기준의 첫 리포트를 저장하세요.";
  const visibleWarnings = [
    ...(runsLoadFailed ? [state.runsErrorMessage || "최근 플랜 정보를 불러오지 못했습니다."] : []),
    ...state.warnings,
  ];
  const resourceLoadCopy = getDashboardResourceLoadCopy(state.resourceLoadState);

  return (
    <PageShell>
      <div className="space-y-8" data-testid="dashboard-root">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-semibold text-slate-500">재무 대시보드</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">내 재무 현황</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">현재 상태를 확인하고, 다음에 할 한 가지를 이어가세요.</p>
          </div>
          <button type="button" onClick={() => window.location.reload()} className={dashboardSecondaryButtonClassName}>
            {refreshing ? "새로고침 중..." : "새로고침"}
          </button>
        </header>

        <div className="grid items-start gap-8 xl:grid-cols-[1.15fr_1fr]" data-testid="dashboard-primary-workspace">
          <section aria-label="현재 재무 상태" data-testid="dashboard-current-state" className="min-w-0 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-navy">현재 재무 상태</h2>
              <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                {currentProfile.state === "loaded"
                  ? `기본 프로필: ${currentProfile.name} · 저장 시점 ${formatDateTime(currentProfile.updatedAt)}`
                  : "저장된 기본 프로필 기준"}
              </p>
            </div>
            {currentProfile.state === "loaded" ? (
              <>
                <div className="rounded-2xl bg-slate-100 p-6 sm:p-7">
                  <DashboardMetric label="월 잉여금" value={formatKrw(currentProfile.monthlySurplusKrw)} description="순수입 − 생활지출 − 최소 부채상환액" emphasis negative={currentProfile.monthlySurplusKrw < 0} />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
                  <DashboardMetric label="월 순수입" value={formatKrw(currentProfile.monthlyIncomeKrw)} />
                  <DashboardMetric label="월 생활지출" value={formatKrw(currentProfile.monthlyExpensesKrw)} description="필수지출 + 선택지출" />
                  <DashboardMetric label="월 최소 부채상환액" value={formatKrw(currentProfile.monthlyDebtPaymentKrw)} />
                  <DashboardMetric label="총 부채" value={formatKrw(currentProfile.totalDebtKrw)} />
                  <DashboardMetric label="현재 순자산" value={formatKrw(currentProfile.netWorthKrw)} description="자산과 목표 자금에서 부채를 뺀 금액" />
                </div>
                <p className="border-t border-slate-200 pt-4 text-sm leading-6 text-slate-500">플래닝 계산에서는 목표에 모은 금액을 현금성·투자자산과 별도 자금으로 반영합니다.</p>
              </>
            ) : currentProfile.state === "failed" ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
                <p>{currentProfile.message}</p>
                <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 font-semibold underline underline-offset-4">현재 프로필 다시 불러오기</button>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-100 p-6 sm:p-7">
                <p className="text-xl font-bold text-navy">수입과 지출부터 입력해 보세요.</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">아직 입력된 재무 정보가 없습니다. 입력한 금액으로 현재 상태를 확인하고 첫 플랜을 저장할 수 있습니다.</p>
                <Link href="/planning" prefetch={devPlanningPrefetch("/planning")} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">재무 상태 진단 시작</Link>
              </div>
            )}
          </section>

          <section aria-label="현재 프로필의 최근 플랜 결과" data-testid="dashboard-current-plan" data-state={currentPlan.state} className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div data-testid="dashboard-next-action">
              <p className="text-sm font-semibold text-primary">다음에 할 한 가지</p>
              <h2 className="mt-2 text-xl font-bold leading-8 tracking-tight text-navy">
                {currentPlan.state === "failed" ? "저장된 플랜을 다시 확인하세요" : currentPlan.state === "stale" ? "바뀐 재무 정보로 다시 계산하세요" : currentRun ? "저장된 결과에서 우선순위를 확인하세요" : "첫 재무 진단을 시작하세요"}
              </h2>
              <p className="mt-2 break-words text-sm leading-6 text-slate-600">{currentPlan.state === "stale" ? "프로필이 바뀌어 이전 결과와 현재 상태가 다릅니다. 이전 계산 조건으로 새 결과를 저장합니다." : nextActionSummary}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {currentPlan.state === "failed" ? (
                  <button type="button" onClick={() => window.location.reload()} className={dashboardPrimaryButtonClassName}>최근 플랜 다시 불러오기</button>
                ) : currentPlan.state === "stale" ? (
                  <button type="button" onClick={() => void rerunCurrentPlan()} disabled={rerunning} className={dashboardPrimaryButtonClassName}>
                    {rerunning ? "다시 계산 중..." : "현재 프로필로 다시 계산"}
                  </button>
                ) : currentRun ? (
                  <Link href={currentReportHref} prefetch={devPlanningPrefetch(currentReportHref)} className={dashboardPrimaryButtonClassName}>최근 플랜 리포트 보기</Link>
                ) : (
                  <Link href={currentPlanningHref} prefetch={devPlanningPrefetch(currentPlanningHref)} className={dashboardPrimaryButtonClassName}>재무 상태 진단 시작</Link>
                )}
              </div>
            </div>
            <div className="space-y-3 border-t border-slate-200 pt-5">
              <h3 className="text-base font-bold text-navy">최근 플랜 결과</h3>
              <p role={currentPlan.state === "failed" ? "alert" : "status"} className={cn("text-sm leading-6", currentPlan.state === "stale" || currentPlan.state === "failed" ? "font-medium text-amber-800" : "text-slate-600")}>{currentPlanMessage}</p>
              {currentPlan.state === "stale" ? (
                <div className="space-y-2 text-sm leading-6 text-slate-600">
                  <p>기간·정책·가정은 이전 플랜 조건을 사용합니다.</p>
                  {rerunError ? <p role="alert" className="rounded-lg bg-amber-50 p-3 font-semibold text-amber-900">{rerunError}</p> : null}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <Link href={currentPlanningHref} prefetch={devPlanningPrefetch(currentPlanningHref)} className={dashboardTextLinkClassName}>계산 조건 검토</Link>
                    <Link href={currentReportHref} prefetch={devPlanningPrefetch(currentReportHref)} className={dashboardTextLinkClassName}>최근 플랜 리포트 보기</Link>
                  </div>
                </div>
              ) : currentRun ? (
                <Link href={currentPlanningHref} prefetch={devPlanningPrefetch(currentPlanningHref)} className={dashboardTextLinkClassName}>현재 조건으로 다시 계산</Link>
              ) : null}
              {currentRun ? (
                <>
                  <p className="text-sm text-slate-500">최근 실행 {formatDateTime(currentRun.createdAt)} · {formatRunStatus(currentRun.overallStatus)}</p>
                  <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <DashboardMetric label="최저 현금" value={formatKrw(currentSummary.worstCashKrw)} description="시뮬레이션 기간 중" />
                    <DashboardMetric label="말기 순자산" value={formatKrw(currentSummary.endNetWorthKrw)} description={`${currentRun.input?.horizonMonths ?? "-"}개월 시뮬레이션 말기`} />
                  </div>
                  <p className="text-sm leading-6 text-slate-500">저장 당시 조건으로 계산한 미래 시뮬레이션 결과입니다. 현재 잔액이나 보장된 수익이 아닙니다.</p>
                </>
              ) : null}
            </div>
          </section>
        </div>

        {visibleWarnings.length > 0 ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" data-testid={`dashboard-resources-${state.resourceLoadState}`}>
            <p className="font-semibold">{resourceLoadCopy?.title ?? "일부 정보는 아직 준비되지 않았습니다."}</p>
            <p className="mt-1">{resourceLoadCopy?.guidance ?? "저장된 기록과 현재 재무 정보는 별도로 확인할 수 있습니다."}</p>
            <details className="mt-2">
              <summary className="cursor-pointer py-2 font-medium">불러오지 못한 정보 확인</summary>
              {visibleWarnings.map((message) => <p key={message}>{message}</p>)}
            </details>
            <Link href="/settings/data-sources" className={dashboardTextLinkClassName}>데이터 연결 설정 확인 →</Link>
          </div>
        ) : null}

        <section aria-labelledby="dashboard-recent-title" className="border-t border-slate-200 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="dashboard-recent-title" className="text-lg font-bold text-navy">최근 플랜</h2>
            <Link href="/planning/runs" prefetch={devPlanningPrefetch("/planning/runs")} className={dashboardTextLinkClassName}>전체 실행 보기 →</Link>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">모든 프로필의 최근 기록입니다. 저장 당시 조건의 미래 시뮬레이션 결과를 다시 보거나 입력 조건을 검토할 수 있습니다.</p>
          {runsLoadFailed ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900" data-testid="dashboard-runs-load-failed">
              <p className="font-semibold">최근 실행 기록을 불러오지 못했습니다.</p>
              <p>저장된 기록이 없다는 뜻은 아닙니다. 새로고침해 다시 확인해 주세요.</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-2 min-h-11 font-semibold underline underline-offset-4">다시 불러오기</button>
            </div>
          ) : state.runs.length < 1 ? (
            <p className="mt-4 rounded-xl bg-slate-100 p-5 text-sm leading-6 text-slate-600">저장된 실행이 아직 없습니다. 첫 플랜을 저장하면 이곳에서 다시 열 수 있습니다.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {state.runs.slice(0, 3).map((run) => {
                const summary = runSummary(run);
                return (
                  <article className="grid min-w-0 gap-4 py-5 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center" key={run.id}>
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-navy">{run.title || "플래닝 실행"}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{formatDate(run.createdAt)} · {formatRunStatus(run.overallStatus)} · {run.input?.horizonMonths ?? "-"}개월</p>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm leading-6 text-slate-600">
                      <p>말기 순자산 <span className="font-semibold tabular-nums text-navy">{formatKrw(summary.endNetWorthKrw)}</span></p>
                      <p>최저 현금 <span className="font-semibold tabular-nums text-navy">{formatKrw(summary.worstCashKrw)}</span></p>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 lg:flex-col lg:items-end">
                      <Link href={`/planning/reports?runId=${encodeURIComponent(run.id)}`} prefetch={devPlanningPrefetch("/planning/reports")} className={dashboardTextLinkClassName}>리포트 다시 보기 →</Link>
                      <Link href={`/planning?profileId=${encodeURIComponent(run.profileId)}`} prefetch={devPlanningPrefetch("/planning")} className="inline-flex min-h-11 items-center text-sm text-slate-600 underline underline-offset-4">같은 조건으로 다시 계산</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <details
          className="group rounded-xl border border-slate-200 bg-white"
          data-testid="dashboard-secondary-tools"
          onToggle={(event) => {
            if (event.currentTarget.open) setHasOpenedSecondaryTools(true);
          }}
        >
          <summary className="cursor-pointer px-5 py-5 text-base font-semibold text-navy outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-6">상품·혜택·환율과 데이터 상태 <span className="ml-2 text-sm font-normal text-slate-500">필요할 때 펼쳐보기</span></summary>
          <div className="space-y-8 border-t border-slate-200 px-5 py-6 sm:px-6">
            <nav aria-label="보조 도구" className="flex flex-wrap gap-x-6 gap-y-2">
              {[{ href: "/recommend", title: "조건에 맞는 상품 비교" }, { href: "/products/catalog", title: "상품 탐색" }, { href: "/public/dart", title: "공시 탐색" }, { href: "/benefits", title: "혜택 전체 보기" }, { href: "/tools/fx", title: "환율 계산기" }, { href: "/settings/data-sources", title: "데이터 연결 설정" }].map((item) => <Link key={item.href} href={item.href} className={dashboardTextLinkClassName}>{item.title} →</Link>)}
            </nav>
            <section className="space-y-3">
              <h2 className="text-base font-bold text-navy">플랜 액션과 비교 후보</h2>
              <p className="break-words text-sm leading-6 text-slate-500">{latestRun ? `최근 실행 ${latestRun.title || latestRun.id} · 프로필 ${latestRun.profileId} 대상 액션입니다.` : "플랜을 저장하면 실행 계획과 비교 후보를 확인할 수 있습니다."}</p>
              {latestActions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {latestActions.map((action) => (
                    <div key={action.code || action.title} className="py-3">
                      <p className="font-semibold text-navy">{action.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{action.summary}</p>
                      {action.steps.slice(0, 2).map((step) => <p key={step} className="text-sm leading-6 text-slate-500">{step}</p>)}
                      <Link href={action.href} className={dashboardTextLinkClassName}>액션 이어보기 →</Link>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">저장된 액션이 없습니다.</p>}
              {latestCandidates.map((candidate) => (
                <div key={candidate.id} className="space-y-1 border-t border-slate-100 py-3">
                  <p className="font-semibold text-navy">{candidate.productName}</p>
                  <p className="text-sm leading-6 text-slate-600">{candidate.providerName} · {candidate.termMonths ? `${candidate.termMonths}개월` : "기간 미상"} · 대표 금리 {candidate.rateMaxPct && candidate.rateMaxPct > (candidate.rateMinPct ?? 0) ? `${formatPct(candidate.rateMinPct)} ~ ${formatPct(candidate.rateMaxPct)}` : formatPct(candidate.rateMinPct)}</p>
                  <p className="text-sm leading-6 text-slate-500">{candidate.whyThis[0] || candidate.notes[0] || "상세 조건은 리포트에서 확인하세요."}</p>
                </div>
              ))}
              {latestRun ? <Link href={latestRunReportHref} className={dashboardTextLinkClassName}>실행 계획 보기 →</Link> : null}
            </section>
            <div className="grid gap-8 lg:grid-cols-2">
              <section className="space-y-3">
                <h2 className="text-base font-bold text-navy">혜택 바로보기</h2>
                {loading ? <p className="text-sm text-slate-500">보조 정보를 불러오는 중입니다.</p> : state.benefits.length > 0 ? state.benefits.map((item) => (
                  <div key={item.serviceId || item.title} className="space-y-1 border-b border-slate-100 pb-3">
                    <p className="text-sm font-semibold text-navy">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.org || "주관 기관 미상"}</p>
                    <p className="text-sm leading-6 text-slate-600">{item.summary}</p>
                  </div>
                )) : <p className="text-sm text-slate-500">혜택 정보가 없습니다. 혜택 탐색에서 데이터 상태와 조건을 확인해 주세요.</p>}
              </section>
              <section className="space-y-3">
                <h2 className="text-base font-bold text-navy">환율과 생활 도구</h2>
                {state.fxItems.map((item) => (
                  <div key={item.currency} className="border-b border-slate-100 pb-3 text-sm leading-6">
                    <p className="font-semibold text-navy">{item.currency} {item.amount.toLocaleString("ko-KR")} = {formatKrw(item.krw)}</p>
                    <p className="text-slate-500">적용 환율 {typeof item.rate === "number" ? item.rate.toLocaleString("ko-KR") : "-"} · 기준일 {item.asOfDate ? formatDate(item.asOfDate) : "미확인"}</p>
                  </div>
                ))}
                <p className="text-sm leading-6 text-slate-600">시장 기준 환율: USD 1 = {state.exchangeUsdRate ? `${state.exchangeUsdRate.toLocaleString("ko-KR")}원` : "-"} · 기준일 {state.exchangeAsOf || "미확인"}</p>
              </section>
            </div>
            <section className="space-y-3 border-t border-slate-200 pt-5">
              <h2 className="text-base font-bold text-navy">데이터 신뢰 상태</h2>
              <p className="text-sm leading-6 text-slate-600">주요 데이터 연결 {configuredP0}/{totalP0 || 0} · 최신 상품 데이터 {freshSources}/{state.sourceStatuses.length || 0}</p>
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {state.dataSources.filter((row) => row.priority === "P0").map((row) => (
                  <div key={row.id} className="text-sm leading-6">
                    <p className="font-medium text-navy">{row.label} · {row.status?.state === "configured" ? "설정됨" : "확인 필요"}</p>
                    {row.status?.message ? <p className="break-words text-slate-500">{row.status.message}</p> : null}
                  </div>
                ))}
                {state.sourceStatuses.map((row) => <p key={`${row.sourceId}:${row.kind}`} className="break-words text-sm leading-6 text-slate-600">{row.sourceId} · {row.kind} · {row.counts.toLocaleString("ko-KR")}건 · {row.isFresh ? "최신" : "갱신 필요"} · {formatDate(row.lastSyncedAt || "")}</p>)}
              </div>
            </section>
          </div>
        </details>
        <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-4">
          <Link href="/planning/reports" className={dashboardTextLinkClassName}>저장한 리포트</Link>
          <Link href="/help" className={dashboardTextLinkClassName}>사용 도움말</Link>
          <Link href="/feedback" className={dashboardTextLinkClassName}>의견 남기기</Link>
        </footer>
      </div>
    </PageShell>
  );
}
