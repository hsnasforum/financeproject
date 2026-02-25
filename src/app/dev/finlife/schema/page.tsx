import { notFound } from "next/navigation";
import { FinlifeSchemaReportClient } from "@/components/FinlifeSchemaReportClient";

export default function FinlifeSchemaReportPage() {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    notFound();
  }

  return <FinlifeSchemaReportClient />;
}
