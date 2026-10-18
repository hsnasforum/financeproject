import { DashboardClient } from "@/components/DashboardClient";
import { PlanningAuthRequiredState } from "@/components/planning/PlanningAuthRequiredState";
import { loadDashboardViewModel } from "@/app/dashboard/_lib/dashboardViewModel";
import {
  buildDashboardAuthCallbackPath,
  parseDashboardProfileSelection,
} from "@/app/dashboard/_lib/dashboardProfileSelection";
import { isPlanningAuthError } from "@/lib/planning/auth/currentUser";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { cookies } from "next/headers";

export const metadata = PUBLIC_PAGE_METADATA["/dashboard"];

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{ profileId?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const selection = parseDashboardProfileSelection((await searchParams)?.profileId);
  let initialViewModel;
  try {
    initialViewModel = await loadDashboardViewModel(undefined, undefined, undefined, selection);
  } catch (error) {
    if (isPlanningAuthError(error)) {
      return <PlanningAuthRequiredState error={error} callbackPath={buildDashboardAuthCallbackPath(selection)} />;
    }
    throw error;
  }
  const csrf = (await cookies()).get("dev_csrf")?.value ?? "";
  return <DashboardClient initialViewModel={initialViewModel} csrf={csrf} />;
}
