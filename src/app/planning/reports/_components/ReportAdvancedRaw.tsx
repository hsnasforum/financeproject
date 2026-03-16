"use client";

import { useMemo, useState } from "react";
import { type PlanningInterpretationPolicy } from "@/lib/planning/catalog/planningPolicy";
import { type AssumptionsOverrideEntry } from "@/lib/planning/assumptions/overrides";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

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
    <details className="group rounded-[1.5rem] border border-slate-200 bg-slate-50/50 p-4 transition-all">
      <summary className="cursor-pointer text-sm font-black text-slate-400 group-open:text-slate-600 list-none flex items-center gap-2">
        <span className="transition-transform group-open:rotate-90">▶</span>
        {title}
      </summary>
      <div className="mt-4">
        <pre className="max-h-[40vh] overflow-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-300 font-mono shadow-inner" data-testid={testId}>
          {rendered}
        </pre>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest tabular-nums">
            {safeText.length.toLocaleString("ko-KR")} chars total
          </p>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg px-4 text-[10px] font-black"
              onClick={() => setVisibleChars((prev) => prev + chunkChars)}
            >
              더 보기 (+{Math.min(chunkChars, safeText.length - rendered.length).toLocaleString("ko-KR")})
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

export default function ReportAdvancedRaw({ reproducibility, raw, onLoadMoreRunJson }: Props) {
  if (!reproducibility && !raw?.reportMarkdown && !raw?.runJson && !raw?.runJsonPreview) return null;

  const runJsonPreview = raw?.runJsonPreview;
  const fallbackRunJson = raw?.runJson ? JSON.stringify(raw.runJson, null, 2) : "";

  return (
    <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-advanced-raw">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Advanced Metadata</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">시스템 원문 데이터</h2>
          <p className="mt-2 text-sm font-bold text-slate-500 leading-relaxed">재현성과 디버깅을 위한 원문 확인용 영역입니다.</p>
        </div>
        <Badge variant="secondary" className="rounded-lg bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm">
          Raw Access
        </Badge>
      </div>

      <div className="space-y-6">
        {reproducibility && (
          <details className="group rounded-[2rem] border border-slate-200 bg-slate-50/50 p-6 transition-all">
            <summary className="cursor-pointer text-sm font-black text-slate-400 group-open:text-slate-600 list-none flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Reproducibility (실행 환경 정보)
            </summary>
            <div className="mt-6 space-y-6 border-t border-slate-200 pt-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: "Run ID", value: reproducibility.runId, mono: true },
                  { label: "Created At", value: reproducibility.createdAt, mono: true },
                  { label: "App Version", value: reproducibility.appVersion, mono: true },
                  { label: "Engine Version", value: reproducibility.engineVersion, mono: true },
                  { label: "Profile Hash", value: profileHashPrefix(reproducibility.profileHash), mono: true },
                  { label: "Assumptions Hash", value: reproducibility.assumptionsHash ? profileHashPrefix(reproducibility.assumptionsHash) : "-", mono: true },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                    <p className={cn("text-[11px] font-black text-slate-700", item.mono && "font-mono")}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Applied Overrides</p>
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-inner">
                  {reproducibility.appliedOverrides.length > 0 ? (
                    <ul className="space-y-2">
                      {reproducibility.appliedOverrides.map((override) => (
                        <li key={`${override.key}:${override.updatedAt}`} className="text-[11px] font-bold text-slate-600 flex flex-wrap gap-2">
                          <span className="text-emerald-600 font-black">{override.key}</span>
                          <span className="text-slate-300">=</span>
                          <span className="text-slate-900">{override.value}</span>
                          {override.reason && <span className="text-slate-400">({override.reason})</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] font-bold text-slate-300 italic text-center">적용된 오버라이드가 없습니다.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Policy Thresholds</p>
                <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-4 text-[10px] text-slate-400 font-mono shadow-inner">
                  {JSON.stringify(reproducibility.policy, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        )}

        {raw?.reportMarkdown && (
          <SafeTextViewer
            testId="report-advanced-raw-markdown"
            text={raw.reportMarkdown}
            title="Generated Markdown (리포트 원문)"
          />
        )}

        {runJsonPreview ? (
          <details className="group rounded-[1.5rem] border border-slate-200 bg-slate-50/50 p-4 transition-all">
            <summary className="cursor-pointer text-sm font-black text-slate-400 group-open:text-slate-600 list-none flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Run JSON (실행 결과 데이터)
            </summary>
            <div className="mt-4">
              <pre className="max-h-[40vh] overflow-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-300 font-mono shadow-inner" data-testid="report-advanced-raw-json">
                {runJsonPreview.text}
              </pre>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest tabular-nums">
                  {runJsonPreview.totalChars.toLocaleString("ko-KR")} chars total
                </p>
                {runJsonPreview.hasMore && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-8 rounded-lg px-4 text-[10px] font-black shadow-lg shadow-emerald-900/10"
                    disabled={runJsonPreview.loading}
                    onClick={onLoadMoreRunJson}
                  >
                    {runJsonPreview.loading ? "Loading..." : "전체 JSON 불러오기"}
                  </Button>
                )}
              </div>
              {runJsonPreview.error && (
                <p className="mt-2 text-[10px] font-black text-rose-600 bg-rose-50 p-2 rounded-lg">{runJsonPreview.error}</p>
              )}
            </div>
          </details>
        ) : fallbackRunJson ? (
          <SafeTextViewer
            testId="report-advanced-raw-json-fallback"
            text={fallbackRunJson}
            title="Run JSON (실행 데이터 스냅샷)"
          />
        ) : null}
      </div>
    </Card>
  );
}
