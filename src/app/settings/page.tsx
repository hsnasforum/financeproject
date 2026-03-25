import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";

const links = [
  {
    href: "/settings/data-sources",
    title: "데이터 신뢰",
    description: "공시·뉴스·상품 데이터가 어떤 기준으로 보이는지 먼저 확인하는 설정 영역입니다.",
  },
  {
    href: "/settings/alerts",
    title: "알림 규칙",
    description: "DART 알림 규칙과 프리셋을 조정하는 설정 영역입니다.",
  },
  {
    href: "/settings/backup",
    title: "백업 및 복원",
    description: "백업 파일 내보내기와 복원 준비를 확인하는 설정 영역입니다.",
  },
  {
    href: "/settings/recovery",
    title: "시스템 복구",
    description: "문제가 생겼을 때 복구 절차를 확인하는 설정 영역입니다.",
  },
  {
    href: "/settings/maintenance",
    title: "유지 관리",
    description: "보관 정책과 정리 작업을 확인하는 설정 영역입니다.",
  },
];

export default function SettingsHomePage() {
  return (
    <PageShell>
      <PageHeader
        title="내 설정"
        description="내 설정에서 필요한 영역을 먼저 고르고, 세부 기준과 실행은 각 설정 화면에서 이어서 확인하는 구조입니다."
      />
      <p className="mb-6 text-sm font-medium leading-relaxed text-slate-500">
        이 화면은 설정을 끝내는 곳이 아니라 시작할 영역을 고르는 안내 화면입니다.
        최신 기준 확인이나 복구 작업 같은 세부 내용은 각 카드에서 이어서 확인하세요.
      </p>

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
                  이 설정 열기 ▶
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
