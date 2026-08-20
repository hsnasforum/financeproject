import { headers } from "next/headers";
import { BackupClient } from "@/components/BackupClient";
import { requireCurrentPlanningUser } from "@/lib/planning/auth/currentUser";

export const dynamic = "force-dynamic";

function requestFromHeaders(incoming: Headers): Request {
  return new Request("https://settings.invalid/settings/backup", { headers: incoming });
}

async function resolveBackupOwnerId(): Promise<string | null> {
  try {
    const currentUser = await requireCurrentPlanningUser(requestFromHeaders(await headers()));
    return currentUser.id;
  } catch {
    return null;
  }
}

export default async function BackupSettingsPage() {
  return <BackupClient ownerId={await resolveBackupOwnerId()} />;
}
