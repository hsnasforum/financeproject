import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE_FILE = "src/app/api/ops/backup/restore/route.ts";
const ROUTE_SERVICE_IMPORT = "lib/ops/backup/backupRestoreRouteService";
const FORBIDDEN_ROUTE_PATTERNS = [
  "lib/audit/auditLogStore",
  "lib/ops/securityAuditLog",
  "lib/ops/metricsLog",
  "lib/ops/backup/clientErrors",
  "lib/ops/backup/planningDataVault",
  "lib/ops/backup/previewSession",
  "lib/ops/backup/previewToken",
  "lib/ops/backup/uploadTemp",
  "lib/ops/opsPolicy",
  "lib/planning/security/vaultCsrf",
  "appendAuditLog(",
  "appendOpsAuditEvent(",
  "appendOpsMetricEvent(",
  "decryptPlanningDataVaultArchive(",
  "restorePlanningDataVaultZip(",
  "readBackupPreviewSessionFromRequest(",
  "consumeBackupPreviewToken(",
  "readUploadBufferViaTemp(",
  "loadOpsPolicy(",
  "consumeVaultCsrfOrThrow(",
  "ensureVaultCsrfCookie(",
  "toBackupArchiveClientError(",
] as const;

describe("ops backup restore route service boundary", () => {
  it("keeps upload, preview-token, archive restore, csrf, audit, and metric access behind the route service", () => {
    const source = fs.readFileSync(ROUTE_FILE, "utf8");
    const violations = FORBIDDEN_ROUTE_PATTERNS
      .filter((pattern) => source.includes(pattern))
      .map((pattern) => `${ROUTE_FILE}:${pattern}`);

    expect(source).toContain(ROUTE_SERVICE_IMPORT);
    expect(violations).toEqual([]);
  });
});
