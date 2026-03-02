import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsMetricsClient } from "@/components/OpsMetricsClient";

export default async function OpsMetricsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsMetricsClient csrf={csrf} />;
}
