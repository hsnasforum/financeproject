import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendOpsAuditEvent, listOpsAuditEvents } from "../../../src/lib/ops/securityAuditLog";

const env = process.env as Record<string, string | undefined>;
const originalAuditPath = process.env.PLANNING_OPS_AUDIT_PATH;
const originalAuditMaxBytes = process.env.PLANNING_OPS_AUDIT_MAX_BYTES;
const originalAuditMaxFiles = process.env.PLANNING_OPS_AUDIT_MAX_FILES;

describe("securityAuditLog", () => {
  let root = "";
  let auditPath = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-ops-audit-"));
    auditPath = path.join(root, "events.ndjson");
    env.PLANNING_OPS_AUDIT_PATH = auditPath;
    env.PLANNING_OPS_AUDIT_MAX_BYTES = "32768";
    env.PLANNING_OPS_AUDIT_MAX_FILES = "2";
  });

  afterEach(async () => {
    if (typeof originalAuditPath === "string") env.PLANNING_OPS_AUDIT_PATH = originalAuditPath;
    else delete env.PLANNING_OPS_AUDIT_PATH;
    if (typeof originalAuditMaxBytes === "string") env.PLANNING_OPS_AUDIT_MAX_BYTES = originalAuditMaxBytes;
    else delete env.PLANNING_OPS_AUDIT_MAX_BYTES;
    if (typeof originalAuditMaxFiles === "string") env.PLANNING_OPS_AUDIT_MAX_FILES = originalAuditMaxFiles;
    else delete env.PLANNING_OPS_AUDIT_MAX_FILES;
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rotates ndjson files when size exceeds configured max bytes", async () => {
    for (let index = 0; index < 60; index += 1) {
      await appendOpsAuditEvent({
        eventType: `OPS_EVENT_${index}`,
        at: new Date(Date.parse("2026-03-01T00:00:00.000Z") + index * 1_000).toISOString(),
        meta: {
          index,
          reason: "rotation-test-line".repeat(300),
        },
      });
    }

    const fileNames = await fs.readdir(root);
    expect(fileNames).toContain("events.ndjson.1");
    expect(fileNames.filter((row) => row.startsWith("events.ndjson")).length).toBeLessThanOrEqual(3);

    const rows = await listOpsAuditEvents({ limit: 200 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.eventType).toBe("OPS_EVENT_59");
  });

  it("redacts sensitive patterns before writing lines", async () => {
    await appendOpsAuditEvent({
      eventType: "VAULT_UNLOCK_ERROR",
      meta: {
        passphrase: "super-secret-passphrase",
        token: "ghp_secret_token_value",
        nested: { apiKey: "raw-api-key" },
        note: "Authorization: Bearer my-secret-token path=.data/planning/profiles/u1.json GITHUB_TOKEN=ghp_raw",
      },
    });

    const raw = await fs.readFile(auditPath, "utf-8");
    expect(raw).toContain("Bearer ***");
    expect(raw).toContain("GITHUB_TOKEN=***");
    expect(raw).toContain("<DATA_PATH>");
    expect(raw).toContain("\"passphrase\":\"***\"");
    expect(raw).toContain("\"token\":\"***\"");
    expect(raw).toContain("\"apiKey\":\"***\"");
    expect(raw).not.toContain("super-secret-passphrase");
    expect(raw).not.toContain("ghp_secret_token_value");
    expect(raw).not.toContain("my-secret-token");
    expect(raw).not.toContain("ghp_raw");
    expect(raw).not.toContain(".data/planning/profiles/u1.json");
  });

  it("reads sparse rotated audit files without probing missing suffixes", async () => {
    await fs.writeFile(
      auditPath,
      `${JSON.stringify({ eventType: "SCHEDULED_TASK", at: "2026-03-01T00:00:03.000Z", actor: "local" })}\n`,
      "utf-8",
    );
    await fs.writeFile(
      `${auditPath}.2`,
      `${JSON.stringify({ eventType: "VAULT_UNLOCK", at: "2026-03-01T00:00:01.000Z", actor: "local" })}\n`,
      "utf-8",
    );

    const rows = await listOpsAuditEvents({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.eventType).toBe("SCHEDULED_TASK");
    expect(rows[1]?.eventType).toBe("VAULT_UNLOCK");
  });
});
