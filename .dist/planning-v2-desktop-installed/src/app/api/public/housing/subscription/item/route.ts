import { NextResponse } from "next/server";
import { listSubscriptionNotices } from "@/lib/publicApis/providers/subscription";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();
  const region = (searchParams.get("region") ?? "").trim();
  const houseType = ((searchParams.get("houseType") ?? "apt").trim().toLowerCase() || "apt") as
    | "apt"
    | "urbty"
    | "remndr";

  if (!id) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "id를 입력하세요." } }, { status: 400 });
  }

  const result = await listSubscriptionNotices(region, { mode: "all", scanPages: 5, houseType });
  if (!result.ok) return NextResponse.json(result, { status: 502 });

  const item = result.data.find((entry) => entry.id === id);
  if (!item) {
    return NextResponse.json({ ok: false, error: { code: "NO_DATA", message: "상세 공고를 찾지 못했습니다." } }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      item,
      sections: {
        summary: [item.title, item.region].filter(Boolean),
        schedule: [`접수: ${item.applyStart ?? "-"} ~ ${item.applyEnd ?? "-"}`],
        misc: [item.supplyType, item.sizeHints].filter(Boolean),
      },
    },
  });
}

