import { NextResponse } from "next/server";
import { getCorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";
import { buildMissingCorpIndexPayload } from "@/lib/publicApis/dart/missingIndex";

export const runtime = "nodejs";

export async function GET() {
  const status = getCorpIndexStatus();
  if (!status.exists) {
    return NextResponse.json(buildMissingCorpIndexPayload(status), { status: 409 });
  }
  return NextResponse.json(status);
}
