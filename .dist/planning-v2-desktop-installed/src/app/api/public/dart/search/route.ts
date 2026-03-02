import { NextResponse } from "next/server";
import { getDartDisclosureList } from "@/lib/publicApis/dart/list";
import { mapDartErrorToHttp } from "@/lib/publicApis/dart/opendartErrors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const result = await getDartDisclosureList(searchParams);
  if (!result.ok) {
    return NextResponse.json(result, { status: mapDartErrorToHttp(result.error) });
  }

  return NextResponse.json(result);
}
