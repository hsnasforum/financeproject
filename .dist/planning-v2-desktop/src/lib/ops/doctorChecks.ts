export type DoctorCheckStatus = "PASS" | "WARN" | "FAIL";

export type DoctorCheck = {
  id: string;
  title: string;
  status: DoctorCheckStatus;
  message: string;
  fixHref?: string;
  details?: Record<string, unknown>;
};

export type DoctorReport = {
  ok: boolean;
  generatedAt: string;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function summarizeDoctorChecks(checks: DoctorCheck[], generatedAt = new Date().toISOString()): DoctorReport {
  const pass = checks.filter((check) => check.status === "PASS").length;
  const warn = checks.filter((check) => check.status === "WARN").length;
  const fail = checks.filter((check) => check.status === "FAIL").length;
  const createdAt = asString(generatedAt);
  return {
    ok: fail === 0,
    generatedAt: createdAt || new Date().toISOString(),
    checks,
    summary: {
      pass,
      warn,
      fail,
    },
  };
}
