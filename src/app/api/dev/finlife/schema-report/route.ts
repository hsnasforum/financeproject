import { NextResponse } from "next/server";
import { buildFinlifeSchemaReport } from "@/lib/finlife/schemaReport";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }

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
