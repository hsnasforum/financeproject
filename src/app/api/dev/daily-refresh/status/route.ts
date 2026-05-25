import { NextResponse } from "next/server";
import { guardDevReadRequest } from "@/lib/dev/devGuards";
import { readDailyRefreshResult } from "../../../../../lib/dev/readDailyRefreshResult";

export async function GET(request: Request) {
  const blocked = guardDevReadRequest(request);
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
