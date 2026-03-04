import { cookies } from "next/headers";
import { NewsTrendsTableClient } from "../_components/NewsTrendsTableClient";

export default async function PlanningV3NewsTrendsPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <NewsTrendsTableClient csrf={csrf} />;
}
