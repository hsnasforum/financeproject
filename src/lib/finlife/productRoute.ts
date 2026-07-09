import { NextResponse } from "next/server";
import { pushError } from "@/lib/observability/errorRingBuffer";
import { attachTrace, getOrCreateTraceId, setTraceHeader } from "@/lib/observability/trace";
import { getFinlifeProductsForHttp } from "@/lib/finlife/productsHttp";
import { type FinlifeKind } from "@/lib/finlife/types";

export function createFinlifeProductRoute(kind: FinlifeKind) {
  return async function GET(request: Request) {
    const startedAt = Date.now();
    const traceId = getOrCreateTraceId(request);
    const result = await getFinlifeProductsForHttp(kind, request);
    const payload = {
      ...result.payload,
      meta: attachTrace(result.payload.meta, traceId),
    };

    if (!payload.ok) {
      pushError({
        time: new Date().toISOString(),
        traceId,
        route: `/api/finlife/${kind}`,
        source: "finlife",
        code: payload.error?.code ?? "UNKNOWN",
        message: payload.error?.message ?? `FINLIFE ${kind} API failed`,
        status: result.status,
        elapsedMs: Date.now() - startedAt,
      });
    }

    const response = NextResponse.json(payload, { status: result.status, headers: result.headers });
    return setTraceHeader(response, traceId);
  };
}
