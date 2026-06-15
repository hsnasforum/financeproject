import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AuditLogItem, append, list } from "../src/lib/audit/auditLogStore";

const TEST_AUDIT_PATH = path.join(process.cwd(), "tmp", "audit_log.test.json");

let previousAuditPath: string | undefined;

function cleanup() {
  if (fs.existsSync(TEST_AUDIT_PATH)) {
    fs.unlinkSync(TEST_AUDIT_PATH);
  }
}

function writeAuditFixture(items: AuditLogItem[]) {
  fs.mkdirSync(path.dirname(TEST_AUDIT_PATH), { recursive: true });
  fs.writeFileSync(TEST_AUDIT_PATH, `${JSON.stringify(items, null, 2)}\n`, "utf-8");
}

function makeAuditItem(index: number): AuditLogItem {
  return {
    id: `audit-${index}`,
    createdAt: new Date(Date.UTC(2026, 1, 27, 10, 0, index)).toISOString(),
    event: `E${index}`,
    route: "/api/dev/test",
    summary: `summary-${index}`,
  };
}

describe("audit log store", () => {
  beforeEach(() => {
    previousAuditPath = process.env.AUDIT_LOG_PATH;
    process.env.AUDIT_LOG_PATH = TEST_AUDIT_PATH;
    cleanup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    if (typeof previousAuditPath === "string") process.env.AUDIT_LOG_PATH = previousAuditPath;
    else delete process.env.AUDIT_LOG_PATH;
  });

  it("appends and lists latest-first with limit", () => {
    append({ event: "RETENTION_UPDATE", route: "/api/dev/maintenance/retention", summary: "updated" });
    vi.setSystemTime(new Date("2026-02-27T10:01:00.000Z"));
    append({ event: "RECOVERY_RESET", route: "/api/dev/recovery/reset", summary: "done" });

    const rows = list(10);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.event).toBe("RECOVERY_RESET");
    expect(rows[1]?.event).toBe("RETENTION_UPDATE");

    const one = list(1);
    expect(one).toHaveLength(1);
    expect(one[0]?.event).toBe("RECOVERY_RESET");
  });

  it("keeps at most 500 items", () => {
    writeAuditFixture(Array.from({ length: 519 }, (_, index) => makeAuditItem(index)));
    vi.setSystemTime(new Date("2026-02-27T10:08:39.000Z"));
    append({ event: "E519", route: "/api/dev/test", summary: "summary-519" });

    const rows = list(600);
    expect(rows).toHaveLength(500);
    expect(rows[0]?.event).toBe("E519");
    expect(rows[rows.length - 1]?.event).toBe("E20");
  });

  it("resets broken json file and continues append", () => {
    fs.mkdirSync(path.dirname(TEST_AUDIT_PATH), { recursive: true });
    fs.writeFileSync(TEST_AUDIT_PATH, "{ broken", "utf-8");

    append({ event: "DEV_UNLOCK", route: "/api/dev/unlock", summary: "ok" });

    const rows = list(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event).toBe("DEV_UNLOCK");

    const raw = JSON.parse(fs.readFileSync(TEST_AUDIT_PATH, "utf-8")) as unknown;
    expect(Array.isArray(raw)).toBe(true);
  });
});
