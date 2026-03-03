import { ProfileDraftPreflightClient } from "./_components/ProfileDraftPreflightClient";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ profileId?: string }>;
};

export default async function PlanningV3ProfileDraftPreflightPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const profileId = typeof query.profileId === "string" ? query.profileId : "";
  return <ProfileDraftPreflightClient id={id} initialProfileId={profileId} />;
}

