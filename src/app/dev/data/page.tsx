import { notFound } from "next/navigation";
import { DevDataDashboardClient } from "@/components/DevDataDashboardClient";
import { isProductionEnv } from "@/lib/dev/onlyDev";

export default function DevDataPage() {
  if (isProductionEnv()) {
    notFound();
  }

  return <DevDataDashboardClient />;
}
