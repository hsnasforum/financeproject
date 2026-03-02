import { VaultLockScreenClient } from "@/components/VaultLockScreenClient";
import { getVaultStatus } from "@/lib/planning/security/vaultState";

export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const status = await getVaultStatus();
  if (status.configured && !status.unlocked) {
    return <VaultLockScreenClient scope="planning" />;
  }
  return children;
}
