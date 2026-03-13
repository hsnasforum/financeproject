import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

const serviceLinks = [
  { label: "플래닝", description: "내 흐름 기준 액션 정리", href: "/planning", badge: "PLAN" },
  { label: "리포트", description: "저장된 run 기반 공식 리포트", href: "/planning/reports", badge: "REPORT" },
  { label: "추천", description: "예적금과 대출 추천 허브", href: "/recommend", badge: "PICK" },
  { label: "혜택", description: "보조금24 후보 빠르게 탐색", href: "/benefits", badge: "BENEFIT" },
  { label: "상품 탐색", description: "전체 상품 카탈로그 보기", href: "/products/catalog", badge: "CATALOG" },
  { label: "실행 기록", description: "저장된 run과 진행 흐름 확인", href: "/planning/runs", badge: "RUN" },
];

export function ServiceLinks() {
  return (
    <section className="bg-white py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-400">MMD 전체 흐름</p>
          <h2 className="mt-3 text-[2rem] font-black tracking-[-0.04em] text-slate-950 md:text-[2.5rem]">필요한 화면으로 바로 이동</h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {serviceLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className="group rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 transition-all hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black tracking-[0.16em] text-slate-400">{item.badge}</p>
                  <p className="text-lg font-black tracking-[-0.03em] text-slate-950">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
                <span className="text-lg font-bold text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#2383e2]">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
