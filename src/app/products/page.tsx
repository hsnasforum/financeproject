import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/products"];

const CATALOG_PRESET_CARDS = [
  {
    href: "/products/catalog?kind=deposit",
    title: "예금",
    description: "예금 상품군을 먼저 보며 금리, 기간, 보호 여부를 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Deposit",
    badgeClass: "bg-primary/5 text-navy border-primary/10",
  },
  {
    href: "/products/catalog?kind=saving",
    title: "적금",
    description: "적금 상품군을 먼저 보며 기간과 우대조건을 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Saving",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-100",
  },
] as const;

const SPECIALIZED_PRODUCT_LINKS = [
  {
    href: "/products/mortgage-loan",
    title: "주담대",
    description: "주담대 상품군을 먼저 보며 금리 구조와 상환 조건을 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Mortgage",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    href: "/products/pension",
    title: "연금저축",
    description: "통합연금포털 공시로 원리금보장 연금저축보험과 상품별 수수료율·수익률을 비교할 때",
    entryLabel: "이 상품군 보기",
    badge: "Pension",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    href: "/products/rent-house-loan",
    title: "전세대출",
    description: "전세대출 상품군을 먼저 보며 금리와 가입 요건을 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Rent Loan",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-100",
  },
  {
    href: "/products/credit-loan",
    title: "신용대출",
    description: "신용대출 상품군을 먼저 보며 금리와 한도 조건을 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Credit",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-100",
  },
] as const;

export default function ProductsHomePage() {
  return (
    <PageShell>
      <PageHeader 
        title="금융상품 탐색"
        description="예금·적금은 통합 카탈로그에서 비교하고, 연금·대출은 상품군별 별도 화면에서 조건을 확인하는 시작점입니다."
      />

      <Card
        className="mb-12 rounded-[2.5rem] border border-slate-100 bg-white p-10 shadow-sm"
        data-products-entry-tier="primary"
      >
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">비교 시작점</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-navy leading-tight">
            무엇을 먼저 비교할지 고르세요.
            <br />
            통합 카탈로그에서 기준을 잡아보세요.
          </h2>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-500">
            이 화면은 확정 결론이 아니라 비교 출발점을 고르는 단계입니다.
            예금·적금은 통합 카탈로그에서 후보를 넓게 본 뒤 기간, 우대조건, 보호 여부를 함께 비교하세요.
          </p>
          <div className="mt-10">
            <Link
              href="/products/catalog"
              className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl border border-transparent bg-primary px-10 text-base font-black text-white shadow-xl shadow-navy/20 transition-all duration-300 hover:scale-[1.02] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 active:scale-95"
            >
              통합 카탈로그에서 비교 시작
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
              처음 시작할 때는 여기서 가장 넓게 비교 기준을 잡을 수 있습니다.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-14">
        <section aria-label="예금·적금 통합 카탈로그 바로가기" data-products-entry-tier="catalog-preset">
          <SubSectionHeader
            title="예금·적금 바로가기"
            description="통합 카탈로그의 같은 비교 기준을 유지하면서 상품군 필터만 먼저 적용합니다."
          />

          <div className="mt-8 grid max-w-5xl gap-6 md:grid-cols-2">
            {CATALOG_PRESET_CARDS.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className="flex h-full flex-col rounded-[2rem] border-slate-100 p-8 transition-all hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl active:scale-[0.98]">
                  <div className="mb-6">
                    <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${item.badgeClass}`}>
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-navy transition-colors group-hover:text-primary">{item.title} 상품</h3>
                  <p className="mt-3 flex-1 text-sm font-medium leading-relaxed text-slate-500">{item.description}</p>
                  <div className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                    {item.entryLabel}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={3} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="연금·대출 별도 상품군" data-products-entry-tier="specialized">
          <SubSectionHeader
            title="연금·대출 별도 탐색"
            description="통합 카탈로그에 포함되지 않는 상품군입니다. 상품군별 데이터와 비교 조건을 별도 화면에서 확인하세요."
          />

          <div className="mt-8 divide-y divide-slate-100 border-y border-slate-200">
            {SPECIALIZED_PRODUCT_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group grid gap-4 py-6 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center sm:px-4"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${item.badgeClass}`}>
                    {item.badge}
                  </span>
                  <h3 className="text-base font-black text-navy transition-colors group-hover:text-primary">{item.title}</h3>
                </div>
                <p className="text-sm font-medium leading-relaxed text-slate-500">{item.description}</p>
                <span className="flex items-center gap-2 text-xs font-black text-primary">
                  별도 화면 열기
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
