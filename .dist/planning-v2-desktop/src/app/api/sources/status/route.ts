import { NextResponse } from "next/server";
import { getUnifiedSourceStatuses } from "@/lib/sources/status";

export async function GET() {
  try {
    const data = await getUnifiedSourceStatuses();
    return NextResponse.json({
      ok: true,
      data,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[sources/status] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL",
          message: "현재 데이터를 갱신하지 못했어요. 잠시 후 다시 시도해주세요.",
        },
      },
      { status: 500 },
    );
  }
}
