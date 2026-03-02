import { NextResponse } from "next/server";
import { buildDiagnosticsSnapshot, parseDiagnosticsPageInfoFromRequest } from "@/lib/diagnostics/snapshot";

export async function GET(request: Request) {
  try {
    const pageInfo = parseDiagnosticsPageInfoFromRequest(request);
    const snapshot = buildDiagnosticsSnapshot({ req: request, pageInfo });
    return NextResponse.json({
      ok: true,
      data: snapshot,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "SNAPSHOT_BUILD_FAILED", message: "진단 스냅샷 생성에 실패했습니다." } },
      { status: 500 },
    );
  }
}
