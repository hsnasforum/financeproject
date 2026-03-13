import { cookies } from "next/headers";
import { NewsAlertsClient } from "../_components/NewsAlertsClient";

export default async function PlanningV3NewsAlertsPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <NewsAlertsClient csrf={csrf} />;
}
