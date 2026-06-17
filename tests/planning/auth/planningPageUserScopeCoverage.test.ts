import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const PLANNING_PAGE_DIR = "src/app/planning";
const OPS_PAGE_DIR = "src/app/ops";
const PLANNING_WORKSPACE_PAGE_FILE = "src/app/planning/page.tsx";
const PLANNING_SNAPSHOT_LIST_FILE = "src/app/planning/_lib/snapshotList.ts";
const USER_SCOPED_IMPORT_MARKERS = [
  "@/lib/planning/server/profiles",
  "@/lib/planning/server/reports",
  "@/lib/planning/server/runs",
  "@/lib/planning/server/store/",
  "@/lib/planning/store/",
  "@/lib/planning/v3/",
];

const CURRENT_USER_REPOSITORY_IMPORT_PATH_PREFIXES = [
  "@/lib/planning/server/profiles",
  "@/lib/planning/server/reports",
  "@/lib/planning/server/runs",
] as const;

const CURRENT_USER_REPOSITORY_READ_PREFIXES = [
  "getCurrentUser",
  "listCurrentUser",
] as const;

const FORBIDDEN_V3_PAGE_STORE_IMPORT_MARKERS = [
  "@/lib/planning/v3/drafts/draftStore",
  "@/lib/planning/v3/store/",
];

const FORBIDDEN_PAGE_LOW_LEVEL_READ_IMPORT_MARKERS = [
  "@/lib/planning/server/reports/storage",
  "@/lib/planning/store/runStore",
];

const FORBIDDEN_PAGE_STORE_LAYER_IMPORT_MARKERS = [
  "@/lib/planning/server/store/",
  "@/lib/planning/store/types",
];

const REPORT_RUN_SCOPE_PAGE_FILES = [
  "src/app/planning/reports/page.tsx",
  "src/app/planning/reports/prototype/page.tsx",
];

const REPORT_RUN_SCOPE_LOADER_FILE = "src/lib/planning/reports/reportRunScopeLoader.ts";

const FORBIDDEN_REPORT_RUN_SCOPE_PAGE_STORE_IMPORT_MARKERS = [
  "@/lib/planning/server/store/profileStore",
  "@/lib/planning/server/store/runStore",
];

const OPS_PLANNING_PAGE_FILE = "src/app/ops/planning/page.tsx";

const OPS_PLANNING_USER_SCOPED_MARKERS = [
  "cacheStats(",
  "getCacheUsageStats(",
  "resolveProfilesDir(",
  "resolveRunsDir(",
  "checkPlanningIntegrity(",
] as const;

const OPS_PLANNING_SHARED_MARKERS = [
  "loadLatestAssumptionsSnapshot()",
  "countAssumptionsHistory()",
  "readLatestEvalReport()",
] as const;

const OPS_USER_SCOPED_IMPORT_MARKERS = [
  "@/lib/planning/server/store/",
  "@/lib/planning/security/vaultState",
  "@/lib/planning/cache/",
  "@/lib/planning/store/",
  "@/lib/planning/v3/",
] as const;

const SNAPSHOT_LIST_SHARED_IMPORTS = [
  "../../../lib/planning/assumptions/storage",
  "../../../lib/planning/assumptions/types",
  "node:fs/promises",
  "node:path",
] as const;

function findPlanningPageFiles(dir = PLANNING_PAGE_DIR): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findPlanningPageFiles(fullPath));
      continue;
    }
    if (entry.name === "page.tsx") {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function findOpsPageFiles(dir = OPS_PAGE_DIR): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findOpsPageFiles(fullPath));
      continue;
    }
    if (entry.name === "page.tsx") {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function hasUserScopedPlanningImport(source: string): boolean {
  return USER_SCOPED_IMPORT_MARKERS.some((marker) => source.includes(marker));
}

function hasOpsUserScopedImport(source: string): boolean {
  return OPS_USER_SCOPED_IMPORT_MARKERS.some((marker) => source.includes(marker));
}

function collectImportPaths(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    imports.push(statement.moduleSpecifier.text);
  }

  return imports.sort();
}

function findFunctionBodySource(filePath: string, functionName: string): string {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body = "";

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (statement.name?.text !== functionName) continue;
    body = statement.body?.getText(sourceFile) ?? "";
    break;
  }

  return body;
}

function findFunctionCallArgumentSource(filePath: string, functionName: string, callName: string): string {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let argumentSource = "";

  function visit(node: ts.Node, insideTargetFunction = false) {
    const nextInsideTargetFunction = insideTargetFunction
      || (ts.isFunctionDeclaration(node) && node.name?.text === functionName);

    if (
      nextInsideTargetFunction
      && ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === callName
      && node.arguments[0]
    ) {
      argumentSource = node.arguments[0].getText(sourceFile);
      return;
    }

    ts.forEachChild(node, (child) => visit(child, nextInsideTargetFunction));
  }

  visit(sourceFile);
  return argumentSource;
}

function isCurrentUserRepositoryReadName(name: string): boolean {
  return CURRENT_USER_REPOSITORY_READ_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isCurrentUserRepositoryImportPath(importPath: string): boolean {
  return CURRENT_USER_REPOSITORY_IMPORT_PATH_PREFIXES.some((prefix) => (
    importPath === prefix || importPath.startsWith(`${prefix}/`)
  ));
}

function collectCurrentUserRepositoryReadImports(sourceFile: ts.SourceFile): Set<string> {
  const imported = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isCurrentUserRepositoryImportPath(statement.moduleSpecifier.text)) continue;

    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;
    const namedBindings = importClause.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const localName = element.name.text;
      if (isCurrentUserRepositoryReadName(localName)) {
        imported.add(localName);
      }
    }
  }

  return imported;
}

function findCurrentUserRepositoryNamespaceOrDefaultImports(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isCurrentUserRepositoryImportPath(statement.moduleSpecifier.text)) continue;

    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;

    if (importClause.name) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(importClause.name.getStart(sourceFile));
      violations.push(`${filePath}:${line + 1}:${importClause.name.text}`);
    }

    const namedBindings = importClause.namedBindings;
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(namedBindings.name.getStart(sourceFile));
      violations.push(`${filePath}:${line + 1}:${namedBindings.name.text}`);
    }
  }

  return violations;
}

function isImportSpecifierIdentifier(node: ts.Identifier): boolean {
  return ts.isImportSpecifier(node.parent)
    || ts.isImportClause(node.parent)
    || ts.isNamespaceImport(node.parent);
}

function isTypeOnlyIdentifierReference(node: ts.Identifier): boolean {
  let current: ts.Node | undefined = node.parent;

  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isTypeQueryNode(current)
      || ts.isTypeReferenceNode(current)
      || ts.isImportTypeNode(current)
      || ts.isInterfaceDeclaration(current)
      || ts.isTypeAliasDeclaration(current)
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function isWithCurrentPlanningPageUserCallback(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  if (parent.arguments[0] !== node) return false;
  const expression = parent.expression;
  return ts.isIdentifier(expression) && expression.text === "withCurrentPlanningPageUser";
}

function isInsideCurrentPlanningPageUserCallback(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;

  while (current && !ts.isSourceFile(current)) {
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && isWithCurrentPlanningPageUserCallback(current)
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function findCurrentUserRepositoryReadsOutsidePageAuth(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const readNames = collectCurrentUserRepositoryReadImports(sourceFile);
  if (readNames.size < 1) return [];

  const violations: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isIdentifier(node)
      && readNames.has(node.text)
      && !isImportSpecifierIdentifier(node)
      && !isTypeOnlyIdentifierReference(node)
      && !isInsideCurrentPlanningPageUserCallback(node)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(`${filePath}:${line + 1}:${node.text}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe("planning page current-user scope coverage", () => {
  it("keeps server planning pages with user-scoped repositories or stores behind pageAuth", () => {
    const missing = findPlanningPageFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return hasUserScopedPlanningImport(source) && !source.includes("withCurrentPlanningPageUser(");
    });

    expect(missing).toEqual([]);
  });

  it("keeps current-user page repositories on named imports", () => {
    const violations = findPlanningPageFiles().flatMap(findCurrentUserRepositoryNamespaceOrDefaultImports);

    expect(violations).toEqual([]);
  });

  it("keeps current-user repository reads inside pageAuth callbacks", () => {
    const violations = findPlanningPageFiles().flatMap(findCurrentUserRepositoryReadsOutsidePageAuth);

    expect(violations).toEqual([]);
  });

  it("keeps /planning snapshot list as a shared assumptions read outside pageAuth", () => {
    const pageSource = fs.readFileSync(PLANNING_WORKSPACE_PAGE_FILE, "utf8");
    const snapshotSource = fs.readFileSync(PLANNING_SNAPSHOT_LIST_FILE, "utf8");
    const snapshotCallIndex = pageSource.indexOf("loadSnapshotListForPlanning(20)");
    const pageAuthIndex = pageSource.indexOf("withCurrentPlanningPageUser(");

    expect(snapshotCallIndex).toBeGreaterThanOrEqual(0);
    expect(pageAuthIndex).toBeGreaterThanOrEqual(0);
    expect(snapshotCallIndex).toBeLessThan(pageAuthIndex);
    expect(collectImportPaths(PLANNING_SNAPSHOT_LIST_FILE)).toEqual([...SNAPSHOT_LIST_SHARED_IMPORTS].sort());
    expect(snapshotSource).not.toContain("withCurrentPlanningPageUser(");
    expect(snapshotSource).not.toContain("getCurrentUser");
    expect(snapshotSource).not.toContain("listCurrentUser");
  });

  it("keeps planning v3 pages off direct store imports", () => {
    const directStorePages = findPlanningPageFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_V3_PAGE_STORE_IMPORT_MARKERS.some((marker) => source.includes(marker));
    });

    expect(directStorePages).toEqual([]);
  });

  it("keeps planning pages off low-level report and run readers", () => {
    const directReaderPages = findPlanningPageFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_PAGE_LOW_LEVEL_READ_IMPORT_MARKERS.some((marker) => source.includes(marker));
    });

    expect(directReaderPages).toEqual([]);
  });

  it("keeps planning pages off direct store layer imports", () => {
    const directStoreLayerPages = findPlanningPageFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_PAGE_STORE_LAYER_IMPORT_MARKERS.some((marker) => source.includes(marker));
    });

    expect(directStoreLayerPages).toEqual([]);
  });

  it("keeps report run scope pages behind current-user repositories", () => {
    const directStorePages = REPORT_RUN_SCOPE_PAGE_FILES.filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_REPORT_RUN_SCOPE_PAGE_STORE_IMPORT_MARKERS.some((marker) => source.includes(marker));
    });

    expect(directStorePages).toEqual([]);
  });

  it("keeps the report run scope loader inside pageAuth", () => {
    const source = fs.readFileSync(REPORT_RUN_SCOPE_LOADER_FILE, "utf8");

    expect(source).toContain("withCurrentPlanningPageUser(");
    expect(findCurrentUserRepositoryReadsOutsidePageAuth(REPORT_RUN_SCOPE_LOADER_FILE)).toEqual([]);
  });

  it("keeps the ops planning SSR user-owned summary behind pageAuth", () => {
    const source = fs.readFileSync(OPS_PLANNING_PAGE_FILE, "utf8");
    const userScopedLoaderSource = findFunctionBodySource(OPS_PLANNING_PAGE_FILE, "loadUserScopedOpsPlanningState");
    const userScopedCallbackSource = findFunctionCallArgumentSource(
      OPS_PLANNING_PAGE_FILE,
      "loadUserScopedOpsPlanningState",
      "withCurrentPlanningPageUser",
    );

    expect(source).toContain("withCurrentPlanningPageUser(");
    expect(source).toContain("loadUserScopedOpsPlanningState");
    expect(userScopedLoaderSource).toContain("withCurrentPlanningPageUser(");
    for (const marker of OPS_PLANNING_USER_SCOPED_MARKERS) {
      expect(source).toContain(marker);
      expect(userScopedCallbackSource).toContain(marker);
    }
    for (const marker of OPS_PLANNING_SHARED_MARKERS) {
      expect(source).toContain(marker);
      expect(userScopedLoaderSource).not.toContain(marker);
      expect(userScopedCallbackSource).not.toContain(marker);
    }
  });

  it("keeps ops server pages with user-owned planning storage behind pageAuth", () => {
    const missing = findOpsPageFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return hasOpsUserScopedImport(source) && !source.includes("withCurrentPlanningPageUser(");
    });

    expect(missing).toEqual([]);
  });
});
