import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runGov24SyncOnce } from "@/lib/publicApis/gov24SyncState";
import { runGov24SnapshotSync } from "@/lib/gov24/syncRunner";

export async function POST() {
  const traceId = crypto.randomUUID();
  try {
    const result = await runGov24SyncOnce(async () => {
      const synced = await runGov24SnapshotSync({
        scanPages: "auto",
        rows: 200,
        limit: 100_000,
        maxMatches: 200_000,
      });
      if (!synced.ok) {
        throw synced.error;
      }
      return synced.meta;
    });
    return NextResponse.json({ ok: true, meta: result });
  } catch (error) {
    const parsed = error && typeof error === "object"
      ? error as { code?: string; message?: string; upstreamStatus?: number; diagnostics?: Record<string, unknown> }
      : {};
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: parsed.code ?? "INTERNAL",
          message: parsed.message ?? "gov24 sync failed",
          upstreamStatus: parsed.upstreamStatus,
          diagnostics: parsed.diagnostics,
          traceId,
        },
      },
      { status: 500 },
    );
  }
}
