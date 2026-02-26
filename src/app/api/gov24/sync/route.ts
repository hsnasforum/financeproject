import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isDebugEnabled, makeHttpError } from "@/lib/http/apiError";
import { attachFallback } from "@/lib/http/fallbackMeta";
import { statusFromExternalApiErrorCode } from "@/lib/publicApis/errorContract";
import { runGov24SyncOnce } from "@/lib/publicApis/gov24SyncState";
import { runGov24SnapshotSync } from "@/lib/gov24/syncRunner";
import { singleflight } from "../../../../lib/cache/singleflight";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const debugEnabled = isDebugEnabled(searchParams);
  const traceId = crypto.randomUUID();
  try {
    const result = await singleflight("gov24-sync", () => runGov24SyncOnce(async () => {
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
    }));
    return NextResponse.json({
      ok: true,
      meta: attachFallback((result ?? {}) as Record<string, unknown>, {
        mode: "LIVE",
        sourceKey: "gov24",
        reason: "sync_success",
      }),
    });
  } catch (error) {
    const parsed = error && typeof error === "object"
      ? error as { code?: string; message?: string; upstreamStatus?: number; diagnostics?: Record<string, unknown> }
      : {};
    const code = parsed.code ?? "INTERNAL";
    const message = parsed.message ?? "gov24 sync failed";
    return NextResponse.json(
      {
        ok: false,
        meta: attachFallback({}, {
          mode: "LIVE",
          sourceKey: "gov24",
          reason: "sync_failed",
        }),
        error: makeHttpError(code, message, {
          debugEnabled,
          debug: {
            upstreamStatus: parsed.upstreamStatus,
            traceId,
          },
        }),
      },
      { status: statusFromExternalApiErrorCode(code) },
    );
  }
}
