"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { buildConfirmString } from "@/lib/ops/confirm";
import { type PlanningProfileRecord, type PlanningRunRecord } from "@/lib/planning/store/types";
import { diffRuns } from "@/lib/planning/v2/diffRuns";

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    issues?: string[];
  };
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

function runFlags(run: PlanningRunRecord): {
  hasMonteCarlo: boolean;
  hasActions: boolean;
  hasDebt: boolean;
  warningsCount: number;
  criticalHealthCount: number;
} {
  return {
    hasMonteCarlo: Boolean(run.outputs.monteCarlo),
    hasActions: Boolean(run.outputs.actions),
    hasDebt: Boolean(run.outputs.debtStrategy),
    warningsCount: asArray(run.outputs.simulate?.warnings).length,
    criticalHealthCount: run.meta.health?.criticalCount ?? 0,
  };
}

export function PlanningRunsClient() {
  const [profiles, setProfiles] = useState<PlanningProfileRecord[]>([]);
  const [runs, setRuns] = useState<PlanningRunRecord[]>([]);
  const [filterProfileId, setFilterProfileId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [generatedReportByRun, setGeneratedReportByRun] = useState<Record<string, string>>({});
  const [generatedShareReportByRun, setGeneratedShareReportByRun] = useState<Record<string, string>>({});
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
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord[]> | null;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setRuns([]);
        setSelectedRunId("");
        setCompareIds([]);
        return;
      }

      setRuns(payload.data);
      if (!payload.data.some((item) => item.id === selectedRunId)) {
        setSelectedRunId(payload.data[0]?.id ?? "");
      }
      setCompareIds((prev) => prev.filter((id) => payload.data.some((item) => item.id === id)).slice(0, 2));
    } catch (error) {
      setRuns([]);
      setSelectedRunId("");
      setCompareIds([]);
      window.alert(error instanceof Error ? error.message : "실행 이력 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  useEffect(() => {
    void loadRuns(filterProfileId);
  }, [filterProfileId]);

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
        body: JSON.stringify({ confirmText }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "실행 이력 삭제에 실패했습니다.");
        return;
      }

      await loadRuns(filterProfileId);
      const undo = window.confirm("실행 이력을 휴지통으로 이동했습니다. 바로 복구할까요?");
      if (!undo) {
        window.alert("실행 이력을 휴지통으로 이동했습니다.");
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
        body: JSON.stringify({
          kind: "runs",
          id,
          confirmText: restoreText,
        }),
      });
      const restorePayload = (await restoreRes.json().catch(() => null)) as ApiResponse<{ restored?: boolean }> | null;
      if (!restoreRes.ok || !restorePayload?.ok) {
        window.alert(restorePayload?.error?.message ?? "복구에 실패했습니다.");
        return;
      }
      await loadRuns(filterProfileId);
      window.alert("실행 이력을 복구했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "실행 이력 삭제 중 오류가 발생했습니다.");
    }
  }

  async function copyRunJsonAction(run: PlanningRunRecord): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${JSON.stringify(run, null, 2)}\n`);
      window.alert("run JSON을 클립보드에 복사했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "복사에 실패했습니다.");
    }
  }

  async function generateReportAction(runId: string): Promise<void> {
    try {
      const res = await fetch("/api/planning/v2/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ id?: string }> | null;
      if (!res.ok || !payload?.ok || !payload.data?.id) {
        window.alert(payload?.error?.message ?? "리포트 생성에 실패했습니다.");
        return;
      }

      setGeneratedReportByRun((prev) => ({
        ...prev,
        [runId]: payload.data?.id as string,
      }));
      window.alert("리포트를 생성했습니다. /planning/reports에서 확인할 수 있습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "리포트 생성 중 오류가 발생했습니다.");
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
        body: JSON.stringify({ runId, level }),
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

  const selectedSummary = asRecord(selectedRun?.outputs.simulate?.summary);

  return (
    <PageShell>
      <PageHeader
        title="실행 이력"
        description="저장된 run을 조회/비교/내보내기 할 수 있습니다."
        action={(
          <div className="flex items-center gap-4 text-sm">
            <Link className="font-semibold text-emerald-700" href="/planning/reports">리포트 보기</Link>
            <Link className="font-semibold text-emerald-700" href="/planning/trash">휴지통</Link>
            <Link className="font-semibold text-emerald-700" href="/planning">재무설계 화면으로</Link>
          </div>
        )}
      />

      <Card className="mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">가정/확률 결과는 보장값이 아닙니다.</p>
        <p className="mt-1 text-xs text-amber-800">run 비교 시 snapshot/asOf, health 경고, override 차이를 함께 확인하세요.</p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">
              profile filter
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
            <table className="min-w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2">비교</th>
                  <th className="px-2 py-2">run</th>
                  <th className="px-2 py-2">생성시각</th>
                  <th className="px-2 py-2">snapshot</th>
                  <th className="px-2 py-2">warnings</th>
                  <th className="px-2 py-2">health critical</th>
                  <th className="px-2 py-2">MC/A/D</th>
                  <th className="px-2 py-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr><td className="px-2 py-3" colSpan={8}>저장된 run이 없습니다.</td></tr>
                ) : runs.map((run) => {
                  const checked = compareIds.includes(run.id);
                  const flags = runFlags(run);
                  const snapshotLabel = run.meta.snapshot?.id || run.meta.snapshot?.asOf || "latest/missing";
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
                      <td className="px-2 py-2">{flags.hasMonteCarlo ? "M" : "-"}/{flags.hasActions ? "A" : "-"}/{flags.hasDebt ? "D" : "-"}</td>
                      <td className="px-2 py-2">
                        <button
                          className="font-semibold text-blue-700"
                          onClick={() => void generateReportAction(run.id)}
                          type="button"
                        >
                          리포트 생성
                        </button>
                        {generatedReportByRun[run.id] ? (
                          <Link
                            className="ml-2 font-semibold text-emerald-700"
                            href={`/planning/reports?selected=${encodeURIComponent(generatedReportByRun[run.id])}`}
                          >
                            보기
                          </Link>
                        ) : null}
                        <span className="mx-1 text-slate-300">|</span>
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
                            Download
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
            <h2 className="text-base font-bold text-slate-900">run 상세</h2>
            {!selectedRun ? <p className="mt-2 text-xs text-slate-500">선택된 run이 없습니다.</p> : null}
            {selectedRun ? (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p>runId: {selectedRun.id}</p>
                <p>profileId: {selectedRun.profileId}</p>
                <p>createdAt: {formatDateTime(selectedRun.createdAt)}</p>
                <p>snapshot: {selectedRun.meta.snapshot?.id ?? selectedRun.meta.snapshot?.asOf ?? "latest/missing"}</p>
                <p>종료 순자산: {formatNumber(selectedSummary.endNetWorthKrw)}원</p>
                <p>최저 현금: {formatNumber(selectedSummary.worstCashKrw)}원</p>
                <p>목표 달성 수: {formatNumber(selectedSummary.goalsAchievedCount)}</p>
                <p>경고 수: {formatNumber(selectedSummary.warningsCount)}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyRunJsonAction(selectedRun)}>Copy JSON</Button>
                  <Button size="sm" variant="outline" onClick={() => void generateReportAction(selectedRun.id)}>Generate report</Button>
                  <Button size="sm" variant="outline" onClick={() => void generateShareReportAction(selectedRun.id)}>Create share report</Button>
                  <a
                    className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/export`}
                  >
                    Download JSON
                  </a>
                  {generatedReportByRun[selectedRun.id] ? (
                    <Link
                      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-slate-50"
                      href={`/planning/reports?selected=${encodeURIComponent(generatedReportByRun[selectedRun.id])}`}
                    >
                      View report
                    </Link>
                  ) : null}
                  {generatedShareReportByRun[selectedRun.id] ? (
                    <a
                      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-slate-50"
                      href={`/api/planning/v2/share-report/${encodeURIComponent(generatedShareReportByRun[selectedRun.id])}/download`}
                    >
                      Download share report
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-base font-bold text-slate-900">Run Compare</h2>
            <p className="mt-1 text-xs text-slate-500">run 2개를 선택하면 base(첫 선택) 대비 변화를 표시합니다.</p>

            {!compareResult ? (
              <p className="mt-3 text-xs text-slate-500">비교할 run 2개를 선택하세요.</p>
            ) : (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p>base: {compareResult.base.title || compareResult.base.id.slice(0, 8)}</p>
                <p>other: {compareResult.other.title || compareResult.other.id.slice(0, 8)}</p>
                <p>말기 순자산 변화: {formatNumber(compareResult.diff.keyMetrics.endNetWorthDeltaKrw)}원</p>
                <p>최저 현금 변화: {formatNumber(compareResult.diff.keyMetrics.worstCashDeltaKrw)}원</p>
                <p>목표 달성 수 변화: {formatNumber(compareResult.diff.keyMetrics.goalsAchievedDelta)}</p>
                <p>추가 경고: {compareResult.diff.warningsDelta.added.join(", ") || "없음"}</p>
                <p>해소 경고: {compareResult.diff.warningsDelta.removed.join(", ") || "없음"}</p>
                <p>추가 Health 경고: {compareResult.diff.healthWarningsDelta.added.join(", ") || "없음"}</p>
                <p>해소 Health 경고: {compareResult.diff.healthWarningsDelta.removed.join(", ") || "없음"}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

export default PlanningRunsClient;
