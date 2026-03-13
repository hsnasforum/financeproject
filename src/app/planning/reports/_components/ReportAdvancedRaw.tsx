"use client";

import { useMemo, useState } from "react";
import { type PlanningInterpretationPolicy } from "@/lib/planning/catalog/planningPolicy";
import { type AssumptionsOverrideEntry } from "@/lib/planning/assumptions/overrides";
import { Card } from "@/components/ui/Card";
import {
  reportSurfaceButtonClassName,
  reportSurfaceDetailClassName,
  reportSurfaceInsetClassName,
} from "@/components/ui/ReportTone";

type Props = {
  reproducibility?: {
    runId: string;
    createdAt: string;
    assumptionsSnapshotId?: string;
    staleDays?: number;
    appVersion: string;
    engineVersion: string;
    profileHash: string;
    assumptionsHash?: string;
    effectiveAssumptionsHash?: string;
    appliedOverrides: AssumptionsOverrideEntry[];
    policy: PlanningInterpretationPolicy;
  };
  raw?: {
    reportMarkdown?: string;
    runJson?: unknown;
    runJsonPreview?: {
      text: string;
      nextCursor: number;
      hasMore: boolean;
      totalChars: number;
      loading?: boolean;
      error?: string;
    };
  };
  onLoadMoreRunJson?: () => void;
};

const MARKDOWN_CHUNK_CHARS = 8_000;

function profileHashPrefix(value: string): string {
  const text = value.trim();
  if (!text) return "-";
  return text.slice(0, 12);
}

function SafeTextViewer(props: {
  title: string;
  text: string;
  testId: string;
  chunkChars?: number;
}) {
  const { title, text, testId, chunkChars = MARKDOWN_CHUNK_CHARS } = props;
  const [visibleChars, setVisibleChars] = useState(chunkChars);
  const safeText = useMemo(() => text ?? "", [text]);
  const rendered = safeText.slice(0, visibleChars);
  const hasMore = rendered.length < safeText.length;
  return (
    <details className={`${reportSurfaceInsetClassName} p-3`}>
      <summary className="cursor-pointer text-sm font-semibold text-white/85">{title}</summary>
      <pre className="mt-3 max-h-[40vh] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100" data-testid={testId}>
        {rendered}
      </pre>
      {hasMore ? (
        <button
          className={`mt-2 text-xs ${reportSurfaceButtonClassName}`}
          onClick={() => setVisibleChars((prev) => prev + chunkChars)}
          type="button"
        >
          더 보기 ({Math.min(chunkChars, safeText.length - rendered.length).toLocaleString("ko-KR")} chars)
        </button>
      ) : null}
      <p className="mt-1 text-[11px] text-white/55">
        {safeText.length.toLocaleString("ko-KR")} chars
      </p>
    </details>
  );
}

export default function ReportAdvancedRaw({ reproducibility, raw, onLoadMoreRunJson }: Props) {
  if (!reproducibility && !raw?.reportMarkdown && !raw?.runJson && !raw?.runJsonPreview) return null;

  const runJsonPreview = raw?.runJsonPreview;
  const fallbackRunJson = raw?.runJson ? JSON.stringify(raw.runJson, null, 2) : "";

  return (
    <Card className="space-y-4 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-xl" data-testid="report-advanced-raw">
      <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Advanced Raw</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-white">Advanced (원문)</h2>
        <p className="mt-1 text-sm text-white/70">재현성과 원문 확인용 영역도 동일한 리포트 톤으로 맞췄습니다.</p>
      </div>
      {reproducibility ? (
        <details className={`${reportSurfaceInsetClassName} rounded-3xl p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-white">Reproducibility</summary>
          <div className="mt-3 space-y-2 text-xs text-white/80">
            <p><span className="font-semibold text-white">runId</span>: {reproducibility.runId}</p>
            <p><span className="font-semibold text-white">createdAt</span>: {reproducibility.createdAt}</p>
            <p><span className="font-semibold text-white">assumptionsSnapshotId</span>: {reproducibility.assumptionsSnapshotId ?? "-"}</p>
            <p><span className="font-semibold text-white">staleDays</span>: {typeof reproducibility.staleDays === "number" ? reproducibility.staleDays : "-"}</p>
            <p><span className="font-semibold text-white">appVersion</span>: {reproducibility.appVersion}</p>
            <p><span className="font-semibold text-white">engineVersion</span>: {reproducibility.engineVersion}</p>
            <p><span className="font-semibold text-white">profileHash</span>: {profileHashPrefix(reproducibility.profileHash)}</p>
            <p><span className="font-semibold text-white">assumptionsHash</span>: {reproducibility.assumptionsHash ? profileHashPrefix(reproducibility.assumptionsHash) : "-"}</p>
            <p><span className="font-semibold text-white">effectiveAssumptionsHash</span>: {reproducibility.effectiveAssumptionsHash ? profileHashPrefix(reproducibility.effectiveAssumptionsHash) : "-"}</p>
            <div>
              <p className="font-semibold text-white">applied overrides</p>
              {reproducibility.appliedOverrides.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {reproducibility.appliedOverrides.map((override) => (
                    <li key={`${override.key}:${override.updatedAt}`}>
                      {override.key}={override.value}
                      {override.reason ? ` (${override.reason})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-white/60">적용된 오버라이드 없음</p>
              )}
            </div>
            <div>
              <p className="font-semibold text-white">policy thresholds</p>
              <pre className={`mt-1 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100 ${reportSurfaceDetailClassName}`}>
                {JSON.stringify(reproducibility.policy, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      ) : null}
      {raw?.reportMarkdown ? (
        <SafeTextViewer testId="report-markdown-preview" text={raw.reportMarkdown} title="report markdown 원문" />
      ) : null}
      {runJsonPreview ? (
        <details className={`${reportSurfaceInsetClassName} rounded-3xl p-4 shadow-sm`}>
          <summary className="cursor-pointer text-sm font-semibold text-white">run raw json (안전 미리보기)</summary>
          <pre className="mt-3 max-h-[40vh] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100" data-testid="report-runjson-preview">
            {runJsonPreview.text}
          </pre>
          <div className="mt-2 flex items-center gap-2">
            {runJsonPreview.hasMore ? (
              <button
                className={`text-xs ${reportSurfaceButtonClassName}`}
                onClick={() => onLoadMoreRunJson?.()}
                type="button"
              >
                {runJsonPreview.loading ? "불러오는 중..." : "더 불러오기"}
              </button>
            ) : null}
            <span className="text-[11px] text-white/55">
              {runJsonPreview.text.length.toLocaleString("ko-KR")} / {runJsonPreview.totalChars.toLocaleString("ko-KR")} chars
            </span>
          </div>
          {runJsonPreview.error ? (
            <p className="mt-2 text-xs font-semibold text-rose-700">{runJsonPreview.error}</p>
          ) : null}
        </details>
      ) : raw?.runJson ? (
        <SafeTextViewer testId="report-runjson-preview" text={fallbackRunJson} title="run raw json (fallback)" />
      ) : null}
    </Card>
  );
}
