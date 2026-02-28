import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsPlanningCleanupClient } from "@/components/OpsPlanningCleanupClient";
import { loadPlanningRetentionPolicy } from "@/lib/planning/retention/policy";

export default async function OpsPlanningCleanupPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const policy = loadPlanningRetentionPolicy();

  return <OpsPlanningCleanupClient csrf={csrf} initialPolicy={policy} />;
}

