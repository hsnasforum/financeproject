"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/browser/download";
import { addCompareIdToStorage, compareStoreConfig } from "@/lib/products/compareStore";
import {
  clearRuns,
  exportRunCsv,
  exportRunJson,
  listRuns,
  removeRun,
  type SavedRecommendRun,
  type SavedRunItem,
} from "@/lib/recommend/savedRunsStore";

type DiffChangedRow = {
  unifiedId: string;
  productName: string;
  providerName: string;
  previousRank: number;
  currentRank: number;
  previousRate: number | null;
  currentRate: number | null;
  previousTermMonths: number | null;
  currentTermMonths: number | null;
  previousScore: number;
  currentScore: number;
  changedFields: Array<"rank" | "rate" | "term" | "score">;
};

type RunDiff = {
  previous: SavedRecommendRun;
  current: SavedRecommendRun;
  changed: DiffChangedRow[];
  added: SavedRunItem[];
  removed: SavedRunItem[];
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function formatPurposeLabel(value: SavedRecommendRun["profile"]["purpose"]): string {
  if (value === "emergency") return "단기 비상금";
  if (value === "long-term") return "장기 저축";
  return "목돈 마련";
}

function formatKindLabel(value: SavedRecommendRun["profile"]["kind"]): string {
  return value === "saving" ? "정기 적금" : "정기 예금";
}

function formatLiquidityLabel(value: SavedRecommendRun["profile"]["liquidityPref"]): string {
  if (value === "high") return "유동성 우선";
  if (value === "low") return "만기 유지 우선";
  return "중간 유동성 고려";
}

function formatRateModeLabel(value: SavedRecommendRun["profile"]["rateMode"]): string {
  if (value === "base") return "기본 금리 우선";
  if (value === "simple") return "우대 조건 없는 단순 상품";
  return "최고 금리 우선";
}

function formatDepositProtectionLabel(value: SavedRecommendRun["profile"]["depositProtection"]): string {
  if (value === "require") return "예금자 보호 필수";
  if (value === "prefer") return "예금자 보호 우선";
  return "예금자 보호 조건 무관";
}

function buildRunConditionSummary(profile: SavedRecommendRun["profile"]): string {
  return [
    `${profile.preferredTerm}개월 선호`,
    formatLiquidityLabel(profile.liquidityPref),
    formatRateModeLabel(profile.rateMode),
    formatDepositProtectionLabel(profile.depositProtection),
  ].join(" · ");
}

function buildNextActionHelper(planningRunId?: string): string {
  if (planningRunId) {
    return "저장해 둔 비교 후보를 다시 읽고, 필요하면 저장 당시 플래닝 근거까지 이어서 확인할 수 있습니다.";
  }
  return "저장해 둔 비교 후보를 다시 읽은 뒤, 필요할 때만 새 비교를 열어 다음 후보를 더 좁혀 볼 수 있습니다.";
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatTerm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${Math.trunc(value)}개월`;
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(4);
}

function toTimestamp(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function selectPreviousAndCurrent(runs: SavedRecommendRun[]): { previous: SavedRecommendRun; current: SavedRecommendRun } | null {
  if (runs.length !== 2) return null;
  const [a, b] = runs;
  if (!a || !b) return null;
  if (toTimestamp(a.savedAt) <= toTimestamp(b.savedAt)) return { previous: a, current: b };
  return { previous: b, current: a };
}

function computeDiff(previous: SavedRecommendRun, current: SavedRecommendRun): RunDiff {
  const prevMap = new Map(previous.items.map((item) => [item.unifiedId, item]));
  const currMap = new Map(current.items.map((item) => [item.unifiedId, item]));

  const changed: DiffChangedRow[] = [];
  const added: SavedRunItem[] = [];
  const removed: SavedRunItem[] = [];

  for (const item of current.items) {
    const prev = prevMap.get(item.unifiedId);
    if (!prev) {
      added.push(item);
      continue;
    }

    const changedFields: DiffChangedRow["changedFields"] = [];
    if (prev.rank !== item.rank) changedFields.push("rank");
    if ((prev.termMonths ?? null) !== (item.termMonths ?? null)) changedFields.push("term");
    if ((prev.appliedRate ?? null) !== (item.appliedRate ?? null)) changedFields.push("rate");
    if (Math.abs(prev.finalScore - item.finalScore) >= 0.0001) changedFields.push("score");
    if (changedFields.length === 0) continue;

    changed.push({
      unifiedId: item.unifiedId,
      productName: item.productName,
      providerName: item.providerName,
      previousRank: prev.rank,
      currentRank: item.rank,
      previousRate: prev.appliedRate,
      currentRate: item.appliedRate,
      previousTermMonths: prev.termMonths,
      currentTermMonths: item.termMonths,
      previousScore: prev.finalScore,
      currentScore: item.finalScore,
      changedFields,
    });
  }

  for (const item of previous.items) {
    if (!currMap.has(item.unifiedId)) removed.push(item);
  }

  changed.sort((a, b) => {
    const aWeight = Math.abs(a.previousRank - a.currentRank) + Math.abs(a.currentScore - a.previousScore) * 10 + a.changedFields.length;
    const bWeight = Math.abs(b.previousRank - b.currentRank) + Math.abs(b.currentScore - b.previousScore) * 10 + b.changedFields.length;
    if (aWeight !== bWeight) return bWeight - aWeight;
    return a.currentRank - b.currentRank;
  });

  return {
    previous,
    current,
    changed,
    added: [...added].sort((a, b) => a.rank - b.rank),
    removed: [...removed].sort((a, b) => a.rank - b.rank),
  };
}

function RunIdentifierDisclosure({
  runId,
  planningRunId,
  tone,
}: {
  runId: string;
  planningRunId?: string;
  tone: "slate" | "emerald";
}) {
  const openedClassName = tone === "emerald"
    ? "rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
    : "rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3";
  const summaryClassName = tone === "emerald"
    ? "cursor-pointer list-none text-[11px] font-semibold text-white/75 marker:hidden"
    : "cursor-pointer list-none text-[11px] font-semibold text-slate-500 marker:hidden";
  const bodyClassName = tone === "emerald"
    ? "mt-3 space-y-2 text-[11px] font-medium leading-relaxed text-emerald-50/90"
    : "mt-3 space-y-2 text-[11px] font-medium leading-relaxed text-slate-500";
  const idClassName = tone === "emerald" ? "font-mono text-white" : "font-mono text-slate-700";

  return (
    <details className={openedClassName}>
      <summary className={summaryClassName}>공유·복구용 보조 정보</summary>
      <div className={bodyClassName}>
        <p>직접 공유나 복구, 지원 대응이 꼭 필요할 때만 raw 식별자를 열어 확인해 주세요.</p>
        <p>
          추천 기록 식별자 (runId): <span className={idClassName}>{runId}</span>
        </p>
        <p>
          플래닝 연결 식별자 (planningRunId): {planningRunId ? <span className={idClassName}>{planningRunId}</span> : "연결된 값 없음"}
        </p>
      </div>
    </details>
  );
}

export function RecommendHistoryClient({
  initialOpenRunId = null,
}: {
  initialOpenRunId?: string | null;
}) {
  const [runs, setRuns] = useState<SavedRecommendRun[]>(() => listRuns());
  const [activeRunId, setActiveRunId] = useState<string | null>(() => {
    const current = listRuns();
    if (initialOpenRunId && current.some((run) => run.runId === initialOpenRunId)) return initialOpenRunId;
    return current[0]?.runId ?? null;
  });
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [compareTopN, setCompareTopN] = useState<2 | 3 | 4>(3);
  const [notice, setNotice] = useState("");

  const activeRun = useMemo(() => runs.find((run) => run.runId === activeRunId) ?? runs[0] ?? null, [activeRunId, runs]);

  const selectedRuns = useMemo(() => {
    const picked = selectedRunIds
      .map((runId) => runs.find((run) => run.runId === runId))
      .filter((run): run is SavedRecommendRun => Boolean(run));
    return picked.slice(0, 2);
  }, [runs, selectedRunIds]);

  const diff = useMemo(() => {
    const pair = selectPreviousAndCurrent(selectedRuns);
    if (!pair) return null;
    return computeDiff(pair.previous, pair.current);
  }, [selectedRuns]);
  const openedFromQuery = Boolean(
    initialOpenRunId
    && activeRun
    && activeRun.runId === initialOpenRunId,
  );

  function refresh() {
    const next = listRuns();
    setRuns(next);
    setActiveRunId((prev) => (next.some((run) => run.runId === prev) ? prev : (next[0]?.runId ?? null)));
    setSelectedRunIds((prev) => prev.filter((runId) => next.some((run) => run.runId === runId)).slice(0, 2));
  }

  function toggleRunSelection(runId: string) {
    setSelectedRunIds((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length < 2) return [...prev, runId];
      return [prev[1] ?? runId, runId];
    });
  }

  function removeOne(runId: string) {
    removeRun(runId);
    refresh();
    setNotice("실행 기록을 삭제했습니다.");
  }

  function clearAll() {
    clearRuns();
    refresh();
    setNotice("모든 실행 기록을 삭제했습니다.");
  }

  function exportOneJson(run: SavedRecommendRun) {
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}-${run.runId}.json`, exportRunJson(run), "application/json;charset=utf-8");
    setNotice("JSON 파일을 내보냈습니다.");
  }

  function exportOneCsv(run: SavedRecommendRun) {
    downloadText(`recommend-run-${run.savedAt.slice(0, 10)}-${run.runId}.csv`, exportRunCsv(run), "text/csv;charset=utf-8");
    setNotice("CSV 파일을 내보냈습니다.");
  }

  function addTopItemsToCompare(run: SavedRecommendRun) {
    const topItems = [...run.items].sort((a, b) => a.rank - b.rank).slice(0, compareTopN);
    if (topItems.length < 2) {
      setNotice("비교 담기를 위해 최소 2개 항목이 필요합니다.");
      return;
    }
    let count = 0;
    for (const item of topItems) {
      const next = addCompareIdToStorage(item.unifiedId, compareStoreConfig.max);
      count = next.length;
    }
    setNotice(`상위 ${topItems.length}개를 비교함에 담았습니다. (${count}/${compareStoreConfig.max})`);
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4">
        <PageHeader
          title="추천 비교 기록"
          description="저장해 둔 추천 결과를 다시 읽고, 필요할 때만 다음 비교나 플래닝 근거 확인으로 이어 가는 기록 화면입니다."
          action={
            <Link href="/recommend">
              <Button variant="primary" className="rounded-full">새 추천 비교 열기</Button>
            </Link>
          }
        />

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" type="button" variant="outline" className="rounded-xl h-9 font-bold" onClick={refresh}>
                새로고침
              </Button>
              <Button
                size="sm"
                onClick={clearAll}
                disabled={runs.length === 0}
                variant="outline"
                className="rounded-xl h-9 border-rose-200 text-rose-700 hover:bg-rose-50 font-bold"
              >
                전체 삭제
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">저장된 실행</span>
              <span className="text-sm font-black text-emerald-600">{runs.length} / 50</span>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">
            이 기록은 확정 답안을 저장하는 곳이 아니라, 조건이나 시점을 바꿔 다시 본 결과를 비교해 보는 용도입니다.
          </p>
          {notice ? <p className="mt-4 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg inline-block">{notice}</p> : null}
        </Card>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <SubSectionHeader
              title="실행 목록"
              description="언제 저장했고 어떤 목적과 조건이었는지 먼저 확인한 뒤, 비교할 실행 2개를 고르세요."
            />
            {runs.length === 0 ? (
              <EmptyState
                className="mt-4"
                description="먼저 `/recommend`에서 추천 비교를 저장하면, 이후에는 이 화면에서 저장 기록을 다시 읽고 조건 차이를 비교할 수 있습니다."
                title="저장된 실행이 없습니다."
              />
            ) : (
              <ul className="mt-4 space-y-3">
                {runs.map((run) => {
                  const selected = selectedRunIds.includes(run.runId);
                  const active = activeRun?.runId === run.runId;
                  const planningRunId = run.profile.planning?.runId?.trim() ?? "";
                  let planningReportHref = "";
                  if (planningRunId) {
                    const params = new URLSearchParams({
                      runId: planningRunId,
                      recommendRunId: run.runId,
                    });
                    planningReportHref = `/planning/reports?${params.toString()}`;
                  }
                  return (
                    <li key={run.runId}>
                      <div className={cn(
                        "rounded-2xl border p-4 transition-all",
                        active ? "border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500" : "border-slate-100 bg-slate-50/50 hover:border-slate-200"
                      )}>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              checked={selected}
                              onChange={() => toggleRunSelection(run.runId)}
                            />
                            비교 선택
                          </label>
                          <div className="flex items-center gap-1">
                            <Button size="sm" type="button" onClick={() => setActiveRunId(run.runId)} variant="ghost" className="h-7 text-[11px] font-bold">
                              상세 열기
                            </Button>
                            <Button size="sm" type="button" onClick={() => removeOne(run.runId)} variant="ghost" className="h-7 text-[11px] font-bold text-rose-600 hover:bg-rose-50">
                              삭제
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">저장 시점</p>
                            <p className="mt-1 text-sm font-black text-slate-900">{formatDateTime(run.savedAt)}</p>
                            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">저장 조건</p>
                            <p className="mt-1 text-xs font-bold text-slate-700">
                              {formatPurposeLabel(run.profile.purpose)} · {formatKindLabel(run.profile.kind)} · 상위 {run.items.length}건 저장
                            </p>
                            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                              {buildRunConditionSummary(run.profile)}
                            </p>
                            <p className="mt-3 text-[11px] font-medium leading-relaxed text-slate-500">
                              {buildNextActionHelper(planningRunId)}
                            </p>
                          </div>
                          <div className="max-w-[15rem] text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">다음에 할 일</p>
                            {planningRunId ? (
                              <>
                                <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                                  저장 당시 플래닝 보고서로 이어 가면 왜 이 후보를 확인했는지 판단 근거를 다시 읽을 수 있습니다.
                                </p>
                                <Link
                                  href={planningReportHref}
                                  className="mt-3 inline-flex text-[11px] font-black uppercase tracking-widest text-emerald-600 hover:underline"
                                >
                                  저장 당시 플래닝 보기 →
                                </Link>
                              </>
                            ) : (
                              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                                연결된 플래닝 실행은 없지만, 이 기록 안에서 저장 조건과 후보를 다시 읽어 다음 비교 전 판단 기준을 정리할 수 있습니다.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Button size="sm" type="button" onClick={() => exportOneJson(run)} variant="outline" className="h-7 px-3 text-[10px] font-black rounded-lg bg-white">
                            JSON
                          </Button>
                          <Button size="sm" type="button" onClick={() => exportOneCsv(run)} variant="outline" className="h-7 px-3 text-[10px] font-black rounded-lg bg-white">
                            CSV
                          </Button>
                        </div>

                        <div className="mt-4 border-t border-slate-200/70 pt-4">
                          <RunIdentifierDisclosure runId={run.runId} planningRunId={planningRunId} tone="slate" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <SubSectionHeader
              title="선택 실행 상세"
              description="저장 시점, 목적, 조건, 다음 행동을 먼저 읽고 필요할 때만 보조 식별자를 확인하는 영역입니다."
            />
            {!activeRun ? (
              <EmptyState
                className="mt-4"
                description="왼쪽 목록에서 저장된 실행 하나를 선택하여 상세 내용을 확인하세요."
                title="실행을 선택해 주세요."
              />
          ) : (
              <div className="space-y-6">
                {(() => {
                  const activePlanningRunId = activeRun.profile.planning?.runId?.trim() ?? "";
                  let activePlanningReportHref = "";
                  if (activePlanningRunId) {
                    const params = new URLSearchParams({
                      runId: activePlanningRunId,
                      recommendRunId: activeRun.runId,
                    });
                    activePlanningReportHref = `/planning/reports?${params.toString()}`;
                  }
                  return (
                <div className="rounded-2xl bg-emerald-600 p-6 text-white shadow-xl shadow-emerald-900/20">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">현재 선택한 기록</p>
                    {openedFromQuery && <Badge className="bg-white/20 text-white border-none px-2 py-0.5 text-[9px] font-black uppercase">링크로 열기</Badge>}
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100/80">저장 시점</p>
                  <p className="text-xl font-black tracking-tight">{formatDateTime(activeRun.savedAt)}</p>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-emerald-100/80">저장 조건</p>
                  <p className="mt-1 text-sm font-bold text-emerald-100/90">
                    {formatPurposeLabel(activeRun.profile.purpose)} · {formatKindLabel(activeRun.profile.kind)} · 상위 {activeRun.items.length}건 저장
                  </p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-50/90">
                    {buildRunConditionSummary(activeRun.profile)}
                  </p>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-emerald-50/90">
                    저장 당시 조건에서 왜 이 후보들이 남았는지 다시 읽고, 필요할 때만 다음 행동으로 이어 보세요.
                  </p>
                  <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100/80">다음에 할 일</p>
                    <p className="mt-2 text-[11px] font-medium leading-relaxed text-emerald-50/90">
                      {buildNextActionHelper(activePlanningRunId)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                        <span className="text-[10px] font-bold text-emerald-100 uppercase">비교 담기</span>
                        <select
                          className="bg-transparent text-xs font-black outline-none cursor-pointer"
                          value={compareTopN}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setCompareTopN(next === 2 || next === 4 ? next : 3);
                          }}
                        >
                          <option className="text-slate-900" value={2}>2개</option>
                          <option className="text-slate-900" value={3}>3개</option>
                          <option className="text-slate-900" value={4}>4개</option>
                        </select>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => addTopItemsToCompare(activeRun)}
                        disabled={activeRun.items.length < 2}
                        variant="primary"
                        className="rounded-xl h-9 px-4 font-black bg-white text-emerald-600 hover:bg-emerald-50 border-none shadow-lg shadow-emerald-900/10"
                      >
                        상위 {compareTopN}개 비교 후보 담기
                      </Button>
                      {activePlanningRunId ? (
                        <Link href={activePlanningReportHref}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl h-9 px-4 font-black border-white/30 bg-white/10 text-white hover:bg-white/20"
                          >
                            저장 당시 플래닝 보기
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="mt-2 text-[11px] font-medium leading-relaxed text-emerald-50/90">
                      식별자는 첫 화면에서 바로 읽어야 할 핵심 정보가 아니라, 공유나 복구, 지원 대응이 필요할 때만 확인하는 보조 정보입니다.
                    </p>
                    <div className="mt-3">
                      <RunIdentifierDisclosure
                        runId={activeRun.runId}
                        planningRunId={activePlanningRunId}
                        tone="emerald"
                      />
                    </div>
                  </div>
                </div>
                  );
                })()}

                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <th className="px-4 py-3">순위</th>
                        <th className="px-4 py-3">상품 정보</th>
                        <th className="px-4 py-3 text-right">금리/기간</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                      {activeRun.items
                        .slice()
                        .sort((a, b) => a.rank - b.rank)
                        .slice(0, 10)
                        .map((item) => (
                          <tr key={`${activeRun.runId}-${item.unifiedId}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4 font-black text-slate-400 text-center w-12">{item.rank}</td>
                            <td className="px-4 py-4">
                              <p className="font-bold text-slate-900 leading-tight">{item.productName}</p>
                              <p className="mt-0.5 text-[10px] font-medium text-slate-400 uppercase tracking-tight">{item.providerName}</p>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <p className="font-black text-emerald-600 tabular-nums">{formatRate(item.appliedRate)}</p>
                              <p className="text-[10px] font-bold text-slate-400">{formatTerm(item.termMonths)}</p>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </section>

        <Card className="p-6">
          <SubSectionHeader
            title="실행 비교"
            description="조건이나 저장 시점이 달라졌을 때 어떤 후보가 바뀌었는지 비교합니다."
          />
          {selectedRuns.length !== 2 || !diff ? (
            <EmptyState
              className="py-12"
              description="목록에서 실행 2개를 선택하면 변경, 신규, 제외 항목과 상위 변화 포인트를 비교용으로 보여줍니다."
              title="비교할 실행 2개를 선택해 주세요."
            />
          ) : (
            <div className="space-y-8">
              <div className="rounded-[2rem] bg-emerald-50/50 p-8 border border-emerald-100 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 mb-2">Comparison Analysis</p>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    {formatDateTime(diff.previous.savedAt)} <span className="mx-2 text-emerald-300">→</span> {formatDateTime(diff.current.savedAt)}
                  </h3>
                </div>
                <div className="flex gap-4">
                  <div className="text-center bg-white px-6 py-3 rounded-2xl shadow-sm border border-emerald-100 min-w-[100px]">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">변경</p>
                    <p className="text-lg font-black text-emerald-600">{diff.changed.length}<span className="text-xs ml-0.5">건</span></p>
                  </div>
                  <div className="text-center bg-white px-6 py-3 rounded-2xl shadow-sm border border-emerald-100 min-w-[100px]">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">신규</p>
                    <p className="text-lg font-black text-emerald-600">{diff.added.length}<span className="text-xs ml-0.5">건</span></p>
                  </div>
                  <div className="text-center bg-white px-6 py-3 rounded-2xl shadow-sm border border-emerald-100 min-w-[100px]">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">제외</p>
                    <p className="text-lg font-black text-slate-400">{diff.removed.length}<span className="text-xs ml-0.5">건</span></p>
                  </div>
                </div>
              </div>

              {diff.changed.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-black text-slate-900 px-1">상위 변경 테이블</p>
                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-4 py-3">상품명</th>
                          <th className="px-4 py-3">순위 변화</th>
                          <th className="px-4 py-3">금리 변화</th>
                          <th className="px-4 py-3 text-right">점수</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 bg-white">
                        {diff.changed.slice(0, 12).map((item) => (
                          <tr key={item.unifiedId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4">
                              <p className="font-bold text-slate-900 leading-tight">{item.productName}</p>
                              <p className="mt-0.5 text-[10px] font-medium text-slate-400 uppercase tracking-tight">{item.providerName}</p>
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-slate-600">
                              {item.previousRank}위 <span className="mx-1 text-slate-300">→</span> {item.currentRank}위
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-emerald-600 tabular-nums">
                              {formatRate(item.previousRate)} <span className="mx-1 text-emerald-200">→</span> {formatRate(item.currentRate)}
                            </td>
                            <td className="px-4 py-4 text-right text-xs font-black text-slate-400 tabular-nums">
                              {formatScore(item.previousScore)} <span className="mx-1 text-slate-200">→</span> {formatScore(item.currentScore)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 p-6 bg-slate-50/30">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-4">신규 진입 상품</p>
                  {diff.added.length === 0 ? (
                    <p className="text-sm font-medium text-slate-400 italic text-center py-4">목록에 새로 추가된 상품이 없습니다.</p>
                  ) : (
                    <ul className="space-y-3">
                      {diff.added.slice(0, 8).map((item) => (
                        <li key={`added-${item.unifiedId}`} className="flex items-center gap-3">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="text-sm font-bold text-slate-700">{item.productName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-100 p-6 bg-slate-50/30">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">순위권 제외 상품</p>
                  {diff.removed.length === 0 ? (
                    <p className="text-sm font-medium text-slate-400 italic text-center py-4">목록에서 제외된 상품이 없습니다.</p>
                  ) : (
                    <ul className="space-y-3">
                      {diff.removed.slice(0, 8).map((item) => (
                        <li key={`removed-${item.unifiedId}`} className="flex items-center gap-3 opacity-60">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                          <span className="text-sm font-bold text-slate-700">{item.productName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
