import Link from "next/link";

type QuickLink = {
  label: string;
  description: string;
  href: string;
};

const serviceLinks: QuickLink[] = [
  { label: "통합 탐색", description: "예금/적금 카탈로그", href: "/products/catalog" },
  { label: "상품 카테고리", description: "대출/연금 카테고리", href: "/products" },
  { label: "추천 히스토리", description: "실행 이력/오픈", href: "/recommend/history" },
  { label: "리포트", description: "결과 요약 리포트", href: "/report" },
  { label: "비교", description: "상품 비교 보기", href: "/compare" },
  { label: "혜택 탐색", description: "보조금/복지 검색", href: "/benefits" },
];

export function ServiceLinks() {
  return (
    <section className="mt-16">
      <h2 className="text-xl font-black tracking-tight text-slate-900">전체 서비스</h2>
      <p className="mt-1 text-sm text-slate-500">필요한 기능으로 빠르게 이동하세요.</p>
      
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {serviceLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-slate-100 bg-white p-5 transition-all hover:border-emerald-200 hover:shadow-card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.description}</p>
              </div>
              <span className="text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
