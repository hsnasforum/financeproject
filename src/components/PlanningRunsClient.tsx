"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  BodyActionLink,
  BodyDialogSurface,
  BodyEmptyState,
  BodyInset,
  BodyTableFrame,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
  bodyDialogActionsClassName,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
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

function formatActionStatus(status: PlanningRunActionStatus): string {
  if (status === "todo") return "TODO";
  if (status === "doing") return "DOING";
  if (status === "done") return "DONE";
  return "SNOOZED";
}

function actionStatusBadgeClass(status: PlanningRunActionStatus): string {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "doing") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "snoozed") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toResultDto(run: PlanningRunRecord) {
  return resolveReportResultDtoFromRun(run);
}

function resolveActionCenterRelatedHref(rawHref: string | undefined, run: PlanningRunRecord | null): string | null {
  const href = typeof rawHref === "string" ? rawHref.trim() : "";
  if (!href) return null;
  if (!href.startsWith("#")) return href;
  if (!run) return null;
  return appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(run.id)}${href}`, run.profileId);
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
  const [generatedShareReportByRun, setGeneratedShareReportByRun] = useState<Record<string, string>>({});
  const [actionProgressSummaryByRun, setActionProgressSummaryByRun] = useState<Record<string, ActionProgressSummary>>({});
  const [selectedActionPlan, setSelectedActionPlan] = useState<PlanningRunActionPlan | null>(null);
  const [selectedActionProgress, setSelectedActionProgress] = useState<PlanningRunActionProgress | null>(null);
  const [actionNoteDrafts, setActionNoteDrafts] = useState<Record<string, string>>({});
  const [actionCenterLoading, setActionCenterLoading] = useState(false);
  const [actionCenterError, setActionCenterError] = useState("");
  const [updatingActionKey, setUpdatingActionKey] = useState("");
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
  const [shareWorkingRunId, setShareWorkingRunId] = useState("");
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
    setUpdatingActionKey(actionKey);
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
    } finally {
      setUpdatingActionKey("");
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

  async function generateShareReportAction(runId: string): Promise<void> {
    const level: ShareMaskLevel = shareMaskLevel;
    setShareWorkingRunId(runId);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/planning/v2/share-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ runId, level })),
      });
      const rawPayload = await res.json().catch(() => null);
      const payload = parsePlanningV2Response<{ id?: string }>(rawPayload);
      if (!payload.ok) {
        pushError(payload.error.message ?? "공유 리포트 생성에 실패했습니다.");
        return;
      }
      if (!res.ok || !payload.data?.id) {
        pushError("공유 리포트 생성에 실패했습니다.");
        return;
      }
      setGeneratedShareReportByRun((prev) => ({
        ...prev,
        [runId]: payload.data?.id as string,
      }));
      pushNotice(`공유용 리포트를 생성했습니다. (마스킹: ${level})`);
    } catch (error) {
      pushError(error instanceof Error ? error.message : "공유 리포트 생성 중 오류가 발생했습니다.");
    } finally {
      setShareWorkingRunId("");
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
    <PageShell className="report-root">
      <PageHeader
        title="실행 기록"
        description="저장된 실행 기록을 조회/비교/내보내기 할 수 있습니다."
        action={(
          <div className="no-print flex items-center gap-4 text-sm">
            <Button
              data-testid="runs-print-button"
              onClick={handlePrint}
              size="sm"
              type="button"
              variant="outline"
            >
              PDF 인쇄
            </Button>
            <Link className="font-semibold text-emerald-700" href={appendProfileIdQuery("/planning", filterProfileId)}>플래닝</Link>
          </div>
        )}
      />

      <Card className="print-card mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">가정/확률 결과는 보장값이 아닙니다.</p>
        <p className="mt-1 text-xs text-amber-800">실행 기록 비교 시 snapshot/asOf, health 경고, override 차이를 함께 확인하세요.</p>
      </Card>
      {error ? (
        <Card className="print-card mb-4 border border-rose-200 bg-rose-50">
          <p className="text-sm font-semibold text-rose-700">{error}</p>
        </Card>
      ) : null}
      {notice ? (
        <Card className="print-card mb-4 border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-700">{notice}</p>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="print-card">
          <div className="no-print flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">
              프로필 필터
              <select
                className={`ml-2 ${bodyCompactFieldClassName}`}
                value={filterProfileId}
                onChange={(event) => setFilterProfileId(event.target.value)}
              >
                <option value="">전체</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              공유 마스킹
              <select
                className={`ml-2 ${bodyCompactFieldClassName}`}
                value={shareMaskLevel}
                onChange={(event) => setShareMaskLevel(event.target.value as ShareMaskLevel)}
              >
                <option value="light">light</option>
                <option value="standard">standard</option>
                <option value="strict">strict</option>
              </select>
            </label>
            <Button disabled={loading} onClick={() => void loadRuns(filterProfileId)} size="sm" variant="ghost">새로고침</Button>
          </div>

          <BodyTableFrame className="mt-3">
            <table className="min-w-full text-left text-xs text-slate-700" data-testid="planning-runs-table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="no-print px-2 py-2">비교</th>
                  <th className="px-2 py-2">실행 기록</th>
                  <th className="px-2 py-2">생성시각</th>
                  <th className="px-2 py-2">snapshot</th>
                  <th className="px-2 py-2">warnings</th>
                  <th className="px-2 py-2">치명 경고</th>
                  <th className="px-2 py-2">완료율</th>
                  <th className="px-2 py-2">MC/A/D</th>
                  <th className="no-print px-2 py-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3" colSpan={9}>
                      <BodyEmptyState
                        className="border-none bg-transparent px-0 py-3"
                        description="프로필을 선택해 다시 계산한 뒤 결과를 저장하면 실행 기록이 여기에 쌓입니다."
                        title="저장된 실행 기록이 없습니다."
                      />
                    </td>
                  </tr>
                ) : runs.map((run) => {
                  const checked = compareIds.includes(run.id);
                  const flags = runFlags(run);
                  const snapshotLabel = run.meta.snapshot?.id || run.meta.snapshot?.asOf || "latest/missing";
                  const completion = actionProgressSummaryByRun[run.id];
                  return (
                    <tr className="border-b border-slate-100" key={run.id}>
                      <td className="no-print px-2 py-2">
                        <input checked={checked} onChange={() => toggleCompare(run.id)} type="checkbox" />
                      </td>
                      <td className="no-print px-2 py-2">
                        <button
                          className="font-semibold text-emerald-700"
                          onClick={() => setSelectedRunId(run.id)}
                          type="button"
                        >
                          {run.title || run.id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="px-2 py-2">{formatDateTime(run.createdAt)}</td>
                      <td className="px-2 py-2">{snapshotLabel}</td>
                      <td className="px-2 py-2">{formatNumber(flags.warningsCount)}</td>
                      <td className="px-2 py-2">{formatNumber(flags.criticalHealthCount)}</td>
                      <td className="px-2 py-2" data-testid={`run-action-completion-${run.id}`}>
                        <span data-testid="run-action-completion">
                          {completion ? `${completion.done}/${completion.total} (${completion.completionPct}%)` : "0/0 (0%)"}
                        </span>
                      </td>
                      <td className="px-2 py-2">{flags.hasMonteCarlo ? "M" : "-"}/{flags.hasActions ? "A" : "-"}/{flags.hasDebt ? "D" : "-"}</td>
                      <td className="px-2 py-2">
                        <button
                          className="font-semibold text-indigo-700"
                          disabled={shareWorkingRunId === run.id}
                          onClick={() => void generateShareReportAction(run.id)}
                          type="button"
                        >
                          {shareWorkingRunId === run.id ? "생성 중..." : "공유 리포트"}
                        </button>
                        {generatedShareReportByRun[run.id] ? (
                          <a
                            className="ml-2 text-sm font-semibold text-emerald-700 underline underline-offset-2"
                            href={`/api/planning/v2/share-report/${encodeURIComponent(generatedShareReportByRun[run.id])}/download`}
                          >
                            다운로드
                          </a>
                        ) : null}
                        <span className="mx-1 text-slate-300">|</span>
                        <a
                          className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                          href={appendProfileIdQuery(`/planning/reports/${encodeURIComponent(run.id)}`, run.profileId)}
                        >
                          리포트 보기
                        </a>
                        <BodyActionLink
                          className="ml-2"
                          href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(run.id)}`, run.profileId)}
                          prefetch={false}
                        >
                          대시보드
                        </BodyActionLink>
                        <span className="mx-1 text-slate-300">|</span>
                        <button
                          className="text-sm font-semibold text-rose-700 underline underline-offset-2"
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
          </BodyTableFrame>
        </Card>

        <div className="space-y-6">
          <Card className="print-card">
            <h2 className="text-base font-bold text-slate-900">실행 기록 상세</h2>
            {!selectedRun ? (
              <BodyEmptyState
                className="mt-3"
                description="왼쪽 표에서 실행 기록 하나를 선택하면 저장 시점과 결과 요약을 바로 확인할 수 있습니다."
                title="선택된 실행 기록이 없습니다."
              />
            ) : null}
            {selectedRun ? (
              <BodyInset className="mt-3 space-y-2 text-xs text-slate-700">
                <p>runId: {selectedRun.id}</p>
                <p>profileId: {selectedRun.profileId}</p>
                <p>createdAt: {formatDateTime(selectedRun.createdAt)}</p>
                <p>snapshot: {selectedRun.meta.snapshot?.id ?? selectedRun.meta.snapshot?.asOf ?? "latest/missing"}</p>
                <p>종료 순자산: {formatNumber(selectedSummary.endNetWorthKrw)}원</p>
                <p>최저 현금: {formatNumber(selectedSummary.worstCashKrw)}원</p>
                <p>목표 달성 수: {selectedDto?.summary.goalsAchieved ? `${selectedDto.summary.goalsAchieved.achieved}/${selectedDto.summary.goalsAchieved.total}` : "-"}</p>
                <p>경고 수: {formatNumber(selectedSummary.totalWarnings)}</p>
                <p>Action 완료율: {actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0}%</p>

                <div className={`no-print mt-2 ${bodyDenseActionRowClassName}`}>
                  <Button size="sm" variant="outline" onClick={() => void copyRunJsonAction(selectedRun)}>JSON 복사</Button>
                  <Button
                    disabled={shareWorkingRunId === selectedRun.id}
                    size="sm"
                    variant="outline"
                    onClick={() => void generateShareReportAction(selectedRun.id)}
                  >
                    {shareWorkingRunId === selectedRun.id ? "생성 중..." : `공유 리포트 생성 (${shareMaskLevel})`}
                  </Button>
                  <a
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/export`}
                  >
                    JSON 다운로드
                  </a>
                  <Link
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-slate-50"
                    href={appendProfileIdQuery(`/planning/reports/${encodeURIComponent(selectedRun.id)}`, selectedRun.profileId)}
                    prefetch={false}
                  >
                    리포트 보기
                  </Link>
                  {generatedShareReportByRun[selectedRun.id] ? (
                    <a
                      className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-slate-50"
                      href={`/api/planning/v2/share-report/${encodeURIComponent(generatedShareReportByRun[selectedRun.id])}/download`}
                    >
                      공유 리포트 다운로드
                    </a>
                  ) : null}
                  <Link
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-slate-50"
                    href={`/planning/runs/${encodeURIComponent(selectedRun.id)}`}
                  >
                    상세 페이지
                  </Link>
                </div>
                <p className="text-[11px] text-slate-500">팁: 공식 리포트 화면에서 브라우저 인쇄를 사용하면 PDF로 저장할 수 있습니다.</p>
              </BodyInset>
            ) : null}
          </Card>

          <Card className="print-card" data-testid="run-action-center" id={RUN_SECTION_IDS.actionCenter}>
            <h2 className="text-base font-bold text-slate-900">Action Center</h2>
            <p className="mt-1 text-xs text-slate-500">운영 체크리스트 상태(todo/doing/done/snoozed)와 메모를 run 단위로 저장합니다.</p>
            {!selectedRun ? (
              <BodyEmptyState
                className="mt-3"
                description="저장된 실행 기록을 선택하면 액션 상태와 메모를 이 화면에서 바로 관리할 수 있습니다."
                title="실행 기록을 선택하면 액션 체크리스트가 표시됩니다."
              />
            ) : actionCenterLoading ? (
              <BodyEmptyState
                className="mt-3"
                description="선택한 실행 기록의 액션 계획과 진행 상태를 불러오고 있습니다."
                title="Action Center 로딩 중..."
              />
            ) : actionCenterError ? (
              <BodyEmptyState
                className="mt-3 border-rose-200 bg-rose-50"
                description={actionCenterError}
                title="Action Center를 불러오지 못했습니다."
              />
            ) : !selectedActionPlan || !selectedActionProgress ? (
              <BodyEmptyState
                className="mt-3"
                description="이 실행 기록에는 저장된 액션 계획이나 진행 상태가 아직 없습니다."
                title="표시할 액션 데이터가 없습니다."
              />
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-700">
                  완료율: <span className="font-semibold">{actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0}%</span>
                  {" · "}
                  항목: <span className="font-semibold">{selectedActionProgress.items.length}</span>
                </p>
                <div className="h-2 w-full rounded-full bg-slate-200" data-testid="run-action-progress">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    data-testid="run-action-progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0))}%` }}
                  />
                </div>
                <div className="space-y-2" data-testid="run-action-items">
                  {selectedActionPlan.items.map((item) => {
                    const progress = selectedActionProgress.items.find((row) => row.actionKey === item.actionKey);
                    const status = progress?.status ?? "todo";
                    const noteValue = actionNoteDrafts[item.actionKey] ?? "";
                    const relatedHref = resolveActionCenterRelatedHref(item.href, selectedRun);
                    return (
                      <BodyInset data-testid={`run-action-item-${item.actionKey}`} key={item.actionKey}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${actionStatusBadgeClass(status)}`}>
                            {formatActionStatus(status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-700">{item.description}</p>
                        {item.steps.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                            {item.steps.map((step, index) => (
                              <li key={`${item.actionKey}-step-${index}`}>{step}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                          <select
                            aria-label={`${item.title} 상태`}
                            className={`no-print ${bodyCompactFieldClassName}`}
                            data-testid={`run-action-status-${item.actionKey}`}
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
                            aria-label={`${item.title} 메모`}
                            className={`no-print ${bodyCompactFieldClassName}`}
                            data-testid={`run-action-note-${item.actionKey}`}
                            placeholder="메모"
                            value={noteValue}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setActionNoteDrafts((prev) => ({
                                ...prev,
                                [item.actionKey]: nextValue,
                              }));
                            }}
                          />
                          <Button
                            aria-label={`${item.title} 메모 저장`}
                            className="no-print"
                            data-testid={`run-action-save-${item.actionKey}`}
                            disabled={updatingActionKey === item.actionKey}
                            onClick={() => {
                              void patchActionProgress(selectedRun.id, item.actionKey, {
                                note: noteValue,
                              });
                            }}
                            size="sm"
                            variant="outline"
                          >
                            저장
                          </Button>
                        </div>
                        {relatedHref ? (
                          <p className="mt-2 text-[11px] text-slate-600">
                            <BodyActionLink className="text-[11px]" href={relatedHref}>
                              관련 섹션 보기
                            </BodyActionLink>
                          </p>
                        ) : null}
                      </BodyInset>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card className="print-card">
            <h2 className="text-base font-bold text-slate-900">실행 비교</h2>
            <p className="mt-1 text-xs text-slate-500">실행 기록 2개를 선택하면 base(첫 선택) 대비 변화를 표시합니다.</p>

            {!compareResult ? (
              <BodyEmptyState
                className="mt-3"
                description="왼쪽 표에서 실행 기록 두 개를 체크하면 base 대비 변화와 경고 차이를 요약해서 보여줍니다."
                title="비교할 실행 기록 2개를 선택하세요."
              />
            ) : (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                {compareWhyChanged ? (
                  <BodyInset>
                    <p className="text-xs font-semibold text-slate-800">{compareWhyChanged.headline}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                      {compareWhyChanged.bullets.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </BodyInset>
                ) : null}
                <p>base: {compareResult.base.title || compareResult.base.id.slice(0, 8)}</p>
                <p>other: {compareResult.other.title || compareResult.other.id.slice(0, 8)}</p>
                <p>
                  비교 리포트:
                  {" "}
                  <a
                    className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                    href={`/api/planning/v2/runs/${encodeURIComponent(compareResult.other.id)}/report?compareTo=${encodeURIComponent(compareResult.base.id)}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    other 기준 HTML 열기
                  </a>
                </p>
                <p>말기 순자산 변화: {formatNumber(compareResult.diff.keyMetrics.endNetWorthDeltaKrw)}원</p>
                <p>최저 현금 변화: {formatNumber(compareResult.diff.keyMetrics.worstCashDeltaKrw)}원</p>
                <p>목표 달성 수 변화: {formatNumber(compareResult.diff.keyMetrics.goalsAchievedDelta)}</p>
                <p>추가 경고: {compareResult.diff.warningsDelta.added.join(", ") || "없음"}</p>
                <p>해소 경고: {compareResult.diff.warningsDelta.removed.join(", ") || "없음"}</p>
                <p>추가 건강도 경고: {compareResult.diff.healthWarningsDelta.added.join(", ") || "없음"}</p>
                <p>해소 건강도 경고: {compareResult.diff.healthWarningsDelta.removed.join(", ") || "없음"}</p>
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
          <BodyDialogSurface className="max-w-lg">
            <h3 className="text-base font-black text-slate-900" id="planning-runs-delete-title">실행 기록 삭제 확인</h3>
            <p className="mt-2 text-sm text-slate-700">
              아래 확인 문구를 정확히 입력해야 삭제가 진행됩니다.
            </p>
            <BodyInset className="mt-2 px-2 py-1 font-mono text-xs text-slate-700">{deleteExpectedConfirm}</BodyInset>
            <input
              className={bodyFieldClassName}
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
            />
            <div className={bodyDialogActionsClassName}>
              <Button
                disabled={deleteWorking}
                onClick={closeDeleteRunDialog}
                size="sm"
                type="button"
                variant="outline"
              >
                취소
              </Button>
              <Button
                disabled={deleteWorking || deleteConfirmText.trim() !== deleteExpectedConfirm}
                onClick={() => void submitDeleteRunAction()}
                size="sm"
                type="button"
                variant="primary"
              >
                {deleteWorking ? "삭제 중..." : "삭제 진행"}
              </Button>
            </div>
          </BodyDialogSurface>
        </div>
      ) : null}
      {restoreTargetRunId ? (
        <div
          aria-labelledby="planning-runs-restore-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
        >
          <BodyDialogSurface className="max-w-lg">
            <h3 className="text-base font-black text-slate-900" id="planning-runs-restore-title">실행 기록 복구 확인</h3>
            <p className="mt-2 text-sm text-slate-700">
              방금 삭제한 실행 기록을 바로 복구할 수 있습니다. 확인 문구를 입력하세요.
            </p>
            <BodyInset className="mt-2 px-2 py-1 font-mono text-xs text-slate-700">{restoreExpectedConfirm}</BodyInset>
            <input
              className={bodyFieldClassName}
              value={restoreConfirmText}
              onChange={(event) => setRestoreConfirmText(event.target.value)}
            />
            <div className={bodyDialogActionsClassName}>
              <Button
                disabled={restoreWorking}
                onClick={closeRestoreRunDialog}
                size="sm"
                type="button"
                variant="outline"
              >
                나중에
              </Button>
              <Button
                disabled={restoreWorking || restoreConfirmText.trim() !== restoreExpectedConfirm}
                onClick={() => void submitRestoreRunAction()}
                size="sm"
                type="button"
                variant="primary"
              >
                {restoreWorking ? "복구 중..." : "바로 복구"}
              </Button>
            </div>
          </BodyDialogSurface>
        </div>
      ) : null}
    </PageShell>
  );
}

export default PlanningRunsClient;
