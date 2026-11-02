import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const GUARD_SCRIPT = path.join(process.cwd(), "scripts", "planning_ssot_guard.mjs");
const roots: string[] = [];

function makeRoot(files: Record<string, string | Buffer>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-ssot-guard-"));
  roots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return root;
}

function runGuard(cwd: string) {
  // No PATH at all, so the guard cannot depend on an rg binary.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"),
  ) as NodeJS.ProcessEnv;
  return spawnSync(process.execPath, [GUARD_SCRIPT], { cwd, env, encoding: "utf8" });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("planning_ssot_guard", () => {
  it("passes when the patterns only appear in excluded, hidden or binary files", () => {
    const root = makeRoot({
      "src/lib/planning/calc/rounding.ts": [
        'import { a } from "../../core/v2/debt/calc";',
        'import { b } from "@/lib/finlife/calculators";',
        "export const c = Math.round(a + b);",
      ].join("\n"),
      "src/lib/planning/v2/debt/coreCalc.ts": 'export * from "../../core/v2/debt/calc";\n',
      "src/lib/planning/reports/reportViewModel.ts": "export const d = Math.floor(1.5);\n",
      "src/lib/planning/.cache/generated.ts": "export const e = Math.round(2.5);\n",
      "src/lib/planning/blob.bin": Buffer.from("\0Math.round(3.5)\n"),
      "src/app/page.tsx": "export const f = Math.round(4.5);\n",
    });

    const result = runGuard(root);

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("[planning:ssot:check] PASS\n");
    expect(result.status).toBe(0);
  });

  it("reports each rule's violations outside its own exceptions as path:line:content", () => {
    const root = makeRoot({
      "src/app/debt.ts": 'import { x } from "@/lib/planning/core/v2/debt/calc";\n',
      "src/lib/planning/v2/debt/coreCalc.ts": [
        'export * from "../../core/v2/debt/calc";',
        'export { y } from "@/lib/finlife/calculators";',
      ].join("\n"),
      "src/lib/planning/calcx/notCalc.ts": "export const z = Math.round(1.5);\n",
      "src/lib/planning/reports/summary.ts": "export const a = 1;\r\nexport const b = Math.floor(2.5);\r\n",
    });

    const result = runGuard(root);

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        "[planning:ssot:check] FAIL violations=3",
        "",
        "[planning:ssot:check] core/v2/debt/calc 직접 import 금지 (calc 외부)",
        'src/app/debt.ts:1:import { x } from "@/lib/planning/core/v2/debt/calc";',
        "",
        "[planning:ssot:check] lib/finlife/calculators 직접 import 금지 (calc 외부)",
        'src/lib/planning/v2/debt/coreCalc.ts:2:export { y } from "@/lib/finlife/calculators";',
        "",
        "[planning:ssot:check] src/lib/planning/** 에서 Math.round/Math.floor 직접 사용 금지 (baseline 예외 외부)",
        "src/lib/planning/calcx/notCalc.ts:1:export const z = Math.round(1.5);",
        "src/lib/planning/reports/summary.ts:2:export const b = Math.floor(2.5);",
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(1);
  });

  it("fails closed when a scanned root is missing", () => {
    const root = makeRoot({ "src/app/page.tsx": "export const a = 1;\n" });

    const result = runGuard(root);

    expect(result.stderr).toContain(
      "[planning:ssot:check] FAIL\n스캔 실패 (src/lib/planning/** 에서 Math.round/Math.floor 직접 사용 금지 (baseline 예외 외부)): ENOENT",
    );
    expect(result.status).toBe(1);
  });
});
