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
    description: "예금·적금 후보를 넓게 훑으며 비교 기준을 먼저 잡는 빠른 시작점",
    entryLabel: "통합으로 시작",
    badge: "Unified",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-100",
  },
  {
    href: "/products/deposit",
    title: "예금",
    description: "예금 상품군을 먼저 보며 금리, 기간, 보호 여부를 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Deposit",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  {
    href: "/products/saving",
    title: "적금",
    description: "적금 상품군을 먼저 보며 기간과 우대조건을 좁혀 볼 때",
    entryLabel: "이 상품군 보기",
    badge: "Saving",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-100",
  },
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
    description: "연금저축 상품군을 먼저 보며 납입 조건과 절세 요소를 좁혀 볼 때",
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
        description="예적금과 대출 상품의 결론을 바로 고르는 화면이 아니라, 어디서 비교를 시작할지 정하는 입구입니다."
      />

      <Card className="mb-12 rounded-[2.5rem] border border-slate-100 bg-white p-10 shadow-sm">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">비교 시작점</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 leading-tight">
            무엇을 먼저 비교할지 고르세요.
            <br />
            통합 카탈로그에서 기준을 잡아보세요.
          </h2>
          <p className="mt-4 text-base font-medium leading-relaxed text-slate-500">
            이 화면은 확정 결론이 아니라 비교 출발점을 고르는 단계입니다.
            먼저 통합 카탈로그(`/products/catalog`)에서 후보를 넓게 본 뒤, 이미 볼 상품군이 정해졌다면 아래 바로가기로 바로 들어가세요.
          </p>
          <div className="mt-10">
            <Link href="/products/catalog">
              <Button size="lg" variant="primary" className="h-14 rounded-2xl px-10 font-black shadow-xl shadow-emerald-900/20">
                통합 카탈로그에서 비교 시작
              </Button>
            </Link>
            <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
              처음 시작할 때는 여기서 가장 넓게 비교 기준을 잡을 수 있습니다.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-8">
        <SubSectionHeader 
          title="카테고리 바로가기" 
          description="이미 볼 상품군이 정해졌다면 아래에서 바로 들어가세요. 통합 카탈로그보다 범위를 좁혀 시작하는 바로가기입니다."
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
                  {item.entryLabel}
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
