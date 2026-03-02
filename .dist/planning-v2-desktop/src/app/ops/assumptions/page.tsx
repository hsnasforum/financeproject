import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsAssumptionsClient } from "@/components/OpsAssumptionsClient";
import { getDefaultProfileId, listProfileMetas } from "@/lib/planning/server/store/profileStore";

export default async function OpsAssumptionsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const ecosConfigured = Boolean((process.env.BOK_ECOS_API_KEY ?? process.env.ECOS_API_KEY ?? "").trim());
  const [initialProfiles, initialSelectedProfileId] = await Promise.all([
    listProfileMetas(),
    getDefaultProfileId(),
  ]);

  return (
    <OpsAssumptionsClient
      csrf={csrf}
      ecosConfigured={ecosConfigured}
      initialProfiles={initialProfiles}
      initialSelectedProfileId={initialSelectedProfileId}
    />
  );
}
