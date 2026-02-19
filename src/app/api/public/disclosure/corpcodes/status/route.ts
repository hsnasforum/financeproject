import { NextResponse } from "next/server";
import { getCorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";

export const runtime = "nodejs";

export async function GET() {
  const status = getCorpIndexStatus();
  return NextResponse.json(status);
}
