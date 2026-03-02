import Link from "next/link";
import { Card } from "@/components/ui/Card";
import EvidencePanel from "@/components/planning/EvidencePanel";
import { REPORT_SECTION_IDS } from "@/lib/planning/navigation/sectionIds";
import {
  buildInterpretationVM,
  type InterpretationInput,
} from "@/lib/planning/v2/insights/interpretationVm";
import {
  DEFAULT_PLANNING_POLICY,
  type PlanningInterpretationPolicy,
} from "@/lib/planning/catalog/planningPolicy";

export type InterpretationGuideProps = {
  summaryMetrics: InterpretationInput["summary"];
  aggregatedWarnings: InterpretationInput["aggregatedWarnings"];
  goals: InterpretationInput["goals"];
  outcomes?: InterpretationInput["outcomes"];
  summaryEvidence?: InterpretationInput["summaryEvidence"];
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
    className: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

function diagnosticTone(severity: "risk" | "caution" | "info"): string {
  if (severity === "risk") return "border-rose-200 bg-rose-50";
  if (severity === "caution") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-slate-50";
}

function warningLevelText(level: "info" | "warn" | "critical"): string {
  if (level === "critical") return "치명";
  if (level === "warn") return "경고";
  return "정보";
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
  const handleHashAction = (href: `#${string}`): void => {
    if (typeof window === "undefined") return;
    const targetId = href.slice(1);
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) {
      window.history.replaceState(null, "", href);
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.location.hash !== href) {
      window.history.replaceState(null, "", href);
    }
  };

  return (
    <Card
      className={`space-y-3 border border-slate-200 p-4${className}`}
      data-testid="interpretation-guide"
      id={REPORT_SECTION_IDS.interpretation}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">결과 해석 가이드 (10초 판정)</h2>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`} data-testid="verdict-badge">{badge.label}</span>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
        {vm.verdict.headline}
      </p>

      <div id={REPORT_SECTION_IDS.evidence}>
        <p className="text-xs font-semibold text-slate-700">핵심 진단 Top 3</p>
        {vm.diagnostics.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">해석 가능한 지표가 부족합니다. 프로필 입력과 실행 결과를 확인하세요.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {vm.diagnostics.slice(0, 3).map((diag, index) => (
              <article className={`rounded-lg border px-3 py-2 text-xs ${diagnosticTone(diag.severity)}`} data-testid={`diagnostic-item-${index}`} key={diag.id}>
                <p className="font-semibold text-slate-900">{diag.title}: {diag.evidence}</p>
                <p className="mt-1 text-slate-700">{diag.description}</p>
                {diag.evidenceItem ? (
                  <EvidencePanel className="mt-2 bg-white" item={diag.evidenceItem} />
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700">다음 행동 Top 3</p>
        <p className="mt-1 text-[11px] text-slate-500">상품 추천이 아닌, 현재 위험을 줄이기 위한 실행 우선순위입니다.</p>
        <div className="mt-2 space-y-2" data-testid="interpretation-actions">
          {vm.nextActions.slice(0, 3).map((action, index) => (
            <article className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" key={`${action.id}-${index}`}>
              <p className="font-semibold text-slate-900">[{index + 1}] {action.title}</p>
              <p className="mt-1 text-slate-700">{action.description}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700">
                {action.steps.slice(0, 3).map((step, stepIndex) => (
                  <li key={`${action.id}-step-${stepIndex}`}>{step}</li>
                ))}
              </ul>
              {action.href ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  {isHashHref(action.href) ? (
                    <button
                      className="font-semibold underline"
                      data-action-id={action.id}
                      data-testid={`interpretation-action-link-${index}`}
                      onClick={() => {
                        if (isHashHref(action.href)) {
                          handleHashAction(action.href);
                        }
                      }}
                      type="button"
                    >
                      관련 섹션 보기
                    </button>
                  ) : (
                    <Link
                      className="font-semibold underline"
                      data-action-id={action.id}
                      data-testid={`interpretation-action-link-${index}`}
                      href={action.href}
                    >
                      관련 섹션 보기
                    </Link>
                  )}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="interpretation-warnings">
        <summary className="cursor-pointer font-semibold text-slate-900">경고 해석 (코드 → 사람말)</summary>
        <div className="mt-2 space-y-2">
          {vm.warnings.length === 0 ? (
            <p>해석할 경고가 없습니다.</p>
          ) : vm.warnings.map((warning) => (
            <article className="rounded-lg border border-slate-200 bg-white px-3 py-2" key={`${warning.code}:${warning.period}`}>
              <p className="text-xs font-semibold text-slate-900">
                [{warningLevelText(warning.severity)}] {warning.title}
              </p>
              <p className="mt-1">설명: {warning.plainDescription}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                발생: {warning.count}회 / 기간: {warning.period}
                {warning.subjectLabel ? ` / 대상: ${warning.subjectLabel}` : ""}
              </p>
              {warning.suggestedActionId ? (
                <p className="mt-1 text-[11px] text-slate-500">권장 액션: {warning.suggestedActionId}</p>
              ) : null}
              <details className="mt-1 text-[11px] text-slate-500">
                <summary className="cursor-pointer">고급(코드 보기)</summary>
                <p className="mt-1 font-mono">{warning.code}</p>
              </details>
            </article>
          ))}
        </div>
      </details>
    </Card>
  );
}
