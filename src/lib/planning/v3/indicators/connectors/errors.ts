import type { ConnectorErrorCode, RefreshError } from "../contracts";

const MAX_MESSAGE_LENGTH = 180;
const REDACT_PATTERN = /(api[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi;

function compactWhitespace(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeErrorMessage(value: unknown): string {
  const base = typeof value === "string" && value.trim().length > 0
    ? value
    : value instanceof Error
      ? value.message
      : "unknown_error";

  const redacted = compactWhitespace(base).replace(REDACT_PATTERN, (_all, key: string) => `${key}=[redacted]`);
  if (redacted.length <= MAX_MESSAGE_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_MESSAGE_LENGTH)}...`;
}

export class ConnectorError extends Error {
  code: ConnectorErrorCode;

  constructor(code: ConnectorErrorCode, message: unknown) {
    super(sanitizeErrorMessage(message));
    this.name = "ConnectorError";
    this.code = code;
  }
}

export function normalizeConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) {
    return new ConnectorError(error.code, error.message);
  }

  if (error instanceof Error) {
    return new ConnectorError("INTERNAL", error.message);
  }

  return new ConnectorError("INTERNAL", "unknown_error");
}

export function toRefreshError(error: unknown, sourceId: string, seriesId?: string): RefreshError {
  const normalized = normalizeConnectorError(error);
  return {
    sourceId,
    seriesId,
    code: normalized.code,
    message: normalized.message,
  };
}

export function shouldRetryConnectorError(error: ConnectorError): boolean {
  return error.code === "FETCH" || error.code === "LIMIT";
}
