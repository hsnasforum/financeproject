import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsAssumptionsClient } from "@/components/OpsAssumptionsClient";

export default async function OpsAssumptionsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const ecosConfigured = Boolean((process.env.ECOS_API_KEY ?? process.env.BOK_ECOS_API_KEY ?? "").trim());

  return <OpsAssumptionsClient csrf={csrf} ecosConfigured={ecosConfigured} />;
}
