import { notFound } from "next/navigation";
import DashboardArtifactsClient from "@/components/DashboardArtifactsClient";
import { isProductionEnv } from "@/lib/dev/onlyDev";

export default function DashboardArtifactsPage() {
  if (isProductionEnv()) {
    notFound();
  }

  return <DashboardArtifactsClient />;
}
