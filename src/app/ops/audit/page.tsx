import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsAuditClient } from "@/components/OpsAuditClient";

type OpsAuditPageSearchParams = {
  eventType?: string | string[];
  taskName?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeAuditFilter(value: string | string[] | undefined): string {
  return firstSearchParam(value).trim().toUpperCase();
}

type OpsAuditPageProps = {
  searchParams?: Promise<OpsAuditPageSearchParams>;
};

export default async function OpsAuditPage({ searchParams }: OpsAuditPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const params = searchParams ? await searchParams : undefined;

  return (
    <OpsAuditClient
      csrf={csrf}
      initialEventType={normalizeAuditFilter(params?.eventType)}
      initialTaskName={normalizeAuditFilter(params?.taskName)}
    />
  );
}
