import fs from "node:fs";
import path from "node:path";
import { ReportClient } from "@/components/ReportClient";
import type { ReportDisclosureDigest } from "@/lib/report/reportBuilder";
import type { DailyBrief } from "@/lib/dart/dailyBriefBuilder";
import { readDailyBrief } from "@/lib/dart/dailyBriefReader";

type ReportPageSearchParams = {
  runId?: string;
};

function loadDisclosureDigest(): ReportDisclosureDigest | null {
  const digestPath = path.join(process.cwd(), "tmp", "dart", "disclosure_digest.json");
  if (!fs.existsSync(digestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(digestPath, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ReportDisclosureDigest;
  } catch {
    return null;
  }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportPageSearchParams>;
}) {
  const resolved = await searchParams;
  const runId = typeof resolved.runId === "string" ? resolved.runId : null;
  const disclosureDigest = loadDisclosureDigest();
  const dailyBrief: DailyBrief | null = readDailyBrief();
  return <ReportClient runId={runId} disclosureDigest={disclosureDigest} dailyBrief={dailyBrief} />;
}
