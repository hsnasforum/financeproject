import { notFound } from "next/navigation";
import { OpsMetricsClient } from "@/components/OpsMetricsClient";

export default async function OpsMetricsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <OpsMetricsClient />;
}
