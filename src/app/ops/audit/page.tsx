import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsAuditClient } from "@/components/OpsAuditClient";

export default async function OpsAuditPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsAuditClient csrf={csrf} />;
}
