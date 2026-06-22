import { type OpsActionRunResult, type OpsActionRunStatus } from "./types";

export function resolveOpsActionRunStatus(result: OpsActionRunResult): OpsActionRunStatus {
  if (result.status) return result.status;
  return result.ok ? "SUCCESS" : "FAILED";
}

export function opsActionAuditResult(status: OpsActionRunStatus): "SUCCESS" | "PARTIAL_SUCCESS" | "ERROR" {
  if (status === "FAILED") return "ERROR";
  return status;
}

export function opsActionAuditEventType(status: OpsActionRunStatus): string {
  if (status === "FAILED") return "OPS_ACTION_RUN_ERROR";
  if (status === "PARTIAL_SUCCESS") return "OPS_ACTION_RUN_PARTIAL_SUCCESS";
  return "OPS_ACTION_RUN_SUCCESS";
}
