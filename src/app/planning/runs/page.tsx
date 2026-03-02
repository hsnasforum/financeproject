import PlanningRunsClient from "@/components/PlanningRunsClient";
import { getPlanningFeatureFlags } from "@/lib/planning/config";
import { normalizeProfileId } from "@/lib/planning/profileScope";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";

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
  const initialFilterProfileId = pickProfileId(resolvedSearchParams?.profileId) || (await getDefaultProfileId()) || "";
  const featureFlags = getPlanningFeatureFlags();
  return (
    <PlanningRunsClient
      initialSelectedRunId={initialSelectedRunId}
      initialFilterProfileId={initialFilterProfileId}
      pdfEnabled={featureFlags.pdfEnabled}
    />
  );
}
