import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { getPublicDesktopNavItems } from "@/lib/navigation/routeRegistry";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

const serviceCopyById: Record<string, { label?: string; description: string; badge: string }> = {
  dashboard: { label: "홈/대시보드", description: "진단과 상품 비교 중 어디서 다시 시작할지 고르기", badge: "시작" },
  planning: { description: "내 수입·지출·부채 흐름부터 먼저 보기", badge: "진단" },
  recommend: { description: "현재 조건으로 예적금·대출 후보 비교", badge: "추천" },
  products: { description: "상품·공시·혜택·주거·환율 정보 탐색", badge: "탐색" },
  settings: { description: "데이터 신뢰, 알림, 백업을 한 곳에서 관리", badge: "설정" },
};

export function ServiceLinks() {
  const serviceLinks = getPublicDesktopNavItems().map((item) => {
    const copy = serviceCopyById[item.id];
    return {
      label: copy?.label ?? item.label,
      description: copy?.description ?? "",
      href: item.href,
      badge: copy?.badge ?? item.label,
    };
  });

  return (
    <section className="bg-[#f5f7fa] py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">전체 화면 바로가기</p>
          <h2 className="mt-6 text-3xl font-black tracking-tight text-navy md:text-4xl">지금 필요한 시작점으로 바로 이동</h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          {serviceLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className="group rounded-[1.5rem] border border-slate-100 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] hover:border-primary/20"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{item.badge}</p>
                  <p className="mt-4 text-xl font-black tracking-tight text-navy">{item.label}</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-muted">{item.description}</p>
                </div>
                <span className="text-xl font-bold text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-primary">
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
