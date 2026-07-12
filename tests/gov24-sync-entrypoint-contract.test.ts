import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedFixId } from "../src/lib/dev/fixCatalog";
import { isOpsActionId } from "../src/lib/ops/actions/types";

describe("Gov24 sync entrypoint contract", () => {
  it("keeps public UI and the HTTP tombstone disconnected from the sync runner", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/gov24/sync/route.ts"),
      "utf8",
    );
    const clientSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/Gov24Client.tsx"),
      "utf8",
    );

    expect(routeSource).not.toContain("runGov24SnapshotSync");
    expect(routeSource).not.toContain("runGov24SyncOnce");
    expect(clientSource).not.toContain("/api/gov24/sync");
    expect(clientSource).not.toContain("수동 갱신");
  });

  it("removes Gov24 and daily refresh from indirect HTTP command catalogs", () => {
    expect(isAllowedFixId("GOV24_SYNC_IF_STALE")).toBe(false);
    expect(isAllowedFixId("DAILY_REFRESH")).toBe(false);
    expect(isOpsActionId("GOV24_SYNC_IF_STALE")).toBe(false);
    expect(isOpsActionId("DAILY_REFRESH")).toBe(false);
  });

  it("keeps the local-ops CLI and operating guide as the canonical entrypoint", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const guide = fs.readFileSync(path.join(process.cwd(), "docs/gov24-sync.md"), "utf8");

    expect(packageJson.scripts?.["gov24:sync"]).toBeTruthy();
    expect(packageJson.scripts?.["gov24:sync:if-stale"]).toBeTruthy();
    expect(guide).toContain("pnpm gov24:sync");
    expect(guide).toContain("OPERATOR_COMMAND_REQUIRED");
  });
});
