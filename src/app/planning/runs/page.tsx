import PlanningRunsClient from "@/components/PlanningRunsClient";
import { normalizeProfileId } from "@/lib/planning/profileScope";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";

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
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return (
      <PlanningRunsClient
        initialSelectedRunId={initialSelectedRunId}
        initialFilterProfileId={requestedProfileId}
      />
    );
  }

  const initialFilterProfileId = requestedProfileId
    || (await getDefaultProfileId().catch(() => "")) || "";
  return (
    <PlanningRunsClient
      initialSelectedRunId={initialSelectedRunId}
      initialFilterProfileId={initialFilterProfileId}
    />
  );
}
