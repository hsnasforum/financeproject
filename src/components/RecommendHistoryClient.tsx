"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BodyActionLink,
  BodyEmptyState,
  BodyInset,
  BodySectionHeading,
  BodyTableFrame,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
  bodyInlineActionLinkClassName,
  bodyMetaChipClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BodySectionHeading
            title="추천 실행 히스토리"
            description={
              <>
                <span className="block text-sm text-slate-600">저장된 실행을 조회/삭제/내보내기하고, 2개 실행을 선택해 변경점을 비교합니다.</span>
                <span className="mt-1 block text-xs text-amber-700">이 화면의 리포트 열기는 planning 공식 <code>/planning/reports</code> 경로를 사용합니다. legacy <code>/report</code> 는 명시적 opt-in일 때만 엽니다.</span>
              </>
            }
          />
          <BodyActionLink href="/recommend" className={bodyInlineActionLinkClassName}>
            추천으로 돌아가기
          </BodyActionLink>
        </div>
        <div className={`mt-4 text-xs ${bodyDenseActionRowClassName}`}>
          <Button size="sm" type="button" variant="outline" onClick={refresh}>
            새로고침
          </Button>
          <Button
            size="sm"
            onClick={clearAll}
            disabled={runs.length === 0}
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            전체 삭제
          </Button>
          <span className={bodyMetaChipClassName}>저장된 실행: {runs.length} / 50</span>
        </div>
        {notice ? <p className="mt-2 text-xs text-slate-600">{notice}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <BodySectionHeading title="실행 목록" />
          {runs.length === 0 ? (
            <BodyEmptyState
              className="mt-3"
              description="`/recommend`에서 추천을 실행하고 저장하면 비교할 실행 기록이 여기에 쌓입니다."
              title="저장된 실행이 없습니다."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {runs.map((run) => {
                const selected = selectedRunIds.includes(run.runId);
                const active = activeRun?.runId === run.runId;
                return (
                  <li key={run.runId}>
                    <BodyInset className={`p-3 ${active ? "border-slate-400" : "bg-white"}`}>
                    <div className={`text-xs ${bodyDenseActionRowClassName}`}>
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input type="checkbox" checked={selected} onChange={() => toggleRunSelection(run.runId)} />
                        비교 선택
                      </label>
                      <Button size="sm" type="button" onClick={() => setActiveRunId(run.runId)} variant="outline">
                        보기
                      </Button>
                      <Button size="sm" type="button" onClick={() => exportOneJson(run)} variant="outline">
                        JSON
                      </Button>
                      <Button size="sm" type="button" onClick={() => exportOneCsv(run)} variant="outline">
                        CSV
                      </Button>
                      <Link
                        href={`/planning/reports?runId=${encodeURIComponent(run.runId)}`}
                        data-testid={active ? "history-open-report" : undefined}
                        className={bodyInlineActionLinkClassName}
                      >
                        planning 리포트
                      </Link>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => removeOne(run.runId)}
                        variant="outline"
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      >
                        삭제
                      </Button>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(run.savedAt)}</p>
                    <p className="text-xs text-slate-600">
                      {run.profile.purpose} / {run.profile.kind} / {run.items.length}건 / topN {run.profile.topN}
                    </p>
                    </BodyInset>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <BodySectionHeading title="선택 실행" />
          {!activeRun ? (
            <BodyEmptyState
              className="mt-3"
              description="왼쪽 목록에서 저장된 실행 하나를 열면 상위 상품과 비교 담기 동작을 여기서 바로 이어갈 수 있습니다."
              title="실행을 선택해 주세요."
            />
          ) : (
            <>
              {openedFromQuery ? (
                <p data-testid="history-open-run" className="mt-2 text-xs text-emerald-700">
                  open run: {activeRun.runId}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-700">
                저장 시각: {formatDateTime(activeRun.savedAt)} / 항목 {activeRun.items.length}건
              </p>
              <div className={`mt-3 text-xs ${bodyDenseActionRowClassName}`}>
                <label className="inline-flex items-center gap-2 text-slate-700">
                  비교 담기 개수
                  <select
                    className={bodyCompactFieldClassName}
                    value={compareTopN}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setCompareTopN(next === 2 || next === 4 ? next : 3);
                    }}
                  >
                    <option value={2}>2개</option>
                    <option value={3}>3개</option>
                    <option value={4}>4개</option>
                  </select>
                </label>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => addTopItemsToCompare(activeRun)}
                  disabled={activeRun.items.length < 2}
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  상위 {compareTopN}개 비교 담기
                </Button>
              </div>
              <BodyTableFrame className="mt-3">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2 pr-3">순위</th>
                      <th className="py-2 pr-3">상품</th>
                      <th className="py-2 pr-3">금리</th>
                      <th className="py-2 pr-3">기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRun.items
                      .slice()
                      .sort((a, b) => a.rank - b.rank)
                      .slice(0, 10)
                      .map((item) => (
                        <tr key={`${activeRun.runId}-${item.unifiedId}`} className="border-b border-slate-100 text-slate-700">
                          <td className="py-2 pr-3">{item.rank}</td>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-slate-900">{item.productName}</p>
                            <p className="text-xs text-slate-500">{item.providerName}</p>
                          </td>
                          <td className="py-2 pr-3">{formatRate(item.appliedRate)}</td>
                          <td className="py-2 pr-3">{formatTerm(item.termMonths)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </BodyTableFrame>
            </>
          )}
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <BodySectionHeading title="실행 비교 (2개 선택)" />
        {selectedRuns.length !== 2 || !diff ? (
          <BodyEmptyState
            className="mt-3"
            description="목록에서 실행 2개를 선택하면 변경, 신규, 제외 항목과 상위 변경 테이블을 보여줍니다."
            title="비교할 실행 2개를 선택해 주세요."
          />
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700">
              기준: {formatDateTime(diff.previous.savedAt)} → {formatDateTime(diff.current.savedAt)}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <BodyInset className="text-sm">
                <p className="font-semibold text-slate-900">변경</p>
                <p className="mt-1 text-slate-700">{diff.changed.length}건</p>
              </BodyInset>
              <BodyInset className="text-sm">
                <p className="font-semibold text-slate-900">신규</p>
                <p className="mt-1 text-slate-700">{diff.added.length}건</p>
              </BodyInset>
              <BodyInset className="text-sm">
                <p className="font-semibold text-slate-900">제외</p>
                <p className="mt-1 text-slate-700">{diff.removed.length}건</p>
              </BodyInset>
            </div>

            {diff.changed.length > 0 ? (
              <BodyTableFrame className="mt-4">
                <p className="text-sm font-semibold text-slate-900">상위 변경 테이블</p>
                <table className="mt-2 min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2 pr-3">상품</th>
                      <th className="py-2 pr-3">순위</th>
                      <th className="py-2 pr-3">금리</th>
                      <th className="py-2 pr-3">기간</th>
                      <th className="py-2 pr-3">점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.changed.slice(0, 12).map((item) => (
                      <tr key={item.unifiedId} className="border-b border-slate-100 align-top text-slate-700">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-slate-900">{item.productName}</p>
                          <p className="text-xs text-slate-500">{item.providerName}</p>
                        </td>
                        <td className="py-2 pr-3">{item.previousRank}위 → {item.currentRank}위</td>
                        <td className="py-2 pr-3">{formatRate(item.previousRate)} → {formatRate(item.currentRate)}</td>
                        <td className="py-2 pr-3">{formatTerm(item.previousTermMonths)} → {formatTerm(item.currentTermMonths)}</td>
                        <td className="py-2 pr-3">{formatScore(item.previousScore)} → {formatScore(item.currentScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </BodyTableFrame>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">신규</p>
                {diff.added.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">없음</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {diff.added.slice(0, 8).map((item) => (
                      <li key={`added-${item.unifiedId}`}>{item.productName}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">제외</p>
                {diff.removed.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-600">없음</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {diff.removed.slice(0, 8).map((item) => (
                      <li key={`removed-${item.unifiedId}`}>{item.productName}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
