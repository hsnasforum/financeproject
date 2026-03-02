import { NextResponse } from "next/server";
import { readDailyRefreshResult } from "../../../../../lib/dev/readDailyRefreshResult";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const result = readDailyRefreshResult();
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: result.data,
  });
}
