import { notFound } from "next/navigation";
import { PublicApisDiagnosticsClient } from "@/components/PublicApisDiagnosticsClient";
import { isProductionEnv } from "@/lib/dev/onlyDev";

export default function PublicApisDiagnosticsPage() {
  if (isProductionEnv()) {
    notFound();
  }
  return <PublicApisDiagnosticsClient />;
}
