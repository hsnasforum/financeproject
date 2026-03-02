import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsDoctorClient } from "@/components/OpsDoctorClient";
import { shouldBlockOpsPageInCurrentRuntime } from "@/lib/ops/pageAccess";

type OpsDoctorPageProps = {
  searchParams?: Promise<{
    state?: string | string[];
  }>;
};

function pickSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export default async function OpsDoctorPage({ searchParams }: OpsDoctorPageProps) {
  if (shouldBlockOpsPageInCurrentRuntime()) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const state = pickSingle(resolvedSearchParams?.state);

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsDoctorClient csrf={csrf} state={state} />;
}
