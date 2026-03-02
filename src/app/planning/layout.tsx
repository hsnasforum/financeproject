import Link from "next/link";
import { redirect } from "next/navigation";
import { VaultLockScreenClient } from "@/components/VaultLockScreenClient";
import { runPlanningMigrationsOnStartup } from "@/lib/planning/migrations/manager";
import { isMigrationRequired } from "@/lib/planning/migrations/requirement";
import { getVaultStatus } from "@/lib/planning/security/vaultState";

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const skipMigrationGate = (process.env.PLANNING_E2E_SKIP_MIGRATION_GATE ?? "").trim() === "1";
  if (!skipMigrationGate) {
    const migration = await runPlanningMigrationsOnStartup();
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
      <div className="mx-auto mt-3 w-full max-w-6xl rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        업데이트 전 백업 권장.{" "}
        <Link className="font-semibold underline" href="/ops/backup">
          /ops/backup
        </Link>
      </div>
      {children}
    </>
  );
}
