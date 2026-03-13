import { cookies } from "next/headers";
import { NewsTrendsClient } from "../_components/NewsTrendsClient";

export default async function PlanningV3NewsTrendsPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <NewsTrendsClient csrf={csrf} />;
}
