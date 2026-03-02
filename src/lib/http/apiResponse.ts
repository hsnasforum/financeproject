import { NextResponse } from "next/server";
import { ApiErrorResponseSchema, ApiOkBaseResponseSchema } from "./apiContract";
import { inferFixHrefByErrorCode } from "../ops/errorFixHref";

export function statusFromCode(code: string): number {
  if (code === "INPUT" || code === "INVALID_DATE_FORMAT") return 400;
  if (code === "NO_DATA") return 404;
  if (
    code === "ENV_MISSING"
    || code === "ENV_INVALID_URL"
    || code === "ENV_INCOMPLETE_URL"
    || code === "ENV_DOC_URL"
    || code === "CONFIG_MISSING"
    || code === "CONFIG"
  ) {
    return 400;
  }
  if (code === "UPSTREAM" || code === "HTTP" || code === "INTERNAL") return 502;
  return 502;
}

type JsonOkOptions = {
  meta?: Record<string, unknown>;
  status?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function contractViolationResponse(target: "ok" | "error") {
  return NextResponse.json({
    ok: false,
    error: {
      code: "INTERNAL",
      message: `API response contract violation (${target})`,
    },
  }, { status: 500 });
}

export function jsonOk<T>(data: T, options?: JsonOkOptions) {
  const bodyBase = isRecord(data)
    ? { ok: true, ...data }
    : { ok: true, data };

  if (options?.meta) {
    const existingMeta = isRecord((bodyBase as Record<string, unknown>).meta)
      ? ((bodyBase as Record<string, unknown>).meta as Record<string, unknown>)
      : {};
    const payload = {
      ...bodyBase,
      meta: {
        ...existingMeta,
        ...options.meta,
      },
    };
    const parsed = ApiOkBaseResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return contractViolationResponse("ok");
    }
    return NextResponse.json(parsed.data, { status: options.status ?? 200 });
  }

  const parsed = ApiOkBaseResponseSchema.safeParse(bodyBase);
  if (!parsed.success) {
    return contractViolationResponse("ok");
  }
  return NextResponse.json(parsed.data, { status: options?.status ?? 200 });
}

type JsonErrorOptions = {
  issues?: string[];
  debug?: Record<string, unknown>;
  details?: unknown;
  fixHref?: string;
  status?: number;
  meta?: Record<string, unknown>;
};

export function jsonError(code: string, message: string, options?: JsonErrorOptions) {
  const error: {
    code: string;
    message: string;
    fixHref?: string;
    issues?: string[];
    debug?: Record<string, unknown>;
    details?: unknown;
  } = {
    code,
    message,
  };
  const fixHref = options?.fixHref || inferFixHrefByErrorCode(code);
  if (fixHref) {
    error.fixHref = fixHref;
  }

  if (Array.isArray(options?.issues) && options.issues.length > 0) {
    error.issues = options.issues;
  }
  if (options?.debug && Object.keys(options.debug).length > 0) {
    error.debug = options.debug;
  }
  if (options?.details !== undefined) {
    error.details = options.details;
  }

  const body: Record<string, unknown> = {
    ok: false,
    error,
  };
  if (options?.meta) {
    body.meta = options.meta;
  }

  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return contractViolationResponse("error");
  }
  return NextResponse.json(parsed.data, { status: options?.status ?? statusFromCode(code) });
}
