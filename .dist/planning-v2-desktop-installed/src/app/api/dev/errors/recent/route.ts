import { NextResponse } from "next/server";
import { listErrors } from "../../../../../lib/observability/errorRingBuffer";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 20;

    return NextResponse.json({
      ok: true,
      data: listErrors(limit),
      meta: {
        limit,
        total: listErrors(200).length,
      },
    });
  } catch (error) {
    console.error("[dev/errors/recent] failed to read error ring buffer", error);
    return NextResponse.json({
      ok: true,
      data: [],
      meta: {
        limit: 20,
        total: 0,
        degraded: true,
        reasonCode: "ERROR_RING_BUFFER_READ_FAILED",
      },
    });
  }
}
