import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { Button } from "@/components/ui/Button";

const PRODUCT_CARDS = [
  {
    href: "/products/catalog",
    title: "통합 탐색",
    description: "예금/적금을 통합 카탈로그에서 한 번에 탐색하고 비교합니다.",
    badge: "Unified",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-100",
  },
  {
    href: "/products/deposit",
    title: "예금",
    description: "목돈을 일정 기간 예치하고 안정적인 이자 수익을 받는 상품",
    badge: "Deposit",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  {
    href: "/products/saving",
    title: "적금",
    description: "매달 일정 금액을 납입하여 만기에 목돈을 만드는 저축 상품",
    badge: "Saving",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-100",
  },
  {
    href: "/products/mortgage-loan",
    title: "주담대",
    description: "내 집 마련을 위한 주택 담보 기반 장기 대출 상품",
    badge: "Mortgage",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    href: "/products/pension",
    title: "연금저축",
    description: "노후 준비를 위해 장기 납입하는 절세 혜택 포함 저축 상품",
    badge: "Pension",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    href: "/products/rent-house-loan",
    title: "전세대출",
    description: "전세 보증금 마련을 위한 주거 안정 지원 대출 상품",
    badge: "Rent Loan",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-100",
  },
  {
    href: "/products/credit-loan",
    title: "신용대출",
    description: "담보 없이 개인 신용도를 기반으로 이용하는 대출 상품",
    badge: "Credit",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-100",
  },
] as const;

export default function ProductsHomePage() {
  return (
    <PageShell>
      <PageHeader 
        title="금융상품 카테고리"
        description="다양한 금융기관의 상품 정보를 카테고리별로 비교하고 탐색할 수 있습니다."
      />

      <Card className="mb-12 rounded-[2.5rem] border border-slate-100 bg-white p-10 shadow-sm">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Smart Discovery</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 leading-tight">
            어떤 상품을 찾으시나요?
            <br />
            통합 카탈로그에서 한눈에 보세요.
          </h2>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-500">
            개별 카테고리로 이동하기 전, 통합 탐색(`/products/catalog`)에서 
            전체 금융권의 금리 순위를 먼저 확인하는 흐름을 권장합니다.
          </p>
          <div className="mt-10">
            <Link href="/products/catalog">
              <Button size="lg" variant="primary" className="h-14 rounded-2xl px-10 font-black shadow-xl shadow-emerald-900/20">
                통합 카탈로그 열기
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="space-y-8">
        <SubSectionHeader 
          title="카테고리 바로가기" 
          description="목적에 맞는 상품군을 선택하여 상세 조건을 필터링하세요." 
        />
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CARDS.map((item) => (
            <Link key={item.href} href={item.href} className="group">
              <Card className="flex flex-col h-full rounded-[2rem] p-8 border-slate-100 transition-all hover:border-emerald-200 hover:shadow-xl hover:-translate-y-1 active:scale-[0.98]">
                <div className="mb-6">
                  <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${item.badgeClass}`}>
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">{item.title} 상품</h3>
                <p className="mt-3 text-sm font-medium text-slate-500 flex-1 leading-relaxed">{item.description}</p>
                <div className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                  Explore Now
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
