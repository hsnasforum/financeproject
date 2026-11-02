const DEFAULT_BACKUP_JSON_REQUEST_LIMIT_BYTES = 32 * 1024;

export class BackupJsonRequestError extends Error {
  readonly code: "BACKUP_JSON_INVALID" | "BACKUP_JSON_TOO_LARGE" | "BACKUP_JSON_UNSUPPORTED_MEDIA_TYPE";
  readonly status: number;

  constructor(
    code: "BACKUP_JSON_INVALID" | "BACKUP_JSON_TOO_LARGE" | "BACKUP_JSON_UNSUPPORTED_MEDIA_TYPE",
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "BackupJsonRequestError";
    this.code = code;
    this.status = status;
  }
}

function parseDeclaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length")?.trim() ?? "";
  if (!raw) return null;
  if (!/^\d+$/u.test(raw)) {
    throw new BackupJsonRequestError(
      "BACKUP_JSON_INVALID",
      "요청 본문 크기 정보가 올바르지 않습니다.",
      400,
    );
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BackupJsonRequestError(
      "BACKUP_JSON_INVALID",
      "요청 본문 크기 정보가 올바르지 않습니다.",
      400,
    );
  }
  return parsed;
}

function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (contentType !== "application/json") {
    throw new BackupJsonRequestError(
      "BACKUP_JSON_UNSUPPORTED_MEDIA_TYPE",
      "JSON 형식(application/json)으로 요청해 주세요.",
      415,
    );
  }
}

export async function readBoundedBackupJson(
  request: Request,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const maxBytes = Math.max(1, Math.trunc(options.maxBytes ?? DEFAULT_BACKUP_JSON_REQUEST_LIMIT_BYTES));
  assertJsonContentType(request);
  const declaredLength = parseDeclaredLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new BackupJsonRequestError(
      "BACKUP_JSON_TOO_LARGE",
      `요청 본문은 ${maxBytes.toLocaleString("ko-KR")}바이트 이하여야 합니다.`,
      413,
    );
  }

  if (!request.body) {
    throw new BackupJsonRequestError("BACKUP_JSON_INVALID", "요청 본문이 비어 있습니다.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("backup JSON request limit exceeded").catch(() => undefined);
        throw new BackupJsonRequestError(
          "BACKUP_JSON_TOO_LARGE",
          `요청 본문은 ${maxBytes.toLocaleString("ko-KR")}바이트 이하여야 합니다.`,
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new BackupJsonRequestError("BACKUP_JSON_INVALID", "JSON 요청 본문을 확인해 주세요.", 400);
  }
}

export function toBackupJsonRequestError(error: unknown): BackupJsonRequestError | null {
  return error instanceof BackupJsonRequestError ? error : null;
}
