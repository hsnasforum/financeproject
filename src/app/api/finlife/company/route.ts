import { NextResponse } from "next/server";
import { getFinlifeCompanies } from "@/lib/finlife/companySource";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageNo = Number(searchParams.get("pageNo") ?? 1);
    const topFinGrpNo = searchParams.get("topFinGrpNo") ?? "020000";

    const result = await getFinlifeCompanies({ pageNo, topFinGrpNo });

    if (!result.ok) {
      return NextResponse.json(result, { status: 503 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "FINLIFE 회사 API 처리 중 오류가 발생했습니다." } },
      { status: 503 },
    );
  }
}
