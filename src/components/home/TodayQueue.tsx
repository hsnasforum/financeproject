import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

export type TodayQueueActionSummaryMetric = {
  label: string;
  value: string;
  hint: string;
};

export type TodayQueueActionSummary = {
  badge: string;
  title: string;
  summary: string;
  basis: string;
  href: string;
  metrics: TodayQueueActionSummaryMetric[];
  quickRuleDetail?: string;
  quickRuleLabel?: string;
};

const featurePanels = [
  {
    title: "리포트에서 바로 추천",
    description: "저장된 플랜 기준으로 예적금과 혜택 후보를 이어서 봅니다.",
    href: "/planning/reports",
    tone: "bg-[#e0ecff]",
  },
  {
    title: "상품 비교는 더 간단하게",
    description: "복잡한 목록 대신 핵심 후보부터 빠르게 확인합니다.",
    href: "/products/catalog",
    tone: "bg-[#ede9fe]",
  },
  {
    title: "실행 중심 플래닝",
    description: "이번 달 액션과 위험 신호를 한 흐름으로 정리합니다.",
    href: "/planning",
    tone: "bg-[#d1faf0]",
  },
];

export function TodayQueue({ actionSummary }: { actionSummary?: TodayQueueActionSummary | null }) {
  return (
    <section className="py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {actionSummary ? (
            <>
              <div className="rounded-[2rem] bg-white border border-slate-100 p-10 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-card-hover)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-accent-foreground shadow-sm">
                    {actionSummary.badge}
                  </span>
                  {actionSummary.quickRuleLabel ? (
                    <span className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                      빠른 점검 · {actionSummary.quickRuleLabel}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight text-navy">
                  {actionSummary.title}
                </h2>
                <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-muted">
                  {actionSummary.summary}
                </p>
                <div className="mt-8 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">계산 기준</p>
                  <p className="max-w-md text-xs font-bold text-muted">
                    {actionSummary.basis}
                  </p>
                </div>
                {actionSummary.quickRuleDetail ? (
                  <p className="mt-3 max-w-md text-xs font-bold text-primary/80 italic">
                    상태 읽기: {actionSummary.quickRuleDetail}
                  </p>
                ) : null}
                <Link
                  className="mt-10 inline-flex h-12 items-center rounded-2xl bg-primary px-10 text-sm font-black text-white shadow-[0_16px_32px_-12px_rgba(30,58,138,0.5)] transition-all hover:bg-primary-hover hover:scale-[1.02] active:scale-[0.98]"
                  href={actionSummary.href}
                  prefetch={devPlanningPrefetch("/planning/reports")}
                >
                  액션 리포트 보기
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {actionSummary.metrics.map((metric) => (
                  <div
                    className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-[var(--shadow-card)] transition-all hover:border-primary/20 hover:shadow-[var(--shadow-card-hover)] group"
                    key={metric.label}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">{metric.label}</p>
                    <p className="mt-4 text-3xl font-black tracking-tight text-navy font-numeric tabular-nums group-hover:text-primary transition-colors">{metric.value}</p>
                    <p className="mt-4 text-xs font-medium leading-relaxed text-muted">{metric.hint}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                className="bg-hero-gradient-surface relative overflow-hidden rounded-[2rem] p-10 text-white"
              >
                <div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#00d9a3]/20 blur-3xl" />
                <p className="relative text-sm font-black uppercase tracking-widest text-[#00d9a3]">오늘의 실행</p>
                <h2 className="relative mt-6 text-3xl font-black leading-tight tracking-tight text-white">
                  내 상황에 필요한 흐름만
                  <br />
                  MMD에서 바로 엽니다
                </h2>
                <p className="relative mt-4 max-w-md text-base font-medium leading-relaxed text-white/80">
                  플래닝에서 시작하고, 리포트와 추천, 혜택으로 바로 이어지는 흐름만 남겼습니다.
                </p>
                <Link
                  className="relative mt-10 inline-flex h-12 items-center rounded-2xl bg-accent px-10 text-sm font-black text-accent-foreground shadow-[0_16px_32px_-12px_rgba(0,217,163,0.5)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                  href="/planning"
                  prefetch={devPlanningPrefetch("/planning")}
                >
                  플래닝 시작하기
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {featurePanels.map((panel) => (
                  <Link
                    key={panel.href}
                    href={panel.href}
                    prefetch={devPlanningPrefetch(panel.href)}
                    className="group rounded-[1.5rem] border border-slate-100 bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] hover:border-primary/20"
                  >
                    <p className="text-sm font-black tracking-tight text-navy group-hover:text-primary transition-colors">{panel.title}</p>
                    <p className="mt-4 text-xs font-medium leading-relaxed text-muted">{panel.description}</p>
                    <div className="mt-10 flex justify-end">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 group-hover:text-primary transition-colors">시작하기 →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </Container>
    </section>
  );
}
