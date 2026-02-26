import { NextResponse } from "next/server";
import { readDailyBrief } from "../../../../../lib/dart/dailyBriefReader";

export async function GET() {
  const data = readDailyBrief();
  return NextResponse.json({
    ok: true,
    data,
  });
}
