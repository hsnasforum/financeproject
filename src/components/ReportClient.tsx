"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { downloadText } from "@/lib/browser/download";
import { getRun, type SavedRecommendRun } from "@/lib/recommend/savedRunsStore";
import type { DailyBrief } from "@/lib/dart/dailyBriefBuilder";
import {
  buildReportModel,
  type ReportDisclosureDigest,
  toJson,
  toMarkdown,
  type PlannerLastSnapshot,
} from "@/lib/report/reportBuilder";

const PLANNER_LAST_SNAPSHOT_KEY = "planner_last_snapshot_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePlannerSnapshot(raw: string | null): PlannerLastSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.savedAt !== "string") return null;
    if (!isRecord(parsed.input)) return null;
    if (!isRecord(parsed.result)) return null;
    return parsed as PlannerLastSnapshot;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(4);
}

function formatTerm(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${Math.trunc(value)}개월`;
}

function digestLevel(item: {
  representativeLevel?: "high" | "mid" | "low";
  classification?: { level?: "high" | "mid" | "low" };
}): string {
  return (item.representativeLevel ?? item.classification?.level ?? "low").toUpperCase();
}

function digestScore(item: {
  representativeScore?: number;
  classification?: { score?: number };
}): number {
  return item.representativeScore ?? item.classification?.score ?? 0;
}

function digestTitle(item: {
  representativeTitle?: string;
  reportName?: string;
}): string {
  return item.representativeTitle ?? item.reportName ?? "(제목 없음)";
}

export function ReportClient({
  runId,
  disclosureDigest,
  dailyBrief,
}: {
  runId: string | null;
  disclosureDigest: ReportDisclosureDigest | null;
  dailyBrief: DailyBrief | null;
}) {
  const [includeDisclosuresFromDigest, setIncludeDisclosuresFromDigest] = useState(false);
  const [includeDailyBrief, setIncludeDailyBrief] = useState(false);

  const savedRun: SavedRecommendRun | null = useMemo(() => {
    if (!runId) return null;
    return getRun(runId);
  }, [runId]);

  const plannerSnapshot: PlannerLastSnapshot | null = useMemo(() => {
    if (typeof window === "undefined") return null;
    return parsePlannerSnapshot(window.localStorage.getItem(PLANNER_LAST_SNAPSHOT_KEY));
  }, []);

  const digestHasData = useMemo(() => {
    const top = Array.isArray(disclosureDigest?.topHighlights) ? disclosureDigest.topHighlights : [];
    const companies = Array.isArray(disclosureDigest?.companies) ? disclosureDigest.companies : [];
    return top.length > 0 || companies.length > 0;
  }, [disclosureDigest]);

  const digestError = includeDisclosuresFromDigest && !digestHasData
    ? "로컬 digest를 찾지 못했거나 데이터가 비어 있습니다. 먼저 `pnpm dart:watch`를 실행하세요."
    : "";

  const reportModel = useMemo(() => buildReportModel({
    plannerSnapshot,
    savedRun,
    includeDisclosuresFromDigest,
    disclosureDigest,
    disclosuresError: digestError || null,
  }), [plannerSnapshot, savedRun, includeDisclosuresFromDigest, disclosureDigest, digestError]);

  function exportMarkdown() {
    const content = toMarkdown(reportModel);
    const name = reportModel.overview.runId ?? "no-run";
    downloadText(`report-${name}.md`, content, "text/markdown;charset=utf-8");
  }

  function exportJson() {
    const content = toJson(reportModel);
    const name = reportModel.overview.runId ?? "no-run";
    downloadText(`report-${name}.json`, content, "application/json;charset=utf-8");
  }

  return (
    <main data-testid="report-root" className="report-root mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <section className="print-card rounded-2xl border border-slate-200 bg-white p-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">재무설계 + 추천 리포트</h1>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={includeDisclosuresFromDigest}
                onChange={(event) => setIncludeDisclosuresFromDigest(event.target.checked)}
              />
              공시 핵심 변화 포함 (로컬 digest 기반)
            </label>
            <label className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={includeDailyBrief}
                onChange={(event) => setIncludeDailyBrief(event.target.checked)}
              />
              일일 브리핑 포함
            </label>
            <button type="button" onClick={() => window.print()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              인쇄 / PDF 저장
            </button>
            <button type="button" onClick={exportMarkdown} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Markdown 내보내기
            </button>
            <button type="button" onClick={exportJson} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              JSON 내보내기
            </button>
            <Link href="/recommend/history" className="inline-flex rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              히스토리
            </Link>
          </div>
        </div>
        {includeDisclosuresFromDigest ? (
          <p className="mt-2 text-xs text-slate-500">
            공시 섹션(로컬 digest): {reportModel.disclosures.available ? "포함" : "생략"}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>생성시각: {formatDateTime(reportModel.generatedAt)}</p>
          <p>추천 실행 ID: {reportModel.overview.runId ?? "없음"}</p>
          <p>추천 저장시각: {formatDateTime(reportModel.overview.recommendSavedAt)}</p>
          <p>플래너 저장시각: {formatDateTime(reportModel.overview.plannerSavedAt)}</p>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p>{reportModel.disclaimer}</p>
          <p className="mt-1">{reportModel.dataAsOfNote}</p>
        </div>
      </section>

      <section className="print-card rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">플래너 섹션</h2>
        {!reportModel.planner.available || !reportModel.planner.snapshot ? (
          <p className="mt-2 text-sm text-slate-600">{reportModel.planner.message}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700">
              입력 기준: 월소득 {reportModel.planner.snapshot.input.monthlyIncomeNet.toLocaleString()}원 /
              고정지출 {reportModel.planner.snapshot.input.monthlyFixedExpenses.toLocaleString()}원 /
              변동지출 {reportModel.planner.snapshot.input.monthlyVariableExpenses.toLocaleString()}원
            </p>
            <div data-testid="report-recommend-table" className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2 pr-3">지표</th>
                    <th className="py-2 pr-3">값</th>
                    <th className="py-2 pr-3">계산식</th>
                  </tr>
                </thead>
                <tbody>
                  {reportModel.planner.snapshot.result.metrics.map((metric) => (
                    <tr key={metric.key} className="border-b border-slate-100 text-slate-700">
                      <td className="py-2 pr-3">{metric.label}</td>
                      <td className="py-2 pr-3">{metric.value ?? "-"}</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{metric.formula ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">우선 액션</p>
              {reportModel.planner.snapshot.result.actions.length === 0 ? (
                <p className="mt-1 text-sm text-slate-600">액션 없음</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {reportModel.planner.snapshot.result.actions.map((action, index) => (
                    <li key={`${action.title}-${index}`}>[{action.priority}] {action.title} - {action.action}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <section className="print-card rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">추천 섹션</h2>
        {!reportModel.recommendation.available || !reportModel.recommendation.run ? (
          <p className="mt-2 text-sm text-slate-600">{reportModel.recommendation.message}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700">
              프로필: {reportModel.recommendation.run.profile.purpose} / {reportModel.recommendation.run.profile.kind} /
              topN {reportModel.recommendation.run.profile.topN}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2 pr-3">순위</th>
                    <th className="py-2 pr-3">상품</th>
                    <th className="py-2 pr-3">금리</th>
                    <th className="py-2 pr-3">기간</th>
                    <th className="py-2 pr-3">점수</th>
                    <th className="py-2 pr-3 no-print">링크</th>
                  </tr>
                </thead>
                <tbody>
                  {reportModel.recommendation.run.items.map((item) => (
                    <tr key={item.unifiedId} className="border-b border-slate-100 text-slate-700">
                      <td className="py-2 pr-3">{item.rank}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">{item.providerName}</p>
                        <p className="text-xs text-slate-500">{item.unifiedId}</p>
                      </td>
                      <td className="py-2 pr-3">{formatRate(item.appliedRate)}</td>
                      <td className="py-2 pr-3">{formatTerm(item.termMonths)}</td>
                      <td className="py-2 pr-3">{formatScore(item.finalScore)}</td>
                      <td className="py-2 pr-3 no-print">
                        <Link href={`/products/catalog/${encodeURIComponent(item.unifiedId)}`} className="text-xs font-semibold text-emerald-700 hover:underline">
                          통합 상세
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {includeDailyBrief ? (
        <section className="print-card rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">DART 일일 브리핑 (10줄)</h2>
          {!dailyBrief || !Array.isArray(dailyBrief.lines) || dailyBrief.lines.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">브리핑 파일이 없습니다. 먼저 `pnpm dart:watch`를 실행하세요.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">generatedAt: {formatDateTime(dailyBrief.generatedAt)}</p>
              <ol className="list-decimal pl-5 text-xs text-slate-700 space-y-1">
                {dailyBrief.lines.slice(0, 10).map((line, index) => (
                  <li key={`daily-brief-${index}`}>{line}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      ) : null}

      {reportModel.disclosures.included ? (
        <section className="print-card rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            {reportModel.disclosures.source === "digest" ? "공시 핵심 변화 섹션 (로컬 digest 기반)" : "공시 모니터링 섹션"}
          </h2>
          {!reportModel.disclosures.available ? (
            <p className="mt-2 text-sm text-slate-600">{reportModel.disclosures.message}</p>
          ) : reportModel.disclosures.source === "digest" && reportModel.disclosures.digest ? (
            <div className="mt-3 space-y-4">
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-900">핵심 Top</p>
                {Array.isArray(reportModel.disclosures.digest.topHighlights) &&
                reportModel.disclosures.digest.topHighlights.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                    {reportModel.disclosures.digest.topHighlights.slice(0, 10).map((item, index) => (
                      <li key={`${item.receiptNo ?? index}-${item.corpCode ?? index}`}>
                        [{digestLevel(item)} {digestScore(item)}]{" "}
                        {item.corpName ?? item.corpCode ?? "-"} / {item.receiptDate ?? "-"} / {digestTitle(item)}
                        {typeof item.count === "number" ? ` (${item.count}건)` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">핵심 공시 없음</p>
                )}
              </div>

              {Array.isArray(reportModel.disclosures.digest.companies) ? (
                reportModel.disclosures.digest.companies.map((company) => (
                  <div key={company.corpCode} className="rounded-xl border border-slate-100 p-3">
                    <p className="text-sm font-semibold text-slate-900">{company.corpName ?? company.corpCode}</p>
                    <p className="text-xs text-slate-500">
                      {company.corpCode} · 마지막 확인 {formatDateTime(company.checkedAt ?? null)} · 신규 {company.newCount ?? 0}건
                    </p>
                    {company.error ? (
                      <p className="mt-2 text-xs text-rose-600">{company.error}</p>
                    ) : (
                      <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                        {(Array.isArray(company.summaryLines) ? company.summaryLines : ["요약 없음"])
                          .slice(0, 5)
                          .map((line, index) => (
                            <li key={`${company.corpCode}-summary-${index}`}>{line}</li>
                          ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {reportModel.disclosures.entries.map((entry) => (
                <div key={entry.corpCode} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-sm font-semibold text-slate-900">{entry.corpName ?? entry.corpCode}</p>
                  <p className="text-xs text-slate-500">
                    {entry.corpCode} · 마지막 확인 {formatDateTime(entry.checkedAt ?? null)} · 신규 {entry.newCount ?? 0}건
                  </p>
                  {entry.items.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">공시 없음</p>
                  ) : (
                    <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                      {entry.items.map((item, index) => (
                        <li key={`${entry.corpCode}-${item.receiptNo ?? index}`}>
                          {item.receiptDate ?? "-"} {item.reportName ?? "(제목 없음)"} {item.receiptNo ? `(${item.receiptNo})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!runId ? (
        <section className="no-print rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          `runId` 쿼리가 없습니다. `/report?runId=...` 형태로 접근해 주세요.
        </section>
      ) : null}
    </main>
  );
}
