import { SnapshotDeltaCards } from "@/components/SnapshotDeltaCards";
import { Sparkline } from "@/components/Sparkline";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  STEPS,
  type PlannerInput,
  type PlannerWizardFooterNavProps,
  type PlannerWizardHistoryPanelProps,
  type PlannerWizardSidebarProps,
  type PlannerWizardTrendPanelProps,
  formatMoney,
} from "./shared";

export function InputHint({ value, unit }: { value: number; unit: PlannerInput["unit"] }) {
  if (!value) return null;
  const inManwon = unit === "MANWON" ? value : value / 10000;
  if (inManwon >= 10000) {
    return <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded bg-primary/5 px-1.5 py-0.5 text-[11px] font-bold text-primary">{(inManwon / 10000).toFixed(1)}억원</span>;
  }
  return <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded bg-primary/5 px-1.5 py-0.5 text-[11px] font-bold text-primary">{inManwon.toLocaleString()}만원</span>;
}

export function FinancialHealthGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg className="h-full w-full -rotate-90">
          <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (score / 100) * circumference}
            strokeLinecap="round"
            className={cn(
              "transition-[stroke-dashoffset] duration-1000 ease-out",
              score > 70 ? "text-success" : score > 40 ? "text-warning" : "text-danger",
            )}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black tabular-nums text-navy transition-transform duration-300">
            {score}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Health Score</p>
    </div>
  );
}

export function MascotGuide({ step }: { step: number }) {
  const messages = [
    "안녕하세요! 먼저 당신이 이루고 싶은 재무 목표를 알려주세요. 구체적일수록 정확한 설계가 가능합니다.",
    "현재의 수입과 지출을 꼼꼼히 적어주세요. 이 데이터가 모든 분석의 기초가 됩니다.",
    "분석이 완료되었습니다! 현재 상태를 진단하고, 목표 달성을 위한 최적의 경로를 제안해 드립니다.",
    "이제 실행할 시간입니다. 이번 주와 이번 달에 꼭 해야 할 일들을 체크리스트로 정리했습니다.",
    "설계된 내용을 저장하고 주기적으로 점검하세요. 변화가 생기면 언제든 다시 설계를 수정할 수 있습니다.",
  ];

  return (
    <div key={step} className="group relative mb-8 flex items-center gap-6 overflow-hidden rounded-3xl border border-primary/10 bg-white p-6 shadow-card animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="absolute right-0 top-0 p-4 opacity-[0.03] transition-transform duration-700 group-hover:scale-110">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nb/mascot.png" alt="" aria-hidden="true" width={160} height={160} />
      </div>
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/5 ring-4 ring-primary/10 transition-transform duration-200 group-hover:scale-105 group-hover:rotate-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nb/mascot.png" alt="Mascot" width={64} height={64} className="h-16 w-16 object-cover" />
      </div>
      <div className="relative">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary">Financial Assistant</p>
        <p className="text-sm font-bold leading-relaxed text-slate-700">{messages[step]}</p>
      </div>
    </div>
  );
}

export function TrendRow({ label, values, color, formatValue }: { label: string; values: number[]; color: string; formatValue?: (v: number) => string }) {
  const current = values.length ? values[values.length - 1] : 0;
  const prev = values.length > 1 ? values[values.length - 2] : current;
  const diff = current - prev;
  const sign = diff > 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20">
      <div>
        <p className="mb-1 text-[11px] font-black uppercase tracking-tight text-slate-400">{label}</p>
        <p className={cn("text-xs font-bold tabular-nums", diff >= 0 ? "text-success" : "text-danger")}>
          {sign}{diff.toFixed(1)}%
        </p>
      </div>
      <div className="w-24">
        <Sparkline values={values} color={color} formatValue={formatValue} />
      </div>
    </div>
  );
}

export function PlannerWizardSidebar({
  step,
  linkOpenMode,
  onStepSelect,
  onLinkOpenModeChange,
}: PlannerWizardSidebarProps) {
  return (
    <div className="md:w-72 flex-shrink-0">
      <div className="sticky top-24 space-y-3">
        {STEPS.map((stepItem, idx) => {
          const isActive = step === idx;
          const isCompleted = step > idx;
          return (
            <button
              key={stepItem.label}
              type="button"
              className={cn(
                "group flex w-full items-center gap-4 rounded-[1.5rem] px-5 py-4 text-sm font-bold transition-all duration-300 hover:translate-x-1 active:scale-[0.98]",
                isActive
                  ? "scale-[1.03] bg-primary text-white shadow-xl shadow-primary/20"
                  : "border border-border/50 bg-surface text-slate-500 shadow-sm hover:bg-surface-muted hover:text-navy",
              )}
              onClick={() => onStepSelect(idx)}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl text-base transition-all",
                isActive ? "bg-white/20" : cn("bg-surface-muted group-hover:bg-white", stepItem.color),
              )}>
                {isCompleted ? "✓" : stepItem.icon}
              </div>
              <span className="flex-1 text-left tracking-tight">{stepItem.label}</span>
              {isActive ? <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : null}
            </button>
          );
        })}

        <Card className="relative mt-8 overflow-hidden border border-slate-100 bg-surface-muted p-6 shadow-inner">
          <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
          <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">UI Prefs</p>
          <div className="space-y-4">
            <div>
              <p className="mb-3 text-xs font-bold text-slate-600">상품 상세 열기</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-200/50 p-1">
                <button
                  onClick={() => onLinkOpenModeChange("quickview")}
                  className={cn("rounded-lg py-1.5 text-[10px] font-black transition-all", linkOpenMode === "quickview" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >
                  빠른 보기
                </button>
                <button
                  onClick={() => onLinkOpenModeChange("newtab")}
                  className={cn("rounded-lg py-1.5 text-[10px] font-black transition-all", linkOpenMode === "newtab" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}
                >
                  새 탭
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function PlannerWizardHistoryPanel({
  snapshots,
  onLoad,
  onDelete,
}: PlannerWizardHistoryPanelProps) {
  return (
    <Card className="border-border/50 bg-surface p-8">
      <h3 className="mb-8 border-b border-border/50 pb-4 text-xs font-black uppercase tracking-widest text-navy">Recent History</h3>
      <div className="space-y-4">
        {snapshots.length === 0 ? (
          <div className="space-y-4 py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-slate-200">∅</div>
            <p className="text-[11px] font-bold text-slate-400">저장된 기록이 없습니다.</p>
          </div>
        ) : (
          snapshots.slice(0, 5).map((snap) => (
            <div
              key={snap.id}
              className="group rounded-2xl border border-border bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary"
            >
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">{snap.createdAt.slice(0, 10)}</p>
              <p className="mb-4 line-clamp-1 text-sm font-black text-slate-800">{snap.input.goalName}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 flex-1 rounded-xl border-none bg-surface-muted text-[10px] font-black shadow-sm transition-all hover:bg-primary hover:text-white" onClick={() => onLoad(snap.id)}>LOAD</Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-xl p-0 text-rose-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => onDelete(snap.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export function PlannerWizardTrendPanel({
  snapshots,
  compareA,
  compareB,
  onCompareAChange,
  onCompareBChange,
  compareSnapA,
  compareSnapB,
  monthlySavingTrend,
  emergencyGapTrend,
  goalRequiredTrend,
  debtRatioTrend,
  unit,
}: PlannerWizardTrendPanelProps) {
  return (
    <Card className="p-10">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </div>
          <h3 className="text-xl font-black tracking-tight text-navy">트렌드 분석 및 성과 비교</h3>
        </div>
        <Badge variant="outline" className="border-slate-200 px-3 py-1 text-[10px] font-black text-slate-400">LAST 10 SNAPSHOTS</Badge>
      </div>

      <div className="mb-12 grid gap-8 md:grid-cols-2">
        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">기준 스냅샷 (A)</label>
          <select className="h-12 w-full cursor-pointer rounded-2xl border border-border bg-surface-muted px-5 text-sm font-bold shadow-inner transition-all outline-none hover:bg-white" value={compareA} onChange={(event) => onCompareAChange(event.target.value)}>
            <option value="">비교 대상을 선택하세요</option>
            {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">대조 스냅샷 (B)</label>
          <select className="h-12 w-full cursor-pointer rounded-2xl border border-border bg-surface-muted px-5 text-sm font-bold shadow-inner transition-all outline-none hover:bg-white" value={compareB} onChange={(event) => onCompareBChange(event.target.value)}>
            <option value="">비교 대상을 선택하세요</option>
            {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
          </select>
        </div>
      </div>

      {compareSnapA && compareSnapB ? (
        <div className="mb-12 rounded-[2.5rem] border border-border/50 bg-surface-muted p-8 shadow-inner animate-in fade-in zoom-in-95 duration-200">
          <SnapshotDeltaCards prev={compareSnapA} next={compareSnapB} />
        </div>
      ) : null}

      <div className="space-y-6">
        <p className="flex items-center gap-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          Performance Indicators
          <span className="h-px flex-1 bg-slate-200" />
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrendRow label="월 저축액" values={monthlySavingTrend} color="#10b981" formatValue={(value) => formatMoney(value, unit)} />
          <TrendRow label="비상금 부족" values={emergencyGapTrend} color="#ef4444" formatValue={(value) => formatMoney(value, unit)} />
          <TrendRow label="필요 적립액" values={goalRequiredTrend} color="#10b981" formatValue={(value) => formatMoney(value, unit)} />
          <TrendRow label="부채 상환율" values={debtRatioTrend} color="#6366f1" formatValue={(value) => `${value.toFixed(1)}%`} />
        </div>
      </div>
    </Card>
  );
}

export function PlannerWizardFooterNav({
  step,
  onPrevious,
  onContinue,
}: PlannerWizardFooterNavProps) {
  return (
    <div className="mt-12 flex items-center justify-between border-t border-border/50 py-10">
      <Button
        variant="outline"
        size="lg"
        className="h-14 w-44 rounded-full border-slate-200 bg-white text-xs font-black uppercase tracking-widest shadow-md transition-all active:scale-95 hover:bg-surface-muted"
        disabled={step === 0}
        onClick={onPrevious}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="m15 18-6-6 6-6"/></svg>
        PREVIOUS
      </Button>

      <div className="hidden gap-3 sm:flex">
        {STEPS.map((_, i) => (
          <div key={i} className={cn(
            "h-1.5 rounded-full transition-all duration-500",
            i === step ? "w-12 bg-primary shadow-[0_0_8px_var(--color-primary)]" : i < step ? "w-6 bg-primary/30" : "w-6 bg-slate-200",
          )} />
        ))}
      </div>

      <Button
        variant="primary"
        size="lg"
        className="h-14 w-44 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl shadow-primary/30 transition-all active:scale-95 hover:scale-105"
        disabled={step === STEPS.length - 1}
        onClick={onContinue}
      >
        CONTINUE
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-3"><path d="m9 18 6-6-6-6"/></svg>
      </Button>
    </div>
  );
}
