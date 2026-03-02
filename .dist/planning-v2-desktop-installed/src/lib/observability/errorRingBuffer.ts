export type ObservedError = {
  time: string;
  traceId: string;
  route: string;
  source: string;
  code: string;
  message: string;
  status: number;
  elapsedMs: number;
};

const BUFFER_SIZE = 200;
const GLOBAL_KEY = "__finance_error_ring_buffer_v1__";

function getStore(): ObservedError[] {
  const g = globalThis as Record<string, unknown>;
  if (!Array.isArray(g[GLOBAL_KEY])) {
    g[GLOBAL_KEY] = [] as ObservedError[];
  }
  return g[GLOBAL_KEY] as ObservedError[];
}

function sanitizeMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

export function pushError(entry: ObservedError): void {
  const store = getStore();
  const normalized: ObservedError = {
    time: typeof entry.time === "string" && entry.time ? entry.time : new Date().toISOString(),
    traceId: typeof entry.traceId === "string" ? entry.traceId : "",
    route: typeof entry.route === "string" ? entry.route : "",
    source: typeof entry.source === "string" ? entry.source : "",
    code: typeof entry.code === "string" ? entry.code : "UNKNOWN",
    message: sanitizeMessage(entry.message),
    status: toPositiveInt(entry.status, 500),
    elapsedMs: toPositiveInt(entry.elapsedMs, 0),
  };
  store.push(normalized);
  if (store.length > BUFFER_SIZE) {
    store.splice(0, store.length - BUFFER_SIZE);
  }
}

export function listErrors(limit = 20): ObservedError[] {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const store = getStore();
  return [...store].slice(-safeLimit).reverse();
}
