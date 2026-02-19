import { NextResponse } from "next/server";
import { getFinlifeProducts } from "@/lib/finlife/source";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageNo = Number(searchParams.get("pageNo") ?? 1);
  const topFinGrpNo = searchParams.get("topFinGrpNo") ?? "020000";

  const result = await getFinlifeProducts("saving", { pageNo, topFinGrpNo });

  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json({
    ...result,
    meta: {
      ...result.meta,
      hasNext: result.data.length > 0,
      nextPage: result.data.length > 0 ? result.meta.pageNo + 1 : null,
    },
  });
}
