import PlanningWorkspaceClient from "@/components/PlanningWorkspaceClient";
import { loadSnapshotListForPlanning } from "@/app/planning/_lib/snapshotList";
import { getPlanningFeatureFlags } from "@/lib/planning/config";
import { resolvePlanningLocale } from "@/lib/planning/i18n";
import { normalizeProfileId } from "@/lib/planning/profileScope";

type PlanningPageProps = {
      searchParams?:
    | {
        lang?: string | string[];
        profileId?: string | string[];
      }
    | Promise<{
        lang?: string | string[];
        profileId?: string | string[];
      }>;
};

function pickLang(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function pickProfileId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return normalizeProfileId(value[0]);
  return normalizeProfileId(value);
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const featureFlags = getPlanningFeatureFlags();
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const locale = resolvePlanningLocale(pickLang(resolvedSearchParams?.lang), process.env.PLANNING_LOCALE);
  const snapshotItems = await loadSnapshotListForPlanning(20);
  const initialSelectedProfileId = pickProfileId(resolvedSearchParams?.profileId);
  return (
    <PlanningWorkspaceClient
      featureFlags={featureFlags}
      locale={locale}
      snapshotItems={snapshotItems}
      initialSelectedProfileId={initialSelectedProfileId}
    />
  );
}
