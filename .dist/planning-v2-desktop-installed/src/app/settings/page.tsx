import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

const links = [
  {
    href: "/settings/data-sources",
    title: "데이터 소스",
    description: "연동 상태 및 헬스체크를 확인합니다.",
  },
  {
    href: "/settings/alerts",
    title: "알림 규칙",
    description: "DART 알림 필터 규칙과 프리셋을 관리합니다.",
  },
  {
    href: "/settings/backup",
    title: "백업 / 복원",
    description: "Export/Import 번들로 로컬+서버 상태를 백업/복원합니다.",
  },
  {
    href: "/settings/recovery",
    title: "Recovery",
    description: "안전 초기화(Reset)와 오프라인 복구(Repair)를 실행합니다.",
  },
  {
    href: "/settings/maintenance",
    title: "Maintenance",
    description: "Cleanup 리텐션 정책을 관리하고 즉시 정리를 실행합니다.",
  },
];

export default function SettingsHomePage() {
  return (
    <PageShell className="bg-surface-muted">
      <PageHeader
        title="환경 설정"
        description="운영/진단/백업 관련 설정 메뉴입니다."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
              <h2 className="text-lg font-black text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
