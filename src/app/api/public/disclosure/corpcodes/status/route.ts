import { NextResponse } from "next/server";
import { getCorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";
import { buildMissingCorpIndexPayload } from "@/lib/publicApis/dart/missingIndex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const debug = new URL(request.url).searchParams.get("debug") === "1";
  const status = getCorpIndexStatus();
  if (!status.exists || status.usable === false) {
    return NextResponse.json({
      ...buildMissingCorpIndexPayload(status, { includeOpsHints: debug }),
      freshness: status.freshness,
    }, { status: 409 });
  }
  return NextResponse.json(status);
}
