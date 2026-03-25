"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  bodyCompactFieldClassName,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { Badge } from "@/components/ui/Badge";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { buildConfirmString } from "@/lib/ops/confirm";
import {
  appendProfileIdQuery,
  normalizeProfileId,
  PLANNING_SELECTED_PROFILE_STORAGE_KEY,
} from "@/lib/planning/profileScope";
import { RUN_SECTION_IDS } from "@/lib/planning/navigation/sectionIds";
import { parsePlanningV2Response } from "@/lib/planning/api/contracts";
import { resolveReportResultDtoFromRun } from "@/lib/planning/reports/reportInputContract";
import {
  type PlanningProfileRecord,
  type PlanningRunActionPlan,
  type PlanningRunActionProgress,
  type PlanningRunActionStatus,
  type PlanningRunRecord,
} from "@/lib/planning/store/types";
import { diffRuns } from "@/lib/planning/v2/diffRuns";
import { summarizeRunDiff } from "@/lib/planning/v2/insights/whyChanged";
import { cn } from "@/lib/utils";

type PlanningRunsClientProps = {
  initialSelectedRunId?: string;
  initialFilterProfileId?: string;
};

type ActionProgressSummary = {
  total: number;
  done: number;
  doing: number;
  todo: number;
  snoozed: number;
  completionPct: number;
};

type RunActionCenterPayload = {
  plan: PlanningRunActionPlan;
  progress: PlanningRunActionProgress;
};

type ShareMaskLevel = "light" | "standard" | "strict";

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toResultDto(run: PlanningRunRecord) {
  return resolveReportResultDtoFromRun(run);
}

function runFlags(run: PlanningRunRecord): {
  hasMonteCarlo: boolean;
  hasActions: boolean;
  hasDebt: boolean;
  warningsCount: number;
  criticalHealthCount: number;
} {
  const dto = toResultDto(run);
  return {
    hasMonteCarlo: Boolean(dto.monteCarlo),
    hasActions: Boolean(dto.actions?.items?.length),
    hasDebt: Boolean(dto.debt),
    warningsCount: Math.max(0, Math.trunc(dto.summary.totalWarnings ?? dto.warnings.aggregated.length)),
    criticalHealthCount: run.meta.health?.criticalCount ?? 0,
  };
}

export function PlanningRunsClient({
  initialSelectedRunId = "",
  initialFilterProfileId = "",
}: PlanningRunsClientProps) {
  const isMountedRef = useRef(true);
  const profilesRequestIdRef = useRef(0);
  const runsRequestIdRef = useRef(0);
  const actionCenterRequestIdRef = useRef(0);
  const [profiles, setProfiles] = useState<PlanningProfileRecord[]>([]);
  const [runs, setRuns] = useState<PlanningRunRecord[]>([]);
  const [filterProfileId, setFilterProfileId] = useState(normalizeProfileId(initialFilterProfileId));
  const [selectedRunId, setSelectedRunId] = useState(initialSelectedRunId);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [actionProgressSummaryByRun, setActionProgressSummaryByRun] = useState<Record<string, ActionProgressSummary>>({});
  const [selectedActionPlan, setSelectedActionPlan] = useState<PlanningRunActionPlan | null>(null);
  const [selectedActionProgress, setSelectedActionProgress] = useState<PlanningRunActionProgress | null>(null);
  const [actionNoteDrafts, setActionNoteDrafts] = useState<Record<string, string>>({});
  const [actionCenterLoading, setActionCenterLoading] = useState(false);
  const [actionCenterError, setActionCenterError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [shareMaskLevel, setShareMaskLevel] = useState<ShareMaskLevel>("standard");
  const [deleteTargetRunId, setDeleteTargetRunId] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [restoreTargetRunId, setRestoreTargetRunId] = useState("");
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreWorking, setRestoreWorking] = useState(false);
  const runsRef = useRef<PlanningRunRecord[]>([]);
  const selectedRunIdRef = useRef(initialSelectedRunId);
  const selectedActionCenterRunIdRef = useRef("");

  function pushNotice(message: string): void {
    if (!isMountedRef.current) return;
    setNotice(message);
    setError("");
  }

  function pushError(message: string): void {
    if (!isMountedRef.current) return;
    setError(message);
    setNotice("");
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const compareResult = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const first = runs.find((run) => run.id === compareIds[0]);
    const second = runs.find((run) => run.id === compareIds[1]);
    if (!first || !second) return null;
    return {
      base: first,
      other: second,
      diff: diffRuns(first, second),
    };
  }, [compareIds, runs]);

  const compareWhyChanged = useMemo(() => {
    if (!compareResult) return null;
    const baseDto = toResultDto(compareResult.base);
    const compareDto = toResultDto(compareResult.other);
    return summarizeRunDiff({
      base: baseDto,
      compare: compareDto,
      baseLabel: compareResult.base.title || compareResult.base.id.slice(0, 8),
      compareLabel: compareResult.other.title || compareResult.other.id.slice(0, 8),
    });
  }, [compareResult]);

  async function loadProfiles(): Promise<void> {
    const requestId = profilesRequestIdRef.current + 1;
    profilesRequestIdRef.current = requestId;
    try {
      const res = await fetch("/api/planning/v2/profiles", { cache: "no-store" });
      const rawPayload = await res.json().catch(() => null);
      const payload = parsePlanningV2Response<PlanningProfileRecord[]>(rawPayload);
      if (!isMountedRef.current || profilesRequestIdRef.current !== requestId) return;
      if (!payload.ok || !Array.isArray(payload.data)) {
        setProfiles([]);
        return;
      }
      setProfiles(payload.data);
    } catch {
      if (!isMountedRef.current || profilesRequestIdRef.current !== requestId) return;
      setProfiles([]);
    }
  }

  async function loadRunFallback(runId: string): Promise<PlanningRunRecord | null> {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) return null;
    try {
      const res = await fetch(`/api/planning/v2/runs/${encodeURIComponent(normalizedRunId)}`, { cache: "no-store" });
      const rawPayload = await res.json().catch(() => null);
      const payload = parsePlanningV2Response<PlanningRunRecord>(rawPayload);
      if (!res.ok || !payload.ok || !payload.data) return null;
      return payload.data;
    } catch {
      return null;
    }
  }

  async function loadRuns(profileId = filterProfileId): Promise<void> {
    const requestId = runsRequestIdRef.current + 1;
    runsRequestIdRef.current = requestId;
    const hadPreviousRuns = runsRef.current.length > 0;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (profileId) params.set("profileId", profileId);
      params.set("limit", "200");

      const res = await fetch(`/api/planning/v2/runs?${params.toString()}`, { cache: "no-store" });
      const rawPayload = await res.json().catch(() => null);
      const payload = parsePlanningV2Response<PlanningRunRecord[]>(rawPayload);
      if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
      const payloadMeta = payload.ok
        ? ((payload.meta ?? {}) as { actionProgressSummaryByRunId?: Record<string, ActionProgressSummary> })
        : {};
      const runRows = payload.ok && Array.isArray(payload.data) ? payload.data : null;
      if (!runRows) {
        const fallbackRunId = selectedRunIdRef.current || initialSelectedRunId;
        const fallbackRun = await loadRunFallback(fallbackRunId);
        if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
        if (fallbackRun && (!profileId || fallbackRun.profileId === profileId)) {
          setRuns([fallbackRun]);
          setSelectedRunId(fallbackRun.id);
          setCompareIds([]);
          setActionProgressSummaryByRun({});
          pushNotice("일시적인 문제로 선택한 실행 기록만 먼저 불러왔습니다.");
          return;
        }
        if (hadPreviousRuns) {
          pushNotice("일시적인 문제로 최신 실행 기록을 다시 불러오지 못해 이전 목록을 유지했습니다.");
          return;
        }
        setRuns([]);
        setSelectedRunId("");
        setCompareIds([]);
        pushError(payload.ok ? "실행 기록을 불러오지 못했습니다." : (payload.error.message ?? "실행 기록을 불러오지 못했습니다."));
        return;
      }

      setRuns(runRows);
      setSelectedRunId((previous) => {
        if (runRows.some((item) => item.id === previous)) {
          return previous;
        }
        if (initialSelectedRunId && runRows.some((item) => item.id === initialSelectedRunId)) {
          return initialSelectedRunId;
        }
        return runRows[0]?.id ?? "";
      });
      setCompareIds((prev) => prev.filter((id) => runRows.some((item) => item.id === id)).slice(0, 2));
      const summaries = payloadMeta.actionProgressSummaryByRunId;
      if (summaries && typeof summaries === "object") {
        setActionProgressSummaryByRun(summaries);
      } else {
        void loadActionProgressSummaryForRuns(runRows, requestId);
      }
    } catch (error) {
      if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
      const fallbackRunId = selectedRunIdRef.current || initialSelectedRunId;
      const fallbackRun = await loadRunFallback(fallbackRunId);
      if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
      if (fallbackRun && (!profileId || fallbackRun.profileId === profileId)) {
        setRuns([fallbackRun]);
        setSelectedRunId(fallbackRun.id);
        setCompareIds([]);
        setActionProgressSummaryByRun({});
        pushNotice("일시적인 문제로 선택한 실행 기록만 먼저 불러왔습니다.");
        return;
      }
      if (hadPreviousRuns) {
        pushNotice("일시적인 문제로 최신 실행 기록을 다시 불러오지 못해 이전 목록을 유지했습니다.");
        return;
      }
      setRuns([]);
      setSelectedRunId("");
      setCompareIds([]);
      setActionProgressSummaryByRun({});
      pushError(error instanceof Error ? error.message : "실행 기록 조회 중 오류가 발생했습니다.");
    } finally {
      if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
      setLoading(false);
    }
  }
  const loadRunsRef = useRef(loadRuns);
  loadRunsRef.current = loadRuns;
  const scheduleLoadSelectedActionCenter = useEffectEvent((runId: string, requestId: number) => {
    void loadSelectedActionCenter(runId, requestId);
  });

  async function loadActionProgressSummaryForRuns(runRows: PlanningRunRecord[], requestId: number): Promise<void> {
    if (runRows.length < 1) {
      if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
      setActionProgressSummaryByRun({});
      return;
    }
    const next: Record<string, ActionProgressSummary> = {};
    await Promise.all(runRows.map(async (run) => {
      try {
      const response = await fetch(`/api/planning/runs/${encodeURIComponent(run.id)}/action-progress`, { cache: "no-store" });
        const rawPayload = await response.json().catch(() => null);
        const payload = parsePlanningV2Response<PlanningRunActionProgress>(rawPayload);
        const payloadMeta = payload.ok
          ? ((payload.meta ?? {}) as { summary?: ActionProgressSummary })
          : {};
        if (!response.ok || !payload.ok) return;
        const summary = payloadMeta.summary;
        if (!summary) return;
        next[run.id] = summary;
      } catch {
        // ignore per-run action summary failures
      }
    }));
    if (!isMountedRef.current || runsRequestIdRef.current !== requestId) return;
    setActionProgressSummaryByRun(next);
  }

  async function loadSelectedActionCenter(runId: string, requestId = actionCenterRequestIdRef.current + 1): Promise<void> {
    actionCenterRequestIdRef.current = requestId;
    if (!runId) {
      if (!isMountedRef.current || actionCenterRequestIdRef.current !== requestId) return;
      selectedActionCenterRunIdRef.current = "";
      setSelectedActionPlan(null);
      setSelectedActionProgress(null);
      setActionNoteDrafts({});
      setActionCenterError("");
      setActionCenterLoading(false);
      return;
    }
    setActionCenterLoading(true);
    setActionCenterError("");
    const keepPreviousActionCenter = (message: string): boolean => {
      if (selectedActionCenterRunIdRef.current !== runId || !selectedActionPlan || !selectedActionProgress) {
        return false;
      }
      pushNotice(message);
      setActionCenterError("");
      return true;
    };
    try {
      const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const rawPayload = await response.json().catch(() => null);
      const payload = parsePlanningV2Response<PlanningRunRecord>(rawPayload);
      if (!isMountedRef.current || actionCenterRequestIdRef.current !== requestId) return;
      if (!payload.ok) {
        if (!keepPreviousActionCenter("Action Center 새로고침에 실패해 이전 상태를 유지했습니다.")) {
          setSelectedActionPlan(null);
          setSelectedActionProgress(null);
          setActionNoteDrafts({});
          setActionCenterError(payload.error.message ?? "Action Center를 불러오지 못했습니다.");
        }
        return;
      }
      if (!response.ok || !payload.data) {
        if (!keepPreviousActionCenter("Action Center 새로고침에 실패해 이전 상태를 유지했습니다.")) {
          setSelectedActionPlan(null);
          setSelectedActionProgress(null);
          setActionNoteDrafts({});
          setActionCenterError("Action Center를 불러오지 못했습니다.");
        }
        return;
      }
      const actionCenter = payload.data.actionCenter as RunActionCenterPayload | undefined;
      if (!actionCenter?.plan || !actionCenter.progress) {
        if (!keepPreviousActionCenter("Action Center 최신 상태를 불러오지 못해 이전 데이터를 유지했습니다.")) {
          setSelectedActionPlan(null);
          setSelectedActionProgress(null);
          setActionNoteDrafts({});
          setActionCenterError("Action Center 데이터를 찾을 수 없습니다.");
        }
        return;
      }
      selectedActionCenterRunIdRef.current = runId;
      setSelectedActionPlan(actionCenter.plan);
      setSelectedActionProgress(actionCenter.progress);
      const draftByKey = Object.fromEntries(actionCenter.progress.items.map((item) => [item.actionKey, item.note ?? ""]));
      setActionNoteDrafts(draftByKey);
      const summary = {
        total: actionCenter.progress.items.length,
        done: actionCenter.progress.items.filter((item) => item.status === "done").length,
        doing: actionCenter.progress.items.filter((item) => item.status === "doing").length,
        todo: actionCenter.progress.items.filter((item) => item.status === "todo").length,
        snoozed: actionCenter.progress.items.filter((item) => item.status === "snoozed").length,
        completionPct: actionCenter.progress.items.length > 0
          ? Math.round((actionCenter.progress.items.filter((item) => item.status === "done").length / actionCenter.progress.items.length) * 100)
          : 0,
      };
      setActionProgressSummaryByRun((prev) => ({
        ...prev,
        [runId]: summary,
      }));
    } catch (error) {
      if (!isMountedRef.current || actionCenterRequestIdRef.current !== requestId) return;
      if (!keepPreviousActionCenter("Action Center 새로고침에 실패해 이전 상태를 유지했습니다.")) {
        setSelectedActionPlan(null);
        setSelectedActionProgress(null);
        setActionNoteDrafts({});
        setActionCenterError(error instanceof Error ? error.message : "Action Center 로드에 실패했습니다.");
      }
    } finally {
      if (!isMountedRef.current || actionCenterRequestIdRef.current !== requestId) return;
      setActionCenterLoading(false);
    }
  }

  async function patchActionProgress(
    runId: string,
    actionKey: string,
    patch: { status?: PlanningRunActionStatus; note?: string },
  ): Promise<void> {
    try {
      const response = await fetch(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          actionKey,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        })),
      });
      const rawPayload = await response.json().catch(() => null);
      const payload = parsePlanningV2Response<{
        progress?: PlanningRunActionProgress;
        completion?: { done?: number; total?: number; pct?: number };
      }>(rawPayload);
      if (!payload.ok) {
        pushError(payload.error.message ?? "Action progress 업데이트에 실패했습니다.");
        return;
      }
      if (!response.ok || !payload.data?.progress) {
        pushError("Action progress 업데이트에 실패했습니다.");
        return;
      }
      setSelectedActionProgress(payload.data.progress);
      const updatedItem = payload.data.progress.items.find((item) => item.actionKey === actionKey);
      setActionNoteDrafts((prev) => ({
        ...prev,
        [actionKey]: updatedItem?.note ?? "",
      }));
      const completion = payload.data.completion;
      const summary: ActionProgressSummary = {
        total: Number(completion?.total ?? payload.data.progress.items.length),
        done: Number(completion?.done ?? payload.data.progress.items.filter((item) => item.status === "done").length),
        doing: payload.data.progress.items.filter((item) => item.status === "doing").length,
        todo: payload.data.progress.items.filter((item) => item.status === "todo").length,
        snoozed: payload.data.progress.items.filter((item) => item.status === "snoozed").length,
        completionPct: Number(completion?.pct ?? 0),
      };
      setActionProgressSummaryByRun((prev) => ({
        ...prev,
        [runId]: summary,
      }));
    } catch (error) {
      pushError(error instanceof Error ? error.message : "Action progress 업데이트에 실패했습니다.");
    }
  }

  useEffect(() => {
    if (filterProfileId) return;
    try {
      const stored = normalizeProfileId(window.localStorage.getItem(PLANNING_SELECTED_PROFILE_STORAGE_KEY));
      if (stored) {
        setFilterProfileId(stored);
      }
    } catch {
      // ignore storage failures
    }
  }, [filterProfileId]);

  useEffect(() => {
    try {
      if (filterProfileId) {
        window.localStorage.setItem(PLANNING_SELECTED_PROFILE_STORAGE_KEY, filterProfileId);
      }
    } catch {
      // ignore storage failures
    }
  }, [filterProfileId]);

  useEffect(() => {
    void loadProfiles();
  }, []);

  useEffect(() => {
    void loadRunsRef.current(filterProfileId);
  }, [filterProfileId]);

  useEffect(() => {
    if (!selectedRun) {
      actionCenterRequestIdRef.current += 1;
      setSelectedActionPlan(null);
      setSelectedActionProgress(null);
      setActionNoteDrafts({});
      setActionCenterError("");
      setActionCenterLoading(false);
      return;
    }
    const requestId = actionCenterRequestIdRef.current + 1;
    actionCenterRequestIdRef.current = requestId;
    setActionCenterLoading(true);
    setSelectedActionPlan(null);
    setSelectedActionProgress(null);
    setActionNoteDrafts({});
    setActionCenterError("");
    const timeoutId = window.setTimeout(() => {
      scheduleLoadSelectedActionCenter(selectedRun.id, requestId);
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedRun]);

  function toggleCompare(id: string): void {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }

  function openDeleteRunDialog(runId: string): void {
    const expectedConfirm = buildConfirmString("DELETE run", runId);
    setDeleteTargetRunId(runId);
    setDeleteConfirmText(expectedConfirm);
    setError("");
    setNotice("");
  }

  function closeDeleteRunDialog(): void {
    setDeleteTargetRunId("");
    setDeleteConfirmText("");
  }

  function closeRestoreRunDialog(): void {
    setRestoreTargetRunId("");
    setRestoreConfirmText("");
  }

  async function submitDeleteRunAction(): Promise<void> {
    const runId = deleteTargetRunId;
    if (!runId) return;
    const expectedConfirm = buildConfirmString("DELETE run", runId);
    if (deleteConfirmText.trim() !== expectedConfirm) {
      pushError(`삭제 확인 문구가 일치하지 않습니다. (${expectedConfirm})`);
      return;
    }

    setDeleteWorking(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ confirmText: deleteConfirmText.trim() })),
      });
      const rawPayload = await res.json().catch(() => null);
      const payload = parsePlanningV2Response<{ deleted?: boolean }>(rawPayload);
      if (!payload.ok) {
        pushError(payload.error.message ?? "실행 기록 삭제에 실패했습니다.");
        return;
      }
      if (!res.ok) {
        pushError("실행 기록 삭제에 실패했습니다.");
        return;
      }

      await loadRuns(filterProfileId);
      closeDeleteRunDialog();
      const expectedRestoreConfirm = buildConfirmString("RESTORE runs", runId);
      setRestoreTargetRunId(runId);
      setRestoreConfirmText(expectedRestoreConfirm);
      pushNotice("실행 기록을 휴지통으로 이동했습니다. 필요하면 바로 복구 확인을 진행하세요.");
    } catch (error) {
      pushError(error instanceof Error ? error.message : "실행 기록 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleteWorking(false);
    }
  }

  async function submitRestoreRunAction(): Promise<void> {
    const runId = restoreTargetRunId;
    if (!runId) return;
    const expectedConfirm = buildConfirmString("RESTORE runs", runId);
    if (restoreConfirmText.trim() !== expectedConfirm) {
      pushError(`복구 확인 문구가 일치하지 않습니다. (${expectedConfirm})`);
      return;
    }

    setRestoreWorking(true);
    setError("");
    setNotice("");
    try {
      const restoreRes = await fetch("/api/planning/v2/trash/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          kind: "runs",
          id: runId,
          confirmText: restoreConfirmText.trim(),
        })),
      });
      const restoreRaw = await restoreRes.json().catch(() => null);
      const restorePayload = parsePlanningV2Response<{ restored?: boolean }>(restoreRaw);
      if (!restorePayload.ok) {
        pushError(restorePayload.error.message ?? "복구에 실패했습니다.");
        return;
      }
      if (!restoreRes.ok) {
        pushError("복구에 실패했습니다.");
        return;
      }
      await loadRuns(filterProfileId);
      closeRestoreRunDialog();
      pushNotice("실행 기록을 복구했습니다.");
    } catch (error) {
      pushError(error instanceof Error ? error.message : "복구 중 오류가 발생했습니다.");
    } finally {
      setRestoreWorking(false);
    }
  }

  async function copyRunJsonAction(run: PlanningRunRecord): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${JSON.stringify(run, null, 2)}\n`);
      pushNotice("실행 기록 JSON을 클립보드에 복사했습니다.");
    } catch (error) {
      pushError(error instanceof Error ? error.message : "복사에 실패했습니다.");
    }
  }

  const selectedDto = useMemo(
    () => (selectedRun ? toResultDto(selectedRun) : null),
    [selectedRun],
  );
  const selectedSummary = asRecord(selectedDto?.summary);
  const deleteExpectedConfirm = deleteTargetRunId ? buildConfirmString("DELETE run", deleteTargetRunId) : "";
  const restoreExpectedConfirm = restoreTargetRunId ? buildConfirmString("RESTORE runs", restoreTargetRunId) : "";
  const handlePrint = (): void => {
    if (typeof window === "undefined") return;
    window.print();
  };

  return (
    <PageShell className="bg-slate-50">
      <PageHeader
        title="실행 기록"
        description="저장된 실행을 다시 읽고 비교하며, 필요하면 상세 리포트와 다음 확인 단계로 이어 보는 화면입니다."
        action={(
          <div className="no-print flex items-center gap-3">
            <Button
              data-testid="runs-print-button"
              onClick={handlePrint}
              size="sm"
              variant="outline"
              className="rounded-full font-bold h-9 bg-white"
            >
              PDF 인쇄
            </Button>
            <Link href={appendProfileIdQuery("/planning", filterProfileId)}>
              <Button variant="primary" className="rounded-full font-bold h-9">플래닝으로 돌아가기</Button>
            </Link>
          </div>
        )}
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        이 화면은 확정 답안 목록이 아니라, 저장된 실행을 다시 읽고 서로 비교하거나 상세 리포트로 이어 보는 기록 관리 단계입니다.
      </p>

      <Card className="mb-6 border-amber-100 bg-amber-50/50 p-4 rounded-2xl">
        <div className="flex gap-3">
          <span className="text-amber-500 font-bold">!</span>
          <div>
            <p className="text-sm font-bold text-amber-900">실행 기록은 저장 당시 조건 기준 비교 기록입니다.</p>
            <p className="mt-0.5 text-xs text-amber-700/80">서로 비교할 때는 snapshot/asOf, health 경고, override 차이가 왜 생겼는지 함께 확인하세요.</p>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="mb-4 border-rose-100 bg-rose-50/50 p-4 rounded-2xl">
          <p className="text-sm font-bold text-rose-700">{error}</p>
        </Card>
      )}
      {notice && (
        <Card className="mb-4 border-emerald-100 bg-emerald-50/50 p-4 rounded-2xl">
          <p className="text-sm font-bold text-emerald-700">{notice}</p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <SubSectionHeader
            title="실행 목록"
            description="프로필별로 저장된 실행을 좁혀 보고, 상세로 열 실행과 비교할 두 실행을 고릅니다."
            action={
              <div className="no-print flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">프로필</span>
                  <select
                    className={cn(bodyCompactFieldClassName, "h-8 text-[11px] font-bold rounded-lg border-slate-200")}
                    value={filterProfileId}
                    onChange={(event) => setFilterProfileId(event.target.value)}
                  >
                    <option value="">전체</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">마스킹</span>
                  <select
                    className={cn(bodyCompactFieldClassName, "h-8 text-[11px] font-bold rounded-lg border-slate-200")}
                    value={shareMaskLevel}
                    onChange={(event) => setShareMaskLevel(event.target.value as ShareMaskLevel)}
                  >
                    <option value="light">light</option>
                    <option value="standard">standard</option>
                    <option value="strict">strict</option>
                  </select>
                </div>
                <Button disabled={loading} onClick={() => void loadRuns(filterProfileId)} size="sm" variant="ghost" className="h-8 px-3 text-xs font-bold text-slate-500">새로고침</Button>
              </div>
            }
          />

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
            <table className="min-w-full text-left text-[11px] text-slate-700" data-testid="planning-runs-table">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="no-print px-4 py-3">비교</th>
                  <th className="px-4 py-3">실행 기록</th>
                  <th className="px-4 py-3">생성시각</th>
                  <th className="px-4 py-3">snapshot</th>
                  <th className="px-4 py-3">치명경고</th>
                  <th className="px-4 py-3">완료율</th>
                  <th className="px-4 py-3">M/A/D</th>
                  <th className="no-print px-4 py-3 text-right">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {runs.length === 0 ? (
                  <tr>
                    <td className="px-4 py-12 text-center" colSpan={8}>
                      <p className="text-sm font-bold text-slate-400">저장된 실행 기록이 없습니다.</p>
                      <p className="mt-2 text-xs font-medium text-slate-400">플래닝에서 실행을 저장하면 여기서 비교와 상세 확인을 이어 할 수 있습니다.</p>
                    </td>
                  </tr>
                ) : runs.map((run) => {
                  const checked = compareIds.includes(run.id);
                  const flags = runFlags(run);
                  const snapshotLabel = run.meta.snapshot?.id || run.meta.snapshot?.asOf || "latest/missing";
                  const completion = actionProgressSummaryByRun[run.id];
                  return (
                    <tr className={cn("hover:bg-slate-50/50 transition-colors", selectedRunId === run.id && "bg-emerald-50")} key={run.id}>
                      <td className="no-print px-4 py-3">
                        <input
                          checked={checked}
                          onChange={() => toggleCompare(run.id)}
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="font-bold text-slate-900 hover:text-emerald-600 hover:underline text-left"
                          onClick={() => setSelectedRunId(run.id)}
                          type="button"
                        >
                          {run.title || run.id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(run.createdAt)}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{snapshotLabel}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={flags.criticalHealthCount > 0 ? "destructive" : "secondary"} className="text-[9px] px-1.5 h-4 min-w-[1.25rem] justify-center">
                          {flags.criticalHealthCount}
                        </Badge>
                      </td>
                      <td className="px-4 py-3" data-testid={`run-action-completion-${run.id}`}>
                        <span className="font-bold text-slate-600">
                          {completion ? `${completion.done}/${completion.total} (${completion.completionPct}%)` : "0/0 (0%)"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-400">{flags.hasMonteCarlo ? "M" : "-"}/{flags.hasActions ? "A" : "-"}/{flags.hasDebt ? "D" : "-"}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Link
                          className="text-emerald-600 font-bold hover:underline"
                          href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(run.id)}`, run.profileId)}
                        >
                          리포트 보기
                        </Link>
                        <button
                          className="text-rose-600 font-bold hover:underline"
                          onClick={() => openDeleteRunDialog(run.id)}
                          type="button"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <SubSectionHeader
              title="실행 기록 상세"
              description="선택한 실행이 언제 저장됐는지와 핵심 결과를 먼저 보고, 다음 단계로 상세 리포트로 이어 갑니다."
            />
            {!selectedRun ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                목록에서 실행을 하나 고르면 저장 시점과 다음 확인 경로를 여기서 바로 읽을 수 있습니다.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl bg-emerald-600 p-6 text-white shadow-xl shadow-emerald-900/20">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100 mb-4">선택한 실행</p>
                  <h3 className="text-xl font-black tracking-tight">{selectedRun.title || selectedRun.id.slice(0, 8)}</h3>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-emerald-50/90">
                    저장 당시 결과를 다시 읽고, 필요하면 상세 리포트에서 추천 비교 자료와 후속 행동까지 이어 볼 수 있습니다.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-emerald-100/70 uppercase">생성 시각</p>
                      <p className="text-sm font-bold">{formatDateTime(selectedRun.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-emerald-100/70 uppercase">종료 순자산</p>
                      <p className="text-sm font-bold text-white">{formatNumber(selectedSummary.endNetWorthKrw)}원</p>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black rounded-lg border-white/20 bg-white/5 hover:bg-white/10" onClick={() => void copyRunJsonAction(selectedRun)}>JSON 복사</Button>
                    <Link
                      className="inline-flex items-center h-8 rounded-lg bg-white px-3 text-[10px] font-black text-emerald-600 hover:bg-emerald-50 transition-colors shadow-sm"
                      href={appendProfileIdQuery(`/planning/reports/${encodeURIComponent(selectedRun.id)}`, selectedRun.profileId)}
                    >
                      상세 리포트 보기 →
                    </Link>
                  </div>
                  <p className="mt-3 text-[11px] font-medium leading-relaxed text-emerald-100/80">
                    상세 리포트에서는 실행 비교, 추천 비교 자료, 추가 혜택 후보를 이어서 확인할 수 있습니다.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">최저 현금</p>
                    <p className="text-sm font-black text-slate-900">{formatNumber(selectedSummary.worstCashKrw)}원</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">목표 달성</p>
                    <p className="text-sm font-black text-slate-900">{selectedDto?.summary.goalsAchieved ? `${selectedDto.summary.goalsAchieved.achieved}/${selectedDto.summary.goalsAchieved.total}` : "-"}</p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6" data-testid="run-action-center" id={RUN_SECTION_IDS.actionCenter}>
            <SubSectionHeader
              title="후속 행동 정리"
              description="저장된 액션 체크리스트의 진행 상태와 메모를 정리하는 영역입니다."
            />
            {!selectedRun ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                실행을 선택하면 저장 당시 후속 행동과 메모를 여기서 이어 정리할 수 있습니다.
              </p>
            ) : actionCenterLoading ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 italic">로딩 중...</p>
            ) : actionCenterError ? (
              <p className="p-4 text-center text-sm font-bold text-rose-600 bg-rose-50 rounded-xl border border-rose-100">{actionCenterError}</p>
            ) : !selectedActionPlan || !selectedActionProgress ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 italic">저장된 액션 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-bold text-slate-600">완료율 {actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0}%</p>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0}%` }} />
                  </div>
                </div>

                <div className="space-y-3 mt-6">
                  {selectedActionPlan.items.map((item) => {
                    const progress = selectedActionProgress.items.find((row) => row.actionKey === item.actionKey);
                    const status = progress?.status ?? "todo";
                    const noteValue = actionNoteDrafts[item.actionKey] ?? "";
                    return (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100" key={item.actionKey}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-900">{item.title}</p>
                            <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">{item.description}</p>
                          </div>
                          <Badge variant="secondary" className={cn("text-[9px] uppercase font-black",
                            status === 'done' ? "bg-emerald-100 text-emerald-700" :
                            status === 'doing' ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-600"
                          )}>
                            {status}
                          </Badge>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <select
                            className={cn(bodyCompactFieldClassName, "h-8 text-[11px] font-bold rounded-lg bg-white border-slate-200")}
                            value={status}
                            onChange={(event) => {
                              void patchActionProgress(selectedRun.id, item.actionKey, {
                                status: event.target.value as PlanningRunActionStatus,
                              });
                            }}
                          >
                            <option value="todo">todo</option>
                            <option value="doing">doing</option>
                            <option value="done">done</option>
                            <option value="snoozed">snoozed</option>
                          </select>
                          <input
                            className={cn(bodyCompactFieldClassName, "h-8 text-[11px] font-bold rounded-lg bg-white border-slate-200 flex-1")}
                            placeholder="메모를 입력하세요"
                            value={noteValue}
                            onChange={(event) => setActionNoteDrafts(prev => ({ ...prev, [item.actionKey]: event.target.value }))}
                          />
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs font-bold rounded-lg" onClick={() => void patchActionProgress(selectedRun.id, item.actionKey, { note: noteValue })}>저장</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <SubSectionHeader
              title="실행 비교 요약"
              description="선택한 두 실행 사이에서 무엇이 달라졌는지 먼저 짧게 읽고, 필요하면 상세 비교 리포트로 이어 갑니다."
            />
            {!compareResult ? (
              <p className="py-12 text-center text-sm font-bold text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                목록에서 실행 두 개를 선택하면 저장 시점 차이와 핵심 변화 포인트를 여기서 먼저 볼 수 있습니다.
              </p>
            ) : (
              <div className="space-y-4">
                {compareWhyChanged && (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-2">Insight</p>
                    <p className="text-sm font-bold text-slate-900 leading-snug">{compareWhyChanged.headline}</p>
                  </div>
                )}
                <div className="space-y-2 text-xs font-bold text-slate-600">
                  <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span>말기 순자산 변화</span>
                    <span className={cn(compareResult.diff.keyMetrics.endNetWorthDeltaKrw >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {formatNumber(compareResult.diff.keyMetrics.endNetWorthDeltaKrw)}원
                    </span>
                  </div>
                  <div className="flex justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span>최저 현금 변화</span>
                    <span className={cn(compareResult.diff.keyMetrics.worstCashDeltaKrw >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {formatNumber(compareResult.diff.keyMetrics.worstCashDeltaKrw)}원
                    </span>
                  </div>
                </div>
                <a
                  className="block w-full text-center py-3 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 shadow-lg shadow-emerald-900/10 transition-all active:scale-[0.98]"
                  href={`/api/planning/v2/runs/${encodeURIComponent(compareResult.other.id)}/report?compareTo=${encodeURIComponent(compareResult.base.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  상세 비교 리포트 열기
                </a>
              </div>
            )}
          </Card>
        </div>
      </div>
      {deleteTargetRunId ? (
        <div
          aria-labelledby="planning-runs-delete-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-900/10">
            <h3 className="text-base font-black text-slate-900" id="planning-runs-delete-title">실행 기록 삭제 확인</h3>
            <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed">
              삭제해도 바로 영구 삭제되지 않고 휴지통으로 이동합니다. 필요하면 바로 복구할 수 있습니다.
            </p>
            <div className="mt-4 px-3 py-2 font-mono text-[10px] text-rose-600 bg-rose-50 rounded-lg border border-rose-100">{deleteExpectedConfirm}</div>
            <input
              className={cn(bodyFieldClassName, "mt-4 h-11 text-center font-bold")}
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                disabled={deleteWorking}
                onClick={closeDeleteRunDialog}
                size="sm"
                type="button"
                variant="outline"
                className="rounded-xl h-10 px-6 font-bold"
              >
                취소
              </Button>
              <Button
                disabled={deleteWorking || deleteConfirmText.trim() !== deleteExpectedConfirm}
                onClick={() => void submitDeleteRunAction()}
                size="sm"
                type="button"
                variant="primary"
                className="rounded-xl h-10 px-6 font-bold"
              >
                {deleteWorking ? "휴지통으로 이동 중..." : "휴지통으로 이동"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {restoreTargetRunId ? (
        <div
          aria-labelledby="planning-runs-restore-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-900/10">
            <h3 className="text-base font-black text-slate-900" id="planning-runs-restore-title">실행 기록 복구 확인</h3>
            <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed">
              방금 휴지통으로 옮긴 실행을 다시 목록으로 돌립니다. 확인 문구를 입력하면 바로 복구됩니다.
            </p>
            <div className="mt-4 px-3 py-2 font-mono text-[10px] text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-100">{restoreExpectedConfirm}</div>
            <input
              className={cn(bodyFieldClassName, "mt-4 h-11 text-center font-bold")}
              value={restoreConfirmText}
              onChange={(event) => setRestoreConfirmText(event.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                disabled={restoreWorking}
                onClick={closeRestoreRunDialog}
                size="sm"
                type="button"
                variant="outline"
                className="rounded-xl h-10 px-6 font-bold"
              >
                나중에
              </Button>
              <Button
                disabled={restoreWorking || restoreConfirmText.trim() !== restoreExpectedConfirm}
                onClick={() => void submitRestoreRunAction()}
                size="sm"
                type="button"
                variant="primary"
                className="rounded-xl h-10 px-6 font-bold"
              >
                {restoreWorking ? "복구 중..." : "바로 복구"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default PlanningRunsClient;
