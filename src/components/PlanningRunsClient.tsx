"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";
import { buildConfirmString } from "@/lib/ops/confirm";
import {
  appendProfileIdQuery,
  normalizeProfileId,
  PLANNING_SELECTED_PROFILE_STORAGE_KEY,
} from "@/lib/planning/profileScope";
import {
  type PlanningProfileRecord,
  type PlanningRunActionPlan,
  type PlanningRunActionProgress,
  type PlanningRunActionStatus,
  type PlanningRunRecord,
} from "@/lib/planning/store/types";
import { diffRuns } from "@/lib/planning/v2/diffRuns";
import { summarizeRunDiff } from "@/lib/planning/v2/insights/whyChanged";
import { buildResultDtoV1FromRunRecord, isResultDtoV1 } from "@/lib/planning/v2/resultDto";

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    issues?: string[];
  };
};

type PlanningRunsClientProps = {
  pdfEnabled?: boolean;
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

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}`;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
  const outputs = asRecord(run.outputs);
  const rawDto = outputs.resultDto;
  return isResultDtoV1(rawDto) ? rawDto : buildResultDtoV1FromRunRecord(run);
}

function buildRunPdfHref(runId: string): string {
  const params = new URLSearchParams();
  const csrf = readDevCsrfToken();
  if (csrf) params.set("csrf", csrf);
  const query = params.toString();
  return `/api/planning/v2/runs/${encodeURIComponent(runId)}/report.pdf${query ? `?${query}` : ""}`;
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
  pdfEnabled = false,
  initialSelectedRunId = "",
  initialFilterProfileId = "",
}: PlanningRunsClientProps) {
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
    try {
      const res = await fetch("/api/planning/v2/profiles", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningProfileRecord[]> | null;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setProfiles([]);
        return;
      }
      setProfiles(payload.data);
    } catch {
      setProfiles([]);
    }
  }

  async function loadRuns(profileId = filterProfileId): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (profileId) params.set("profileId", profileId);
      params.set("limit", "200");

      const res = await fetch(`/api/planning/v2/runs?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as (ApiResponse<PlanningRunRecord[]> & {
        meta?: { actionProgressSummaryByRunId?: Record<string, ActionProgressSummary> };
      }) | null;
      const runRows = payload?.ok && Array.isArray(payload.data) ? payload.data : null;
      if (!runRows) {
        setRuns([]);
        setSelectedRunId("");
        setCompareIds([]);
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
      const summaries = payload.meta?.actionProgressSummaryByRunId;
      if (summaries && typeof summaries === "object") {
        setActionProgressSummaryByRun(summaries);
      } else {
        void loadActionProgressSummaryForRuns(runRows);
      }
    } catch (error) {
      setRuns([]);
      setSelectedRunId("");
      setCompareIds([]);
      setActionProgressSummaryByRun({});
      window.alert(error instanceof Error ? error.message : "실행 기록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function loadActionProgressSummaryForRuns(runRows: PlanningRunRecord[]): Promise<void> {
    if (runRows.length < 1) {
      setActionProgressSummaryByRun({});
      return;
    }
    const next: Record<string, ActionProgressSummary> = {};
    await Promise.all(runRows.map(async (run) => {
      try {
        const response = await fetch(`/api/planning/runs/${encodeURIComponent(run.id)}/action-progress`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunActionProgress> & {
          meta?: { summary?: ActionProgressSummary };
        };
        if (!response.ok || !payload?.ok) return;
        const summary = payload.meta?.summary;
        if (!summary) return;
        next[run.id] = summary;
      } catch {
        // ignore per-run action summary failures
      }
    }));
    setActionProgressSummaryByRun(next);
  }

  async function loadSelectedActionCenter(runId: string): Promise<void> {
    if (!runId) {
      setSelectedActionPlan(null);
      setSelectedActionProgress(null);
      setActionNoteDrafts({});
      setActionCenterError("");
      return;
    }
    setActionCenterLoading(true);
    setActionCenterError("");
    try {
      const [planResponse, progressResponse] = await Promise.all([
        fetch(`/api/planning/runs/${encodeURIComponent(runId)}/action-plan`, { cache: "no-store" }),
        fetch(`/api/planning/runs/${encodeURIComponent(runId)}/action-progress`, { cache: "no-store" }),
      ]);
      const [planPayload, progressPayload] = await Promise.all([
        planResponse.json().catch(() => null) as Promise<ApiResponse<PlanningRunActionPlan> | null>,
        progressResponse.json().catch(() => null) as Promise<(ApiResponse<PlanningRunActionProgress> & { meta?: { summary?: ActionProgressSummary } }) | null>,
      ]);
      if (!planResponse.ok || !planPayload?.ok || !planPayload.data) {
        setSelectedActionPlan(null);
        setSelectedActionProgress(null);
        setActionNoteDrafts({});
        setActionCenterError(planPayload?.error?.message ?? "Action plan을 불러오지 못했습니다.");
        return;
      }
      if (!progressResponse.ok || !progressPayload?.ok || !progressPayload.data) {
        setSelectedActionPlan(planPayload.data);
        setSelectedActionProgress(null);
        setActionNoteDrafts({});
        setActionCenterError(progressPayload?.error?.message ?? "Action progress를 불러오지 못했습니다.");
        return;
      }
      setSelectedActionPlan(planPayload.data);
      setSelectedActionProgress(progressPayload.data);
      const draftByKey = Object.fromEntries(progressPayload.data.items.map((item) => [item.actionKey, item.note ?? ""]));
      setActionNoteDrafts(draftByKey);
      const summary = progressPayload.meta?.summary;
      if (summary) {
        setActionProgressSummaryByRun((prev) => ({
          ...prev,
          [runId]: summary,
        }));
      }
    } catch (error) {
      setSelectedActionPlan(null);
      setSelectedActionProgress(null);
      setActionNoteDrafts({});
      setActionCenterError(error instanceof Error ? error.message : "Action Center 로드에 실패했습니다.");
    } finally {
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
      const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}/action-progress`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          actionKey,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        })),
      });
      const payload = (await response.json().catch(() => null)) as (ApiResponse<PlanningRunActionProgress> & {
        meta?: { summary?: ActionProgressSummary };
      }) | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        window.alert(payload?.error?.message ?? "Action progress 업데이트에 실패했습니다.");
        return;
      }
      setSelectedActionProgress(payload.data);
      const updatedItem = payload.data.items.find((item) => item.actionKey === actionKey);
      setActionNoteDrafts((prev) => ({
        ...prev,
        [actionKey]: updatedItem?.note ?? "",
      }));
      const summary = payload.meta?.summary;
      if (summary) {
        setActionProgressSummaryByRun((prev) => ({
          ...prev,
          [runId]: summary,
        }));
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Action progress 업데이트에 실패했습니다.");
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
    void loadRuns(filterProfileId);
  }, [filterProfileId]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedActionPlan(null);
      setSelectedActionProgress(null);
      setActionNoteDrafts({});
      setActionCenterError("");
      return;
    }
    void loadSelectedActionCenter(selectedRunId);
  }, [selectedRunId]);

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

  async function deleteRunAction(id: string): Promise<void> {
    const expectedConfirm = buildConfirmString("DELETE run", id);
    const confirmText = window.prompt(
      `삭제 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    try {
      const res = await fetch(`/api/planning/v2/runs/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ confirmText })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "실행 기록 삭제에 실패했습니다.");
        return;
      }

      await loadRuns(filterProfileId);
      const undo = window.confirm("실행 기록을 휴지통으로 이동했습니다. 바로 복구할까요?");
      if (!undo) {
        window.alert("실행 기록을 휴지통으로 이동했습니다.");
        return;
      }
      const restoreConfirm = buildConfirmString("RESTORE runs", id);
      const restoreText = window.prompt(
        `복구 확인 문구를 입력하세요.\n${restoreConfirm}`,
        restoreConfirm,
      );
      if (!restoreText) return;
      const restoreRes = await fetch("/api/planning/v2/trash/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          kind: "runs",
          id,
          confirmText: restoreText,
        })),
      });
      const restorePayload = (await restoreRes.json().catch(() => null)) as ApiResponse<{ restored?: boolean }> | null;
      if (!restoreRes.ok || !restorePayload?.ok) {
        window.alert(restorePayload?.error?.message ?? "복구에 실패했습니다.");
        return;
      }
      await loadRuns(filterProfileId);
      window.alert("실행 기록을 복구했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "실행 기록 삭제 중 오류가 발생했습니다.");
    }
  }

  async function copyRunJsonAction(run: PlanningRunRecord): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${JSON.stringify(run, null, 2)}\n`);
      window.alert("실행 기록 JSON을 클립보드에 복사했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "복사에 실패했습니다.");
    }
  }

  async function generateShareReportAction(runId: string): Promise<void> {
    const levelInput = window.prompt("마스킹 레벨(light|standard|strict)", "standard");
    if (!levelInput) return;
    const level = levelInput.trim().toLowerCase();
    if (!(level === "light" || level === "standard" || level === "strict")) {
      window.alert("마스킹 레벨은 light|standard|strict 중 하나여야 합니다.");
      return;
    }

    try {
      const res = await fetch("/api/planning/v2/share-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ runId, level })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ id?: string }> | null;
      if (!res.ok || !payload?.ok || !payload.data?.id) {
        window.alert(payload?.error?.message ?? "공유 리포트 생성에 실패했습니다.");
        return;
      }
      setGeneratedShareReportByRun((prev) => ({
        ...prev,
        [runId]: payload.data?.id as string,
      }));
      window.alert("공유용 리포트를 생성했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "공유 리포트 생성 중 오류가 발생했습니다.");
    }
  }

  const selectedDto = useMemo(
    () => (selectedRun ? toResultDto(selectedRun) : null),
    [selectedRun],
  );
  const selectedSummary = asRecord(selectedDto?.summary);

  return (
    <PageShell>
      <PageHeader
        title="실행 기록"
        description="저장된 실행 기록을 조회/비교/내보내기 할 수 있습니다."
        action={(
          <div className="flex items-center gap-4 text-sm">
            <Link className="font-semibold text-emerald-700" href={appendProfileIdQuery("/planning", filterProfileId)}>플래닝</Link>
          </div>
        )}
      />

      <Card className="mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">가정/확률 결과는 보장값이 아닙니다.</p>
        <p className="mt-1 text-xs text-amber-800">실행 기록 비교 시 snapshot/asOf, health 경고, override 차이를 함께 확인하세요.</p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">
              프로필 필터
              <select
                className="ml-2 h-9 rounded-xl border border-slate-300 px-2 text-xs"
                value={filterProfileId}
                onChange={(event) => setFilterProfileId(event.target.value)}
              >
                <option value="">전체</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
            <Button disabled={loading} onClick={() => void loadRuns(filterProfileId)} size="sm" variant="ghost">새로고침</Button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-700" data-testid="planning-runs-table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2">비교</th>
                  <th className="px-2 py-2">실행 기록</th>
                  <th className="px-2 py-2">생성시각</th>
                  <th className="px-2 py-2">snapshot</th>
                  <th className="px-2 py-2">warnings</th>
                  <th className="px-2 py-2">치명 경고</th>
                  <th className="px-2 py-2">완료율</th>
                  <th className="px-2 py-2">MC/A/D</th>
                  <th className="px-2 py-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr><td className="px-2 py-3" colSpan={9}>저장된 실행 기록이 없습니다.</td></tr>
                ) : runs.map((run) => {
                  const checked = compareIds.includes(run.id);
                  const flags = runFlags(run);
                  const snapshotLabel = run.meta.snapshot?.id || run.meta.snapshot?.asOf || "latest/missing";
                  const completion = actionProgressSummaryByRun[run.id]?.completionPct ?? 0;
                  return (
                    <tr className="border-b border-slate-100" key={run.id}>
                      <td className="px-2 py-2">
                        <input checked={checked} onChange={() => toggleCompare(run.id)} type="checkbox" />
                      </td>
                      <td className="px-2 py-2">
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
                        <span data-testid="run-action-completion">{completion}%</span>
                      </td>
                      <td className="px-2 py-2">{flags.hasMonteCarlo ? "M" : "-"}/{flags.hasActions ? "A" : "-"}/{flags.hasDebt ? "D" : "-"}</td>
                      <td className="px-2 py-2">
                        <button
                          className="font-semibold text-indigo-700"
                          onClick={() => void generateShareReportAction(run.id)}
                          type="button"
                        >
                          공유 리포트
                        </button>
                        {generatedShareReportByRun[run.id] ? (
                          <a
                            className="ml-2 font-semibold text-emerald-700"
                            href={`/api/planning/v2/share-report/${encodeURIComponent(generatedShareReportByRun[run.id])}/download`}
                          >
                            다운로드
                          </a>
                        ) : null}
                        <span className="mx-1 text-slate-300">|</span>
                  <a
                    className="font-semibold text-emerald-700"
                    href={`/api/planning/v2/runs/${encodeURIComponent(run.id)}/report`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    리포트 보기
                  </a>
                  <Link
                    className="ml-2 font-semibold text-emerald-700"
                    href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(run.id)}`, run.profileId)}
                  >
                    대시보드
                  </Link>
                        <a
                          className="ml-2 font-semibold text-indigo-700"
                          href={`/api/planning/v2/runs/${encodeURIComponent(run.id)}/report?download=1`}
                        >
                          다운로드(HTML)
                        </a>
                        {pdfEnabled ? (
                          <a
                            className="ml-2 font-semibold text-rose-700"
                            href={buildRunPdfHref(run.id)}
                          >
                            Download PDF
                          </a>
                        ) : null}
                        <span className="mx-1 text-slate-300">|</span>
                        <button
                          className="font-semibold text-rose-700"
                          onClick={() => void deleteRunAction(run.id)}
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
          <Card>
            <h2 className="text-base font-bold text-slate-900">실행 기록 상세</h2>
            {!selectedRun ? <p className="mt-2 text-xs text-slate-500">선택된 실행 기록이 없습니다.</p> : null}
            {selectedRun ? (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p>runId: {selectedRun.id}</p>
                <p>profileId: {selectedRun.profileId}</p>
                <p>createdAt: {formatDateTime(selectedRun.createdAt)}</p>
                <p>snapshot: {selectedRun.meta.snapshot?.id ?? selectedRun.meta.snapshot?.asOf ?? "latest/missing"}</p>
                <p>종료 순자산: {formatNumber(selectedSummary.endNetWorthKrw)}원</p>
                <p>최저 현금: {formatNumber(selectedSummary.worstCashKrw)}원</p>
                <p>목표 달성 수: {selectedDto?.summary.goalsAchieved ? `${selectedDto.summary.goalsAchieved.achieved}/${selectedDto.summary.goalsAchieved.total}` : "-"}</p>
                <p>경고 수: {formatNumber(selectedSummary.totalWarnings)}</p>
                <p>Action 완료율: {actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0}%</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyRunJsonAction(selectedRun)}>JSON 복사</Button>
                  <Button size="sm" variant="outline" onClick={() => void generateShareReportAction(selectedRun.id)}>공유 리포트 생성</Button>
                  <a
                    className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/export`}
                  >
                    JSON 다운로드
                  </a>
                  <a
                    className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-slate-50"
                    href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/report`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    리포트 보기
                  </a>
                  <a
                    className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-slate-50"
                    href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/report?download=1`}
                  >
                    다운로드(HTML)
                  </a>
                  {pdfEnabled ? (
                    <a
                      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-slate-50"
                      href={buildRunPdfHref(selectedRun.id)}
                    >
                      Download PDF
                    </a>
                  ) : null}
                  {generatedShareReportByRun[selectedRun.id] ? (
                    <a
                      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-slate-50"
                      href={`/api/planning/v2/share-report/${encodeURIComponent(generatedShareReportByRun[selectedRun.id])}/download`}
                    >
                      공유 리포트 다운로드
                    </a>
                  ) : null}
                  <Link
                    className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-slate-50"
                    href={`/planning/runs/${encodeURIComponent(selectedRun.id)}`}
                  >
                    상세 페이지
                  </Link>
                </div>
                <p className="text-[11px] text-slate-500">팁: 리포트 보기 화면에서 브라우저 인쇄를 사용하면 PDF로 저장할 수 있습니다.</p>
              </div>
            ) : null}
          </Card>

          <Card data-testid="run-action-center">
            <h2 className="text-base font-bold text-slate-900">Action Center</h2>
            <p className="mt-1 text-xs text-slate-500">운영 체크리스트 상태(todo/doing/done/snoozed)와 메모를 run 단위로 저장합니다.</p>
            {!selectedRun ? (
              <p className="mt-3 text-xs text-slate-500">실행 기록을 선택하면 액션 체크리스트가 표시됩니다.</p>
            ) : actionCenterLoading ? (
              <p className="mt-3 text-xs text-slate-500">Action Center 로딩 중...</p>
            ) : actionCenterError ? (
              <p className="mt-3 text-xs text-rose-700">{actionCenterError}</p>
            ) : !selectedActionPlan || !selectedActionProgress ? (
              <p className="mt-3 text-xs text-slate-500">표시할 액션 데이터가 없습니다.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-700">
                  완료율: <span className="font-semibold">{actionProgressSummaryByRun[selectedRun.id]?.completionPct ?? 0}%</span>
                  {" · "}
                  항목: <span className="font-semibold">{selectedActionProgress.items.length}</span>
                </p>
                <div className="h-2 w-full rounded-full bg-slate-200" data-testid="run-action-progress-bar">
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
                    return (
                      <div className="rounded-lg border border-slate-200 p-3" key={item.actionKey}>
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
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
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
                            className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
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
                        {item.href ? (
                          <p className="mt-2 text-[11px] text-slate-600">
                            <Link className="underline" href={item.href}>{item.href}</Link>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-base font-bold text-slate-900">실행 비교</h2>
            <p className="mt-1 text-xs text-slate-500">실행 기록 2개를 선택하면 base(첫 선택) 대비 변화를 표시합니다.</p>

            {!compareResult ? (
              <p className="mt-3 text-xs text-slate-500">비교할 실행 기록 2개를 선택하세요.</p>
            ) : (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                {compareWhyChanged ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-800">{compareWhyChanged.headline}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                      {compareWhyChanged.bullets.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p>base: {compareResult.base.title || compareResult.base.id.slice(0, 8)}</p>
                <p>other: {compareResult.other.title || compareResult.other.id.slice(0, 8)}</p>
                <p>
                  비교 리포트:
                  {" "}
                  <a
                    className="font-semibold text-emerald-700"
                    href={`/api/planning/v2/runs/${encodeURIComponent(compareResult.other.id)}/report?compareTo=${encodeURIComponent(compareResult.base.id)}`}
                    rel="noreferrer"
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
    </PageShell>
  );
}

export default PlanningRunsClient;
