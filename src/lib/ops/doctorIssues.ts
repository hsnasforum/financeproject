import { type DoctorCheck } from "./doctorChecks";
import { type OpsActionId } from "./actions/types";

export type DoctorIssueSeverity = "risk" | "warn" | "info";

export type DoctorIssueFix =
  | {
      type: "none";
      label: string;
    }
  | {
      type: "link";
      label: string;
      href: string;
    }
  | {
      type: "action";
      label: string;
      actionId: OpsActionId;
      dangerous?: boolean;
      confirmText?: string;
    };

export type DoctorIssue = {
  id: string;
  checkId: string;
  title: string;
  status: DoctorCheck["status"];
  severity: DoctorIssueSeverity;
  priority: number;
  message: string;
  updatedAt: string;
  fix: DoctorIssueFix;
  fixHref?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severityRank(severity: DoctorIssueSeverity): number {
  if (severity === "risk") return 0;
  if (severity === "warn") return 1;
  return 2;
}

export function toDoctorIssueSeverity(status: DoctorCheck["status"]): DoctorIssueSeverity {
  if (status === "FAIL") return "risk";
  if (status === "WARN") return "warn";
  return "info";
}

function toDefaultFix(check: DoctorCheck): DoctorIssueFix {
  const href = asString(check.fixHref);
  if (href) {
    return {
      type: "link",
      label: "열기",
      href,
    };
  }
  return {
    type: "none",
    label: "조치 불필요",
  };
}

function inferFix(check: DoctorCheck): DoctorIssueFix {
  if (check.status === "PASS") {
    return toDefaultFix(check);
  }

  if (check.id === "assumptions-latest" || check.id === "metrics-refresh-failures") {
    return {
      type: "action",
      label: "가정 새로고침",
      actionId: "ASSUMPTIONS_REFRESH",
    };
  }

  if (check.id === "storage-consistency") {
    return {
      type: "action",
      label: "인덱스 수리",
      actionId: "REPAIR_INDEX",
    };
  }

  if (check.id === "migrations") {
    const href = asString(check.fixHref);
    if (href === "/ops/security") {
      return {
        type: "link",
        label: "보안 설정",
        href,
      };
    }
    return {
      type: "action",
      label: "마이그레이션 실행",
      actionId: "RUN_MIGRATIONS",
    };
  }

  if (check.id === "runs-recent-success") {
    return {
      type: "link",
      label: "실행 기록 열기",
      href: "/planning/runs",
    };
  }

  return toDefaultFix(check);
}

export function buildDoctorIssues(checks: DoctorCheck[], updatedAt = new Date().toISOString()): DoctorIssue[] {
  return checks.map((check, index) => {
    const severity = toDoctorIssueSeverity(check.status);
    const basePriority = severityRank(severity) * 100;
    const fix = inferFix(check);

    return {
      id: `${check.id}:${index}`,
      checkId: check.id,
      title: check.title,
      status: check.status,
      severity,
      priority: basePriority + index,
      message: check.message,
      updatedAt,
      fix,
      ...(asString(check.fixHref) ? { fixHref: asString(check.fixHref) } : {}),
    };
  });
}

export function sortDoctorIssues(issues: DoctorIssue[]): DoctorIssue[] {
  return [...issues].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.title !== b.title) return a.title.localeCompare(b.title);
    return a.id.localeCompare(b.id);
  });
}
