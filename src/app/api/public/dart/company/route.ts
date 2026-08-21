import { NextResponse } from "next/server";
import { getDartCompany } from "@/lib/publicApis/dart/company";
import { mapDartErrorToHttp, toPublicDartError } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corpCode = (searchParams.get("corpCode") ?? "").trim();

  const result = await getDartCompany(corpCode, request.signal);
  if (result.ok) {
    return NextResponse.json({ ok: true, data: result.data });
  }

  const error = toPublicDartError(result.error);
  return NextResponse.json({ ok: false, error }, { status: mapDartErrorToHttp(result.error) });
}
