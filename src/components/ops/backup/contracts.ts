export type BackupPreviewPayload = {
  ok?: boolean;
  previewToken?: string;
  data?: {
    manifest?: {
      kind?: string;
      formatVersion?: number;
      mode?: "full" | "delta";
      scope?: "ops" | "user";
      userId?: string;
      createdAt?: string;
      appVersion?: string;
      conflictPolicy?: {
        runId?: string;
        snapshotId?: string;
      };
      counts?: Record<string, number>;
      planningV3?: {
        included?: boolean;
        totalBytes?: number;
        reason?: string;
      };
    };
    actual?: {
      totalFiles?: number;
      totalBytes?: number;
      profiles?: number;
      runs?: number;
      runBlobs?: number;
      actionPlans?: number;
      actionProgress?: number;
      assumptionsHistory?: number;
      policies?: number;
      planningV3Owners?: number;
      planningV3Files?: number;
      planningV3Bytes?: number;
    };
    ids?: {
      profileIds?: string[];
      runIds?: string[];
      snapshotIds?: string[];
    };
    warnings?: string[];
  };
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
  message?: string;
};

export type VaultStatusPayload = {
  ok?: boolean;
  csrfToken?: string;
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
};

export type BackupRestorePayload = {
  ok?: boolean;
  data?: {
    mode?: "merge" | "replace";
    imported?: {
      profiles?: number;
      runs?: number;
      runBlobs?: number;
      actionPlans?: number;
      actionProgress?: number;
      assumptionsHistory?: number;
      latestSnapshot?: boolean;
      policies?: number;
      planningV3Files?: number;
    };
    issues?: Array<{
      entity?: string;
      id?: string;
      path?: string;
      message?: string;
    }>;
    warnings?: string[];
    normalization?: {
      profiles?: Array<{
        id?: string;
        disclosure?: {
          defaultsApplied?: string[];
          fixesApplied?: Array<{
            path?: string;
            from?: unknown;
            to?: unknown;
            message?: string;
          }>;
        };
      }>;
    };
  };
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
  message?: string;
};

export type OpsApiError = {
  code?: string;
  message?: string;
  fixHref?: string;
};

export type OpsApiErrorPayload = {
  error?: OpsApiError;
};

export type BackupExportFinalizePayload = OpsApiErrorPayload & {
  ok?: boolean;
  data?: {
    status?: "already-finalized" | "committed" | "superseded";
  };
};

export type PendingExportConfirmation = {
  fileName: string;
  receipt: string;
};

export function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

export function formatBytes(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function toBackupActionError(payload: OpsApiErrorPayload | null, fallbackMessage: string): string {
  const code = (payload?.error?.code ?? "").trim().toUpperCase();
  const rawMessage = (payload?.error?.message ?? "").trim();
  if (rawMessage) return rawMessage;
  if (code === "LOCAL_ONLY") {
    return "로컬 주소(127.0.0.1 또는 localhost)에서만 실행할 수 있습니다.";
  }
  if (code === "CSRF") {
    return "보안 확인 정보가 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
  }
  return fallbackMessage;
}

export function getOpsApiErrorCode(payload: OpsApiErrorPayload | null): string {
  return (payload?.error?.code ?? "").trim().toUpperCase();
}
