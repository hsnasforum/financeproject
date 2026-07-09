import { DashboardClient } from "@/components/DashboardClient";
import { loadDashboardViewModel } from "@/app/dashboard/_lib/dashboardViewModel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialViewModel = await loadDashboardViewModel();
  return <DashboardClient initialViewModel={initialViewModel} />;
}
