import { ApiErrorResponseSchema, ApiLegacyErrorResponseSchema } from "./apiContract";
import { inferFixHrefByErrorCode } from "../ops/errorFixHref";

export type ApiErrorLike = {
  code?: unknown;
  message?: unknown;
  fixHref?: unknown;
  details?: unknown;
};

export type ApiResponseLike = {
  ok?: unknown;
  message?: unknown;
  code?: unknown;
  error?: ApiErrorLike;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function resolveClientApiError(payload: unknown, fallbackMessage: string): {
  code: string;
  message: string;
  fixHref?: string;
} {
  const parsedContract = ApiErrorResponseSchema.safeParse(payload);
  if (parsedContract.success) {
    const code = asString(parsedContract.data.error.code).toUpperCase();
    const message = asString(parsedContract.data.error.message) || fallbackMessage;
    const fixHref = asString(parsedContract.data.error.fixHref) || inferFixHrefByErrorCode(code);
    return {
      code,
      message,
      ...(fixHref ? { fixHref } : {}),
    };
  }

  const parsedLegacy = ApiLegacyErrorResponseSchema.safeParse(payload);
  if (parsedLegacy.success) {
    const code = asString(parsedLegacy.data.code).toUpperCase();
    const message = asString(parsedLegacy.data.message) || fallbackMessage;
    const fixHref = inferFixHrefByErrorCode(code);
    return {
      code,
      message,
      ...(fixHref ? { fixHref } : {}),
    };
  }

  const record = asRecord(payload);
  const error = asRecord(record.error);

  const code = asString(error.code || record.code).toUpperCase();
  const message = asString(error.message || record.message) || fallbackMessage;
  const fixHrefRaw = asString(error.fixHref);
  const fixHref = fixHrefRaw || inferFixHrefByErrorCode(code);

  return {
    code,
    message,
    ...(fixHref ? { fixHref } : {}),
  };
}
