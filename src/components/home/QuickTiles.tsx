import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

const categoryTiles = [
  { title: "예적금", description: "금리 비교 후 바로 플랜에 연결", href: "/products/saving", accent: "bg-[linear-gradient(145deg,#edf6ff_0%,#d8ebff_100%)]", code: "SV" },
  { title: "혜택", description: "보조금24 기반 후보를 빠르게 확인", href: "/benefits", accent: "bg-[linear-gradient(145deg,#eefcf6_0%,#d9f7ea_100%)]", code: "BF" },
  { title: "리포트", description: "이번 달 액션과 위험 신호 정리", href: "/planning/reports", accent: "bg-[linear-gradient(145deg,#f4f8ff_0%,#e7f0ff_100%)]", code: "RP" },
  { title: "대시보드", description: "최근 플랜과 데이터 상태를 한 번에 확인", href: "/dashboard", accent: "bg-[linear-gradient(145deg,#fff4ea_0%,#ffe7d1_100%)]", code: "DB" },
];

export function QuickTiles() {
  return (
    <section className="bg-white py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-[15px] font-medium text-slate-400">MMD 핵심 기능</p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {categoryTiles.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className="group rounded-[28px] border border-slate-200 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_44px_rgba(15,23,42,0.08)]"
            >
              <div className={`flex h-16 w-16 items-center justify-center rounded-[22px] ${item.accent}`}>
                <span className="text-lg font-black text-slate-900">{item.code}</span>
              </div>
              <h3 className="mt-5 text-xl font-black tracking-[-0.03em] text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              <p className="mt-6 text-sm font-bold text-[#2383e2]">바로 이동</p>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
