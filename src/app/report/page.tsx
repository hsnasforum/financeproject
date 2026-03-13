import { permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legacy Report Redirect",
  description: "legacy /report 경로는 planning 리포트 경로로 영구 이동됩니다.",
};

type ReportPageSearchParams = {
  runId?: string;
};

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportPageSearchParams>;
}) {
  const resolved = await searchParams;
  const runId = typeof resolved.runId === "string" ? resolved.runId.trim() : "";
  if (runId) {
    permanentRedirect(`/planning/reports?runId=${encodeURIComponent(runId)}`);
  }
  permanentRedirect("/planning/reports");
}
