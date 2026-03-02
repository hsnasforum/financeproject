import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { VaultLockScreenClient } from "@/components/VaultLockScreenClient";
import { OpsHubClient } from "@/components/OpsHubClient";
import { getVaultStatus } from "@/lib/planning/security/vaultState";

export default async function OpsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const status = await getVaultStatus();
  if (status.configured && !status.unlocked) {
    return <VaultLockScreenClient scope="ops" />;
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsHubClient csrf={csrf} />;
}
