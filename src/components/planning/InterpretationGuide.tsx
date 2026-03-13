"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import EvidencePanel from "@/components/planning/EvidencePanel";
import {
  reportHeroActionLinkClassName,
  reportHeroPrimaryActionClassName,
  reportSurfaceDisclosureClassName,
  reportSurfaceDisclosureSummaryClassName,
  reportSurfaceInsetClassName,
} from "@/components/ui/ReportTone";
import { REPORT_SECTION_IDS } from "@/lib/planning/navigation/sectionIds";
import {
  buildInterpretationVM,
  type InterpretationInput,
} from "@/lib/planning/v2/insights/interpretationVm";
import {
  DEFAULT_PLANNING_POLICY,
  type PlanningInterpretationPolicy,
} from "@/lib/planning/catalog/planningPolicy";
import { buildFallbackPlanningAiSummary } from "@/lib/planning/v2/insights/aiSummary";

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

function verdictBadge(code: "GOOD" | "CAUTION" | "RISK" | "UNKNOWN"): { label: string; className: string } {
  if (code === "RISK") {
    return {
      label: "위험",
      className: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }
  if (code === "CAUTION") {
    return {
      label: "주의",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (code === "GOOD") {
    return {
      label: "양호",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  return {
    label: "확인 필요",
    className: "border-white/20 bg-white/10 text-white/85",
  };
}

function diagnosticTone(severity: "risk" | "caution" | "info"): string {
  if (severity === "risk") return "border-rose-400/30 bg-gradient-to-br from-slate-900 to-rose-950 text-white";
  if (severity === "caution") return "border-amber-400/30 bg-gradient-to-br from-slate-900 to-amber-950 text-white";
  return "border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white";
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
  if (tone === "rose") return "border-rose-400/30 bg-gradient-to-br from-slate-900 to-rose-950 text-white shadow-sm";
  if (tone === "amber") return "border-amber-400/30 bg-gradient-to-br from-slate-900 to-amber-950 text-white shadow-sm";
  if (tone === "emerald") return "border-emerald-400/30 bg-gradient-to-br from-slate-900 to-emerald-950 text-white shadow-sm";
  return "border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm";
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
    <Card
      className={`space-y-4 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-xl${className}`}
      data-testid="interpretation-guide"
      id={REPORT_SECTION_IDS.interpretation}
    >
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Quick Summary</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">한눈에 보는 결과 해석</h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`} data-testid="verdict-badge">{badge.label}</span>
        </div>

        <section className={`mt-4 rounded-3xl p-4 backdrop-blur ${reportSurfaceInsetClassName}`}>
          <p className="text-xs font-semibold text-white/55">먼저 이 문장만 보세요</p>
          <p className="mt-2 text-lg font-black leading-7 text-white">{vm.verdict.headline}</p>
          <p className="mt-2 text-sm text-white/75">
            {primaryAction
              ? `가장 먼저 할 일은 '${primaryAction.title}'입니다. 아래 이유 3가지만 확인하면 지금 상태를 빠르게 이해할 수 있습니다.`
              : "아래 숫자 3개만 보면 지금 계획이 왜 이렇게 나왔는지 빠르게 이해할 수 있습니다."}
          </p>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {diagnosticCards.map((diag, index) => (
              <article
                className={`rounded-2xl border px-3 py-3 text-xs shadow-sm ${diagnosticTone(diag.severity)}`}
                data-testid={`diagnostic-item-${index}`}
                key={diag.id}
              >
                <p className="text-[11px] font-semibold text-white/55">{diag.title}</p>
                <p className="mt-1 text-sm font-bold text-white">{diag.evidence}</p>
                <p className="mt-1 text-white/72">{diag.description}</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      {props.monthlyOperatingGuide ? (
        <section
          className={`rounded-3xl p-4 shadow-sm backdrop-blur ${reportSurfaceInsetClassName}`}
          data-testid="interpretation-monthly-operating-guide"
        >
          <div className={reportSurfaceDisclosureClassName}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">월수입 운영 권장안</p>
            <p className="mt-2 text-base font-black tracking-tight text-white">{props.monthlyOperatingGuide.headline}</p>
            <p className="mt-1 text-xs text-white/65">{props.monthlyOperatingGuide.basisLabel}</p>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold text-white/60">현재 배분</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {props.monthlyOperatingGuide.currentSplit.map((item) => (
                <article className={`rounded-3xl border px-4 py-4 text-xs ${guideToneClass(item.tone)}`} key={`guide-current-${item.title}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{item.title}</p>
                  <p className="mt-1 text-lg font-black tracking-tight text-white">{item.amountKrw.toLocaleString("ko-KR")}원</p>
                  <p className="mt-1 text-white/65">월 수입의 {item.sharePct.toFixed(0)}%</p>
                  <p className="mt-2 leading-5 text-white/78">{item.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold text-white/60">{props.monthlyOperatingGuide.nextPlanTitle}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {props.monthlyOperatingGuide.nextPlan.map((item) => (
                <article className={`rounded-3xl border px-4 py-4 text-xs ${guideToneClass(item.tone)}`} key={`guide-plan-${item.title}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{item.title}</p>
                  {typeof item.amountKrw === "number" ? (
                    <p className="mt-1 text-lg font-black tracking-tight text-white">{item.amountKrw.toLocaleString("ko-KR")}원</p>
                  ) : null}
                  {typeof item.sharePct === "number" ? (
                    <p className="mt-1 text-white/65">
                      {props.monthlyOperatingGuide?.nextPlanTitle === "남는 돈 운영안"
                        ? `남는 돈의 ${item.sharePct.toFixed(0)}%`
                        : `기준 비중 ${item.sharePct.toFixed(0)}%`}
                    </p>
                  ) : null}
                  <p className="mt-2 leading-5 text-white/78">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div>
        <p className="text-xs font-semibold text-white/75">지금 가장 먼저 할 일</p>
        {primaryAction ? (
          <article className="mt-2 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-slate-900 to-emerald-950 px-4 py-4 text-white shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Priority 1</p>
            <p className="mt-1 text-base font-black tracking-tight text-white">{primaryAction.title}</p>
            <p className="mt-2 text-sm text-white/78">{primaryAction.description}</p>
            {primaryAction.steps.length > 0 ? (
              <ol className="mt-3 space-y-1 text-xs text-white/78">
                {primaryAction.steps.slice(0, 3).map((step, index) => (
                  <li key={`${primaryAction.id}-step-${index}`}>{index + 1}. {step}</li>
                ))}
              </ol>
            ) : null}
            {primaryAction.href ? (
              <div className="mt-3">
                {isHashHref(primaryAction.href) ? (
                  <button
                    className={`inline-flex text-xs no-underline ${reportHeroPrimaryActionClassName}`}
                    data-action-id={primaryAction.id}
                    data-testid="interpretation-primary-action-link"
                    onClick={() => {
                      if (isHashHref(primaryAction.href)) {
                        handleHashAction(primaryAction.href);
                      }
                    }}
                    type="button"
                  >
                    바로 확인하기
                  </button>
                ) : (
                  <Link
                    className={`inline-flex text-xs no-underline ${reportHeroPrimaryActionClassName}`}
                    data-action-id={primaryAction.id}
                    data-testid="interpretation-primary-action-link"
                    href={primaryAction.href}
                  >
                    바로 확인하기
                  </Link>
                )}
              </div>
            ) : null}
          </article>
        ) : (
          <p className="mt-1 text-xs text-white/65">바로 보여줄 실행 항목이 없습니다. 아래 근거부터 확인하세요.</p>
        )}
      </div>

      <section className="rounded-3xl border border-amber-400/30 bg-gradient-to-br from-slate-900 to-amber-950 p-4 text-white shadow-sm" data-testid="interpretation-ai-summary">
        <p className="text-xs font-semibold text-white/60">{narrativeSummary.headline}</p>
        <div className="mt-2 space-y-2 text-sm leading-6 text-white/78">
          {narrativeSummary.paragraphs.map((line, index) => (
            <p key={`ai-line-${index}`}>{line}</p>
          ))}
        </div>
      </section>

      <details className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-3 text-xs text-white shadow-sm" data-testid="interpretation-detail-panel">
        <summary className="cursor-pointer font-semibold text-white">상세 근거와 추가 제안 보기</summary>

        <div className="mt-3" id={REPORT_SECTION_IDS.evidence}>
          <p className="text-xs font-semibold text-white/70">왜 이렇게 봤냐면</p>
          {vm.diagnostics.length === 0 ? (
            <p className="mt-1 text-xs text-white/65">해석 가능한 지표가 부족합니다. 프로필 입력과 실행 결과를 확인하세요.</p>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {vm.diagnostics.slice(0, 3).map((diag) => (
                <article className={`rounded-3xl px-4 py-4 text-xs shadow-sm backdrop-blur ${reportSurfaceInsetClassName}`} key={diag.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white">{diag.title}</p>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${diag.severity === "risk" ? "bg-rose-200/20 text-rose-100" : diag.severity === "caution" ? "bg-amber-200/20 text-amber-100" : "bg-emerald-200/20 text-emerald-100"}`}>
                      {severityLabel(diag.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">{diag.evidence}</p>
                  <p className="mt-1 leading-5 text-white/70">{diag.description}</p>
                  {diag.evidenceItem ? (
                    <EvidencePanel className="mt-3" item={diag.evidenceItem} tone="dark" />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        {secondaryActions.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-white/70">이어서 하면 좋은 일</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2" data-testid="interpretation-actions">
              {secondaryActions.map((action, index) => (
                <article className={`rounded-3xl px-4 py-4 text-xs shadow-sm backdrop-blur ${reportSurfaceInsetClassName}`} key={`${action.id}-${index}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Next {index + 2}</p>
                  <p className="mt-1 font-semibold text-white">{action.title}</p>
                  <p className="mt-1 text-white/70">{action.description}</p>
                  {action.href ? (
                    <p className="mt-2 text-[11px] text-white/65">
                      {isHashHref(action.href) ? (
                        <button
                          className={`inline-flex text-[11px] no-underline ${reportHeroActionLinkClassName}`}
                          data-action-id={action.id}
                          data-testid={`interpretation-action-link-${index + 1}`}
                          onClick={() => {
                            if (isHashHref(action.href)) {
                              handleHashAction(action.href);
                            }
                          }}
                          type="button"
                        >
                          관련 내용 보기
                        </button>
                      ) : (
                        <Link
                          className={`inline-flex text-[11px] no-underline ${reportHeroActionLinkClassName}`}
                          data-action-id={action.id}
                          data-testid={`interpretation-action-link-${index + 1}`}
                          href={action.href}
                        >
                          관련 내용 보기
                        </Link>
                      )}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-white/70">전문 경고</p>
          {vm.warnings.length === 0 ? (
            <p className="text-white/65">추가로 확인할 전문 경고는 없습니다.</p>
          ) : vm.warnings.map((warning) => (
            <article className={`rounded-3xl px-4 py-3 shadow-sm backdrop-blur ${reportSurfaceInsetClassName}`} key={`${warning.code}:${warning.period}`}>
              <p className="text-xs font-semibold text-white">
                [{warningLevelText(warning.severity)}] {warning.title}
              </p>
              <p className="mt-1 text-white/72">무슨 뜻인가요: {warning.plainDescription}</p>
              <p className="mt-1 text-[11px] text-white/50">
                발생: {warning.count}회 / 기간: {warning.period}
                {warning.subjectLabel ? ` / 대상: ${warning.subjectLabel}` : ""}
              </p>
              {warning.suggestedActionId ? (
                <p className="mt-1 text-[11px] text-white/50">권장 액션: {warning.suggestedActionId}</p>
              ) : null}
              <details className={`mt-2 ${reportSurfaceDisclosureClassName}`}>
                <summary className={reportSurfaceDisclosureSummaryClassName}>고급(코드 보기)</summary>
                <p className="mt-1 font-mono text-white/75">{warning.code}</p>
              </details>
            </article>
          ))}
        </div>
      </details>
    </Card>
  );
}
