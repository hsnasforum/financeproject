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
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          {actionSummary ? (
            <>
              <div className="rounded-[32px] bg-[#eaf3ff] p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-500">오늘의 액션</p>
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-black tracking-[0.14em] text-slate-700">
                    {actionSummary.badge}
                  </span>
                  {actionSummary.quickRuleLabel ? (
                    <span className="rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[11px] font-black tracking-[0.02em] text-sky-700">
                      quick rules · {actionSummary.quickRuleLabel}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-4 text-[2rem] font-black leading-[1.2] tracking-[-0.04em] text-slate-950">
                  {actionSummary.title}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-slate-700">
                  {actionSummary.summary}
                </p>
                <p className="mt-4 max-w-md text-xs leading-6 text-slate-500">
                  계산 기준: {actionSummary.basis}
                </p>
                {actionSummary.quickRuleDetail ? (
                  <p className="mt-2 max-w-md text-xs leading-6 text-slate-600">
                    상태 읽기: {actionSummary.quickRuleDetail}
                  </p>
                ) : null}
                <Link
                  className="mt-8 inline-flex h-12 items-center rounded-xl bg-[#4f8ef7] px-6 text-sm font-extrabold text-white"
                  href={actionSummary.href}
                  prefetch={devPlanningPrefetch("/planning/reports")}
                >
                  액션 근거 보기
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {actionSummary.metrics.map((metric) => (
                  <div
                    className="rounded-[28px] border border-slate-200 bg-white p-6"
                    key={metric.label}
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{metric.label}</p>
                    <p className="mt-4 text-2xl font-black tracking-[-0.04em] text-slate-950">{metric.value}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{metric.hint}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-[32px] bg-[#eaf3ff] p-8">
                <p className="text-sm font-bold text-slate-500">오늘 바로 시작</p>
                <h2 className="mt-4 text-[2rem] font-black leading-[1.2] tracking-[-0.04em] text-slate-950">
                  내 상황에 필요한 흐름만
                  <br />
                  MMD에서 바로 엽니다
                </h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-slate-700">
                  플래닝에서 시작하고, 리포트와 추천, 혜택으로 바로 이어지는 흐름만 남겼습니다.
                </p>
                <Link
                  className="mt-8 inline-flex h-12 items-center rounded-xl bg-[#4f8ef7] px-6 text-sm font-extrabold text-white"
                  href="/planning"
                  prefetch={devPlanningPrefetch("/planning")}
                >
                  플래닝 시작
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {featurePanels.map((panel) => (
                  <Link
                    key={panel.href}
                    href={panel.href}
                    prefetch={devPlanningPrefetch(panel.href)}
                    className={`rounded-[28px] border border-slate-200 p-6 transition-transform hover:-translate-y-1 ${panel.tone}`}
                  >
                    <p className="text-sm font-black tracking-[-0.03em] text-slate-950">{panel.title}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{panel.description}</p>
                    <p className="mt-8 text-sm font-bold text-slate-900">바로 보기</p>
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
