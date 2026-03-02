import { NextResponse } from "next/server";
import { getFinlifeProductsForHttp } from "@/lib/finlife/productsHttp";
import { pushError } from "../../../../lib/observability/errorRingBuffer";
import { attachTrace, getOrCreateTraceId, setTraceHeader } from "../../../../lib/observability/trace";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const traceId = getOrCreateTraceId(request);
  const result = await getFinlifeProductsForHttp("deposit", request);
  const payload = {
    ...result.payload,
    meta: attachTrace(result.payload.meta, traceId),
  };
  if (!payload.ok) {
    pushError({
      time: new Date().toISOString(),
      traceId,
      route: "/api/finlife/deposit",
      source: "finlife",
      code: payload.error?.code ?? "UNKNOWN",
      message: payload.error?.message ?? "FINLIFE deposit API failed",
      status: result.status,
      elapsedMs: Date.now() - startedAt,
    });
  }
  const response = NextResponse.json(payload, { status: result.status, headers: result.headers });
  return setTraceHeader(response, traceId);
}
