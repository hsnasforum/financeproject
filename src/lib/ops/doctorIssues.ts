import { type DoctorCheck } from "./doctorChecks";
import { type DoctorIssue, type DoctorIssueFix, type DoctorIssueSeverity } from "./doctor/types";

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

function toDefaultFix(check: DoctorCheck): DoctorIssueFix | undefined {
  const href = asString(check.fixHref);
  if (!href) return undefined;
  return {
    label: "열기",
    href,
  };
}

function inferFix(check: DoctorCheck): DoctorIssueFix | undefined {
  if (check.status === "PASS") {
    return toDefaultFix(check);
  }

  if (check.id === "assumptions-latest" || check.id === "metrics-refresh-failures" || check.id === "ASSUMPTIONS_REFRESH_FAILING") {
    return {
      label: "가정 새로고침",
      actionId: "ASSUMPTIONS_REFRESH",
    };
  }

  if (check.id === "storage-consistency") {
    return {
      label: "인덱스 수리",
      actionId: "REPAIR_INDEX",
      confirm: "RUN OPS_REPAIR_INDEX",
    };
  }

  if (check.id === "migrations") {
    const href = asString(check.fixHref);
    if (href === "/ops/security") {
      return {
        label: "보안 설정",
        href,
      };
    }
    return {
      label: "마이그레이션 실행",
      actionId: "RUN_MIGRATIONS",
      confirm: "RUN OPS_MIGRATIONS",
    };
  }

  if (check.id === "runs-recent-success") {
    return {
      label: "실행 기록 열기",
      href: "/planning/runs",
    };
  }

  return toDefaultFix(check);
}

function buildIssueId(check: DoctorCheck, index: number): string {
  const base = check.id.trim();
  if (!base) return `doctor-issue-${index + 1}`;
  return `${base}-${index + 1}`;
}

function buildEvidence(check: DoctorCheck): string | undefined {
  if (!check.details) return undefined;
  const summary = asString((check.details as Record<string, unknown>).summary);
  if (summary) return summary;
  const code = asString((check.details as Record<string, unknown>).code);
  if (code) return `code=${code}`;
  return undefined;
}

export function buildDoctorIssues(checks: DoctorCheck[], _updatedAt = new Date().toISOString()): DoctorIssue[] {
  return checks.map((check, index) => {
    const severity = toDoctorIssueSeverity(check.status);
    const evidence = buildEvidence(check);
    const fix = inferFix(check);
    const issue: DoctorIssue = {
      id: buildIssueId(check, index),
      severity,
      title: check.title,
      message: check.message,
      ...(evidence ? { evidence } : {}),
      ...(fix ? { fix } : {}),
    };
    return issue;
  });
}

export function sortDoctorIssues(issues: DoctorIssue[]): DoctorIssue[] {
  return [...issues].sort((a, b) => {
    const severityDiff = severityRank(a.severity) - severityRank(b.severity);
    if (severityDiff !== 0) return severityDiff;
    const titleDiff = a.title.localeCompare(b.title);
    if (titleDiff !== 0) return titleDiff;
    return a.id.localeCompare(b.id);
  });
}
