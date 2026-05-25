import Link from "next/link";
import { DevUnlockShortcutMessage } from "@/components/DevUnlockShortcutLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { OPS_DASHBOARD_AUTO_RUN_INTERVALS } from "@/lib/ops/dashboard/autoRun";
import {
  asString,
  formatDateTime,
  formatDelta,
  isOpsActionId,
  issueBadgeClass,
  readSchedulerPolicyDelta,
  schedulerDeltaBadgeClass,
  schedulerModeText,
  schedulerStatusBadgeClass,
  severityText,
  statusBadgeClass,
  toSafeDomId,
  type OpsDashboardDialogsState,
  type OpsDashboardDoctorState,
  type OpsDashboardPageHeaderState,
  type OpsDashboardQuickActionsState,
  type OpsDashboardRecentEventsState,
  type OpsDashboardSchedulerState,
  type OpsDashboardTopNoticesState,
  QUICK_ACTIONS,
} from "./shared";

type TopNoticesProps = {
  pageHeader: OpsDashboardPageHeaderState;
  topNotices: OpsDashboardTopNoticesState;
};

type SchedulerProps = {
  scheduler: OpsDashboardSchedulerState;
};

type DoctorProps = {
  doctor: OpsDashboardDoctorState;
};

type QuickActionsProps = {
  quickActions: OpsDashboardQuickActionsState;
};

type RecentEventsProps = {
  recentEvents: OpsDashboardRecentEventsState;
};

type DialogsProps = {
  dialogs: OpsDashboardDialogsState;
};

export function OpsDashboardTopNoticesSection({
  pageHeader,
  topNotices,
}: TopNoticesProps) {
  return (
    <>
      {!topNotices.hasCsrf ? <ErrorState className="mb-4" message="Dev unlock/CSRF가 필요합니다." /> : null}
      {topNotices.error ? (
        <ErrorState
          className="mb-4"
          message={topNotices.error}
          onRetry={() => void topNotices.onRetry()}
          retryLabel="다시 시도"
        />
      ) : null}
      {topNotices.notice ? (
        <Card className="mb-4 border border-primary/20 bg-primary/5 p-3 text-sm font-semibold text-navy">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{topNotices.notice}</span>
            <Link href="/ops/audit" className="underline">/ops/audit</Link>
          </div>
        </Card>
      ) : null}
      {topNotices.autoRunAlert ? (
        <Card className="mb-4 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black">자동 실행 오류 알림</p>
              <p className="mt-1 text-xs font-semibold">
                {formatDateTime(topNotices.autoRunAlert.at)} · {topNotices.autoRunAlert.source === "scheduled" ? "스케줄 실행" : "수동 실행"}
              </p>
              <p className="mt-1 text-sm">
                {topNotices.autoRunAlert.failedLabel ? `${topNotices.autoRunAlert.failedLabel} · ` : ""}{topNotices.autoRunAlert.message}
              </p>
              <p className="mt-1 text-xs">
                완료 {topNotices.autoRunAlert.completedCount}/{topNotices.autoRunAlert.total}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={topNotices.onDismissAutoRunAlert}>닫기</Button>
          </div>
        </Card>
      ) : null}
      {topNotices.toast ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[60]">
          <div
            className={`pointer-events-auto min-w-[280px] max-w-[440px] rounded-xl border px-3 py-2 text-sm shadow-xl ${
              topNotices.toast.type === "success"
                ? "border-primary/30 bg-primary/5 text-navy"
                : topNotices.toast.type === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : "border-slate-300 bg-surface-muted text-navy"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{topNotices.toast.message}</p>
              <button
                type="button"
                className="rounded-md border border-current/20 px-2 py-0.5 text-xs"
                onClick={topNotices.onDismissToast}
                aria-label="알림 닫기"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {topNotices.autoRunSummary ? (
        <Card className="mb-4 border border-slate-200 bg-surface-muted p-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-navy">
              최근 자동 실행: {formatDateTime(topNotices.autoRunSummary.ranAt)}
            </p>
            <span className="text-xs text-slate-600">
              완료 {topNotices.autoRunSummary.completed.length}/{topNotices.autoRunSummary.total}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            완료 항목: {topNotices.autoRunSummary.completed.length > 0 ? topNotices.autoRunSummary.completed.join(", ") : "-"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            스케줄: {topNotices.autoRunPolicy.enabled ? `ON · ${topNotices.autoRunPolicy.intervalMinutes}분` : "OFF"} · 위험 작업 자동 포함: {topNotices.autoRunPolicy.includeDangerous ? "ON" : "OFF"}
          </p>
          {topNotices.autoRunSummary.errorMessage ? (
            <p className="mt-1 text-xs font-semibold text-rose-700">
              실패: {topNotices.autoRunSummary.failedLabel ?? "-"} · {topNotices.autoRunSummary.errorMessage}
            </p>
          ) : null}
        </Card>
      ) : null}
      {pageHeader.loading && !topNotices.hasReport ? <LoadingState className="mb-4" title="OPS 대시보드를 로딩하는 중입니다." /> : null}
    </>
  );
}

export function OpsDashboardSchedulerSection({ scheduler }: SchedulerProps) {
  return (
    <Card className="mb-4 border border-slate-200 bg-surface-muted p-3 text-sm text-slate-700" data-testid="ops-scheduler-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-navy">스케줄러 최근 실행</p>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerStatusBadgeClass(scheduler.schedulerSummary?.level ?? "OK")}`}>
            {scheduler.schedulerSummary?.level === "RISK" ? "위험" : scheduler.schedulerSummary?.level === "WARN" ? "주의" : "정상"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <Link href="/ops/metrics?type=SCHEDULED_TASK" className="underline">
            metrics 보기
          </Link>
          <Link href="/ops/audit?eventType=SCHEDULED_TASK&taskName=OPS_SCHEDULER_HEALTH" className="underline">
            audit 보기
          </Link>
          <Link href="/ops/audit?eventType=OPS_SCHEDULER_POLICY_UPDATE" className="underline">
            임계치 변경 로그
          </Link>
        </div>
      </div>
      {scheduler.schedulerRows.length > 0 ? (
        <>
          <p className="mt-1 text-xs text-slate-600">
            성공 {scheduler.schedulerSummary?.success ?? 0} · 실패 {scheduler.schedulerSummary?.failed ?? 0}
            {typeof scheduler.schedulerSummary?.consecutiveFailures === "number" ? ` · 연속 실패 ${scheduler.schedulerSummary.consecutiveFailures}` : ""}
            {scheduler.schedulerSummary?.thresholds ? ` (주의 ${scheduler.schedulerSummary.thresholds.warnConsecutiveFailures} / 위험 ${scheduler.schedulerSummary.thresholds.riskConsecutiveFailures})` : ""}
            {scheduler.schedulerSummary?.latestAt ? ` · 마지막 ${formatDateTime(scheduler.schedulerSummary.latestAt)}` : ""}
          </p>
          <div className="mt-2 rounded-md border border-slate-200 bg-white p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">연속 실패 임계치 설정</p>
              <p className="text-[11px] text-slate-500">
                {scheduler.schedulerPolicyMeta?.source === "file"
                  ? (scheduler.schedulerPolicyMeta.updatedAt ? `정책 파일 적용 · 업데이트 ${formatDateTime(scheduler.schedulerPolicyMeta.updatedAt)}` : "정책 파일 적용")
                  : scheduler.schedulerPolicyMeta?.valid === false
                    ? "정책 파일 오류로 ENV 기본값 사용 중"
                    : "정책 파일 미저장(ENV 기본값 사용)"}
              </p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <label className="text-xs text-slate-700">
                <span className="font-semibold">주의(WARN)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={scheduler.schedulerPolicyDraft.warnConsecutiveFailures}
                  onChange={(event) => {
                    scheduler.onSchedulerPolicyDraftChange("warnConsecutiveFailures", event.target.value);
                  }}
                  className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2 text-xs"
                  disabled={scheduler.schedulerPolicySaving}
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">위험(RISK)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={scheduler.schedulerPolicyDraft.riskConsecutiveFailures}
                  onChange={(event) => {
                    scheduler.onSchedulerPolicyDraftChange("riskConsecutiveFailures", event.target.value);
                  }}
                  className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2 text-xs"
                  disabled={scheduler.schedulerPolicySaving}
                />
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void scheduler.onSaveSchedulerPolicy();
                  }}
                  disabled={scheduler.schedulerPolicySaving || !scheduler.hasCsrf}
                >
                  {scheduler.schedulerPolicySaving ? "저장 중..." : "임계치 저장"}
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={scheduler.onResetSchedulerPolicyDraft}
                  disabled={scheduler.schedulerPolicySaving}
                >
                  현재값으로 되돌리기
                </Button>
              </div>
            </div>
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void scheduler.onResetSchedulerPolicyToDefaults();
                }}
                disabled={scheduler.schedulerPolicySaving || !scheduler.hasCsrf}
              >
                ENV 기본값으로 초기화
              </Button>
            </div>
            {scheduler.schedulerPolicyMeta?.valid === false && scheduler.schedulerPolicyMeta.errors.length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                정책 파일 오류: {scheduler.schedulerPolicyMeta.errors.join(", ")}
              </p>
            ) : null}
            {scheduler.schedulerPolicyError ? (
              <DevUnlockShortcutMessage
                className="mt-2 text-xs font-semibold text-rose-700"
                linkClassName="text-rose-700"
                message={scheduler.schedulerPolicyError}
              />
            ) : null}
          </div>
          {scheduler.schedulerPolicyHistoryRows.length > 0 ? (
            <div className="mt-2 rounded-md border border-slate-200 bg-white p-2.5">
              <p className="text-xs font-semibold text-slate-700">최근 임계치 변경 히스토리</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {scheduler.schedulerPolicyHistoryRows.map((row, index) => {
                  const diff = readSchedulerPolicyDelta(row);
                  return (
                    <li
                      key={`${row.eventType}:${row.at}:${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-surface-muted px-2 py-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-800">{row.meta?.reset ? "초기화" : "변경"}</span>
                        {typeof diff.warnDelta === "number" ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerDeltaBadgeClass(diff.warnDelta)}`}>
                            WARN {formatDelta(diff.warnDelta)}
                          </span>
                        ) : null}
                        {typeof diff.riskDelta === "number" ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerDeltaBadgeClass(diff.riskDelta)}`}>
                            RISK {formatDelta(diff.riskDelta)}
                          </span>
                        ) : null}
                        {typeof diff.warnBefore === "number" && typeof diff.warnAfter === "number" && typeof diff.riskBefore === "number" && typeof diff.riskAfter === "number" ? (
                          <span className="text-slate-500">
                            ({diff.warnBefore}/{diff.riskBefore} → {diff.warnAfter}/{diff.riskAfter})
                          </span>
                        ) : null}
                      </div>
                      <span className="text-slate-500">{formatDateTime(row.at)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p className="mt-1 text-xs text-slate-600">
            마지막 성공 {scheduler.schedulerSummary?.lastSuccessAt ? formatDateTime(scheduler.schedulerSummary.lastSuccessAt) : "-"} · 마지막 실패 {scheduler.schedulerSummary?.lastFailedAt ? formatDateTime(scheduler.schedulerSummary.lastFailedAt) : "-"}
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {scheduler.schedulerRows.map((row, index) => (
              <li
                key={`${row.ts}:${row.mode}:${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.ok ? "border-primary/20 bg-primary/5 text-navy" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                    {row.ok ? "SUCCESS" : "FAILED"}
                  </span>
                  <span className="font-semibold text-slate-800">{schedulerModeText(row.mode)}</span>
                  <span className="text-slate-500">exit={row.exitCode}</span>
                </div>
                <span className="text-slate-500">{formatDateTime(row.ts)}</span>
              </li>
            ))}
          </ul>
          {(scheduler.schedulerLogs.stdout.length > 0 || scheduler.schedulerLogs.stderr.length > 0) ? (
            <details className="mt-3 rounded-md border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">scheduler 로그 미리보기</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold text-slate-600">stdout</p>
                  <pre className="mt-1 max-h-36 overflow-auto rounded border border-slate-200 bg-surface-muted p-2 text-[11px] text-slate-700">
                    {scheduler.schedulerLogs.stdout.length > 0 ? scheduler.schedulerLogs.stdout.join("\n") : "-"}
                  </pre>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-600">stderr</p>
                  <pre className="mt-1 max-h-36 overflow-auto rounded border border-slate-200 bg-surface-muted p-2 text-[11px] text-slate-700">
                    {scheduler.schedulerLogs.stderr.length > 0 ? scheduler.schedulerLogs.stderr.join("\n") : "-"}
                  </pre>
                </div>
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-slate-600">표시할 스케줄러 실행 로그가 없습니다.</p>
      )}
    </Card>
  );
}

export function OpsDashboardDoctorSection({ doctor }: DoctorProps) {
  return (
    <>
      {doctor.report ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-navy">운영 상태 요약</h2>
            <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-bold ${statusBadgeClass(doctor.report.summary.fail < 1, doctor.report.summary.warn)}`} data-testid="ops-status-badge">
              {doctor.summaryLabel}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4 text-sm">
            <div className="rounded-md border border-slate-200 bg-surface-muted px-3 py-2">generatedAt: <span className="font-semibold">{formatDateTime(doctor.report.generatedAt)}</span></div>
            <div className="rounded-md border border-slate-200 bg-surface-muted px-3 py-2">PASS: <span className="font-semibold">{doctor.report.summary.pass}</span></div>
            <div className="rounded-md border border-slate-200 bg-surface-muted px-3 py-2">WARN: <span className="font-semibold">{doctor.report.summary.warn}</span></div>
            <div className="rounded-md border border-slate-200 bg-surface-muted px-3 py-2">FAIL: <span className="font-semibold">{doctor.report.summary.fail}</span></div>
          </div>
        </Card>
      ) : null}

      {doctor.issues.length < 1 && !doctor.loading ? (
        <EmptyState
          className="mb-4"
          icon="default"
          title="표시할 운영 이슈가 없습니다"
          description="doctor 결과가 없거나 모든 항목이 정상입니다."
        />
      ) : null}

      {doctor.issues.length > 0 ? (
        <Card className="mb-4 p-4" data-testid="ops-issues">
          <h2 className="text-base font-black text-navy">우선순위 이슈 큐</h2>
          <div className="mt-3 space-y-2">
            {doctor.issues.map((issue) => {
              const fixHref = issue.fix?.href;
              const fixActionId = isOpsActionId(issue.fix?.actionId) ? issue.fix.actionId : undefined;
              const fixLabel = issue.fix?.label ?? "Fix";
              return (
                <div key={issue.id} className="rounded-lg border border-slate-200 bg-surface-muted p-3" data-testid={`ops-issue-${toSafeDomId(issue.id)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-navy">{issue.title}</p>
                      <p className="text-xs text-slate-600">{issue.id}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${issueBadgeClass(issue.severity)}`}>
                      {severityText(issue.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{issue.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {fixHref ? (
                      <Link href={fixHref}>
                        <Button type="button" size="sm" variant="outline" data-testid={`ops-fix-${toSafeDomId(issue.id)}`}>{fixLabel}</Button>
                      </Link>
                    ) : null}
                    {fixActionId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid={`ops-fix-${toSafeDomId(issue.id)}`}
                        disabled={doctor.actionRunning.length > 0}
                        onClick={() => {
                          void doctor.onStartActionWithPreview(fixActionId, fixLabel);
                        }}
                      >
                        {doctor.actionRunning === fixActionId ? "실행 중..." : fixLabel}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </>
  );
}

export function OpsDashboardQuickActionsSection({ quickActions }: QuickActionsProps) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-black text-navy">원클릭 액션</h2>
      <div className="mt-3 rounded-lg border border-slate-200 bg-surface-muted p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">자동 실행 대상 선택</p>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              quickActions.autoRunPolicy.enabled
                ? "border-primary/30 bg-primary/5 text-navy"
                : "border-slate-300 bg-white text-slate-600"
            }`}>
              {quickActions.autoRunPolicy.enabled ? "스케줄 ON" : "스케줄 OFF"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={quickActions.onRestoreSafeDefaults}
              disabled={quickActions.autoRunning || quickActions.actionRunning.length > 0}
            >
              안전 기본값 복원
            </Button>
          </div>
        </div>
        <div className="mt-2 grid gap-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-2">
            <span className="font-semibold">주기 자동 실행</span>
            <input
              type="checkbox"
              checked={quickActions.autoRunPolicy.enabled}
              disabled={!quickActions.hasCsrf || quickActions.autoRunning}
              onChange={(event) => {
                quickActions.onAutoRunPolicyEnabledChange(event.target.checked);
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="font-semibold">주기</span>
            <select
              value={String(quickActions.autoRunPolicy.intervalMinutes)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              onChange={(event) => {
                const parsed = Math.trunc(Number(event.target.value));
                if (!OPS_DASHBOARD_AUTO_RUN_INTERVALS.includes(parsed as (typeof OPS_DASHBOARD_AUTO_RUN_INTERVALS)[number])) return;
                quickActions.onAutoRunPolicyIntervalChange(parsed as typeof quickActions.autoRunPolicy.intervalMinutes);
              }}
              disabled={quickActions.autoRunning}
            >
              {OPS_DASHBOARD_AUTO_RUN_INTERVALS.map((minutes) => (
                <option key={`auto-run-interval-${minutes}`} value={minutes}>
                  {minutes}분
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="font-semibold">위험 작업 포함</span>
            <input
              type="checkbox"
              checked={quickActions.autoRunPolicy.includeDangerous}
              disabled={quickActions.autoRunning}
              onChange={(event) => {
                quickActions.onAutoRunPolicyIncludeDangerousChange(event.target.checked);
              }}
            />
          </label>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => (
            <label
              key={`auto-select-${action.id}`}
              className="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <span className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={Boolean(quickActions.autoRunSelection[action.id])}
                  disabled={quickActions.autoRunning || quickActions.actionRunning.length > 0}
                  onChange={() => quickActions.onToggleAutoRunAction(action.id)}
                />
                {action.label}
              </span>
              {action.dangerous ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  위험
                </span>
              ) : null}
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <p>기본값은 안전 작업만 선택됩니다.</p>
          <div className="flex items-center gap-2">
            <span>
              브라우저 알림: {quickActions.notificationPermission === "granted" ? "허용" : quickActions.notificationPermission === "denied" ? "차단" : quickActions.notificationPermission === "default" ? "미결정" : "미지원"}
            </span>
            {quickActions.notificationPermission !== "unsupported" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => { void quickActions.onRequestBrowserNotificationPermission(); }}>
                알림 권한 요청
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={quickActions.actionRunning.length > 0 || quickActions.autoRunning || !quickActions.hasCsrf}
            onClick={() => {
              void quickActions.onStartActionWithPreview(action.id, action.label);
            }}
          >
            {quickActions.actionRunning === action.id ? "실행 중..." : action.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={quickActions.autoRunning || quickActions.actionRunning.length > 0 || !quickActions.hasCsrf || quickActions.selectedAutoRunActions.length < 1}
          onClick={() => {
            void quickActions.onRunQuickActionsAuto();
          }}
        >
          {quickActions.autoRunning ? "자동 실행 중..." : `선택 항목 자동 실행 (${quickActions.selectedAutoRunActions.length})`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => quickActions.onOpenDangerousLinkConfirm("/ops/security", "Vault reset 페이지 이동 확인", "OPEN OPS_SECURITY")}
          disabled={quickActions.autoRunning}
        >
          Vault reset 페이지 열기
        </Button>
      </div>
    </Card>
  );
}

export function OpsDashboardRecentEventsSection({ recentEvents }: RecentEventsProps) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-black text-navy">최근 이벤트 미리보기</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">Audit</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {recentEvents.auditRows.slice(0, 6).map((row, index) => (
              <li key={`${row.eventType}:${row.at}:${index}`}>{row.eventType} · {formatDateTime(row.at)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700">Metrics</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {recentEvents.metricRows.slice(0, 6).map((row, index) => (
              <li key={`${row.type}:${row.at}:${index}`}>{row.type} · {asString(row.meta?.status) || "-"}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function OpsDashboardConfirmModalSection({ dialogs }: DialogsProps) {
  if (!dialogs.confirmModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-danger-title"
      data-testid="ops-preview-modal"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <h3 id="ops-danger-title" className="text-base font-black text-navy">{dialogs.confirmModal.title}</h3>
        <p className="mt-2 text-sm text-slate-700">{dialogs.confirmModal.description}</p>
        {dialogs.confirmModal.type === "action" && dialogs.confirmModal.summary ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-surface-muted p-2 text-xs text-slate-700">
            {dialogs.confirmModal.summary.counts ? (
              <p>
                {Object.entries(dialogs.confirmModal.summary.counts).map(([key, value]) => `${key}=${value}`).join(", ")}
              </p>
            ) : null}
            {Array.isArray(dialogs.confirmModal.summary.ids) && dialogs.confirmModal.summary.ids.length > 0 ? (
              <p className="mt-1">ids: {dialogs.confirmModal.summary.ids.join(", ")}{dialogs.confirmModal.summary.truncated ? " ..." : ""}</p>
            ) : null}
            {!Array.isArray(dialogs.confirmModal.summary.ids) && Array.isArray((dialogs.confirmModal.summary as { sampleIds?: string[] }).sampleIds) && (dialogs.confirmModal.summary as { sampleIds?: string[] }).sampleIds!.length > 0 ? (
              <p className="mt-1">ids: {(dialogs.confirmModal.summary as { sampleIds?: string[] }).sampleIds!.join(", ")}{dialogs.confirmModal.summary.truncated ? " ..." : ""}</p>
            ) : null}
          </div>
        ) : null}
        {dialogs.confirmModal.type === "autoRun" ? (
          <div className="mt-3 rounded-md border border-slate-200 bg-surface-muted p-2 text-xs text-slate-700">
            <p className="font-semibold text-navy">
              실행 대상: {dialogs.confirmModal.actions.length}개
            </p>
            <ul className="mt-1 space-y-1">
              {dialogs.confirmModal.actions.map((item) => (
                <li key={`auto-run-confirm-${item.id}`} className="flex items-center justify-between gap-2">
                  <span>{item.label}</span>
                  {item.dangerous ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      위험
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {dialogs.confirmModal.dangerous ? (
              <p className="mt-2 font-semibold text-amber-700">
                위험 작업이 포함되어 있습니다. 실행 전 대상 항목을 다시 확인해 주세요.
              </p>
            ) : null}
          </div>
        ) : null}
        {dialogs.confirmModal.confirmText ? (
          <>
            <p className="mt-3 text-xs font-semibold text-slate-800">확인 문구: <span className="font-black">{dialogs.confirmModal.confirmText}</span></p>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={dialogs.confirmInput}
              onChange={(event) => dialogs.onConfirmInputChange(event.target.value)}
              placeholder={dialogs.confirmModal.confirmText}
            />
          </>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={dialogs.onCloseConfirmModal} data-testid="ops-preview-cancel">취소</Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            data-testid="ops-preview-confirm"
            onClick={() => {
              void dialogs.onExecuteModal();
            }}
            disabled={Boolean(dialogs.confirmModal.confirmText) && dialogs.confirmInput.trim() !== asString(dialogs.confirmModal.confirmText)}
          >
            {dialogs.confirmModal.type === "autoRun" ? "자동 실행 시작" : "계속 진행"}
          </Button>
        </div>
      </div>
    </div>
  );
}
