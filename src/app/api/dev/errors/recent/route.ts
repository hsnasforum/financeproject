import { NextResponse } from "next/server";
import { listErrors } from "../../../../../lib/observability/errorRingBuffer";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

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
}
