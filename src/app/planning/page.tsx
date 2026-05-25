import PlanningWorkspaceClient from "@/components/PlanningWorkspaceClient";
import { cookies } from "next/headers";
import { loadSnapshotListForPlanning } from "@/app/planning/_lib/snapshotList";
import { getPlanningFeatureFlags } from "@/lib/planning/config";
import { resolvePlanningLocale } from "@/lib/planning/i18n";
import { normalizeProfileId } from "@/lib/planning/profileScope";
import { getDefaultProfileId, getProfile } from "@/lib/planning/server/store/profileStore";

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
  const snapshotItems = await loadSnapshotListForPlanning(20).catch(() => ({ history: [] }));
  const initialSelectedProfileId = pickProfileId(resolvedSearchParams?.profileId);
  let initialSelectedProfile = initialSelectedProfileId
    ? await getProfile(initialSelectedProfileId).catch(() => null)
    : null;
  if (!initialSelectedProfile) {
    const defaultProfileId = await getDefaultProfileId().catch(() => "");
    if (defaultProfileId) {
      initialSelectedProfile = await getProfile(defaultProfileId).catch(() => null);
    }
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
