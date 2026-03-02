import { NextResponse } from "next/server";
import { listFixHistory } from "../../../../../../lib/diagnostics/fixHistoryStore";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 20;

    const rows = listFixHistory(limit);
    return NextResponse.json({
      ok: true,
      data: rows,
      meta: {
        limit,
        count: rows.length,
      },
    });
  } catch (error) {
    console.error("[dev/doctor/fix/history] failed to read fix history", error);
    return NextResponse.json({
      ok: true,
      data: [],
      meta: {
        limit: 20,
        count: 0,
        degraded: true,
        reasonCode: "FIX_HISTORY_READ_FAILED",
      },
    });
  }
}
