import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsSupportClient } from "@/components/OpsSupportClient";
import { shouldBlockOpsPageInCurrentRuntime } from "@/lib/ops/pageAccess";

export default async function OpsSupportPage() {
  if (shouldBlockOpsPageInCurrentRuntime()) {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsSupportClient csrf={csrf} />;
}
