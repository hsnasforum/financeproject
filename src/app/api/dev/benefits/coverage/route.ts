import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { buildBenefitsCoverage } from "@/lib/publicApis/benefitsCoverage";
import { searchBenefits } from "@/lib/publicApis/providers/benefits";

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request, {
    onBlocked: () => NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 }),
  });
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  const maxPages = parsePositiveInt(searchParams.get("maxPages"), 20, 1, 50);
  const rows = parsePositiveInt(searchParams.get("rows"), 200, 50, 300);
  const limit = parsePositiveInt(searchParams.get("limit"), 5000, 100, 10000);

  const result = await searchBenefits(query, {
    mode: "all",
    scanPages: maxPages,
    rows,
    limit,
    maxMatches: Math.max(limit, maxPages * rows),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }

  const coverage = buildBenefitsCoverage(result.data);
  return NextResponse.json({
    ok: true,
    data: {
      ...coverage,
      meta: result.meta ?? {},
    },
  });
}
