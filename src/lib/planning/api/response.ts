import { NextResponse } from "next/server";
import { statusFromCode } from "../../http/apiResponse";
import { ApiResponseSchema, type PlanningApiMeta } from "./contracts";

type JsonOkOptions = {
  status?: number;
  meta?: PlanningApiMeta & Record<string, unknown>;
};

type JsonErrOptions = {
  status?: number;
  issues?: string[];
  meta?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function shouldValidateResponseContract(): boolean {
  const env = (process.env.NODE_ENV ?? "").toLowerCase();
  return env === "development" || env === "test";
}

function validationFailureBody(target: "ok" | "error") {
  return {
    ok: false as const,
    error: {
      code: "FORMAT",
      message: `planning v2 API response contract violation (${target})`,
    },
  };
}

function validateOrFallback(body: unknown, target: "ok" | "error") {
  if (!shouldValidateResponseContract()) return body;
  const parsed = ApiResponseSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  return validationFailureBody(target);
}

export function jsonOk<T>(data: T, options?: JsonOkOptions) {
  const bodyBase = isRecord(data) && hasOwnKey(data, "data")
    ? { ok: true as const, ...data }
    : { ok: true as const, data };
  const body = options?.meta
    ? {
      ...bodyBase,
      meta: {
        ...(isRecord((bodyBase as Record<string, unknown>).meta)
          ? ((bodyBase as Record<string, unknown>).meta as Record<string, unknown>)
          : {}),
        ...options.meta,
      },
    }
    : bodyBase;
  const payload = validateOrFallback(body, "ok");
  const status = isRecord(payload) && payload.ok === false
    ? 500
    : (options?.status ?? 200);
  return NextResponse.json(payload, { status });
}

export function jsonErr(status: number, code: string, message?: string, issues?: string[], meta?: Record<string, unknown>) {
  const body = {
    ok: false as const,
    error: {
      code,
      ...(typeof message === "string" && message.trim().length > 0 ? { message: message.trim() } : {}),
      ...(Array.isArray(issues) && issues.length > 0 ? { issues } : {}),
    },
    ...(meta ? { meta } : {}),
  };
  const payload = validateOrFallback(body, "error");
  const responseStatus = isRecord(payload) && payload.ok === false && isRecord(payload.error) && payload.error.code === "FORMAT"
    ? 500
    : status;
  return NextResponse.json(payload, { status: responseStatus });
}

export function jsonError(code: string, message?: string, options?: JsonErrOptions) {
  return jsonErr(options?.status ?? statusFromCode(code), code, message, options?.issues, options?.meta);
}
