import { PlannerExternalModules } from "@/components/PlannerExternalModules";
import { AssumptionsCallout } from "@/components/ui/AssumptionsCallout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { uiTextKo } from "@/lib/uiText.ko";
import { cn } from "@/lib/utils";
import {
  SHOW_RULE_DEBUG,
  type PlannerActionLink,
  type PlannerInput,
  type PlannerWizardAlternativesStepProps,
  type PlannerWizardAnalysisStepProps,
  type PlannerWizardExecutionStepProps,
  type PlannerWizardGoalStepProps,
  type PlannerWizardMonitoringStepProps,
  formatMoney,
} from "./shared";
import {
  FinancialHealthGauge,
  InputHint,
  PlannerWizardHistoryPanel,
  PlannerWizardTrendPanel,
} from "./surfaces";

const GOAL_PRIORITY_OPTIONS = ["low", "medium", "high"] as const;

type AnalysisFieldKey =
  | "monthlyIncome"
  | "monthlyFixedExpense"
  | "monthlyVariableExpense"
  | "cashAssets"
  | "debtBalance"
  | "monthlyDebtPayment";

type InsurancePurposeFieldKey =
  | "insurancePurposeHealth"
  | "insurancePurposeAccident"
  | "insurancePurposeLife"
  | "insurancePurposeIncome";

const ANALYSIS_FIELDS: Array<{
  key: AnalysisFieldKey;
  label: string;
  color: "emerald" | "rose" | "primary" | "slate";
}> = [
  { key: "monthlyIncome", label: "월 소득 (세후)", color: "emerald" },
  { key: "monthlyFixedExpense", label: "월 고정 지출", color: "rose" },
  { key: "monthlyVariableExpense", label: "월 변동 지출", color: "rose" },
  { key: "cashAssets", label: "현금성 자산", color: "primary" },
  { key: "debtBalance", label: "부채 총액", color: "slate" },
  { key: "monthlyDebtPayment", label: "월 부채 상환", color: "slate" },
];

const INSURANCE_PURPOSE_FIELDS: Array<{
  key: InsurancePurposeFieldKey;
  label: string;
}> = [
  { key: "insurancePurposeHealth", label: "건강" },
  { key: "insurancePurposeAccident", label: "상해" },
  { key: "insurancePurposeLife", label: "사망" },
  { key: "insurancePurposeIncome", label: "소득" },
];

const EXECUTION_BUCKETS = ["이번 주", "이번 달"] as const;

const TOOL_ACTIONS: PlannerActionLink[] = [
  { label: "실시간 환율", href: "/tools/fx" },
  { label: "예금 탐색", href: "/products/deposit" },
  { label: "적금 탐색", href: "/products/saving" },
  { label: "AI 맞춤 추천", href: "/recommend" },
];

const TOOL_ICONS: Record<string, string> = {
  "실시간 환율": "🌍",
  "예금 탐색": "🏦",
  "적금 탐색": "💰",
  "AI 맞춤 추천": "✨",
};

export function PlannerWizardGoalStep({
  input,
  setNumber,
  setText,
}: PlannerWizardGoalStepProps) {
  return (
    <Card className="space-y-10 p-10">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-navy">Step 1. 목표 설정</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">당신의 꿈을 현실로 바꾸기 위한 첫 걸음입니다.</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-2xl shadow-sm ring-1 ring-rose-100">🎯</div>
      </div>

      <div className="grid gap-8 rounded-[2rem] border border-slate-100 bg-surface-muted/50 p-8 shadow-inner sm:grid-cols-2">
        <div className="space-y-2">
          <label className="ml-1 text-xs font-black uppercase tracking-widest text-slate-400">목표 명칭</label>
          <input className="h-14 w-full rounded-2xl border border-border bg-white px-5 text-base font-bold text-navy shadow-sm transition-all outline-none focus:ring-4 focus:ring-primary/10" value={input.goalName} onChange={(event) => setText("goalName", event.target.value)} placeholder="예: 결혼 자금, 내 집 마련" />
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-xs font-black uppercase tracking-widest text-slate-400">금액 단위</label>
          <select className="h-14 w-full cursor-pointer appearance-none rounded-2xl border border-border bg-white px-5 text-base font-bold text-navy shadow-sm transition-all outline-none focus:ring-4 focus:ring-primary/10" value={input.unit} onChange={(event) => setText("unit", event.target.value as PlannerInput["unit"])}>
            <option value="MANWON">만원 (Default)</option>
            <option value="KRW">원 (Won)</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-xs font-black uppercase tracking-widest text-slate-400">목표 금액</label>
          <div className="relative">
            <input className="h-14 w-full rounded-2xl border border-border bg-white px-5 pr-24 text-base font-black tabular-nums text-navy shadow-sm transition-all outline-none focus:ring-4 focus:ring-primary/10" value={input.goalAmount} onChange={(event) => setNumber("goalAmount", event.target.value)} />
            <InputHint value={input.goalAmount} unit={input.unit} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-xs font-black uppercase tracking-widest text-slate-400">목표 기한 (개월)</label>
          <input className="h-14 w-full rounded-2xl border border-border bg-white px-5 text-base font-black tabular-nums text-navy shadow-sm transition-all outline-none focus:ring-4 focus:ring-primary/10" value={input.goalDeadlineMonths} onChange={(event) => setNumber("goalDeadlineMonths", event.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-xs font-black uppercase tracking-widest text-slate-400">우선 순위</label>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-white p-1.5 shadow-sm">
            {GOAL_PRIORITY_OPTIONS.map((priority) => (
              <button
                key={priority}
                onClick={() => setText("goalPriority", priority)}
                className={cn(
                  "rounded-xl py-2 text-[11px] font-black uppercase tracking-tighter transition-all",
                  input.goalPriority === priority ? "bg-primary text-white shadow-md" : "text-slate-400 hover:bg-surface-muted",
                )}
              >
                {priority === "high" ? "필수" : priority === "medium" ? "보통" : "여유"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-xs font-black uppercase tracking-widest text-slate-400">위험 성향</label>
          <select className="h-14 w-full cursor-pointer appearance-none rounded-2xl border border-border bg-white px-5 text-base font-bold text-navy shadow-sm transition-all outline-none focus:ring-4 focus:ring-primary/10" value={input.riskProfile} onChange={(event) => setText("riskProfile", event.target.value as PlannerInput["riskProfile"])}>
            <option value="conservative">안정형 (원금 보전)</option>
            <option value="balanced">중립형 (적정 수익)</option>
            <option value="aggressive">공격형 (높은 수익)</option>
          </select>
        </div>
      </div>
    </Card>
  );
}

export function PlannerWizardAnalysisStep({
  input,
  plan,
  insuranceMetrics,
  retirementMetrics,
  setNumber,
  setText,
  setBoolean,
}: PlannerWizardAnalysisStepProps) {
  return (
    <Card className="space-y-10 p-10">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-navy">Step 2. 자산 현황 분석</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">정확한 진단을 위해 수입과 지출 정보를 입력해주세요.</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl shadow-sm ring-1 ring-blue-100">📊</div>
      </div>

      <div className="space-y-10">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {ANALYSIS_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{field.label}</label>
              <div className="relative">
                <input
                  className={cn(
                    "h-12 w-full rounded-2xl border border-border bg-white px-4 pr-24 text-sm font-black shadow-sm transition-all outline-none focus:ring-4",
                    field.color === "emerald" ? "text-primary focus:ring-primary/10"
                      : field.color === "rose" ? "text-rose-600 focus:ring-rose-500/10"
                        : "text-navy focus:ring-primary/10",
                  )}
                  value={input[field.key] as string | number}
                  onChange={(event) => setNumber(field.key, event.target.value)}
                />
                <InputHint value={input[field.key] as number} unit={input.unit} />
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-[2.5rem] bg-navy p-6 text-white shadow-2xl md:flex-row">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-navy to-transparent" />
          <div className="relative z-10">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">Estimated Monthly Saving</p>
            <p className="text-3xl font-black tabular-nums tracking-tight">
              {formatMoney(plan.metrics.monthlySaving, input.unit)}
            </p>
          </div>
          <div className="relative z-10 text-right">
            <div className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black",
              plan.metrics.goalFeasible ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
            )}>
              {plan.metrics.goalFeasible ? "✓ 목표 달성 가능" : "⚠ 재원 부족 예상"}
            </div>
          </div>
        </div>

        <div className="grid gap-6 border-t border-slate-100 pt-10 lg:grid-cols-2">
          <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted p-6 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-black text-navy">
              <span className="h-2 w-2 rounded-full bg-primary" /> 보험 점검
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">월 보험료</label>
                <input className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold shadow-sm transition-all outline-none focus:ring-2 focus:ring-primary/20" value={input.monthlyInsurancePremium} onChange={(event) => setNumber("monthlyInsurancePremium", event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">실손 가입 여부</label>
                <select className="h-11 w-full cursor-pointer rounded-xl border border-border bg-white px-4 text-sm font-bold shadow-sm outline-none" value={input.indemnityStatus} onChange={(event) => setText("indemnityStatus", event.target.value as PlannerInput["indemnityStatus"])}>
                  <option value="unknown">모름</option>
                  <option value="yes">가입됨</option>
                  <option value="no">미가입</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {INSURANCE_PURPOSE_FIELDS.map((item) => (
                <label
                  key={item.key}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95",
                    input[item.key] ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-white text-slate-500 hover:bg-surface-muted",
                  )}
                >
                  <input type="checkbox" checked={input[item.key] as boolean} onChange={(event) => setBoolean(item.key, event.target.checked)} className="hidden" />
                  {item.label}
                </label>
              ))}
            </div>
            <div className="rounded-2xl border border-primary/10 bg-primary/10 p-4 shadow-inner">
              <p className="text-xs leading-relaxed text-slate-700">
                보험료 부담률: <span className="font-black text-primary">{insuranceMetrics.premiumRatioPct.toFixed(1)}%</span> (권장 10% 내외)
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{insuranceMetrics.explain}</p>
            </div>
          </div>

          <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-surface-muted p-6 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-black text-navy">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> 노후 준비
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">연금 자산 합계</label>
                <input className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold shadow-sm" value={input.retirementAssets} onChange={(event) => setNumber("retirementAssets", event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">월 연금 납입</label>
                <input className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold shadow-sm" value={input.retirementMonthlyContribution} onChange={(event) => setNumber("retirementMonthlyContribution", event.target.value)} />
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 shadow-inner">
              <p className="text-xs font-bold text-slate-700">
                필요 생활비(월): {formatMoney(retirementMetrics.retirementNeedMonthlyWon, input.unit)}
              </p>
              <p className="mt-1 text-xs text-slate-700">
                준비 격차: <span className="font-black text-rose-600">{formatMoney(retirementMetrics.gapWon, input.unit)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function PlannerWizardAlternativesStep({
  input,
  plan,
  healthScore,
  linkOpenMode,
  openAction,
}: PlannerWizardAlternativesStepProps) {
  return (
    <div className="space-y-6">
      <PlannerExternalModules />

      <Card className="overflow-hidden border-none p-0 shadow-card">
        <div className="relative flex flex-col items-start justify-between gap-8 overflow-hidden bg-hero-navy p-8 text-white md:flex-row md:items-center">
          <div className="absolute right-0 top-0 rotate-12 scale-150 p-12 opacity-5">
            <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M2 12h20"/><path d="m5 7 3 5-3 5"/><path d="m19 7-3 5 3 5"/></svg>
          </div>
          <div className="relative z-10">
            <Badge variant="success" className="mb-4 border-none bg-primary px-4 py-1.5 text-xs font-black text-white shadow-lg shadow-navy/40">진단 레포트 완료</Badge>
            <h3 className="text-2xl font-black leading-[1.1] tracking-tight md:text-4xl">{plan.summaryLine}</h3>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-6 rounded-[2.5rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
            <FinancialHealthGauge score={healthScore} />
            <div className="text-left">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">월 가용 자금</p>
              <p className="text-3xl font-black tabular-nums tracking-tighter text-primary">{formatMoney(plan.metrics.freeCashflow, input.unit)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-y divide-border bg-surface md:grid-cols-4 md:divide-x md:divide-y-0">
          {[
            { label: "월 저축 가능", value: formatMoney(plan.metrics.monthlySaving, input.unit), trend: "저축 성향" },
            { label: "비상금 지수", value: `${plan.metrics.emergencyMonths.toFixed(1)}개월분`, trend: plan.metrics.emergencyGap <= 0 ? "안전" : "부족" },
            { label: "부채 상환 비중", value: `${(plan.metrics.debtPaymentRatio * 100).toFixed(1)}%`, trend: (plan.metrics.debtPaymentRatio * 100) > 30 ? "주의" : "양호" },
            { label: "목표 달성", value: plan.metrics.goalFeasible ? "가능성 높음" : "추가 재원 필요", trend: "예측 결과" },
          ].map((metric) => (
            <div key={metric.label} className="p-6 transition-colors hover:bg-surface-muted">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{metric.label}</p>
              <p className={cn("text-xl font-black tabular-nums tracking-tight text-navy", metric.trend === "주의" || metric.trend === "부족" ? "text-rose-600" : "")}>{metric.value}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">{metric.trend}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <div className="mt-10 flex items-center justify-between px-2">
          <h3 className="flex items-center gap-2 text-xl font-black tracking-tight text-navy">
            <span className="h-2 w-2 rounded-full bg-primary" /> 단계별 맞춤 제언
          </h3>
          <Badge variant="secondary" className="border-none bg-surface-muted text-[10px] font-bold text-slate-500">총 {plan.recommendations.length}개의 분석 항목</Badge>
        </div>

        {plan.recommendations.map((rec) => (
          <Card key={rec.id} className="overflow-hidden border-none p-0 shadow-card transition-all duration-500 hover:shadow-card-hover">
            <div className="flex min-h-[240px] flex-col md:flex-row">
              <div className={cn(
                "w-full shrink-0 md:w-3",
                rec.priority === "P0" ? "bg-rose-500" : rec.priority === "P1" ? "bg-amber-500" : "bg-primary",
              )} />
              <div className="flex-1 p-8 lg:p-10">
                <div className="mb-6 flex items-center gap-2">
                  <Badge variant="outline" className="border-slate-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    {rec.category}
                  </Badge>
                  {SHOW_RULE_DEBUG ? <span className="font-mono text-[9px] text-slate-300">ID: {rec.id}</span> : null}
                </div>

                <h4 className="mb-8 text-2xl font-black tracking-tight text-navy md:text-3xl">{rec.title}</h4>

                <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-4">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span className="h-1 w-4 rounded-full bg-slate-200" /> 제안 배경 및 근거
                    </p>
                    <ul className="space-y-3.5">
                      {rec.rationale.map((line, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm font-medium leading-relaxed text-slate-600">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span className="h-1 w-4 rounded-full bg-slate-200" /> 구체적 실행 방안
                    </p>
                    <div className="space-y-3">
                      {rec.actions.map((action, index) => (
                        <div key={index} className="group/action flex items-center justify-between rounded-2xl border border-slate-100 bg-surface-muted p-4 transition-all hover:border-primary/20 hover:bg-white hover:shadow-md">
                          <span className="text-sm font-bold text-slate-800">{action.label}</span>
                          {action.href ? (
                            <Button variant="outline" size="sm" className="h-8 rounded-full border-slate-200 bg-white px-4 text-[10px] font-black shadow-sm transition-all group-hover/action:border-primary group-hover/action:bg-primary group-hover/action:text-white" onClick={() => openAction(action)}>
                              {linkOpenMode === "newtab" ? "NEW TAB" : "OPEN QUICK"}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex flex-col justify-between gap-4 border-t border-border/50 pt-6 sm:flex-row sm:items-center">
                  <p className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    {rec.caution || "확정 수익이 아닌 가정 기반 데이터입니다."}
                  </p>
                  <div className="flex gap-1.5">
                    {rec.triggeredBy.map((tag) => (
                      <span key={tag} className="text-[9px] font-black uppercase tracking-tighter text-slate-300">#{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AssumptionsCallout className="mt-12 border-primary/10 bg-white shadow-sm">
        본 재무설계 결과는 사용자가 입력한 데이터와 가정(물가상승률 {input.assumedInflationRate}%, 기대수익률 {input.assumedAnnualReturn}%)을 바탕으로 산출된 참고용 자료이며, 실제 금융 서비스 이용 시 해당 기관의 약관을 반드시 확인하시기 바랍니다.
      </AssumptionsCallout>
    </div>
  );
}

export function PlannerWizardExecutionStep({
  plan,
  checkedMap,
  benefitQueries,
  subscriptionRegion,
  toggleChecklist,
  openAction,
  openPlaybook,
}: PlannerWizardExecutionStepProps) {
  return (
    <div className="space-y-6">
      <Card className="space-y-10 p-10">
        <div className="flex items-center justify-between border-b border-border/50 pb-8">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-navy">{uiTextKo.planner.sectionExecution}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">오늘 바로 시작할 수 있는 작은 실천들이 큰 미래를 만듭니다.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progress</p>
            <Badge variant="secondary" className="border-none bg-primary/5 px-4 py-1.5 text-xs font-black text-navy shadow-sm">
              완료 {Object.values(checkedMap).filter(Boolean).length} / {plan.checklist.length}
            </Badge>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          {EXECUTION_BUCKETS.map((bucket) => (
            <div key={bucket} className="space-y-6">
              <div className="flex items-center gap-3">
                <span className={cn("h-6 w-1 rounded-full", bucket === "이번 주" ? "bg-rose-500" : "bg-primary")} />
                <h3 className="text-sm font-black uppercase tracking-widest text-navy">{bucket}</h3>
              </div>
              <div className="space-y-4">
                {plan.checklist.filter((item) => item.bucket === bucket).map((item) => {
                  const isChecked = !!checkedMap[item.id];
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-start gap-5 rounded-3xl border p-5 transition-all duration-300",
                        isChecked
                          ? "scale-[0.98] border-border/50 bg-surface-muted opacity-60"
                          : "border-border bg-white shadow-sm hover:border-primary/30 hover:shadow-md",
                      )}
                    >
                      <button
                        className={cn(
                          "mt-1.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-xl border-2 transition-all",
                          isChecked ? "rotate-[360deg] border-primary bg-primary text-white" : "border-slate-200 bg-white shadow-sm hover:border-primary",
                        )}
                        onClick={() => toggleChecklist(item.id)}
                      >
                        {isChecked ? <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-base font-black tracking-tight", isChecked ? "font-bold text-slate-400 line-through" : "text-navy")}>{item.label}</p>
                        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">{item.reason}</p>
                        {!isChecked ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {item.href ? (
                              <Button variant="outline" size="sm" className="h-8 rounded-full bg-white px-4 text-[10px] font-black shadow-sm" onClick={() => openAction({ label: item.label, href: item.href })}>
                                바로가기
                              </Button>
                            ) : null}
                            {item.playbookId ? (
                              <Button variant="secondary" size="sm" className="h-8 rounded-full px-4 text-[10px] font-black" onClick={() => openPlaybook(item.playbookId)}>
                                가이드 보기
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="group relative overflow-hidden border-none bg-hero-charcoal p-10 text-white shadow-2xl">
        <div className="absolute right-0 top-0 p-12 opacity-[0.03] transition-transform duration-1000 group-hover:rotate-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nb/mascot.png" alt="" aria-hidden="true" width={300} height={300} />
        </div>
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">추천 서비스</span>
          </div>
          <h3 className="mb-8 text-xl font-black tracking-tight md:text-2xl">당신에게 필요한 금융 도구들을 준비했습니다.</h3>
          <div className="flex flex-wrap gap-3">
            {TOOL_ACTIONS.map((tool) => (
              <Button
                key={tool.label}
                variant="outline"
                className="h-12 rounded-2xl border-white/10 bg-white/5 px-6 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm transition-all hover:bg-white/10"
                onClick={() => openAction(tool)}
              >
                <span className="mr-2 opacity-70">{TOOL_ICONS[tool.label]}</span> {tool.label}
              </Button>
            ))}
            {benefitQueries.map((query) => (
              <Button
                key={query}
                variant="outline"
                className="h-12 rounded-2xl border-white/10 bg-white/5 px-6 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-white/10"
                onClick={() => openAction({ label: `혜택(${query})`, href: `/benefits?query=${encodeURIComponent(query)}` })}
              >
                💎 혜택({query})
              </Button>
            ))}
            <Button
              variant="outline"
              className="h-12 rounded-2xl border-white/10 bg-white/5 px-6 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-white/10"
              onClick={() => openAction({ label: `청약(${subscriptionRegion})`, href: `/housing/subscription?region=${encodeURIComponent(subscriptionRegion)}` })}
            >
              🏠 청약({subscriptionRegion})
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function PlannerWizardMonitoringStep({
  plan,
  input,
  snapshots,
  compareA,
  compareB,
  compareSnapA,
  compareSnapB,
  monthlySavingTrend,
  emergencyGapTrend,
  goalRequiredTrend,
  debtRatioTrend,
  saveCurrentSnapshot,
  applySnapshot,
  deleteSnapshotById,
  setCompareA,
  setCompareB,
}: PlannerWizardMonitoringStepProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-10 p-10 lg:col-span-2">
          <div className="flex items-start justify-between border-b border-border/50 pb-8">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-navy">{uiTextKo.planner.sectionMonitoring}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">지속적인 모니터링은 성공적인 재무 관리의 핵심입니다.</p>
            </div>
            <Button variant="primary" size="lg" onClick={saveCurrentSnapshot} className="h-12 rounded-full px-8 text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
              Save Snapshot
            </Button>
          </div>

          <div className="group relative flex items-center justify-between overflow-hidden rounded-[2.5rem] bg-primary p-8 text-white shadow-xl shadow-navy/20">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
            <div className="relative z-10">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Next Review Recommended</p>
              <p className="text-3xl font-black tabular-nums tracking-tight">{plan.monitoring.nextReviewDate}</p>
            </div>
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-white shadow-2xl transition-transform duration-500 group-hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
            </div>
          </div>

          <div className="space-y-6">
            <p className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">즉시 점검이 필요한 신호</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {plan.monitoring.triggers.map((trigger) => (
                <div
                  key={trigger}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-white p-5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:scale-[1.02] hover:border-primary/30"
                >
                  <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
                  {trigger}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <PlannerWizardHistoryPanel
          snapshots={snapshots}
          onLoad={applySnapshot}
          onDelete={deleteSnapshotById}
        />
      </div>

      <PlannerWizardTrendPanel
        snapshots={snapshots}
        compareA={compareA}
        compareB={compareB}
        onCompareAChange={setCompareA}
        onCompareBChange={setCompareB}
        compareSnapA={compareSnapA}
        compareSnapB={compareSnapB}
        monthlySavingTrend={monthlySavingTrend}
        emergencyGapTrend={emergencyGapTrend}
        goalRequiredTrend={goalRequiredTrend}
        debtRatioTrend={debtRatioTrend}
        unit={input.unit}
      />
    </div>
  );
}
