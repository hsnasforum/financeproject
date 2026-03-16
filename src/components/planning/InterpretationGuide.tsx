"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import EvidencePanel from "@/components/planning/EvidencePanel";
import { REPORT_SECTION_IDS } from "@/lib/planning/navigation/sectionIds";
import {
  buildInterpretationVM,
  type InterpretationInput,
} from "@/lib/planning/v2/insights/interpretationVm";
export type { InterpretationInput };
import {
  DEFAULT_PLANNING_POLICY,
  type PlanningInterpretationPolicy,
} from "@/lib/planning/catalog/planningPolicy";
export { DEFAULT_PLANNING_POLICY };
import { buildFallbackPlanningAiSummary } from "@/lib/planning/v2/insights/aiSummary";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export type InterpretationGuideProps = {
  summaryMetrics: InterpretationInput["summary"];
  aggregatedWarnings: InterpretationInput["aggregatedWarnings"];
  goals: InterpretationInput["goals"];
  outcomes?: InterpretationInput["outcomes"];
  summaryEvidence?: InterpretationInput["summaryEvidence"];
  monthlyOperatingGuide?: {
    headline: string;
    basisLabel: string;
    currentSplit: Array<{
      title: string;
      amountKrw: number;
      sharePct: number;
      tone: "slate" | "amber" | "rose" | "emerald";
      description: string;
    }>;
    nextPlanTitle: string;
    nextPlan: Array<{
      title: string;
      amountKrw?: number;
      sharePct?: number;
      tone: "slate" | "amber" | "rose" | "emerald";
      description: string;
    }>;
  };
  policy?: PlanningInterpretationPolicy;
  className?: string;
};

function verdictBadge(code: "GOOD" | "CAUTION" | "RISK" | "UNKNOWN"): { label: string; className: string; variant: "success" | "warning" | "destructive" | "secondary" } {
  if (code === "RISK") {
    return {
      label: "위험",
      className: "border-rose-200 bg-rose-50 text-rose-800",
      variant: "destructive",
    };
  }
  if (code === "CAUTION") {
    return {
      label: "주의",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      variant: "warning",
    };
  }
  if (code === "GOOD") {
    return {
      label: "양호",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      variant: "success",
    };
  }
  return {
    label: "확인 필요",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    variant: "secondary",
  };
}

function diagnosticTone(severity: "risk" | "caution" | "info"): string {
  if (severity === "risk") return "border-rose-100 bg-rose-50/50 text-rose-900";
  if (severity === "caution") return "border-amber-100 bg-amber-50/50 text-amber-900";
  return "border-slate-100 bg-slate-50/50 text-slate-900";
}

function warningLevelText(level: "info" | "warn" | "critical"): string {
  if (level === "critical") return "치명";
  if (level === "warn") return "경고";
  return "정보";
}

function severityLabel(severity: "risk" | "caution" | "info"): string {
  if (severity === "risk") return "주의도 높음";
  if (severity === "caution") return "점검 필요";
  return "양호";
}

function guideToneClass(tone: "slate" | "amber" | "rose" | "emerald"): string {
  if (tone === "rose") return "border-rose-100 bg-rose-50/30 text-rose-900 shadow-sm";
  if (tone === "amber") return "border-amber-100 bg-amber-50/30 text-amber-900 shadow-sm";
  if (tone === "emerald") return "border-emerald-100 bg-emerald-50/30 text-emerald-900 shadow-sm";
  return "border-slate-100 bg-slate-50/30 text-slate-900 shadow-sm";
}

function isHashHref(href: string | undefined): href is `#${string}` {
  return typeof href === "string" && href.startsWith("#");
}

export default function InterpretationGuide(props: InterpretationGuideProps) {
  const policy = props.policy ?? DEFAULT_PLANNING_POLICY;
  const vm = buildInterpretationVM(
    {
      summary: props.summaryMetrics,
      aggregatedWarnings: props.aggregatedWarnings,
      goals: props.goals,
      ...(props.outcomes ? { outcomes: props.outcomes } : {}),
      ...(props.summaryEvidence ? { summaryEvidence: props.summaryEvidence } : {}),
    },
    policy,
  );
  const badge = verdictBadge(vm.verdict.code);
  const className = props.className ? ` ${props.className}` : "";
  const primaryAction = vm.nextActions[0];
  const secondaryActions = vm.nextActions.slice(1, 3);
  const diagnosticCards = vm.diagnostics.slice(0, 3);
  const narrativeSummary = buildFallbackPlanningAiSummary({
    verdictHeadline: vm.verdict.headline,
    ...(primaryAction ? {
      primaryActionTitle: primaryAction.title,
      primaryActionDescription: primaryAction.description,
    } : {}),
    diagnostics: diagnosticCards,
    ...(props.monthlyOperatingGuide ? {
      monthlyOperatingGuide: {
        headline: props.monthlyOperatingGuide.headline,
        basisLabel: props.monthlyOperatingGuide.basisLabel,
      },
    } : {}),
  });

  const handleHashAction = (href: `#${string}`): void => {
    if (typeof window === "undefined") return;
    const targetId = href.slice(1);
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) {
      window.history.replaceState(null, "", href);
      return;
    }
    let ancestor: HTMLElement | null = target.parentElement;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
        ancestor.open = true;
      }
      ancestor = ancestor.parentElement;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.location.hash !== href) {
      window.history.replaceState(null, "", href);
    }
  };

  return (
    <div
      className={cn("space-y-8", className)}
      data-testid="interpretation-guide"
      id={REPORT_SECTION_IDS.interpretation}
    >
      <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">결과 해석</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">한눈에 보는 결과 해석</h2>
          </div>
          <Badge variant={badge.variant} className="rounded-full px-4 py-1 font-black">
            {badge.label}
          </Badge>
        </div>

        <section className="rounded-[2rem] bg-slate-50 p-8 border border-slate-100/50 shadow-inner">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">핵심 요약</p>
          <p className="mt-3 text-xl font-black leading-snug text-slate-900">{vm.verdict.headline}</p>
          <p className="mt-3 text-sm font-bold text-slate-500 leading-relaxed">
            {primaryAction
              ? `가장 먼저 할 일은 '${primaryAction.title}'입니다. 아래 핵심 지표 3가지를 통해 현재 상황을 파악해 보세요.`
              : "아래 지표 3가지를 통해 현재 계획의 타당성을 빠르게 확인할 수 있습니다."}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {diagnosticCards.map((diag, index) => (
              <article
                className={cn("rounded-2xl border p-5 shadow-sm transition-all hover:bg-white hover:shadow-md", diagnosticTone(diag.severity))}
                data-testid={`diagnostic-item-${index}`}
                key={diag.id}
              >
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{diag.title}</p>
                <p className="mt-2 text-base font-black tabular-nums">{diag.evidence}</p>
                <p className="mt-2 text-xs font-bold leading-relaxed opacity-80">{diag.description}</p>
              </article>
            ))}
          </div>
        </section>

        {props.monthlyOperatingGuide ? (
          <section
            className="mt-10 space-y-8"
            data-testid="interpretation-monthly-operating-guide"
          >
            <div className="px-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">운영 가이드</p>
              <p className="mt-2 text-lg font-black tracking-tight text-slate-900">{props.monthlyOperatingGuide.headline}</p>
              <p className="mt-1 text-xs font-bold text-slate-400 italic">※ {props.monthlyOperatingGuide.basisLabel}</p>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">현재 월수입 배분</p>
              <div className="grid gap-4 md:grid-cols-3">
                {props.monthlyOperatingGuide.currentSplit.map((item) => (
                  <article className={cn("rounded-[1.5rem] border p-5", guideToneClass(item.tone))} key={`guide-current-${item.title}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.title}</p>
                    <p className="mt-2 text-lg font-black tracking-tight tabular-nums">{item.amountKrw.toLocaleString("ko-KR")}원</p>
                    <p className="mt-1 text-[11px] font-bold opacity-70">월 수입의 {item.sharePct.toFixed(0)}%</p>
                    <p className="mt-3 text-xs font-medium leading-relaxed opacity-90">{item.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 ml-1">{props.monthlyOperatingGuide.nextPlanTitle}</p>
              <div className="grid gap-4 md:grid-cols-3">
                {props.monthlyOperatingGuide.nextPlan.map((item) => (
                  <article className={cn("rounded-[1.5rem] border p-5", guideToneClass(item.tone))} key={`guide-plan-${item.title}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.title}</p>
                    {typeof item.amountKrw === "number" ? (
                      <p className="mt-2 text-lg font-black tracking-tight tabular-nums">{item.amountKrw.toLocaleString("ko-KR")}원</p>
                    ) : null}
                    {typeof item.sharePct === "number" ? (
                      <p className="mt-1 text-[11px] font-bold opacity-70">
                        {props.monthlyOperatingGuide?.nextPlanTitle === "남는 돈 운영안"
                          ? `가용 재원의 ${item.sharePct.toFixed(0)}%`
                          : `권장 비중 ${item.sharePct.toFixed(0)}%`}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs font-medium leading-relaxed opacity-90">{item.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-4 px-1">우선 액션</p>
          {primaryAction ? (
            <article className="rounded-3xl border border-emerald-100 bg-emerald-50/20 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-black text-white uppercase tracking-widest shadow-sm">Priority 1</span>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-snug">{primaryAction.title}</h3>
              <p className="mt-3 text-sm font-bold text-slate-600 leading-relaxed">{primaryAction.description}</p>
              {primaryAction.steps.length > 0 ? (
                <div className="mt-6 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">실행 단계</p>
                  <ol className="space-y-2 text-xs font-bold text-slate-700">
                    {primaryAction.steps.slice(0, 3).map((step, index) => (
                      <li key={`${primaryAction.id}-step-${index}`} className="flex gap-3">
                        <span className="text-emerald-500 font-black">{index + 1}.</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {primaryAction.href ? (
                <div className="mt-8">
                  {isHashHref(primaryAction.href) ? (
                    <Button
                      className="w-full rounded-2xl h-12 font-black shadow-lg shadow-emerald-900/10"
                      variant="primary"
                      onClick={() => {
                        if (isHashHref(primaryAction.href)) {
                          handleHashAction(primaryAction.href);
                        }
                      }}
                    >
                      바로 확인하기
                    </Button>
                  ) : (
                    <Link href={primaryAction.href} className="block">
                      <Button className="w-full rounded-2xl h-12 font-black shadow-lg shadow-emerald-900/10" variant="primary">
                        바로 확인하기
                      </Button>
                    </Link>
                  )}
                </div>
              ) : null}
            </article>
          ) : (
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-8 text-center">
              <p className="text-sm font-bold text-slate-400 italic">현재 즉시 실행이 필요한 항목이 없습니다.</p>
            </div>
          )}
        </Card>

        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-4 px-1">해석 요약</p>
          <section className="rounded-3xl border border-amber-100 bg-amber-50/20 p-6 shadow-sm" data-testid="interpretation-ai-summary">
            <p className="text-sm font-black text-amber-900 leading-snug">{narrativeSummary.headline}</p>
            <div className="mt-4 space-y-3 text-xs font-bold leading-relaxed text-slate-600">
              {narrativeSummary.paragraphs.map((line, index) => (
                <p key={`ai-line-${index}`}>{line}</p>
              ))}
            </div>
          </section>
        </Card>
      </div>

      <details className="group no-print rounded-[2rem] border border-slate-200 bg-slate-50/50 p-6 transition-all" data-testid="interpretation-detail-panel">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open:text-slate-600 list-none flex items-center gap-2">
          <span className="transition-transform group-open:rotate-90">▶</span>
          상세 근거와 추가 제안 보기
        </summary>

        <div className="mt-8 space-y-10" id={REPORT_SECTION_IDS.evidence}>
          <div className="px-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">자세히 보기</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">왜 이렇게 분석했나요?</h3>
          </div>
          
          {vm.diagnostics.length === 0 ? (
            <p className="text-sm font-bold text-slate-400 italic px-1">해석 가능한 지표가 부족합니다. 프로필과 실행 결과를 확인해 주세요.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {vm.diagnostics.slice(0, 3).map((diag) => (
                <article className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm" key={diag.id}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{diag.title}</p>
                    <Badge variant={diag.severity === "risk" ? "destructive" : diag.severity === "caution" ? "warning" : "secondary"} className="h-5 px-1.5 text-[9px] font-black">
                      {severityLabel(diag.severity)}
                    </Badge>
                  </div>
                  <p className="text-sm font-black text-slate-900 tabular-nums">{diag.evidence}</p>
                  <p className="mt-2 text-xs font-bold text-slate-500 leading-relaxed">{diag.description}</p>
                  {diag.evidenceItem ? (
                    <EvidencePanel className="mt-4" item={diag.evidenceItem} tone="light" />
                  ) : null}
                </article>
              ))}
            </div>
          )}

          {secondaryActions.length > 0 ? (
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">이어서 하면 좋은 일</p>
              <div className="grid gap-4 md:grid-cols-2" data-testid="interpretation-actions">
                {secondaryActions.map((action, index) => (
                  <article className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-emerald-100" key={`${action.id}-${index}`}>
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600/60">Next {index + 2}</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{action.title}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500 leading-relaxed">{action.description}</p>
                    {action.href ? (
                      <div className="mt-4">
                        {isHashHref(action.href) ? (
                          <button
                            className="text-[10px] font-black text-emerald-600 uppercase tracking-widest underline underline-offset-4 decoration-emerald-200"
                            onClick={() => {
                              if (isHashHref(action.href)) {
                                handleHashAction(action.href);
                              }
                            }}
                            type="button"
                          >
                            관련 내용 보기 →
                          </button>
                        ) : (
                          <Link
                            className="text-[10px] font-black text-emerald-600 uppercase tracking-widest underline underline-offset-4 decoration-emerald-200"
                            href={action.href}
                          >
                            관련 내용 보기 →
                          </Link>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">전문가용 기술 경고 (System Warnings)</p>
            {vm.warnings.length === 0 ? (
              <p className="text-xs font-bold text-slate-400 italic px-1">추가로 확인할 시스템 경고는 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {vm.warnings.map((warning) => (
                  <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" key={`${warning.code}:${warning.period}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant={warning.severity === "critical" ? "destructive" : "warning"} className="h-5 px-1.5 text-[9px] font-black">
                        {warningLevelText(warning.severity)}
                      </Badge>
                      <p className="text-xs font-black text-slate-900">{warning.title}</p>
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-600 leading-relaxed">상세: {warning.plainDescription}</p>
                    <p className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      발생: {warning.count}회 / 기간: {warning.period}
                      {warning.subjectLabel ? ` / 대상: ${warning.subjectLabel}` : ""}
                    </p>
                    {warning.suggestedActionId ? (
                      <p className="mt-1 text-[10px] font-black text-emerald-600">권장 액션 ID: {warning.suggestedActionId}</p>
                    ) : null}
                    <details className="mt-3 group/code">
                      <summary className="cursor-pointer text-[10px] font-black text-slate-300 hover:text-slate-500 uppercase tracking-widest list-none flex items-center gap-1">
                        <span className="transition-transform group-open/code:rotate-90">▶</span>
                        System Code
                      </summary>
                      <pre className="mt-2 rounded-lg bg-slate-950 p-3 text-[10px] text-slate-400 font-mono shadow-inner">{warning.code}</pre>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
