import { ProfileDraftsListClient, type DraftListItem } from "./_components/ProfileDraftsListClient";
import {
  listCurrentUserProfileDrafts,
  type ProfileDraftListRecord,
} from "@/lib/planning/v3/service/profileDraftRepository";
import { withCurrentPlanningPageUser } from "@/lib/planning/server/pageAuth";

export const dynamic = "force-dynamic";

function toDraftListItem(row: ProfileDraftListRecord): DraftListItem {
  return {
    draftId: row.id,
    id: row.id,
    batchId: row.batchId,
    createdAt: row.createdAt,
    ...(row.stats ? { stats: row.stats } : {}),
  };
}

export default async function PlanningV3ProfileDraftsPage() {
  let initialRows: DraftListItem[] = [];
  let initialLoadFailed = false;

  try {
    initialRows = await withCurrentPlanningPageUser(async () => (
      await listCurrentUserProfileDrafts()
    ).map(toDraftListItem));
  } catch {
    initialRows = [];
    initialLoadFailed = true;
  }

  return (
    <ProfileDraftsListClient
      disableAutoLoad
      initialLoadFailed={initialLoadFailed}
      initialRows={initialRows}
    />
  );
}
