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
          <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">MMD Core Features</p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {categoryTiles.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className="group rounded-[2rem] border border-slate-100 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-emerald-100"
            >
              <div className={`flex h-16 w-16 items-center justify-center rounded-[1.5rem] shadow-sm ${item.accent}`}>
                <span className="text-lg font-black text-slate-900">{item.code}</span>
              </div>
              <h3 className="mt-6 text-xl font-black tracking-tight text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500">{item.description}</p>
              <p className="mt-8 text-sm font-black text-emerald-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Explore ▶</p>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
