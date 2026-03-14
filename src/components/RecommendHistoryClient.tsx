"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  bodyCompactFieldClassName,
} from "@/components/ui/BodyTone";
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
          title="추천 실행 히스토리"
          description="저장된 실행을 조회/삭제/내보내기하고, 2개 실행을 선택해 변경점을 비교합니다."
          action={
            <Link href="/recommend">
              <Button variant="primary" className="rounded-full">추천으로 돌아가기</Button>
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
          {notice ? <p className="mt-4 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg inline-block">{notice}</p> : null}
        </Card>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <SubSectionHeader title="실행 목록" />
            {runs.length === 0 ? (
              <EmptyState
                className="mt-4"
                description="`/recommend`에서 추천을 실행하고 저장하면 비교할 실행 기록이 여기에 쌓입니다."
                title="저장된 실행이 없습니다."
              />
            ) : (
              <ul className="mt-4 space-y-3">
                {runs.map((run) => {
                  const selected = selectedRunIds.includes(run.runId);
                  const active = activeRun?.runId === run.runId;
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
                              보기
                            </Button>
                            <Button size="sm" type="button" onClick={() => removeOne(run.runId)} variant="ghost" className="h-7 text-[11px] font-bold text-rose-600 hover:bg-rose-50">
                              삭제
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-black text-slate-900">{formatDateTime(run.savedAt)}</p>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              {run.profile.purpose} · {run.profile.kind} · {run.items.length}건
                            </p>
                          </div>
                          <Link
                            href={`/planning/reports?runId=${encodeURIComponent(run.runId)}`}
                            className="text-[11px] font-black uppercase tracking-widest text-emerald-600 hover:underline"
                          >
                            리포트 →
                          </Link>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Button size="sm" type="button" onClick={() => exportOneJson(run)} variant="outline" className="h-7 px-3 text-[10px] font-black rounded-lg bg-white">
                            JSON
                          </Button>
                          <Button size="sm" type="button" onClick={() => exportOneCsv(run)} variant="outline" className="h-7 px-3 text-[10px] font-black rounded-lg bg-white">
                            CSV
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <SubSectionHeader title="선택 실행 상세" />
            {!activeRun ? (
              <EmptyState
                className="mt-4"
                description="왼쪽 목록에서 저장된 실행 하나를 선택하여 상세 내용을 확인하세요."
                title="실행을 선택해 주세요."
              />
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl bg-slate-900 p-6 text-white">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selected Run</p>
                    {openedFromQuery && <Badge className="bg-emerald-500/20 text-emerald-400 border-none px-2 py-0.5 text-[9px] font-black uppercase">Query Open</Badge>}
                  </div>
                  <p className="text-xl font-black tracking-tight">{formatDateTime(activeRun.savedAt)}</p>
                  <p className="mt-1 text-sm font-bold text-slate-400">항목 {activeRun.items.length}건 / 목적: {activeRun.profile.purpose}</p>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">비교 담기</span>
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
                      className="rounded-xl h-9 px-4 font-black"
                    >
                      상위 {compareTopN}개 비교함 담기
                    </Button>
                  </div>
                </div>

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
            description="목록에서 실행 2개를 선택하면 변경, 신규, 제외 항목을 분석합니다."
          />
          {selectedRuns.length !== 2 || !diff ? (
            <EmptyState
              className="py-12"
              description="목록에서 실행 2개를 선택하면 변경, 신규, 제외 항목과 상위 변경 테이블을 보여줍니다."
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
