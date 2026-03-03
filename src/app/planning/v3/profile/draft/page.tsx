import { ProfileDraftFromBatchClient } from "./_components/ProfileDraftFromBatchClient";

type PageProps = {
  searchParams: Promise<{ batchId?: string }>;
};

export default async function PlanningV3ProfileDraftByBatchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialBatchId = typeof params.batchId === "string" ? params.batchId : "";
  return <ProfileDraftFromBatchClient initialBatchId={initialBatchId} />;
}

