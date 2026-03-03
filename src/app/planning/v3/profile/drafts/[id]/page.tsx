import { ProfileDraftDetailClient } from "./_components/ProfileDraftDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3ProfileDraftDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ProfileDraftDetailClient id={id} />;
}

