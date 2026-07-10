import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { findLegacyPlannerBoundaryViolations } from "../scripts/planner_deprecated_guard.mjs";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planner-deprecated-guard-"));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, source: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");
}

function seedAllowedBoundary(root: string): void {
  write(root, "src/lib/planner/legacyPlanModel.ts", "export const legacy = true;\n");
  write(
    root,
    "src/lib/planner/plan.ts",
    'import { legacy } from "@/lib/planner/legacyPlanModel";\nexport { legacy };\n',
  );
  write(
    root,
    "src/lib/planner/insuranceMetrics.ts",
    'import { legacy } from "./legacyPlanModel";\nexport { legacy };\n',
  );
  write(
    root,
    "src/lib/planner/retirementMetrics.ts",
    'import { legacy } from "./legacyPlanModel";\nexport { legacy };\n',
  );
  write(root, "src/lib/planner/compute.ts", "export const compute = true;\n");
  write(root, "src/lib/planner/types.ts", "export type Input = {};\n");
  write(
    root,
    "src/app/api/planner/compute/route.ts",
    [
      'import { compute } from "@/lib/planner/compute";',
      'import type { Input } from "@/lib/planner/types";',
      "export const value: Input = {};",
      "export { compute };",
      "",
    ].join("\n"),
  );
  write(root, "src/components/PlannerWizard.tsx", "export const PlannerWizard = () => null;\n");
  write(
    root,
    "src/components/PlannerClient.tsx",
    'import { PlannerWizard } from "@/components/PlannerWizard";\nexport { PlannerWizard };\n',
  );
  write(root, "src/components/ReportClient.tsx", "export const ReportClient = () => null;\n");
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("planner deprecated guard", () => {
  it("accepts the current compatibility boundary", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);

    expect(findLegacyPlannerBoundaryViolations({ cwd: root })).toEqual([]);
  });

  it("runs the package-script entrypoint against the same boundary", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    const scriptPath = path.join(process.cwd(), "scripts/planner_deprecated_guard.mjs");

    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: "utf8",
    });

    expect(output).toContain("legacy planner compatibility boundary intact");
  });

  it("rejects a new legacyPlanModel production consumer", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    write(
      root,
      "src/lib/newPlannerPolicy.ts",
      'export { legacy } from "@/lib/planner/legacyPlanModel";\n',
    );

    expect(findLegacyPlannerBoundaryViolations({ cwd: root })).toContainEqual(
      expect.objectContaining({
        code: "legacy-model-importer",
        file: "src/lib/newPlannerPolicy.ts",
      }),
    );
  });

  it("rejects a new source import from outside the legacy planner tree", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    write(
      root,
      "src/app/planning/page.tsx",
      'import { legacy } from "@/lib/planner/plan";\nexport default function Page() { return legacy; }\n',
    );

    expect(findLegacyPlannerBoundaryViolations({ cwd: root })).toContainEqual(
      expect.objectContaining({
        code: "external-planner-importer",
        file: "src/app/planning/page.tsx",
        target: "src/lib/planner/plan",
      }),
    );
  });

  it("rejects an intermediate wrapper before App Router can reconnect it", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    write(
      root,
      "src/lib/planning/legacyPlannerAdapter.ts",
      'export { compute } from "@/lib/planner/compute";\n',
    );
    write(
      root,
      "src/app/planning/page.tsx",
      'export { compute as default } from "@/lib/planning/legacyPlannerAdapter";\n',
    );

    expect(findLegacyPlannerBoundaryViolations({ cwd: root })).toContainEqual(
      expect.objectContaining({
        code: "external-planner-importer",
        file: "src/lib/planning/legacyPlannerAdapter.ts",
        target: "src/lib/planner/compute",
      }),
    );
  });

  it("rejects a static boundary specifier passed through a require alias", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    write(
      root,
      "src/lib/planning/legacyLoader.ts",
      [
        'import { createRequire } from "node:module";',
        "const load = createRequire(import.meta.url);",
        'export const planner = load("@/lib/planner/plan");',
        "",
      ].join("\n"),
    );

    expect(findLegacyPlannerBoundaryViolations({ cwd: root })).toContainEqual(
      expect.objectContaining({
        code: "external-planner-importer",
        file: "src/lib/planning/legacyLoader.ts",
        target: "src/lib/planner/plan",
      }),
    );
  });

  it("rejects reactivation of a parked legacy UI entry", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    write(
      root,
      "src/components/LegacyPlannerWrapper.tsx",
      'export { PlannerClient } from "@/components/PlannerClient";\n',
    );

    expect(findLegacyPlannerBoundaryViolations({ cwd: root })).toContainEqual(
      expect.objectContaining({
        code: "parked-ui-importer",
        file: "src/components/LegacyPlannerWrapper.tsx",
        target: "src/components/PlannerClient",
      }),
    );
  });

  it("preserves removed-file and removed-import protection", () => {
    const root = makeRoot();
    seedAllowedBoundary(root);
    write(root, "src/lib/planner/core.ts", "export const restored = true;\n");
    write(
      root,
      "tests/restored-planner-core.test.ts",
      'import { restored } from "../src/lib/planner/core";\nvoid restored;\n',
    );
    write(
      root,
      "tests/restored-planner-rules.test.ts",
      'import "../src/lib/planner/rules/helpers";\n',
    );

    const violations = findLegacyPlannerBoundaryViolations({ cwd: root });
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "removed-file-restored", file: "src/lib/planner/core.ts" }),
        expect.objectContaining({ code: "removed-module-import", file: "tests/restored-planner-core.test.ts" }),
        expect.objectContaining({ code: "removed-module-import", file: "tests/restored-planner-rules.test.ts" }),
      ]),
    );
  });
});
