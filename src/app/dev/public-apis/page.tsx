import { notFound } from "next/navigation";
import { PublicApisDiagnosticsClient } from "@/components/PublicApisDiagnosticsClient";

export default function PublicApisDiagnosticsPage() {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    notFound();
  }
  return <PublicApisDiagnosticsClient />;
}
