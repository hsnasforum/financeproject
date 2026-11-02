import { redactText } from "../../planning/privacy/redact";

export type BackupClientError = {
  status: number;
  code: string;
  message: string;
};

type ArchiveAction = "preview" | "restore";

function rawErrorMessage(error: unknown, fallback: string): string {
  return redactText(error instanceof Error ? error.message : fallback);
}

function isInvalidBackupArchiveMessage(message: string): boolean {
  return (
    message.startsWith("INVALID_ZIP")
    || message.startsWith("MANIFEST_")
    || message.startsWith("ZIP_")
    || message.startsWith("ENCRYPTED_PACKAGE_")
  );
}

function fallbackArchiveFailureMessage(action: ArchiveAction): string {
  if (action === "restore") {
    return "백업 파일을 복원하지 못했습니다. 파일과 암호를 확인한 뒤 다시 시도해 주세요.";
  }
  return "백업 파일을 확인하지 못했습니다. 파일과 암호를 확인한 뒤 다시 시도해 주세요.";
}

function isReceiptStoreUnavailableMessage(message: string): boolean {
  return message.startsWith("BACKUP_RECEIPT_STORE_UNAVAILABLE");
}

export function formatBackupUploadLimit(maxBytes: number): string {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) return "설정된 제한";
  if (maxBytes >= 1024 * 1024) return `${(maxBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (maxBytes >= 1024) return `${(maxBytes / 1024).toFixed(1)} KB`;
  return `${Math.trunc(maxBytes)} B`;
}

export function toBackupArchiveClientError(error: unknown, action: ArchiveAction): BackupClientError {
  const message = rawErrorMessage(error, action === "restore" ? "restore failed" : "preview failed");
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return {
      status: 400,
      code: "VALIDATION",
      message: action === "restore" ? "복원 암호를 입력해 주세요." : "백업 암호를 입력해 주세요.",
    };
  }
  if (message.startsWith("VAULT_PASSPHRASE_INVALID")) {
    return {
      status: 401,
      code: "VALIDATION",
      message: "암호가 올바르지 않습니다. 백업 파일을 만들 때 입력한 암호를 확인해 주세요.",
    };
  }
  if (isInvalidBackupArchiveMessage(message)) {
    return {
      status: 400,
      code: "BACKUP_INVALID",
      message: "선택한 파일은 이 앱에서 만든 암호화 백업 파일이 아니거나 파일이 손상되었습니다. 다시 내보낸 백업 파일을 선택해 주세요.",
    };
  }
  if (isReceiptStoreUnavailableMessage(message)) {
    return {
      status: 503,
      code: "BACKUP_RECEIPT_STORE_UNAVAILABLE",
      message: "미리보기 확인 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하고, 반복되면 운영 데이터 디렉터리 권한과 잠금 파일 상태를 확인해 주세요.",
    };
  }
  return {
    status: 500,
    code: action === "restore" ? "RESTORE_FAILED" : "PREVIEW_FAILED",
    message: fallbackArchiveFailureMessage(action),
  };
}

export function toBackupExportClientError(error: unknown): BackupClientError {
  const message = rawErrorMessage(error, "backup export failed");
  if (message.startsWith("VAULT_PASSPHRASE_REQUIRED")) {
    return { status: 400, code: "VALIDATION", message: "백업 암호를 입력해 주세요." };
  }
  if (message.startsWith("VAULT_LOCKED")) {
    return { status: 423, code: "LOCKED", message: "운영 보안 잠금을 해제한 뒤 다시 시도해 주세요." };
  }
  if (message.startsWith("BACKUP_EXPORT_LIMIT_EXCEEDED")) {
    return {
      status: 413,
      code: "BACKUP_TOO_LARGE",
      message: "현재 데이터가 백업 파일 크기 제한을 초과했습니다. 오래된 실행 기록을 정리하거나 운영자가 백업 제한을 확인한 뒤 다시 시도해 주세요.",
    };
  }
  if (message.startsWith("BACKUP_EXPORT_RECEIPT_STORE_UNAVAILABLE")) {
    return {
      status: 503,
      code: "BACKUP_RECEIPT_STORE_UNAVAILABLE",
      message: "백업 저장 확인 정보를 보관할 수 없습니다. 잠시 후 다시 시도하고, 반복되면 데이터 디렉터리 권한을 확인해 주세요.",
    };
  }
  if (message.startsWith("BACKUP_EXPORT_RECEIPT_EXPIRED")) {
    return {
      status: 410,
      code: "VALIDATION",
      message: "백업 저장 확인 시간이 지났습니다. 백업 파일을 다시 내려받아 주세요.",
    };
  }
  if (
    message.startsWith("BACKUP_EXPORT_RECEIPT_INVALID")
    || message.startsWith("BACKUP_EXPORT_RECEIPT_MISSING")
    || message.startsWith("BACKUP_EXPORT_RECEIPT_CONTEXT_MISMATCH")
  ) {
    return {
      status: 400,
      code: "VALIDATION",
      message: "이 백업의 저장 확인 요청을 확인할 수 없습니다. 백업 파일을 다시 내려받아 주세요.",
    };
  }
  return {
    status: 500,
    code: "EXPORT_FAILED",
    message: "백업 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
