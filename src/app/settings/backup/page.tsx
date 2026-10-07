import { BackupClient } from "@/components/BackupClient";
import { PlanningAuthRequiredState } from "@/components/planning/PlanningAuthRequiredState";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { isPlanningAuthError } from "@/lib/planning/auth/currentUser";
import { withCurrentPlanningPageUser } from "@/lib/planning/server/pageAuth";

export const metadata = PUBLIC_PAGE_METADATA["/settings/backup"];

export const dynamic = "force-dynamic";

async function resolveBackupOwnerId(): Promise<string> {
  return withCurrentPlanningPageUser((currentUser) => currentUser.id);
}

export default async function BackupSettingsPage() {
  let ownerId: string;
  try {
    ownerId = await resolveBackupOwnerId();
  } catch (error) {
    if (isPlanningAuthError(error)) {
      return <PlanningAuthRequiredState error={error} callbackPath="/settings/backup" />;
    }
    throw error;
  }
  return <BackupClient ownerId={ownerId} />;
}
