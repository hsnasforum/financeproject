import { RecommendHistoryClient } from "@/components/RecommendHistoryClient";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/recommend/history"];

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
