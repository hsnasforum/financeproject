import { DashboardClient } from "@/components/DashboardClient";
import { loadDashboardViewModel } from "@/app/dashboard/_lib/dashboardViewModel";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/dashboard"];

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialViewModel = await loadDashboardViewModel();
  return <DashboardClient initialViewModel={initialViewModel} />;
}
