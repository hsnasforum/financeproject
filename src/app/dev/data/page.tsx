import { notFound } from "next/navigation";
import { DevDataDashboardClient } from "@/components/DevDataDashboardClient";

export default function DevDataPage() {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    notFound();
  }

  return <DevDataDashboardClient />;
}

