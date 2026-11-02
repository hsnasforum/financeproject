import { loadOpsPolicy } from "../opsPolicy";
import { formatBackupUploadLimit } from "./clientErrors";

const BACKUP_MULTIPART_OVERHEAD_BYTES = 256 * 1024;

export const __BACKUP_MULTIPART_OVERHEAD_BYTES_FOR_TESTS = BACKUP_MULTIPART_OVERHEAD_BYTES;

export type BackupUploadFormDataError = {
  code: "VALIDATION";
  message: string;
  status: 400 | 413;
};

export type BackupUploadFormDataResult = {
  ok: true;
  formData: FormData;
} | {
  ok: false;
  error: BackupUploadFormDataError;
};

function invalidMultipartError(): BackupUploadFormDataResult {
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: "multipart/form-data 형식이 필요합니다.",
      status: 400,
    },
  };
}

function oversizedRequestError(maxUploadBytes: number): BackupUploadFormDataResult {
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: `백업 업로드 요청이 너무 큽니다. 백업 파일은 최대 ${formatBackupUploadLimit(maxUploadBytes)}까지 업로드할 수 있습니다.`,
      status: 413,
    },
  };
}

export async function parseBackupUploadFormData(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackupUploadFormDataResult> {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data;")) {
    return invalidMultipartError();
  }

  const maxUploadBytes = loadOpsPolicy(env).backup.maxUploadBytes;
  const maxRequestBytes = maxUploadBytes + BACKUP_MULTIPART_OVERHEAD_BYTES;
  const declaredLengthRaw = request.headers.get("content-length")?.trim() ?? "";
  if (declaredLengthRaw) {
    if (!/^\d+$/u.test(declaredLengthRaw)) {
      return invalidMultipartError();
    }
    const declaredLength = Number(declaredLengthRaw);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxRequestBytes) {
      return oversizedRequestError(maxUploadBytes);
    }
  }

  if (!request.body) {
    return invalidMultipartError();
  }

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxRequestBytes) {
        await reader.cancel().catch(() => undefined);
        return oversizedRequestError(maxUploadBytes);
      }
      chunks.push(Buffer.from(chunk.value));
    }
  } catch {
    return invalidMultipartError();
  } finally {
    reader.releaseLock();
  }

  try {
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: Buffer.concat(chunks, totalBytes),
    });
    return {
      ok: true,
      formData: await boundedRequest.formData(),
    };
  } catch {
    return invalidMultipartError();
  }
}
