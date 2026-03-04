import { cookies } from "next/headers";
import { NewsDigestClient } from "./_components/NewsDigestClient";

export default async function PlanningV3NewsPage() {
  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  return <NewsDigestClient csrf={csrf} />;
}
