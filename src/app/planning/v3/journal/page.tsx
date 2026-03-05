import { cookies } from "next/headers";
import { JournalClient } from "./JournalClient";

export default async function PlanningV3JournalPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <JournalClient csrf={csrf} />;
}
