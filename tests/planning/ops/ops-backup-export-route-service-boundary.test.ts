import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/backup/export/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/backup/backupExportRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/ops/securityAuditLog",
  "lib/ops/metricsLog",
  "lib/ops/backup/clientErrors",
  "lib/ops/backup/planningDataVault",
  "lib/planning/security/vaultCsrf",
  "appendAuditLog(",
  "appendOpsAuditEvent(",
  "appendOpsMetricEvent(",
  "buildPlanningDataVaultZip(",
  "encryptPlanningDataVaultArchive(",
  "consumeVaultCsrfOrThrow(",
  "ensureVaultCsrfCookie(",
  "toBackupExportClientError(",
] as const;

describe("ops backup export route service boundary", () => {
  it("keeps vault archive, csrf, audit, and metric access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
