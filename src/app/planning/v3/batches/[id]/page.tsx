import { BatchSummaryClient } from "./_components/BatchSummaryClient";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { getCurrentUserBatchSummary } from "@/lib/planning/v3/service/batchReadRepository";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlanningV3BatchSummaryPage({ params }: PageProps) {
  const { id } = await params;
  let initialSummary: Awaited<ReturnType<typeof getCurrentUserBatchSummary>> | null = null;
  let initialMessage = "";

  try {
    initialSummary = await withCurrentPlanningPageUser(() => getCurrentUserBatchSummary(id));
  } catch (error) {
    initialMessage = toPlanningPageLoadMessage(error, "거래 요약을 불러오지 못했습니다.");
  }

  return <BatchSummaryClient id={id} initialMessage={initialMessage} initialSummary={initialSummary} />;
}
