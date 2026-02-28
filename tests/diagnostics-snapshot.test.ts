import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiagnosticsSnapshot } from "../src/lib/diagnostics/snapshot";

const TEST_ROOT = path.join(process.cwd(), "tmp", "diagnostics-snapshot.test");

function cleanup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

describe("diagnostics snapshot", () => {
  afterEach(() => {
    cleanup();
  });

  it("includes required fields", () => {
    const dartDir = path.join(TEST_ROOT, "tmp", "dart");
    fs.mkdirSync(dartDir, { recursive: true });
    fs.writeFileSync(path.join(dartDir, "daily_brief.json"), JSON.stringify({ ok: true }), "utf-8");

    const request = new Request("http://localhost:3000/api/diagnostics/snapshot?token=abc", {
      headers: {
        "user-agent": "vitest-agent",
      },
    });

    const snapshot = buildDiagnosticsSnapshot({
      req: request,
      cwd: TEST_ROOT,
      pageInfo: {
        url: "http://localhost:3000/feedback?query=secret",
        localStateSummary: {
          planner_last_snapshot_v1: { exists: true, savedAt: "2026-02-27T06:00:00.000Z" },
        },
      },
      recentErrors: [
        {
          time: "2026-02-27T06:01:00.000Z",
          traceId: "trace-1",
          route: "/api/feedback?debug=1",
          source: "feedback",
          code: "TEST",
          message: "sample message",
          status: 400,
          elapsedMs: 17,
        },
      ],
    });

    expect(typeof snapshot.generatedAt).toBe("string");
    expect(snapshot.page.url).toBe("http://localhost:3000/feedback");
    expect(snapshot.page.userAgent).toBe("vitest-agent");
    expect(Array.isArray(snapshot.recentErrors)).toBe(true);
    expect(snapshot.recentErrors[0]?.route).toBe("/api/feedback");
    expect(snapshot.dartArtifacts.dirExists).toBe(true);
    expect(snapshot.dartArtifacts.items.length).toBeGreaterThan(0);
    expect(snapshot.localStateSummary?.planner_last_snapshot_v1?.exists).toBe(true);
  });

  it("redacts sensitive token-like strings", () => {
    const request = new Request("http://localhost:3000/api/diagnostics/snapshot?OPENDART_API_KEY=abcd", {
      headers: {
        "x-page-url": "http://localhost:3000/feedback?SERVICE_KEY=abc123",
      },
    });

    const snapshot = buildDiagnosticsSnapshot({
      req: request,
      cwd: TEST_ROOT,
      recentErrors: [
        {
          time: "2026-02-27T06:02:00.000Z",
          traceId: "trace-2",
          route: "/api/test?token=abcd",
          source: "feedback",
          code: "TEST",
          message: "OPENDART_API_KEY=abcd TOKEN=xyz",
          status: 500,
          elapsedMs: 10,
        },
      ],
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized.includes("OPENDART_API_KEY")).toBe(false);
    expect(serialized.includes("SERVICE_KEY")).toBe(false);
    expect(serialized.includes("TOKEN=")).toBe(false);
  });

  it("returns dailyRefresh as null when daily_refresh_result.json is missing", () => {
    const request = new Request("http://localhost:3000/api/diagnostics/snapshot");
    const snapshot = buildDiagnosticsSnapshot({
      req: request,
      cwd: TEST_ROOT,
      recentErrors: [],
    });
    expect(snapshot.dailyRefresh).toBeNull();
  });
});
