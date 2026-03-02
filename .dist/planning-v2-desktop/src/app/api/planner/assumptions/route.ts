import { NextResponse } from "next/server";
import { fetchEximExchange } from "@/lib/publicApis/providers/exchange";

export async function GET() {
  const notes: string[] = ["모든 값은 참고용 가정값이며 사용자가 수정 가능합니다."];
  const fx = await fetchEximExchange();

  return NextResponse.json({
    ok: true,
    data: {
      fx: fx.ok ? fx.data : undefined,
      baseRate: undefined,
      inflation: undefined,
    },
    notes: fx.ok ? notes : [...notes, "환율 데이터는 현재 불러오지 못해 수동 입력이 필요합니다."],
  });
}
