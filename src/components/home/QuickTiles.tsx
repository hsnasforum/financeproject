import Link from "next/link";
import Image from "next/image";

type QuickLink = {
  label: string;
  description: string;
  href: string;
  icon: string;
};

const coreLinks: QuickLink[] = [
  { label: "대시보드", description: "통합 현황 확인", href: "/dashboard", icon: "/icons/ic-dashboard.png" },
  { label: "재무설계", description: "액션 중심 계획", href: "/planner", icon: "/icons/ic-planner.png" },
  { label: "추천", description: "조건 기반 추천", href: "/recommend", icon: "/icons/ic-recommend.png" },
  { label: "공시(DART)", description: "기업 공시 탐색", href: "/public/dart", icon: "/icons/ic-dart.png" },
  { label: "데이터 소스", description: "연동 상태 관리", href: "/settings/data-sources", icon: "/icons/ic-datasource.png" },
];

export function QuickTiles() {
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">핵심 바로가기</h2>
          <p className="text-sm text-slate-500">자주 이용하는 핵심 기능을 빠르게 호출하세요.</p>
        </div>
      </div>
      
      <div className="mt-6 flex gap-4 overflow-x-auto pb-4 no-scrollbar md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
        {coreLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex min-w-[160px] flex-col items-center rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-card transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-card-hover md:min-w-0"
          >
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 transition-colors group-hover:bg-emerald-50">
              <Image 
                src={item.icon} 
                alt={item.label} 
                width={32} 
                height={32} 
                className="transition-transform group-hover:scale-110"
              />
            </div>
            <p className="mt-4 text-sm font-bold text-slate-900">{item.label}</p>
            <p className="mt-1 text-[11px] text-slate-400 group-hover:text-slate-500">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
