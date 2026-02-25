import { NextResponse } from "next/server";
import { getFinlifeProducts } from "@/lib/finlife/source";

function parseScanMaxPages(value: string | null): number | "auto" | undefined {
  if (!value) return undefined;
  const lowered = value.trim().toLowerCase();
  if (!lowered) return undefined;
  if (lowered === "auto") return "auto";
  const parsed = Number(lowered);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(80, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageNo = Number(searchParams.get("pageNo") ?? 1);
    const topFinGrpNo = searchParams.get("topFinGrpNo") ?? "020000";
    const scan = searchParams.get("scan") === "all" ? "all" : undefined;
    const scanMaxPages = scan === "all" ? parseScanMaxPages(searchParams.get("maxPages")) : undefined;

    const result = await getFinlifeProducts("rent-house-loan", { pageNo, topFinGrpNo, scan, scanMaxPages });

    if (!result.ok) {
      return NextResponse.json(result, { status: 503 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "FINLIFE 전세대출 API 처리 중 오류가 발생했습니다." } },
      { status: 503 },
    );
  }
}
