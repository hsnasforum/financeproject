import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

const PRODUCT_CARDS = [
  {
    href: "/products/catalog",
    title: "통합 탐색",
    description: "예금/적금을 통합 카탈로그에서 한 번에 탐색",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-100",
  },
  {
    href: "/products/deposit",
    title: "예금",
    description: "목돈을 일정 기간 예치하고 이자를 받는 상품",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-100",
  },
  {
    href: "/products/saving",
    title: "적금",
    description: "매달 납입하며 만기에 목돈을 만드는 상품",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-100",
  },
  {
    href: "/products/mortgage-loan",
    title: "주담대",
    description: "주택 담보 기반 대출 상품",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-100",
  },
  {
    href: "/products/pension",
    title: "연금저축",
    description: "노후 준비를 위해 장기 납입하는 절세형 저축 상품",
    badgeClass: "bg-violet-50 text-violet-800 border-violet-100",
  },
  {
    href: "/products/rent-house-loan",
    title: "전세대출",
    description: "전세 보증금 마련 목적의 주거 대출",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-100",
  },
  {
    href: "/products/credit-loan",
    title: "신용대출",
    description: "담보 없이 신용도를 기반으로 이용하는 대출",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-100",
  },
] as const;

export default function ProductsHomePage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 md:py-14">
      <Container>
        <section className="mb-8 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">Product Explorer</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">금융상품 카테고리</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base leading-relaxed">
            예금, 적금, 연금저축, 주담대, 전세대출, 신용대출을 같은 화면 구조에서 비교할 수 있습니다.
          </p>
          <div className="mt-6">
            <Link href="/products/deposit">
              <Button size="lg" variant="primary">대표 카테고리 바로가기</Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PRODUCT_CARDS.map((item) => (
            <Card key={item.href} className="flex flex-col h-full group">
              <div className="mb-4">
                <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${item.badgeClass}`}>
                  {item.title}
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-slate-900">{item.title} 상품</h2>
              <p className="mt-2 text-sm text-slate-600 flex-1 leading-relaxed">{item.description}</p>
              <Link
                href={item.href}
                className="mt-6 flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors group-hover:gap-3"
              >
                상세 보기
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </Card>
          ))}
        </section>
      </Container>
    </main>
  );
}
