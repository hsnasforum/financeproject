export type ApiErrorShape = {
  code: string;
  message: string;
  debug?: Record<string, unknown>;
};

export function isDebugEnabled(searchParams: URLSearchParams): boolean {
  return searchParams.get("debug") === "1" || process.env.NODE_ENV !== "production";
}

export function makeHttpError(
  code: string,
  message: string,
  options?: {
    debugEnabled?: boolean;
    debug?: Record<string, unknown> | null;
  },
): ApiErrorShape {
  const debugEnabled = options?.debugEnabled ?? false;
  const debug = options?.debug ?? null;
  if (!debugEnabled || !debug || Object.keys(debug).length === 0) {
    return { code, message };
  }
  return { code, message, debug };
}
