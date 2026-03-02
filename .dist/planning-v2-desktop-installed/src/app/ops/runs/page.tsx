import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsRunsClient } from "@/components/OpsRunsClient";

export default async function OpsRunsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsRunsClient csrf={csrf} />;
}
