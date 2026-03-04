import { cookies } from "next/headers";
import { NewsExploreClient } from "../_components/NewsExploreClient";

export default async function PlanningV3NewsExplorePage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <NewsExploreClient csrf={csrf} />;
}
