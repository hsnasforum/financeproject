import { AlertRulesClient } from "@/components/AlertRulesClient";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AlertSettingsPage() {
  return (
    <PageShell>
      <PageHeader 
        title="Alerts Rules"
        description="DART 알림 무시 규칙(클러스터/회사/카테고리/키워드)을 관리합니다."
      />
      <AlertRulesClient />
    </PageShell>
  );
}
