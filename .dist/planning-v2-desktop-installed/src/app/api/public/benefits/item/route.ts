import { NextResponse } from "next/server";
import { getBenefitItem } from "@/lib/publicApis/providers/benefits";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceId = (searchParams.get("serviceId") ?? "").trim();
  if (!serviceId) {
    return NextResponse.json({ ok: false, error: { code: "INPUT", message: "serviceId를 입력하세요." } }, { status: 400 });
  }

  const result = await getBenefitItem(serviceId);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error.code === "NO_DATA" ? 404 : 502 });
  }
  return NextResponse.json(result);
}

