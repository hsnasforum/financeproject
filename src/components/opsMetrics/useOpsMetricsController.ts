"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type EventsPayload,
  type LegacyRunBackfillSummary,
  type MetricsRow,
  type MetricsSummary,
  type PlanningFallbackDelta,
  type PlanningFallbackSummary,
  type SummaryPayload,
  asString,
  buildMetricsSummaryCards,
  buildPlanningFallbackCards,
  buildPlanningFallbackSourceRows,
  createEmptyLegacyRunBackfillSummary,
  createEmptyPlanningFallbackDelta,
  createEmptyPlanningFallbackSummary,
  mapEventsError,
  mapSummaryError,
  toFallbackSummary,
  toSafeCount,
} from "./shared";

export type OpsMetricsController = {
  rows: MetricsRow[];
  eventTypes: string[];
  eventType: string;
  setEventType: (value: string) => void;
  summary24h: MetricsSummary | undefined;
  summary7d: MetricsSummary | undefined;
  planningFallbacks: PlanningFallbackSummary;
  legacyRunBackfill: LegacyRunBackfillSummary;
  planningFallbackDelta: PlanningFallbackDelta;
  loading: boolean;
  error: string;
  loadMetrics: () => Promise<void>;
  summaryCards: ReturnType<typeof buildMetricsSummaryCards>;
  planningFallbackCards: ReturnType<typeof buildPlanningFallbackCards>;
  planningFallbackSourceRows: ReturnType<typeof buildPlanningFallbackSourceRows>;
};

export function useOpsMetricsController(): OpsMetricsController {
  const [rows, setRows] = useState<MetricsRow[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [summary24h, setSummary24h] = useState<MetricsSummary | undefined>(undefined);
  const [summary7d, setSummary7d] = useState<MetricsSummary | undefined>(undefined);
  const [planningFallbacks, setPlanningFallbacks] = useState<PlanningFallbackSummary>(createEmptyPlanningFallbackSummary());
  const [legacyRunBackfill, setLegacyRunBackfill] = useState<LegacyRunBackfillSummary>(createEmptyLegacyRunBackfillSummary());
  const [planningFallbackDelta, setPlanningFallbackDelta] = useState<PlanningFallbackDelta>(createEmptyPlanningFallbackDelta());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const previousFallbacksRef = useRef<PlanningFallbackSummary | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const eventsParams = new URLSearchParams();
      eventsParams.set("limit", "200");
      if (asString(eventType)) eventsParams.set("type", eventType);

      const [eventsRes, summaryRes] = await Promise.all([
        fetch(`/api/ops/metrics/events?${eventsParams.toString()}`, { cache: "no-store" }),
        fetch("/api/ops/metrics/summary?range=24h", { cache: "no-store" }),
      ]);

      const eventsPayload = (await eventsRes.json().catch(() => null)) as EventsPayload | null;
      const summaryPayload = (await summaryRes.json().catch(() => null)) as SummaryPayload | null;

      if (!eventsRes.ok || !eventsPayload?.ok || !Array.isArray(eventsPayload.data)) {
        throw mapEventsError(eventsPayload);
      }

      if (!summaryRes.ok || !summaryPayload?.ok || !summaryPayload.data) {
        throw mapSummaryError(summaryPayload);
      }

      setRows(eventsPayload.data);
      const nextTypes = Array.isArray(eventsPayload.meta?.types)
        ? eventsPayload.meta.types.map((row) => asString(row)).filter((row) => row.length > 0)
        : [];
      setEventTypes(nextTypes);
      setSummary24h(summaryPayload.data.last24h);
      setSummary7d(summaryPayload.data.last7d);
      const nextFallbacks = toFallbackSummary(summaryPayload.data.planningFallbacks);
      setLegacyRunBackfill({
        totalRuns: toSafeCount(summaryPayload.data.legacyRunBackfill?.totalRuns),
        opsDoctorRuns: toSafeCount(summaryPayload.data.legacyRunBackfill?.opsDoctorRuns),
        userRuns: toSafeCount(summaryPayload.data.legacyRunBackfill?.userRuns),
        legacyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.legacyCandidates),
        opsDoctorLegacyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.opsDoctorLegacyCandidates),
        userLegacyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.userLegacyCandidates),
        resultDtoOnlyCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.resultDtoOnlyCandidates),
        missingResultDtoCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.missingResultDtoCandidates),
        missingEngineSchemaCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.missingEngineSchemaCandidates),
        unreadableCandidates: toSafeCount(summaryPayload.data.legacyRunBackfill?.unreadableCandidates),
      });
      const previousFallbacks = previousFallbacksRef.current;
      const delta: PlanningFallbackDelta = previousFallbacks
        ? {
          engineEnvelopeFallbackCount: Math.max(
            0,
            nextFallbacks.engineEnvelopeFallbackCount - previousFallbacks.engineEnvelopeFallbackCount,
          ),
          reportContractFallbackCount: Math.max(
            0,
            nextFallbacks.reportContractFallbackCount - previousFallbacks.reportContractFallbackCount,
          ),
          runEngineMigrationCount: Math.max(
            0,
            nextFallbacks.runEngineMigrationCount - previousFallbacks.runEngineMigrationCount,
          ),
        }
        : createEmptyPlanningFallbackDelta();
      setPlanningFallbackDelta(delta);
      setPlanningFallbacks(nextFallbacks);
      previousFallbacksRef.current = nextFallbacks;
    } catch (loadError) {
      setRows([]);
      setEventTypes([]);
      setSummary24h(undefined);
      setSummary7d(undefined);
      setLegacyRunBackfill(createEmptyLegacyRunBackfillSummary());
      setPlanningFallbackDelta(createEmptyPlanningFallbackDelta());
      setError(loadError instanceof Error ? loadError.message : "metrics를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [eventType]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMetrics();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadMetrics]);

  const summaryCards = useMemo(() => buildMetricsSummaryCards(summary24h, summary7d), [summary24h, summary7d]);
  const planningFallbackCards = useMemo(
    () => buildPlanningFallbackCards(planningFallbacks, planningFallbackDelta),
    [planningFallbackDelta, planningFallbacks],
  );
  const planningFallbackSourceRows = useMemo(
    () => buildPlanningFallbackSourceRows(planningFallbacks),
    [planningFallbacks],
  );

  return {
    rows,
    eventTypes,
    eventType,
    setEventType,
    summary24h,
    summary7d,
    planningFallbacks,
    legacyRunBackfill,
    planningFallbackDelta,
    loading,
    error,
    loadMetrics,
    summaryCards,
    planningFallbackCards,
    planningFallbackSourceRows,
  };
}
