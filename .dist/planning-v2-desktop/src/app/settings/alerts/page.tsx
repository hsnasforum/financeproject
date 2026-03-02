import { Container } from "@/components/ui/Container";
import { AlertRulesClient } from "@/components/AlertRulesClient";

export default function AlertSettingsPage() {
  return (
    <main className="py-8">
      <Container>
        <h1 className="text-2xl font-semibold text-slate-900">Alerts Rules</h1>
        <p className="mt-2 text-sm text-slate-500">
          DART 알림 무시 규칙(클러스터/회사/카테고리/키워드)을 관리합니다.
        </p>
        <div className="mt-6">
          <AlertRulesClient />
        </div>
      </Container>
    </main>
  );
}
