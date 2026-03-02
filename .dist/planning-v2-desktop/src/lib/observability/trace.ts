import { randomUUID } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getOrCreateTraceId(request: Request): string {
  const incoming = (request.headers.get("x-trace-id") ?? "").trim();
  if (incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

export function attachTrace(meta: unknown, traceId: string): Record<string, unknown> {
  const base = isRecord(meta) ? meta : {};
  return {
    ...base,
    traceId,
  };
}

export function setTraceHeader<T extends Response>(response: T, traceId: string): T {
  response.headers.set("x-trace-id", traceId);
  return response;
}
