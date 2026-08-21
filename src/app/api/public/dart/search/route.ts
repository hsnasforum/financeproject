import { NextResponse } from "next/server";
import { getDartDisclosureList } from "@/lib/publicApis/dart/list";
import { mapDartErrorToHttp, toPublicDartError } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const result = await getDartDisclosureList(searchParams, request.signal);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: toPublicDartError(result.error) },
      { status: mapDartErrorToHttp(result.error) },
    );
  }

  return NextResponse.json(result);
}
