import Link from "next/link";
import { PiggyBank, Gift, FileBarChart2, LayoutDashboard, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

type Tile = {
  title: string;
  description: string;
  href: string;
  accent: string;
  Icon: LucideIcon;
  iconClass: string;
};

const categoryTiles: Tile[] = [
  {
    title: "적금",
    description: "적금 금리 비교 후 바로 플랜에 연결",
    href: "/products/catalog?kind=saving",
    accent: "bg-[linear-gradient(145deg,#e0ecff_0%,#c7d6ff_100%)]",
    Icon: PiggyBank,
    iconClass: "text-primary",
  },
  {
    title: "혜택",
    description: "보조금24 기반 후보를 빠르게 확인",
    href: "/benefits",
    accent: "bg-[linear-gradient(145deg,#d1faf0_0%,#a7f0dc_100%)]",
    Icon: Gift,
    iconClass: "text-[#0f766e]",
  },
  {
    title: "리포트",
    description: "이번 달 액션과 위험 신호 정리",
    href: "/planning/reports",
    accent: "bg-[linear-gradient(145deg,#ede9fe_0%,#c4b5fd_100%)]",
    Icon: FileBarChart2,
    iconClass: "text-violet",
  },
  {
    title: "대시보드",
    description: "최근 플랜과 데이터 상태를 한 번에 확인",
    href: "/dashboard",
    accent: "bg-[linear-gradient(145deg,#dbeafe_0%,#93c5fd_100%)]",
    Icon: LayoutDashboard,
    iconClass: "text-primary",
  },
];

export function QuickTiles() {
  return (
    <section className="bg-white py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">MMD 핵심 기능</p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {categoryTiles.map(({ Icon, ...item }) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className="group rounded-[2rem] border border-slate-100 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-primary/20"
            >
              <div className={`flex h-16 w-16 items-center justify-center rounded-[1.5rem] shadow-sm ${item.accent}`}>
                <Icon size={28} strokeWidth={2} className={item.iconClass} />
              </div>
              <h3 className="mt-6 text-xl font-black tracking-tight text-navy">{item.title}</h3>
              <p className="mt-3 text-sm font-medium leading-relaxed text-muted">{item.description}</p>
              <p className="mt-8 text-sm font-black text-primary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">살펴보기 →</p>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
