import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function toRepoPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function walkFiles(relativeDir: string): string[] {
  const dir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(dir)) return [];

  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(toRepoPath(entryPath)));
      continue;
    }
    if (entry.isFile()) out.push(entryPath);
  }
  return out;
}

describe("planning v3 canonical source layout", () => {
  it("keeps src/lib/planning/v3 independent from root planning/v3 implementation files", () => {
    const rootRelativeImport = /from\s+["'](?:\.\.\/)+planning\/v3\/|export\s+\*\s+from\s+["'](?:\.\.\/)+planning\/v3\//;
    const offenders = walkFiles("src/lib/planning/v3")
      .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
      .filter((filePath) => rootRelativeImport.test(readText(toRepoPath(filePath))))
      .map(toRepoPath)
      .sort();

    expect(offenders).toEqual([]);
  });

  it("keeps root planning/v3 TypeScript files as compatibility entrypoints to canonical src modules", () => {
    const rootFiles = walkFiles("planning/v3")
      .filter((filePath) => filePath.endsWith(".ts"))
      .filter((filePath) => !filePath.endsWith(".test.ts"));

    const offenders = rootFiles
      .filter((filePath) => !readText(toRepoPath(filePath)).includes("@/lib/planning/v3/"))
      .map(toRepoPath)
      .sort();

    expect(offenders).toEqual([]);
  });

  it("runs v3 package commands from the canonical src tree", () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>("package.json");
    const requiredCommands = [
      "v3:doctor",
      "v3:refresh-all",
      "v3:trim",
      "v3:export",
      "v3:support-bundle",
      "v3:restore",
      "v3:migrate",
      "v3:report:weekly",
    ];

    const rootScriptCommandPattern = /(?:^|\s)planning\/v3\//;
    const rootScriptCommands = Object.entries(packageJson.scripts)
      .filter(([name]) => name.startsWith("v3:"))
      .filter(([, command]) => rootScriptCommandPattern.test(command))
      .map(([name, command]) => `${name}=${command}`)
      .sort();

    expect(rootScriptCommands).toEqual([]);
    for (const commandName of requiredCommands) {
      expect(packageJson.scripts[commandName]).toContain("src/lib/planning/v3/");
    }
  });

  it("has a dedicated planning v3 typecheck package scope", () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>("package.json");
    const tsconfig = readJson<{ include?: string[] }>("tsconfig.planning-v3.json");

    expect(packageJson.scripts["typecheck:planning:v3"]).toBe("tsc --noEmit -p tsconfig.planning-v3.json");
    expect(tsconfig.include).toEqual(expect.arrayContaining([
      "src/lib/planning/v3/**/*.ts",
      "src/app/planning/v3/**/*.ts",
      "src/app/api/planning/v3/**/*.ts",
      "planning/v3/**/*.ts",
    ]));
  });

  it("makes the desktop builder inventory v3 CLI entrypoints copied into artifacts", () => {
    const buildScript = readText("scripts/planning_v2_desktop_build.mjs");
    const expectedEntrypoints = [
      "src/lib/planning/v3/ops/doctor.ts",
      "src/lib/planning/v3/ops/refreshAll.ts",
      "src/lib/planning/v3/ops/export.ts",
      "src/lib/planning/v3/ops/restore.ts",
      "src/lib/planning/v3/report/weeklyHtml.ts",
      "tsconfig.planning-v3.json",
    ];

    for (const entrypoint of expectedEntrypoints) {
      expect(buildScript).toContain(entrypoint);
    }
  });
});
