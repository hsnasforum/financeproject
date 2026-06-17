import Link from "next/link";
import { notFound } from "next/navigation";
import { BackupReminderBanner } from "@/components/BackupReminderBanner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { shouldBlockOpsPageInCurrentRuntime } from "@/lib/ops/pageAccess";
import { inspectPlanningMigrations } from "@/lib/planning/migrations/manager";
import { isMigrationRequired } from "@/lib/planning/migrations/requirement";
import { getAppInfo } from "@/lib/planning/server/runtime/appInfo";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { getVaultStatus, type VaultStatus } from "@/lib/planning/security/vaultState";

export default async function OpsAboutPage() {
  if (shouldBlockOpsPageInCurrentRuntime()) {
    notFound();
  }

  const [appInfo, currentUserVaultState, migration] = await Promise.all([
    getAppInfo(),
    withCurrentPlanningPageUser(() => getVaultStatus())
      .then((status) => ({ status, notice: "" }))
      .catch((error) => {
        console.error("[ops/about] failed to load current-user vault status", error);
        return {
          status: null as VaultStatus | null,
          notice: toPlanningPageLoadMessage(error, "현재 사용자 기준 vault 상태를 불러오지 못했습니다."),
        };
      }),
    inspectPlanningMigrations(),
  ]);
  const migrationRequired = isMigrationRequired(migration);
  const vaultStatus = currentUserVaultState.status;

  return (
    <PageShell>
      <PageHeader
        title="Ops About"
        description="로컬 런타임/버전/데이터 경로 상태를 확인합니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops/backup">
              <Button type="button" size="sm" variant="outline">백업 열기</Button>
            </Link>
            <Link href="/ops/doctor">
              <Button type="button" size="sm" variant="outline">Doctor 열기</Button>
            </Link>
            <Link href="/ops/metrics">
              <Button type="button" size="sm" variant="outline">Metrics 열기</Button>
            </Link>
          </div>
        )}
      />

      <BackupReminderBanner scope="ops" appVersion={appInfo.appVersion} />

      {migrationRequired ? (
        <Card className="mb-4 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          마이그레이션 점검이 필요합니다.{" "}
          <Link className="font-semibold underline" href="/ops/doctor?state=MIGRATION_REQUIRED">
            /ops/doctor
          </Link>
        </Card>
      ) : null}
      {currentUserVaultState.notice ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {currentUserVaultState.notice}
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-base font-black text-navy">Runtime Info</h2>
        <div className="mt-3 grid gap-2 text-sm">
          <p>appVersion: <span className="font-semibold">{appInfo.appVersion}</span></p>
          <p>engineVersion: <span className="font-semibold">{appInfo.engineVersion}</span></p>
          <p>dataDir: <span className="font-semibold">{appInfo.dataDir}</span></p>
          <p>hostPolicy: <span className="font-semibold">{appInfo.hostPolicy}</span></p>
          <p>vault configured: <span className="font-semibold">{vaultStatus ? (vaultStatus.configured ? "true" : "false") : "-"}</span></p>
          <p>vault unlocked: <span className="font-semibold">{vaultStatus ? (vaultStatus.unlocked ? "true" : "false") : "-"}</span></p>
          <p>vault autoLockMinutes: <span className="font-semibold">{vaultStatus?.autoLockMinutes ?? "-"}</span></p>
          <p>vault failedAttempts: <span className="font-semibold">{vaultStatus?.failedAttempts ?? "-"}</span></p>
        </div>
      </Card>
    </PageShell>
  );
}
