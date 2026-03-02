import { redirect } from "next/navigation";
import { BackupReminderBannerServer } from "@/app/_components/BackupReminderBannerServer";
import { VaultLockScreenClient } from "@/components/VaultLockScreenClient";
import { inspectPlanningMigrations } from "@/lib/planning/migrations/manager";
import { isMigrationRequired } from "@/lib/planning/migrations/requirement";
import { getVaultStatus } from "@/lib/planning/security/vaultState";

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const skipMigrationGate = (process.env.PLANNING_E2E_SKIP_MIGRATION_GATE ?? "").trim() === "1";
  if (!skipMigrationGate) {
    const migration = await inspectPlanningMigrations();
    if (isMigrationRequired(migration)) {
      redirect("/ops/doctor?state=MIGRATION_REQUIRED");
    }
  }

  const status = await getVaultStatus();
  if (status.configured && !status.unlocked) {
    return <VaultLockScreenClient scope="planning" />;
  }
  return (
    <>
      <BackupReminderBannerServer scope="planning" />
      {children}
    </>
  );
}
