import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import {
  type LegacyRunBackfillSummary,
  type MetricsRow,
  type MetricsSummaryCard,
  type PlanningFallbackCard,
  type PlanningFallbackEvent,
  type PlanningFallbackSourceRow,
  backlogLevel,
  fallbackLevelLabel,
  fallbackSourceKeyLabel,
  formatDateTime,
  formatMs,
  shortMeta,
} from "./shared";

export function OpsMetricsSummarySection({ cards }: { cards: MetricsSummaryCard[] }) {
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="metrics-summary">
      {cards.map((card) => (
        <Card className="p-4" key={card.title}>
          <p className="text-xs font-semibold text-slate-500">{card.title}</p>
          <p className="mt-1 text-lg font-black text-navy">{card.value}</p>
          <p className="mt-1 text-[11px] text-slate-600">{card.hint}</p>
        </Card>
      ))}
    </div>
  );
}

type OpsMetricsFallbackSectionProps = {
  lastEventAt?: string;
  cards: PlanningFallbackCard[];
  sourceRows: PlanningFallbackSourceRow[];
  recentEvents: PlanningFallbackEvent[] | undefined;
  legacyRunBackfill: LegacyRunBackfillSummary;
};

export function OpsMetricsFallbackSection({
  lastEventAt,
  cards,
  sourceRows,
  recentEvents,
  legacyRunBackfill,
}: OpsMetricsFallbackSectionProps) {
  const legacyBacklogStatus = backlogLevel(legacyRunBackfill);

  return (
    <Card className="mb-4 p-4" data-testid="planning-fallback-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-navy">Planning fallback usage</h2>
        <p className="text-xs text-slate-500">
          마지막 발생: {lastEventAt ? formatDateTime(lastEventAt) : "-"}
        </p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-slate-500">{card.title}</p>
            <p className="mt-1 text-lg font-black text-navy">{card.value.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-slate-600">최근 증가량 +{card.delta.toLocaleString()}</p>
            <p className={`mt-1 text-[11px] font-semibold ${
              card.level === "ok" ? "text-success" : card.level === "warn" ? "text-warning" : "text-danger"
            }`}
            >
              {card.levelLabel}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-600">Fallback source breakdown</p>
          <p className="text-[11px] text-slate-500">docs/planning-report-p4-observation-kit.md</p>
        </div>
        {sourceRows.length > 0 ? (
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {sourceRows.map((row) => (
              <div key={`${row.counterKey}-${row.sourceKey}`} className="rounded-lg border border-slate-200 bg-surface-muted p-2">
                <p className="text-[11px] font-semibold text-slate-500">{row.label}</p>
                <p className="mt-1 text-sm font-black text-navy">{fallbackSourceKeyLabel(row.sourceKey)}</p>
                <p className="text-[11px] text-slate-500">{row.sourceKey}</p>
                <p className="text-[11px] text-slate-600">count {row.count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">표준 source_key 기준 breakdown 데이터가 아직 없습니다.</p>
        )}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold text-slate-600">Recent fallback events</p>
        {recentEvents?.length ? (
          <div className="mt-2 space-y-2">
            {recentEvents.slice(0, 8).map((event, index) => (
              <div key={`${event.at}-${event.key}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                <p className="text-[11px] font-semibold text-navy">
                  {event.sourceKey ? fallbackSourceKeyLabel(event.sourceKey) : "unknown"} · {event.key}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {formatDateTime(event.at)} · source={event.source}
                  {event.runKind ? ` · kind=${event.runKind}` : ""}
                  {event.runId ? ` · run=${event.runId}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">최근 fallback 이벤트가 없습니다.</p>
        )}
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold text-slate-600">Legacy run backlog</p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-surface-muted p-2">
            <p className="text-[11px] font-semibold text-slate-500">Legacy candidates</p>
            <p className="mt-1 text-sm font-black text-navy">{legacyRunBackfill.legacyCandidates.toLocaleString()}</p>
            <p className="text-[11px] text-slate-600">user {legacyRunBackfill.userLegacyCandidates.toLocaleString()} / ops-doctor {legacyRunBackfill.opsDoctorLegacyCandidates.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-muted p-2">
            <p className="text-[11px] font-semibold text-slate-500">Canonical DTO gap</p>
            <p className="mt-1 text-sm font-black text-navy">{legacyRunBackfill.resultDtoOnlyCandidates.toLocaleString()}</p>
            <p className="text-[11px] text-slate-600">engine schema missing {legacyRunBackfill.missingEngineSchemaCandidates.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-muted p-2">
            <p className="text-[11px] font-semibold text-slate-500">Backlog status</p>
            <p className="mt-1 text-sm font-black text-navy">{fallbackLevelLabel(legacyBacklogStatus)}</p>
            <p className="text-[11px] text-slate-600">backfillable {legacyRunBackfill.missingResultDtoCandidates.toLocaleString()} / unreadable {legacyRunBackfill.unreadableCandidates.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-muted p-2">
            <p className="text-[11px] font-semibold text-slate-500">Run split</p>
            <p className="mt-1 text-sm font-black text-navy">user {legacyRunBackfill.userRuns.toLocaleString()}</p>
            <p className="text-[11px] text-slate-600">ops-doctor {legacyRunBackfill.opsDoctorRuns.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-muted p-2">
            <p className="text-[11px] font-semibold text-slate-500">Backfillable missing resultDto</p>
            <p className="mt-1 text-sm font-black text-navy">{legacyRunBackfill.missingResultDtoCandidates.toLocaleString()}</p>
            <p className="text-[11px] text-slate-600">total runs {legacyRunBackfill.totalRuns.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-surface-muted p-2">
            <p className="text-[11px] font-semibold text-slate-500">Unreadable meta</p>
            <p className="mt-1 text-sm font-black text-navy">{legacyRunBackfill.unreadableCandidates.toLocaleString()}</p>
            <p className="text-[11px] text-slate-600">separate investigation needed</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

type OpsMetricsFilterSectionProps = {
  eventType: string;
  eventTypes: string[];
  onChange: (value: string) => void;
};

export function OpsMetricsFilterSection({
  eventType,
  eventTypes,
  onChange,
}: OpsMetricsFilterSectionProps) {
  return (
    <Card className="mb-4 p-4">
      <h2 className="text-base font-black text-navy">필터</h2>
      <label className="mt-3 block text-xs text-slate-600">
        Event Type
        <select
          className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm md:max-w-[360px]"
          value={eventType}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">ALL</option>
          {eventTypes.map((row) => (
            <option key={row} value={row}>{row}</option>
          ))}
        </select>
      </label>
    </Card>
  );
}

type OpsMetricsEventsSectionProps = {
  rows: MetricsRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
};

export function OpsMetricsEventsSection({
  rows,
  loading,
  error,
  onRetry,
}: OpsMetricsEventsSectionProps) {
  return (
    <>
      {loading && rows.length < 1 ? <LoadingState className="mb-4" title="metrics를 불러오는 중입니다" /> : null}
      {error ? <ErrorState className="mb-4" message={error} onRetry={onRetry} retryLabel="다시 시도" /> : null}
      {!loading && !error && rows.length < 1 ? (
        <EmptyState
          className="mb-4"
          title="metrics 이벤트가 없습니다"
          description="조건에 맞는 이벤트가 없습니다."
          actionLabel="새로고침"
          onAction={onRetry}
          icon="data"
        />
      ) : null}

      {rows.length > 0 ? (
        <Card className="overflow-x-auto p-0" data-testid="metrics-events">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-surface-muted text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">시각</th>
                <th className="px-3 py-2 font-semibold">유형</th>
                <th className="px-3 py-2 font-semibold">상태</th>
                <th className="px-3 py-2 font-semibold">duration</th>
                <th className="px-3 py-2 font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.at}-${row.type}-${index}`} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(row.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-navy">{row.type}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.status ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatMs(row.durationMs)}</td>
                  <td className="max-w-[520px] px-3 py-2 text-slate-700">{shortMeta(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
