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
    tone: "bg-[#eaf3ff]",
  },
  {
    title: "상품 비교는 더 간단하게",
    description: "복잡한 목록 대신 핵심 후보부터 빠르게 확인합니다.",
    href: "/products/catalog",
    tone: "bg-[#f4f6fb]",
  },
  {
    title: "실행 중심 플래닝",
    description: "이번 달 액션과 위험 신호를 한 흐름으로 정리합니다.",
    href: "/planning",
    tone: "bg-[#eefaf4]",
  },
];

export function TodayQueue({ actionSummary }: { actionSummary?: TodayQueueActionSummary | null }) {
  return (
    <section className="py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {actionSummary ? (
            <>
              <div className="rounded-[2.5rem] bg-white border border-slate-100 p-10 shadow-sm transition-all hover:shadow-md">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm shadow-emerald-200">
                    {actionSummary.badge}
                  </span>
                  {actionSummary.quickRuleLabel ? (
                    <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                      quick rules · {actionSummary.quickRuleLabel}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight text-slate-900">
                  {actionSummary.title}
                </h2>
                <p className="mt-4 max-w-md text-sm font-medium leading-relaxed text-slate-500">
                  {actionSummary.summary}
                </p>
                <div className="mt-8 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">계산 기준</p>
                  <p className="max-w-md text-xs font-bold text-slate-400">
                    {actionSummary.basis}
                  </p>
                </div>
                {actionSummary.quickRuleDetail ? (
                  <p className="mt-3 max-w-md text-xs font-bold text-emerald-600/80 italic">
                    상태 읽기: {actionSummary.quickRuleDetail}
                  </p>
                ) : null}
                <Link
                  className="mt-10 inline-flex h-12 items-center rounded-2xl bg-emerald-600 px-10 text-sm font-black text-white shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]"
                  href={actionSummary.href}
                  prefetch={devPlanningPrefetch("/planning/reports")}
                >
                  액션 리포트 보기
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {actionSummary.metrics.map((metric) => (
                  <div
                    className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm transition-all hover:border-emerald-100 hover:shadow-md group"
                    key={metric.label}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{metric.label}</p>
                    <p className="mt-4 text-3xl font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">{metric.value}</p>
                    <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500">{metric.hint}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-[2.5rem] bg-emerald-50 p-10 border border-emerald-100">
                <p className="text-sm font-black uppercase tracking-widest text-emerald-600">Daily Action</p>
                <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight text-slate-900">
                  내 상황에 필요한 흐름만
                  <br />
                  MMD에서 바로 엽니다
                </h2>
                <p className="mt-4 max-w-md text-base font-medium leading-relaxed text-slate-600">
                  플래닝에서 시작하고, 리포트와 추천, 혜택으로 바로 이어지는 흐름만 남겼습니다.
                </p>
                <Link
                  className="mt-10 inline-flex h-12 items-center rounded-2xl bg-emerald-600 px-10 text-sm font-black text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]"
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
                    className="group rounded-[2rem] border border-slate-100 bg-white p-8 transition-all hover:-translate-y-1 hover:shadow-xl hover:border-emerald-100"
                  >
                    <p className="text-sm font-black tracking-tight text-slate-950 group-hover:text-emerald-600 transition-colors">{panel.title}</p>
                    <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500">{panel.description}</p>
                    <div className="mt-10 flex justify-end">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 group-hover:text-emerald-500 transition-colors">Start ▶</span>
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
