import { cookies } from "next/headers";
import { NewsTodayClient } from "./_components/NewsTodayClient";

export default async function PlanningV3NewsPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <NewsTodayClient csrf={csrf} />;
}
