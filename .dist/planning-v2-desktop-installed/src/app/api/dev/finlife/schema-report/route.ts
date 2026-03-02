import { NextResponse } from "next/server";
import { onlyDev } from "@/lib/dev/onlyDev";
import { buildFinlifeSchemaReport } from "@/lib/finlife/schemaReport";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const topNRaw = Number(searchParams.get("topN") ?? "30");
  const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? Math.floor(topNRaw) : 30;

  const report = buildFinlifeSchemaReport({ topN });
  if (!report.ok) {
    const status = report.error.code === "FIXTURE_NOT_FOUND" ? 404 : 400;
    return NextResponse.json(report, { status });
  }

  return NextResponse.json(report);
}
