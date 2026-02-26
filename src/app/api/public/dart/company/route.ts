import { NextResponse } from "next/server";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import { mapDartErrorToHttp } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corpCode = (searchParams.get("corpCode") ?? "").trim();

  const result = await getDartCompany(corpCode);
  if (result.ok) {
    return NextResponse.json({ ok: true, data: result.data });
  }

  return NextResponse.json({ ok: false, error: { code: result.error.code, message: result.error.message } }, { status: mapDartErrorToHttp(result.error) });
}
