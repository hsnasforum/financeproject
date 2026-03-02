import { NextResponse } from "next/server";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { list } from "../../../../../lib/audit/auditLogStore";

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50;

    return NextResponse.json({
      ok: true,
      data: list(limit),
    });
  } catch (error) {
    console.error("[dev/audit/recent] failed to read audit log", error);
    return NextResponse.json({
      ok: true,
      data: [],
      meta: {
        degraded: true,
        reasonCode: "AUDIT_LOG_READ_FAILED",
      },
    });
  }
}
