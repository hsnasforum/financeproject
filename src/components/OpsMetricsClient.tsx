"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import {
  OpsMetricsEventsSection,
  OpsMetricsFallbackSection,
  OpsMetricsFilterSection,
  OpsMetricsSummarySection,
} from "./opsMetrics/sections";
import { useOpsMetricsController } from "./opsMetrics/useOpsMetricsController";

export function OpsMetricsClient() {
  const {
    rows,
    eventTypes,
    eventType,
    setEventType,
    planningFallbacks,
    legacyRunBackfill,
    loading,
    error,
    loadMetrics,
    summaryCards,
    planningFallbackCards,
    planningFallbackSourceRows,
  } = useOpsMetricsController();

  return (
    <PageShell>
      <div data-testid="ops-metrics">
        <PageHeader
          title="Ops Metrics"
          description="로컬 운영 메트릭 추이 (최근 이벤트 + 24h/7d 요약)"
          action={(
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { void loadMetrics(); }} disabled={loading}>
                {loading ? "새로고침 중..." : "새로고침"}
              </Button>
              <Link href="/ops/doctor">
                <Button type="button" size="sm" variant="outline">Ops Doctor</Button>
              </Link>
              <Link href="/ops">
                <Button type="button" size="sm" variant="outline">Ops 허브</Button>
              </Link>
            </div>
          )}
        />

        <OpsMetricsSummarySection cards={summaryCards} />

        <OpsMetricsFallbackSection
          lastEventAt={planningFallbacks.lastEventAt}
          cards={planningFallbackCards}
          sourceRows={planningFallbackSourceRows}
          recentEvents={planningFallbacks.recentEvents}
          legacyRunBackfill={legacyRunBackfill}
        />

        <OpsMetricsFilterSection
          eventType={eventType}
          eventTypes={eventTypes}
          onChange={setEventType}
        />

        <OpsMetricsEventsSection
          rows={rows}
          loading={loading}
          error={error}
          onRetry={() => { void loadMetrics(); }}
        />
      </div>
    </PageShell>
  );
}
