import { notFound } from "next/navigation";
import { FinlifeSchemaReportClient } from "@/components/FinlifeSchemaReportClient";
import { isProductionEnv } from "@/lib/dev/onlyDev";

export default function FinlifeSchemaReportPage() {
  if (isProductionEnv()) {
    notFound();
  }

  return <FinlifeSchemaReportClient />;
}
