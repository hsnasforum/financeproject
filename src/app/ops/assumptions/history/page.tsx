import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsAssumptionsHistoryClient } from "@/components/OpsAssumptionsHistoryClient";

export default async function OpsAssumptionsHistoryPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsAssumptionsHistoryClient csrf={csrf} />;
}
