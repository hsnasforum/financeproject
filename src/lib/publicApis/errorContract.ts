import { type PublicApiError } from "@/lib/publicApis/contracts/types";

export type ExternalApiFailure = {
  ok: false;
  error: PublicApiError;
};

export function buildExternalApiFailure(input: {
  code: PublicApiError["code"];
  message: string;
  diagnostics?: Record<string, unknown>;
}): ExternalApiFailure {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      diagnostics: input.diagnostics,
    },
  };
}

export function statusFromExternalApiErrorCode(code: string | undefined): number {
  if (!code) return 502;
  if (code === "INPUT") return 400;
  if (code === "NO_DATA") return 404;
  if (code === "ENV_MISSING" || code === "ENV_INVALID_URL" || code === "ENV_INCOMPLETE_URL" || code === "ENV_DOC_URL" || code === "CONFIG") {
    return 400;
  }
  return 502;
}
