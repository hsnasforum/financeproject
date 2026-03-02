import { RecommendHistoryClient } from "@/components/RecommendHistoryClient";

type HistoryPageSearchParams = {
  open?: string;
};

export default async function RecommendHistoryPage({
  searchParams,
}: {
  searchParams: Promise<HistoryPageSearchParams>;
}) {
  const resolved = await searchParams;
  const openRunId = typeof resolved.open === "string" ? resolved.open : null;
  return <RecommendHistoryClient initialOpenRunId={openRunId} />;
}
