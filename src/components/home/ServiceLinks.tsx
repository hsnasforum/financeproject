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
          <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">MMD Full Catalog</p>
          <h2 className="mt-6 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">필요한 화면으로 바로 이동</h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {serviceLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className="group rounded-[2rem] border border-slate-100 bg-slate-50/30 p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-emerald-100 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.badge}</p>
                  <p className="mt-4 text-xl font-black tracking-tight text-slate-900">{item.label}</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{item.description}</p>
                </div>
                <span className="text-xl font-bold text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-emerald-500">
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
