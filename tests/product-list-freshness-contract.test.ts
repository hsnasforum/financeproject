import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("product list freshness timestamp contract", () => {
  it("prefers completed source status over the upstream snapshot timestamp", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "ProductListPage.tsx"),
      "utf-8",
    );

    expect(source).toContain(
      "const lastSyncedAt = finlifeSourceStatusRow?.lastSyncedAt ?? snapshotGeneratedAt ?? null;",
    );
  });
});
