import PlanningRunsClient, { type ActionProgressSummary } from "@/components/PlanningRunsClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { normalizeProfileId } from "@/lib/planning/profileScope";
import {
  loadPlanningRunsPageInitialData,
  type PlanningRunsPageInitialData,
} from "@/lib/planning/server/pages/planningRscLoaders";

export const metadata = PUBLIC_PAGE_METADATA["/planning/runs"];
export const dynamic = "force-dynamic";

type PlanningRunsPageProps = {
  searchParams?: Promise<{
    selected?: string | string[];
    profileId?: string | string[];
  }>;
};

function pickSelected(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value?.trim() ?? "";
}

function pickProfileId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return normalizeProfileId(value[0]);
  return normalizeProfileId(value);
}

export default async function PlanningRunsPage({ searchParams }: PlanningRunsPageProps) {
  const resolvedSearchParams = await searchParams;
  const initialSelectedRunId = pickSelected(resolvedSearchParams?.selected);
  const requestedProfileId = pickProfileId(resolvedSearchParams?.profileId);
  let initialFilterProfileId = requestedProfileId;
  let initialProfiles: PlanningRunsPageInitialData["profiles"] = [];
  let initialProfilesReady = false;
  let initialRuns: PlanningRunsPageInitialData["runs"] = [];
  let initialRunsReady = false;
  let initialActionProgressSummaryByRunId: Record<string, ActionProgressSummary> = {};
  let initialLoadNotice = "";

  const loaded = await loadPlanningRunsPageInitialData({ initialFilterProfileId });
  initialFilterProfileId = loaded.filterProfileId;
  initialProfiles = loaded.profiles;
  initialProfilesReady = loaded.profilesReady;
  initialRuns = loaded.runs;
  initialRunsReady = loaded.runsReady;
  initialActionProgressSummaryByRunId = loaded.actionProgressSummaryByRunId;
  initialLoadNotice = loaded.loadNotice;

  return (
    <PlanningRunsClient
      initialSelectedRunId={initialSelectedRunId}
      initialFilterProfileId={initialFilterProfileId}
      initialProfiles={initialProfiles}
      initialProfilesReady={initialProfilesReady}
      initialRuns={initialRuns}
      initialRunsReady={initialRunsReady}
      initialActionProgressSummaryByRunId={initialActionProgressSummaryByRunId}
      initialLoadNotice={initialLoadNotice}
    />
  );
}
