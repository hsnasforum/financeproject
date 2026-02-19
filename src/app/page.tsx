import Link from "next/link";
import { HomePortalClient } from "@/components/HomePortalClient";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

const quickMenus = [
  { href: "/products/deposit", label: "예금 조회" },
  { href: "/products/saving", label: "적금 조회" },
  { href: "/recommend", label: "추천" },
  { href: "/planner", label: "재무설계" },
  { href: "/help", label: "도움말" },
  { href: "/public/dart", label: "기업개황" },
  { href: "/planner", label: "스냅샷" },
];

const featureCards = [
  { href: "/products/deposit", title: "예금 상품", desc: "기간별 옵션과 최고금리를 한 번에 비교합니다." },
  { href: "/products/saving", title: "적금 상품", desc: "목표 기간에 맞는 적금 후보를 빠르게 추립니다." },
  { href: "/recommend", title: "프로필 기반 추천", desc: "점수 근거를 함께 제공하는 설명가능 추천입니다." },
  { href: "/planner", title: "재무설계", desc: "현금흐름부터 실행 체크리스트까지 단계별로 안내합니다." },
  { href: "/help", title: "도움말", desc: "옵션 의미, API 범위, 활용 가이드를 확인할 수 있습니다." },
  { href: "/public/dart", title: "기업개황", desc: "회사명 검색으로 corp_code를 찾고 공시 개황을 조회합니다." },
];

const promoCards = [
  { title: "비상금", body: "목표 개월 수를 먼저 정하고 안전자산으로 채우세요." },
  { title: "목돈 계획", body: "기간·금리·자동이체 가능성 기준으로 후보를 압축하세요." },
  { title: "부채 관리", body: "상환 스케줄과 금리 부담을 함께 점검하세요." },
];

export default function Home() {
  return (
    <main className="py-8">
      <Container>
        <section className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card className="p-7 lg:p-8">
            <p className="inline-flex rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-slate-600">개인 금융 의사결정 도우미</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-900 lg:text-4xl">비교부터 추천, 실행까지 한 화면 흐름으로 관리하세요</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 lg:text-base">예금·적금 비교, 프로필 기반 추천, 재무설계 초안을 포털형 화면에서 빠르게 점검할 수 있습니다.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/products/deposit"><Button variant="primary">예금 시작</Button></Link>
              <Link href="/recommend"><Button>추천 보기</Button></Link>
              <Link href="/planner"><Button>재무설계 열기</Button></Link>
            </div>
          </Card>

          <div className="grid gap-3">
            {promoCards.map((card) => (
              <Card key={card.title} className="bg-surface-muted">
                <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-sm text-slate-600">{card.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <Card className="overflow-x-auto p-3">
            <div className="flex min-w-max items-center gap-2">
              {quickMenus.map((menu) => (
                <Link key={menu.href + menu.label} href={menu.href} className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-slate-700 hover:bg-surface-muted">
                  {menu.label}
                </Link>
              ))}
            </div>
          </Card>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((card) => (
            <Link key={card.title} href={card.href}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-lg font-semibold text-slate-900">{card.title}</p>
                <p className="mt-2 text-sm text-slate-600">{card.desc}</p>
              </Card>
            </Link>
          ))}
        </section>

        <section className="mt-6">
          <HomePortalClient />
        </section>
      </Container>
    </main>
  );
}
