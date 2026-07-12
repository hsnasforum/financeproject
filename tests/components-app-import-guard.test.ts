import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  findComponentsAppImportViolations,
} from "../scripts/components_app_import_guard.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guardScript = path.join(projectRoot, "scripts", "components_app_import_guard.mjs");
const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-components-app-guard-"));
  tempRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, source: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");
}

function runGuard(cwd: string) {
  return spawnSync(process.execPath, [guardScript], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("components app import guard", () => {
  it("allows shared dependencies and ignores comments or ordinary strings", () => {
    const root = makeRoot();
    write(root, "src/components/Safe.tsx", `
      import { helper } from "@/lib/helper";
      import { Button } from "@/components/Button";
      import React from "react";
      // import hidden from "@/app/comment";
      const text = "@/app/planning/string";
      track("@/app/planning/telemetry");
      export function Safe() { return <div>{text}{helper}{Button}{React}</div>; }
    `);
    write(root, "src/app/page.tsx", `import { Safe } from "@/components/Safe"; export default Safe;`);

    expect(findComponentsAppImportViolations({ cwd: root })).toEqual([]);
  });

  it("finds static, type-only, import type, and re-export dependencies", () => {
    const root = makeRoot();
    write(root, "src/components/Static.ts", `
      import value from "@/app/planning/value";
      import type { Shape } from "@/app/planning/types";
      type LazyShape = import("@/app/planning/lazy-types").Shape;
      export * from "@/app/planning/exported";
      export { named } from "@/app/planning/named";
      void value;
    `);

    expect(findComponentsAppImportViolations({ cwd: root }).map(({ kind, specifier }) => ({ kind, specifier }))).toEqual([
      { kind: "import", specifier: "@/app/planning/value" },
      { kind: "import-type", specifier: "@/app/planning/types" },
      { kind: "import-type", specifier: "@/app/planning/lazy-types" },
      { kind: "export", specifier: "@/app/planning/exported" },
      { kind: "export", specifier: "@/app/planning/named" },
    ]);
  });

  it("finds dynamic, relative, CommonJS, and createRequire dependencies", () => {
    const root = makeRoot();
    write(root, "src/components/nested/Dynamic.ts", `
      import { createRequire as makeRequire } from "node:module";
      import legacy = require("../../app/legacy");
      const localRequire = makeRequire(import.meta.url);
      void import("@/app/planning/dynamic");
      void import(\`@/app/planning/template\`);
      void import(\`@/app/planning/\${section}\`);
      require("../../app/planning/commonjs");
      module.require("@/app/planning/module-require");
      localRequire("@/app/planning/create-require");
      track("@/app/not-a-loader");
      void legacy;
    `);

    const violations = findComponentsAppImportViolations({ cwd: root });
    expect(violations.map((violation) => violation.kind)).toEqual([
      "import-equals",
      "dynamic-import",
      "dynamic-import",
      "dynamic-import",
      "require",
      "module-require",
      "create-require",
    ]);
    expect(violations.some((violation) => violation.specifier === "@/app/not-a-loader")).toBe(false);
    expect(violations.every((violation) => violation.target === "src/app" || violation.target.startsWith("src/app/"))).toBe(true);
  });

  it("checks loader targets even when import options or extra arguments are present", () => {
    const root = makeRoot();
    write(root, "src/components/LoaderOptions.ts", `
      void import("@/app/planning/options", { with: { type: "json" } });
      require("@/app/planning/extra", "ignored");
    `);

    expect(findComponentsAppImportViolations({ cwd: root }).map(({ kind, specifier }) => ({ kind, specifier }))).toEqual([
      { kind: "dynamic-import", specifier: "@/app/planning/options" },
      { kind: "require", specifier: "@/app/planning/extra" },
    ]);
  });

  it("keeps the current production component tree free of app imports", () => {
    expect(findComponentsAppImportViolations({ cwd: projectRoot })).toEqual([]);
  });

  it("exposes a deterministic CLI success and failure contract", () => {
    const root = makeRoot();
    write(root, "src/components/Safe.ts", `import { ok } from "@/lib/ok"; void ok;`);
    const clean = runGuard(root);
    expect(clean.status, clean.stderr).toBe(0);
    expect(clean.stdout).toContain("[components:app-import:guard] PASS scanned=1");

    write(root, "src/components/Unsafe.ts", `import value from "@/app/planning/private"; void value;`);
    const unsafe = runGuard(root);
    expect(unsafe.status).toBe(1);
    expect(unsafe.stderr).toContain("src/components/Unsafe.ts:1:1");
    expect(unsafe.stderr).toContain("@/app/planning/private -> src/app/planning/private");
  });

  it("keeps the package command and required CI step connected", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const workflow = fs.readFileSync(path.join(projectRoot, ".github", "workflows", "ci.yml"), "utf8");

    expect(packageJson.scripts?.["components:app-import:guard"]).toBe("node scripts/components_app_import_guard.mjs");
    expect(workflow).toContain("pnpm components:app-import:guard");
  });
});
