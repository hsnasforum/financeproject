import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

const serviceLinks = [
  { label: "홈/대시보드", description: "진단과 상품 비교 중 어디서 다시 시작할지 고르기", href: "/dashboard", badge: "시작" },
  { label: "재무진단", description: "내 수입·지출·부채 흐름부터 먼저 보기", href: "/planning", badge: "진단" },
  { label: "상품추천", description: "현재 조건으로 예적금·대출 후보 비교", href: "/recommend", badge: "추천" },
  { label: "금융탐색", description: "상품·공시·혜택·주거·환율 정보 탐색", href: "/products", badge: "탐색" },
  { label: "내 설정", description: "데이터 신뢰, 알림, 백업을 한 곳에서 관리", href: "/settings", badge: "설정" },
];

export function ServiceLinks() {
  return (
    <section className="bg-white py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">전체 화면 바로가기</p>
          <h2 className="mt-6 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">지금 필요한 시작점으로 바로 이동</h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
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
