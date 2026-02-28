import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsPlanningCacheClient } from "@/components/OpsPlanningCacheClient";

export default async function OpsPlanningCachePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsPlanningCacheClient csrf={csrf} />;
}
