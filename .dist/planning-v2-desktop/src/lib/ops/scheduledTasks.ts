import { appendOpsMetricEvent } from "./metricsLog";
import { appendOpsAuditEvent } from "./securityAuditLog";
import { getVaultStatus, type VaultStatus } from "../planning/security/vaultState";
import { redactText } from "../planning/privacy/redact";

export type ScheduledTaskName =
  | "OPS_REFRESH_ASSUMPTIONS"
  | "PLANNING_RUN_MONTHLY";

export type ScheduledTaskCode =
  | "OK"
  | "LOCKED"
  | "STALE_ASSUMPTIONS"
  | "VALIDATION"
  | "INTERNAL";

export type ScheduledTaskVaultGuard = {
  ok: boolean;
  code?: "LOCKED";
  message?: string;
};

type ScheduledTaskEventInput = {
  taskName: ScheduledTaskName;
  status: "SUCCESS" | "FAILED";
  code?: ScheduledTaskCode;
  durationMs?: number;
  message?: string;
  meta?: Record<string, unknown>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeDurationMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export function evaluateScheduledTaskVaultGuard(status: Pick<VaultStatus, "configured" | "unlocked">): ScheduledTaskVaultGuard {
  if (status.configured && !status.unlocked) {
    return {
      ok: false,
      code: "LOCKED",
      message: "Vault is locked. Unlock via /ops/security.",
    };
  }
  return { ok: true };
}

export async function ensureScheduledTaskVaultUnlocked(): Promise<ScheduledTaskVaultGuard> {
  const status = await getVaultStatus();
  return evaluateScheduledTaskVaultGuard(status);
}

export function toScheduledTaskErrorCode(error: unknown): ScheduledTaskCode {
  const directCode = asString((error as { code?: unknown } | null | undefined)?.code).toUpperCase();
  if (directCode === "LOCKED" || directCode === "VAULT_LOCKED") return "LOCKED";
  if (directCode === "STALE_ASSUMPTIONS") return "STALE_ASSUMPTIONS";
  if (directCode === "VALIDATION" || directCode === "INPUT") return "VALIDATION";

  const message = asString((error as { message?: unknown } | null | undefined)?.message).toUpperCase();
  if (message.includes("VAULT_LOCKED") || message.includes("LOCKED")) return "LOCKED";
  if (message.includes("STALE_ASSUMPTIONS") || message.includes("SNAPSHOT")) return "STALE_ASSUMPTIONS";
  if (message.includes("PRELIGHT") || message.includes("PREFLIGHT") || message.includes("VALIDATION") || message.includes("INVALID")) {
    return "VALIDATION";
  }
  return "INTERNAL";
}

export function toScheduledTaskErrorMessage(error: unknown): string {
  const message = asString((error as { message?: unknown } | null | undefined)?.message);
  if (!message) return "unknown error";
  const firstLine = message.split("\n")[0] ?? message;
  const redacted = redactText(firstLine);
  return redacted.slice(0, 300);
}

export async function appendScheduledTaskEvent(input: ScheduledTaskEventInput): Promise<void> {
  const status = input.status === "FAILED" ? "FAILED" : "SUCCESS";
  const code = input.code ?? (status === "SUCCESS" ? "OK" : "INTERNAL");
  const durationMs = sanitizeDurationMs(input.durationMs);
  const message = asString(input.message);
  const safeMessage = message ? redactText(message).slice(0, 300) : "";
  const safeMeta = input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)
    ? input.meta
    : {};

  await appendOpsMetricEvent({
    type: "SCHEDULED_TASK",
    meta: {
      taskName: input.taskName,
      status,
      code,
      durationMs,
      ...(safeMessage ? { message: safeMessage } : {}),
      ...safeMeta,
    },
  }).catch(() => undefined);

  await appendOpsAuditEvent({
    eventType: "SCHEDULED_TASK",
    meta: {
      taskName: input.taskName,
      status,
      code,
      durationMs,
      ...(safeMessage ? { message: safeMessage } : {}),
      ...safeMeta,
    },
  }).catch(() => undefined);
}
