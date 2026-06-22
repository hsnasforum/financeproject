import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSchemaFingerprint } from "../src/lib/dataQuality/schemaFingerprint";

const tmpDir = path.join(process.cwd(), "tmp", "test-schema-drift-report-script");
const scriptPath = path.join(process.cwd(), "scripts", "schema_drift_report.mjs");

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("schema_drift_report script", () => {
  it("allows current snapshots to narrow a baseline union type", () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir, ".data"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });

    const baselineSnapshot = createSchemaFingerprint({
      items: [
        { raw: { crdt_grad_5: null } },
        { raw: { crdt_grad_5: 6.58 } },
      ],
    }, { maxDepth: 8, arraySampleSize: 3 });
    fs.writeFileSync(path.join(tmpDir, "docs", "schema-baselines.json"), `${JSON.stringify({
      version: 1,
      generatedAt: "2026-06-23T00:00:00.000Z",
      fingerprint: {
        maxDepth: 8,
        arraySampleSize: 3,
        ignorePaths: [],
      },
      snapshots: {
        "finlife_credit-loan_snapshot.json": baselineSnapshot,
      },
    }, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(tmpDir, ".data", "finlife_credit-loan_snapshot.json"), JSON.stringify({
      items: [
        { raw: { crdt_grad_5: 6.58 } },
      ],
    }), "utf8");

    const output = execFileSync("node", [scriptPath], {
      cwd: tmpDir,
      encoding: "utf8",
    });
    const report = fs.readFileSync(path.join(tmpDir, "docs", "schema-drift-report.md"), "utf8");

    expect(output).toContain("breaking=0 nonBreaking=1");
    expect(report).toContain("| finlife_credit-loan_snapshot.json | 0 | 1 |");
    expect(report).toContain("`type_changed` `$.items[].raw.crdt_grad_5` (null|number -> number)");
  });
});
