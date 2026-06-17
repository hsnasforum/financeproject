import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsAssumptionsClient } from "@/components/OpsAssumptionsClient";
import { getDefaultProfileId, listProfileMetas } from "@/lib/planning/server/store/profileStore";
import { withCurrentPlanningPageUser } from "@/lib/planning/server/pageAuth";

export default async function OpsAssumptionsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";
  const ecosConfigured = Boolean((process.env.BOK_ECOS_API_KEY ?? process.env.ECOS_API_KEY ?? "").trim());
  const profileState = await withCurrentPlanningPageUser(async () => {
    const [initialProfiles, initialSelectedProfileId] = await Promise.all([
      listProfileMetas(),
      getDefaultProfileId(),
    ]);
    return {
      initialProfiles,
      initialSelectedProfileId,
    };
  }).catch((error) => {
    console.error("[ops/assumptions] failed to load current-user profile options", error);
    return {
      initialProfiles: [],
      initialSelectedProfileId: "",
    };
  });

  return (
    <OpsAssumptionsClient
      csrf={csrf}
      ecosConfigured={ecosConfigured}
      initialProfiles={profileState.initialProfiles}
      initialSelectedProfileId={profileState.initialSelectedProfileId}
    />
  );
}
