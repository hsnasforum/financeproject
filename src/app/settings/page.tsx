import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";

const links = [
  {
    href: "/settings/data-sources",
    title: "데이터 신뢰",
    description: "공시·뉴스·상품 데이터의 최신 기준과 연결 상태를 한 곳에서 확인합니다.",
  },
  {
    href: "/settings/alerts",
    title: "알림 규칙",
    description: "DART 공시 알림 무시 규칙과 프리셋을 생성하고 관리합니다.",
  },
  {
    href: "/settings/backup",
    title: "백업 및 복원",
    description: "로컬 환경 설정과 서버 데이터를 파일 번들로 백업하거나 복원합니다.",
  },
  {
    href: "/settings/recovery",
    title: "시스템 복구",
    description: "캐시 초기화, 오프라인 복구 등 시스템 정합성 문제 발생 시 활용합니다.",
  },
  {
    href: "/settings/maintenance",
    title: "유지 관리",
    description: "데이터 보관 주기(Retention) 정책을 설정하고 정리 작업을 수행합니다.",
  },
];

export default function SettingsHomePage() {
  return (
    <PageShell>
      <PageHeader
        title="내 설정"
        description="데이터 신뢰, 알림, 백업/복구 관련 도구를 한 곳에서 관리합니다."
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="group">
            <Card className="h-full rounded-[2rem] p-8 transition-all hover:-translate-y-1 hover:shadow-xl hover:border-emerald-200 active:scale-[0.98]">
              <SubSectionHeader 
                title={item.title} 
                className="mb-0"
                titleClassName="group-hover:text-emerald-600 transition-colors"
              />
              <p className="mt-4 text-sm font-medium leading-relaxed text-slate-500">{item.description}</p>
              
              <div className="mt-8 flex justify-end">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-emerald-500 transition-colors">
                  Setup ▶
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
