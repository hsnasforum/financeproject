"use client";

import { useMemo } from "react";
import { SourceBadge } from "@/components/debug/SourceBadge";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CspSafeProgressBar } from "@/components/ui/CspSafeProgressBar";
import {
  buildActionReasonContext,
  buildCardFreshnessMeta,
  buildDetailProduct,
  buildPlanningContextStrip,
  buildSourceStatusKey,
  buildTrustCues,
  formatFreshnessStatusLabel,
  formatKoreanDateTime,
  type PlanningActionContext,
  type RecommendResponse,
} from "@/lib/recommend/recommendResultsViewModel";
import type { RecommendProfileNormalized } from "@/lib/schemas/recommendProfile";
import type { SourceStatusRow } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

type Props = {
  result: RecommendResponse;
  feedback: string;
  storedProfile: RecommendProfileNormalized | null;
  planningActionContext: PlanningActionContext | null;
  sourceStatusRows: SourceStatusRow[];
  sourceStatusReady: boolean;
  openDetailKey: string | null;
  onOpenDetailKeyChange: (key: string | null) => void;
  onSave: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onAddCompare: (unifiedId: string) => void;
};

export function RecommendResultsPanel({
  result,
  feedback,
  storedProfile,
  planningActionContext,
  sourceStatusRows,
  sourceStatusReady,
  openDetailKey,
  onOpenDetailKeyChange,
  onSave,
  onExportJson,
  onExportCsv,
  onAddCompare,
}: Props) {
  const planningContextStrip = useMemo(
    () => buildPlanningContextStrip(storedProfile, result, planningActionContext),
    [planningActionContext, result, storedProfile],
  );
  const actionReasonContext = useMemo(
    () => buildActionReasonContext(planningActionContext),
    [planningActionContext],
  );
  const sourceStatusMap = useMemo(() => {
    const next = new Map<string, SourceStatusRow>();
    for (const row of sourceStatusRows) {
      if (row.kind !== "deposit" && row.kind !== "saving") continue;
      next.set(buildSourceStatusKey({ sourceId: row.sourceId, kind: row.kind }), row);
    }
    return next;
  }, [sourceStatusRows]);

  return (
    <div className="space-y-8" data-testid="recommend-results">
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <div>
          <h2 className="text-xl font-black text-navy">
            추천 결과 <span className="ml-1 text-primary">{result.items?.length}</span>
          </h2>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
            점수는 현재 선택한 조건과 가중치 기준 비교값입니다. 우열 확정이 아니라 비교 참고용으로 읽고, 가입 전 실제 금리와 조건은 다시 확인해 주세요.
          </p>
        </div>
        <div className="flex items-start gap-3">
          {feedback && (
            <span className="text-xs font-bold text-primary animate-in fade-in duration-300">{feedback}</span>
          )}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-full px-4 font-black" onClick={onSave}>결과 저장</Button>
              <Button size="sm" variant="outline" className="rounded-full px-4 font-black" onClick={onExportJson}>JSON</Button>
              <Button size="sm" variant="outline" className="rounded-full px-4 font-black" onClick={onExportCsv}>CSV</Button>
            </div>
            <p className="max-w-[22rem] text-[11px] font-medium leading-relaxed text-slate-500 md:text-right">
              결과 저장은 이 비교를 나중에 다시 보기 위한 기록용이고, JSON·CSV는 필요할 때만 내려받는 보조 기능입니다.
            </p>
          </div>
        </div>
      </div>

      {planningContextStrip && (
        <Card className="rounded-[2.5rem] border border-primary/10 bg-primary/10 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">플래닝 연동</p>
              <h3 className="text-lg font-black tracking-tight text-navy">{planningContextStrip.title}</h3>
              <p className="text-sm font-medium leading-relaxed text-slate-600">{planningContextStrip.description}</p>
              {(planningContextStrip.sourceLabel || planningContextStrip.overallStatusLabel || planningContextStrip.runId) && (
                <p className="text-xs font-medium leading-relaxed text-slate-500">
                  먼저 위 설명과 액션·단계 같은 현재 맥락을 보고, 연결 근거·실행 상태·실행 ID는 확인이 필요할 때만 참고하세요.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-black">
              {planningContextStrip.actionLabel ? (
                <span className="rounded-full border border-primary/20 bg-white px-3 py-1 text-navy shadow-sm">
                  연결된 액션: {planningContextStrip.actionLabel}
                </span>
              ) : null}
              {planningContextStrip.stageLabel ? (
                <span className="rounded-full border border-primary/20 bg-white px-3 py-1 text-navy shadow-sm">
                  현재 단계: {planningContextStrip.stageLabel}
                </span>
              ) : null}
              {planningContextStrip.sourceLabel ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 shadow-sm">
                  연결 근거: {planningContextStrip.sourceLabel}
                </span>
              ) : null}
              {planningContextStrip.overallStatusLabel ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 shadow-sm">
                  실행 상태 참고: {planningContextStrip.overallStatusLabel}
                </span>
              ) : null}
            </div>
          </div>
          {planningContextStrip.runId ? (
            <p className="mt-4 text-xs font-bold text-slate-500">
              플래닝 실행 ID · 연결 확인용: <span className="font-mono text-slate-700">{planningContextStrip.runId}</span>
            </p>
          ) : null}
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {(result.items ?? []).map((item, index) => {
          const itemKey = `${item.sourceId}-${item.finPrdtCd}-${index}`;
          const detailProduct = buildDetailProduct(item);
          const scorePct = Math.min(100, Math.max(0, item.finalScore));
          const freshnessMeta = buildCardFreshnessMeta({
            item,
            meta: result.meta,
            sourceStatusReady,
            sourceStatusRow: sourceStatusMap.get(buildSourceStatusKey(item)) ?? null,
          });
          const trustCues = buildTrustCues({
            item,
            depositProtectionPolicy: result.meta?.assumptions.depositProtectionPolicy,
          });

          return (
            <Card key={itemKey} className="group relative overflow-hidden rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm transition-all hover:shadow-xl hover:border-primary/10">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-black shadow-sm",
                    index === 0 ? "bg-primary text-white shadow-navy/10" : "bg-surface-muted text-slate-600 border border-slate-200",
                  )}>
                    {index + 1}
                  </span>
                  <SourceBadge sourceId={item.sourceId} />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">매칭 점수</span>
                  <span className="text-lg font-black text-primary tabular-nums">{item.finalScore.toFixed(2)}</span>
                </div>
              </div>

              <div className="mb-8">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{item.providerName}</p>
                <h3 className="mt-1 text-xl font-black leading-snug text-navy group-hover:text-primary transition-colors tracking-tight">
                  {item.productName}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="rounded-2xl border border-slate-100 bg-surface-muted/50 p-4 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">선택 기간</p>
                  <p className="mt-1 font-black text-slate-700 tabular-nums">{item.selectedOption.saveTrm || item.selectedOption.termMonths || "-"}개월</p>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-primary/30 p-4 text-center">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">적용 금리</p>
                  <p className="mt-1 font-black text-navy tabular-nums">{item.selectedOption.appliedRate.toFixed(2)}%</p>
                </div>
              </div>

              <div className="mb-8 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">점수 세부 분석</p>
                  <span className="text-[10px] font-black text-primary tabular-nums">{Math.round(scorePct)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                  <CspSafeProgressBar fillClassName="text-primary" value={scorePct} />
                </div>
              </div>

              <div className="mb-8 space-y-3">
                {freshnessMeta ? (
                  <div className="space-y-3 rounded-2xl border border-slate-100 bg-surface-muted/70 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">결과 기준</p>
                      <div className="flex flex-wrap gap-2">
                        {freshnessMeta.freshnessStatus ? (
                          <span
                            className={cn(
                              "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm",
                              freshnessMeta.freshnessStatus === "ok"
                                ? "border-primary/20 bg-primary/5 text-navy"
                                : freshnessMeta.freshnessStatus === "stale"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : freshnessMeta.freshnessStatus === "error"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : "border-slate-200 bg-white text-slate-500",
                            )}
                          >
                            상태: {formatFreshnessStatusLabel(freshnessMeta.freshnessStatus)}
                          </span>
                        ) : null}
                        {freshnessMeta.fallbackMode ? (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm">
                            {freshnessMeta.fallbackMode}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {typeof freshnessMeta.lastSyncedAt !== "undefined" ? (
                      <p className="text-[11px] font-bold leading-relaxed text-slate-600">
                        {freshnessMeta.lastSyncedAt
                          ? `기준 확인 ${formatKoreanDateTime(freshnessMeta.lastSyncedAt)}`
                          : "기준 확인 시각 정보가 아직 없습니다."}
                      </p>
                    ) : null}
                    {freshnessMeta.assumptionNotes.length > 0 ? (
                      <ul className="space-y-2">
                        {freshnessMeta.assumptionNotes.map((note) => (
                          <li
                            key={note}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold leading-relaxed text-slate-600 shadow-sm"
                          >
                            가정: {note}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">읽기 힌트</p>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {trustCues.length}개
                  </span>
                </div>
                <ul className="space-y-2">
                  {trustCues.map((cue) => (
                    <li
                      key={cue.label}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-[11px] font-bold leading-relaxed shadow-sm",
                        cue.tone === "emerald"
                          ? "border-primary/10 bg-primary/10 text-navy"
                          : cue.tone === "amber"
                            ? "border-amber-100 bg-amber-50/50 text-amber-900"
                            : "border-slate-100 bg-surface-muted/70 text-slate-600",
                      )}
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest">{cue.label}</p>
                      <p className="mt-1">{cue.helper}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-8 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {actionReasonContext?.sectionLabel ?? "비교 근거"}
                    </p>
                    {actionReasonContext ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        상단 플래닝 연동 기준
                      </span>
                    ) : null}
                  </div>
                  {actionReasonContext ? (
                    <p className="rounded-2xl border border-primary/10 bg-primary/10 px-4 py-3 text-[11px] font-bold leading-relaxed text-slate-600">
                      {actionReasonContext.helper}
                    </p>
                  ) : null}
                </div>
                <ul className="space-y-3">
                  {item.reasons.slice(0, 3).map((reason, reasonIndex) => (
                    <li key={reasonIndex} className="flex gap-3 text-sm font-medium text-slate-600">
                      <span className="text-primary font-black mt-0.5">•</span>
                      <span className="line-clamp-2 leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-50">
                <Button variant="outline" className="flex-1 rounded-2xl h-12 font-black" onClick={() => onOpenDetailKeyChange(itemKey)}>
                  상세 분석
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 rounded-2xl h-12 font-black shadow-md"
                  onClick={() => onAddCompare(item.unifiedId)}
                >
                  비교 담기
                </Button>
              </div>

              <ProductDetailDrawer
                open={openDetailKey === itemKey}
                onOpenChange={(next) => onOpenDetailKeyChange(next ? itemKey : null)}
                kind={item.kind}
                product={detailProduct}
                amountWonDefault={item.kind === "saving" ? 500_000 : 10_000_000}
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
