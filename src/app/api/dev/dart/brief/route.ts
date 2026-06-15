import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { readDailyBrief } from "../../../../../lib/dart/dailyBriefReader";

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request);
  if (blocked) return blocked;

  const data = readDailyBrief();
  return NextResponse.json({
    ok: true,
    data,
  });
}
