import { NextResponse } from "next/server";
import { readDailyBrief } from "../../../../../lib/dart/dailyBriefReader";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const data = readDailyBrief();
  return NextResponse.json({
    ok: true,
    data,
  });
}
