import PlanningWorkspaceClient from "@/components/PlanningWorkspaceClient";
import { cookies } from "next/headers";
import { loadSnapshotListForPlanning } from "@/app/planning/_lib/snapshotList";
import { PlanningAuthRequiredState } from "@/components/planning/PlanningAuthRequiredState";
import { getPlanningFeatureFlags } from "@/lib/planning/config";
import { isPlanningAuthError } from "@/lib/planning/auth/currentUser";
import { resolvePlanningLocale } from "@/lib/planning/i18n";
import { normalizeProfileId } from "@/lib/planning/profileScope";
import { withCurrentPlanningPageUser } from "@/lib/planning/server/pageAuth";
import { loadPlanningWorkspaceInitialProfile } from "@/lib/planning/server/pages/planningRscLoaders";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/planning"];

type PlanningPageProps = {
  searchParams?: Promise<{
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
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const resolvedSearchParams = await searchParams;
  const locale = resolvePlanningLocale(pickLang(resolvedSearchParams?.lang), process.env.PLANNING_LOCALE);

  try {
    await withCurrentPlanningPageUser(async () => undefined);
  } catch (error) {
    if (isPlanningAuthError(error)) return <PlanningAuthRequiredState error={error} callbackPath="/planning" />;
    throw error;
  }

  const snapshotItems = await loadSnapshotListForPlanning(20).catch(() => ({ history: [] }));
  const initialSelectedProfileId = pickProfileId(resolvedSearchParams?.profileId);
  let initialSelectedProfile = null;

  try {
    initialSelectedProfile = await loadPlanningWorkspaceInitialProfile(initialSelectedProfileId);
  } catch (error) {
    console.error("[planning] failed to load initial profile in user scope", error);
  }

  return (
    <PlanningWorkspaceClient
      featureFlags={featureFlags}
      locale={locale}
      snapshotItems={snapshotItems}
      initialSelectedProfileId={initialSelectedProfileId}
      initialSelectedProfile={initialSelectedProfile}
      csrf={csrf}
    />
  );
}
