import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

function findRouteFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
      continue;
    }
    if (entry.name === "route.ts") {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function findAppApiRouteFiles(): string[] {
  return findRouteFiles("src/app/api");
}

function findPlanningRouteFiles(dir = "src/app/api/planning"): string[] {
  return findRouteFiles(dir);
}

function findOpsRouteFiles(dir = "src/app/api/ops"): string[] {
  return findRouteFiles(dir);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRepoPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function resolveRouteImportPath(importerPath: string, importPath: string) {
  if (!importPath.startsWith(".")) return null;
  const resolved = path.normalize(path.join(path.dirname(importerPath), `${importPath}.ts`));
  return normalizeRepoPath(resolved);
}

function collectVariableInitializers(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const initializers = new Map<string, ts.Expression>();

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, node.initializer);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return initializers;
}

function findProxyDelegateTargets(filePath: string) {
  const source = fs.readFileSync(filePath, "utf8");
  const targets: string[] = [];
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*"([^"]+)";/g;

  for (const match of source.matchAll(importPattern)) {
    const [, specifierList, importPath] = match;
    const targetPath = resolveRouteImportPath(filePath, importPath);
    if (!targetPath) continue;

    for (const specifier of specifierList.split(",")) {
      const trimmed = specifier.trim();
      if (!trimmed) continue;
      const localName = trimmed.includes(" as ") ? trimmed.split(/\s+as\s+/).at(-1)?.trim() : trimmed;
      if (!localName) continue;

      const delegateCallPattern = new RegExp(`return\\s+${escapeRegExp(localName)}\\(request(?:,|\\))`);
      if (delegateCallPattern.test(source)) {
        targets.push(targetPath);
      }
    }
  }

  return [...new Set(targets)].sort();
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function objectLiteralHasProperty(node: ts.ObjectLiteralExpression, propertyName: string): boolean {
  return node.properties.some((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return property.name.text === propertyName;
    if (!ts.isPropertyAssignment(property)) return false;
    return propertyNameText(property.name) === propertyName;
  });
}

function findObjectLiteralProperty(
  node: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | ts.ShorthandPropertyAssignment | null {
  for (const property of node.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName) return property;
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === propertyName) return property;
  }
  return null;
}

function objectLiteralHasOkTrue(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    return propertyNameText(property.name) === "ok" && property.initializer.kind === ts.SyntaxKind.TrueKeyword;
  });
}

function collectImportedHelperNames(
  sourceFile: ts.SourceFile,
  importedName: string,
  modulePathFragments: readonly string[],
): Set<string> {
  const names = new Set<string>();

  sourceFile.statements.forEach((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return;
    const modulePath = statement.moduleSpecifier.text;
    if (!modulePathFragments.some((fragment) => modulePath.includes(fragment))) return;

    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) return;

    namedBindings.elements.forEach((specifier) => {
      const sourceName = specifier.propertyName
        ? propertyNameText(specifier.propertyName)
        : specifier.name.text;
      if (sourceName === importedName) names.add(specifier.name.text);
    });
  });

  return names;
}

const CURRENT_USER_REPOSITORY_IMPORT_PATH_FRAGMENTS = [
  "/planning/server/profiles/repository",
  "/planning/server/runs/repository",
] as const;

function isCurrentUserRepositoryImportPath(importPath: string): boolean {
  return CURRENT_USER_REPOSITORY_IMPORT_PATH_FRAGMENTS.some((fragment) => importPath.includes(fragment));
}

function findNonCurrentUserRepositoryImports(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isCurrentUserRepositoryImportPath(statement.moduleSpecifier.text)) continue;

    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;

    if (importClause.name) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(importClause.name.getStart(sourceFile));
      violations.push(`${filePath}:${line + 1}:${importClause.name.text}`);
    }

    const namedBindings = importClause.namedBindings;
    if (!namedBindings) continue;

    if (ts.isNamespaceImport(namedBindings)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(namedBindings.name.getStart(sourceFile));
      violations.push(`${filePath}:${line + 1}:${namedBindings.name.text}`);
      continue;
    }

    for (const specifier of namedBindings.elements) {
      if (specifier.isTypeOnly) continue;
      const importedName = specifier.propertyName
        ? propertyNameText(specifier.propertyName)
        : specifier.name.text;
      if (importedName?.includes("CurrentUser")) continue;

      const { line } = sourceFile.getLineAndCharacterOfPosition(specifier.name.getStart(sourceFile));
      violations.push(`${filePath}:${line + 1}:${importedName ?? specifier.name.text}`);
    }
  }

  return violations;
}

function isJsonResponseCall(node: ts.CallExpression): boolean {
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== "json") return false;
  const receiver = expression.expression;
  return ts.isIdentifier(receiver) && (receiver.text === "NextResponse" || receiver.text === "Response");
}

function findDirectSuccessJsonWithoutUserMeta(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isJsonResponseCall(node)) {
      const [body] = node.arguments;
      if (body && ts.isObjectLiteralExpression(body) && objectLiteralHasOkTrue(body) && !objectLiteralHasProperty(body, "meta")) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile));
        missing.push(`${filePath}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return missing;
}

const ROUTE_USER_META_HELPER_NAMES = new Set([
  "planningUserMeta",
  "securityUserMeta",
  "assumptionsUserMeta",
  "doctorRouteMeta",
]);

function expressionHasPlanningUserMetaCall(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    const expression = node.expression;
    if (ts.isIdentifier(expression) && ROUTE_USER_META_HELPER_NAMES.has(expression.text)) return true;
  }

  return node.getChildren().some((child) => expressionHasPlanningUserMetaCall(child));
}

function collectPlanningUserMetaIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const initializers = collectVariableInitializers(sourceFile);
  const identifiers = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, initializer] of initializers) {
      if (
        !identifiers.has(name)
        && (
          expressionHasPlanningUserMetaCall(initializer)
          || isPlanningUserMetaExpression(initializer, identifiers)
        )
      ) {
        identifiers.add(name);
        changed = true;
      }
    }
  }

  return identifiers;
}

function isPlanningUserMetaExpression(
  expression: ts.Expression,
  planningUserMetaIdentifiers: Set<string>,
): boolean {
  if (ts.isIdentifier(expression)) return planningUserMetaIdentifiers.has(expression.text);
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
    return isPlanningUserMetaExpression(expression.expression, planningUserMetaIdentifiers);
  }
  if (ts.isCallExpression(expression)) {
    return ts.isIdentifier(expression.expression) && ROUTE_USER_META_HELPER_NAMES.has(expression.expression.text);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.some((property) =>
      ts.isSpreadAssignment(property)
      && isPlanningUserMetaExpression(property.expression, planningUserMetaIdentifiers),
    );
  }
  return false;
}

function metaPropertyHasPlanningUserMeta(
  expression: ts.Expression,
  planningUserMetaIdentifiers: Set<string>,
  variableInitializers: Map<string, ts.Expression>,
  seen = new Set<string>(),
): boolean {
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return false;
    const initializer = variableInitializers.get(expression.text);
    if (!initializer) return isPlanningUserMetaExpression(expression, planningUserMetaIdentifiers);
    return metaPropertyHasPlanningUserMeta(
      initializer,
      planningUserMetaIdentifiers,
      variableInitializers,
      new Set([...seen, expression.text]),
    );
  }

  if (!ts.isObjectLiteralExpression(expression)) {
    return isPlanningUserMetaExpression(expression, planningUserMetaIdentifiers);
  }

  const metaProperty = findObjectLiteralProperty(expression, "meta");
  if (!metaProperty) return false;
  const metaExpression = ts.isPropertyAssignment(metaProperty)
    ? metaProperty.initializer
    : metaProperty.name;
  return isPlanningUserMetaExpression(metaExpression, planningUserMetaIdentifiers);
}

function jsonOkCallHasPlanningUserMeta(
  node: ts.CallExpression,
  planningUserMetaIdentifiers: Set<string>,
  variableInitializers: Map<string, ts.Expression>,
): boolean {
  const [dataArgument, optionsArgument] = node.arguments;
  if (!dataArgument) return false;
  if (metaPropertyHasPlanningUserMeta(dataArgument, planningUserMetaIdentifiers, variableInitializers)) return true;
  if (!optionsArgument) return false;
  return metaPropertyHasPlanningUserMeta(optionsArgument, planningUserMetaIdentifiers, variableInitializers);
}

function okCallHasPlanningUserMeta(
  node: ts.CallExpression,
  planningUserMetaIdentifiers: Set<string>,
): boolean {
  const metaArgument = node.arguments[1];
  return Boolean(metaArgument) && isPlanningUserMetaExpression(metaArgument, planningUserMetaIdentifiers);
}

function findDirectSuccessJsonWithNonUserMetaInSource(filePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const planningUserMetaIdentifiers = collectPlanningUserMetaIdentifiers(sourceFile);
  const invalid: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isJsonResponseCall(node)) {
      const [body] = node.arguments;
      if (body && ts.isObjectLiteralExpression(body) && objectLiteralHasOkTrue(body)) {
        const metaProperty = findObjectLiteralProperty(body, "meta");
        if (metaProperty) {
          const metaExpression = ts.isPropertyAssignment(metaProperty)
            ? metaProperty.initializer
            : metaProperty.name;
          if (!isPlanningUserMetaExpression(metaExpression, planningUserMetaIdentifiers)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(metaProperty.getStart(sourceFile));
            invalid.push(`${filePath}:${line + 1}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return invalid;
}

function findDirectSuccessJsonWithNonUserMeta(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  return findDirectSuccessJsonWithNonUserMetaInSource(filePath, source);
}

function findResponseHelperSuccessJsonWithNonUserMetaInSource(filePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const variableInitializers = collectVariableInitializers(sourceFile);
  const planningUserMetaIdentifiers = collectPlanningUserMetaIdentifiers(sourceFile);
  const jsonOkNames = collectImportedHelperNames(sourceFile, "jsonOk", [
    "/http/apiResponse",
    "/planning/api/response",
  ]);
  const okNames = collectImportedHelperNames(sourceFile, "ok", [
    "/planning/core/v2/apiResponse",
  ]);
  const invalid: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (
        jsonOkNames.has(node.expression.text)
        && !jsonOkCallHasPlanningUserMeta(node, planningUserMetaIdentifiers, variableInitializers)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        invalid.push(`${filePath}:${line + 1}`);
      }
      if (okNames.has(node.expression.text) && !okCallHasPlanningUserMeta(node, planningUserMetaIdentifiers)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        invalid.push(`${filePath}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return invalid;
}

function findResponseHelperSuccessJsonWithNonUserMeta(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  return findResponseHelperSuccessJsonWithNonUserMetaInSource(filePath, source);
}

const ROUTE_AUTH_HELPERS = [
  "withPlanningRouteUser(",
  "requirePlanningRouteUser(",
] as const;

const ROUTE_AUTH_RESPONSE_GUARD_PATTERN = "if (!isPlanningRouteUser(currentUser)) return currentUser";

const EXPECTED_PLANNING_ROUTE_COUNT = 95;

const ROUTE_AUTH_IMPORT_PATH = "/planning/api/routeAuth";

const PLANNING_ADJACENT_AUTH_ROUTE_FILES = [
  "src/app/api/planner/compute/route.ts",
  "src/app/api/recommend/route.ts",
] as const;

function findPlanningAuthBoundaryRouteFiles(): string[] {
  return [...findPlanningRouteFiles(), ...PLANNING_ADJACENT_AUTH_ROUTE_FILES].sort();
}

const USER_META_HELPER = "planningUserMeta(";

const SUCCESS_RESPONSE_PATTERNS = [
  "jsonOk(",
  "ok(",
  "NextResponse.json(",
  "Response.json(",
  "jsonResponseWithOptionalGzip(",
] as const;

const USER_META_PROXY_EXCEPTIONS = new Set([
  "src/app/api/planning/run/[id]/route.ts",
  "src/app/api/planning/run/route.ts",
  "src/app/api/planning/runs/[id]/action-plan/route.ts",
  "src/app/api/planning/runs/[id]/action-progress/route.ts",
  "src/app/api/planning/runs/[id]/blob/[name]/route.ts",
  "src/app/api/planning/runs/[id]/route.ts",
  "src/app/api/planning/v2/run/route.ts",
]);

const USER_META_RAW_RESPONSE_EXCEPTIONS = new Set([
  "src/app/api/planning/v2/reports/[id]/download/route.ts",
]);

const USER_META_JSON_EXCEPTIONS = new Set([
  ...USER_META_PROXY_EXCEPTIONS,
  ...USER_META_RAW_RESPONSE_EXCEPTIONS,
]);

const PROXY_IMPORT_PATTERNS = [
  " from \"../v2/",
  " from \"../../v2/",
  " from \"../../../v2/",
  " from \"../../../../v2/",
  " from \"../runs/route\"",
] as const;

const PROXY_DELEGATE_CALL_PATTERN = /return\s+\w+\(request(?:,|\))/;

const RAW_SUCCESS_RESPONSE_PATTERNS = [
  "return new Response(",
] as const;

const RAW_RESPONSE_GUARD_PATTERNS = [
  "withPlanningRouteUser(request",
  "getCurrentUserReport(",
  "\"content-type\": \"text/markdown; charset=utf-8\"",
  "\"content-disposition\": `attachment;",
  "\"cache-control\": \"no-store\"",
] as const;

const FORBIDDEN_ROUTE_AUTH_BYPASS_PATTERNS = [
  "withCurrentPlanningUser(",
  "requireCurrentPlanningUser(",
  "runWithPlanningUserScope(",
  "enterPlanningUserScope(",
  "resolvePlanningUserId(",
  "/planning/auth/currentUser",
  "/planning/store/userScope",
  "/planning/store/namespace",
  "../auth/currentUser",
  "../store/userScope",
  "../store/namespace",
  "userId: currentUser.id",
  "authSource: currentUser.source",
] as const;

const ROUTE_AUTH_FAILURE_RETURN_PATTERN = /if\s*\(authError\)\s+return\s+(?:\w+\()?authError\)?;/u;
const ROUTE_AUTH_FAILURE_WRAPPED_RETURN_PATTERN = /if\s*\(authError\)\s+return\s+(\w+)\(authError\);/gu;

function hasRouteAuthFailureBridge(source: string): boolean {
  return source.includes("planningAuthErrorResponse")
    && source.includes("toAuthErrorResponse(error)")
    && ROUTE_AUTH_FAILURE_RETURN_PATTERN.test(source);
}

function isHeaderOnlyAuthErrorResponseWrapper(source: string, wrapperName: string): boolean {
  return source.includes(
    `const ${wrapperName} = <T extends Response>(response: T) => setTraceHeader(response, traceId);`,
  );
}

function findNonHeaderOnlyAuthErrorResponseWrappers(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const invalid: string[] = [];

  for (const match of source.matchAll(ROUTE_AUTH_FAILURE_WRAPPED_RETURN_PATTERN)) {
    const wrapperName = match[1];
    if (!wrapperName || isHeaderOnlyAuthErrorResponseWrapper(source, wrapperName)) continue;
    invalid.push(`${filePath}:${wrapperName}`);
  }

  return invalid;
}

const FORBIDDEN_ROUTE_STORE_IMPORT_PATTERNS = [
  "@/lib/planning/server/store/",
  "/planning/server/store/",
  "@/lib/planning/store/",
  "/planning/store/",
  "/planning/store/types",
  "@/lib/planning/storage/",
  "/planning/storage/",
  "@/lib/planning/v3/drafts/draftStore",
  "@/lib/planning/v3/store/",
  "node:fs",
  "node:fs/promises",
  "@prisma/client",
  "PrismaClient(",
  "better-sqlite3",
  "openNewsDatabase(",
  "closeNewsDatabase(",
  ".prepare(`",
  "FROM news_items",
] as const;

const OPS_USER_SCOPED_ROUTE_IMPORT_PATTERNS = [
  "@/lib/planning/cache/",
  "/planning/cache/",
  "@/lib/planning/security/",
  "/planning/security/",
  "@/lib/planning/server/assumptions/overridesRouteService",
  "/planning/server/assumptions/overridesRouteService",
  "@/lib/planning/server/cache/opsRouteService",
  "/planning/server/cache/opsRouteService",
  "@/lib/planning/server/runs/opsRouteService",
  "/planning/server/runs/opsRouteService",
  "@/lib/planning/server/ops/doctorRouteService",
  "/planning/server/ops/doctorRouteService",
  "@/lib/ops/actions/registry",
  "/ops/actions/registry",
  "@/lib/planning/server/store/",
  "/planning/server/store/",
  "@/lib/planning/store/",
  "/planning/store/",
  "@/lib/planning/v3/",
  "/planning/v3/",
] as const;

const FORBIDDEN_OPS_ROUTE_AUTH_BYPASS_PATTERNS = [
  "withCurrentPlanningUser(",
  "requireCurrentPlanningUser(",
  "runWithPlanningUserScope(",
  "enterPlanningUserScope(",
  "resolvePlanningUserId(",
  "/planning/auth/currentUser",
  "../auth/currentUser",
  "/planning/store/userScope",
  "../store/userScope",
  "userId: currentUser.id",
  "authSource: currentUser.source",
] as const;

const FORBIDDEN_DIRECT_CURRENT_USER_SCOPE_ROUTE_PATTERNS = [
  "withCurrentPlanningUser(",
  "requireCurrentPlanningUser(",
  "runWithPlanningUserScope(",
  "enterPlanningUserScope(",
  "resolvePlanningUserId(",
  "/planning/auth/currentUser",
  "../auth/currentUser",
  "/planning/store/userScope",
  "../store/userScope",
] as const;

function findDirectCurrentUserScopeRouteFiles(routeFiles: string[]): string[] {
  return routeFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return FORBIDDEN_DIRECT_CURRENT_USER_SCOPE_ROUTE_PATTERNS.some((pattern) => source.includes(pattern));
  });
}

const SHARED_OPS_ROUTE_FILES = [
  "src/app/api/ops/audit/route.ts",
  "src/app/api/ops/auto-merge/eligibility/route.ts",
  "src/app/api/ops/data-quality/route.ts",
  "src/app/api/ops/feedback/planning/route.ts",
  "src/app/api/ops/feedback/planning/[id]/route.ts",
  "src/app/api/ops/feedback/planning/[id]/create-issue/route.ts",
  "src/app/api/ops/metrics/events/route.ts",
  "src/app/api/ops/metrics/route.ts",
  "src/app/api/ops/scheduler/route.ts",
] as const;

const FORBIDDEN_SHARED_OPS_ROUTE_PATTERNS = [
  ...ROUTE_AUTH_HELPERS,
  "@/lib/planning/",
  "/lib/planning/",
] as const;

const OPS_ROUTE_USER_META_WRAPPER_SOURCES = [
  { helper: "securityUserMeta", filePath: "src/app/api/ops/security/_lib.ts" },
  { helper: "assumptionsUserMeta", filePath: "src/app/api/ops/assumptions/_lib.ts" },
  { helper: "doctorRouteMeta", filePath: "src/lib/planning/server/ops/doctorRouteService.ts" },
] as const;

const SHARED_OPS_ROUTE_GUARD_PATTERNS = [
  "onlyDev(",
  "assertLocalHost(request)",
  "assertSameOrigin(request)",
] as const;

function routeReadsUserScopedPlanningStorage(source: string): boolean {
  return OPS_USER_SCOPED_ROUTE_IMPORT_PATTERNS.some((pattern) => source.includes(pattern));
}

function findUserOwnedOpsRouteFiles(): string[] {
  return findOpsRouteFiles().filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return routeReadsUserScopedPlanningStorage(source);
  });
}

describe("planning route current-user scope coverage", () => {
  it("covers the current planning API route inventory", () => {
    const routeFiles = findPlanningRouteFiles();

    expect(routeFiles).toHaveLength(EXPECTED_PLANNING_ROUTE_COUNT);
    expect(new Set(routeFiles).size).toBe(routeFiles.length);
  });

  it("covers planning-adjacent auth boundary route inventory", () => {
    const missing = PLANNING_ADJACENT_AUTH_ROUTE_FILES.filter((filePath) => !fs.existsSync(filePath));

    expect(missing).toEqual([]);
  });

  it("keeps every planning auth boundary route behind current-user scope", () => {
    const missing = findPlanningAuthBoundaryRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !ROUTE_AUTH_HELPERS.some((helper) => source.includes(helper));
    });

    expect(missing).toEqual([]);
  });

  it("keeps every planning auth boundary route on the standard routeAuth import boundary", () => {
    const missingRouteAuthImport = findPlanningAuthBoundaryRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !source.includes(ROUTE_AUTH_IMPORT_PATH);
    });

    expect(missingRouteAuthImport).toEqual([]);
  });

  it("keeps requirePlanningRouteUser callers on the Response guard contract", () => {
    const missingResponseGuard = findPlanningAuthBoundaryRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return source.includes("requirePlanningRouteUser(") && !source.includes(ROUTE_AUTH_RESPONSE_GUARD_PATTERN);
    });

    expect(missingResponseGuard).toEqual([]);
  });

  it("keeps planning auth boundary routes on the routeAuth boundary", () => {
    const directCurrentUserRoutes = findPlanningAuthBoundaryRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_ROUTE_AUTH_BYPASS_PATTERNS.some((pattern) => source.includes(pattern));
    });

    expect(directCurrentUserRoutes).toEqual([]);
  });

  it("keeps callback route auth helpers translating auth failures through routeAuth", () => {
    const missingAuthErrorBridge = findPlanningAuthBoundaryRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return source.includes("withPlanningRouteUser(") && !hasRouteAuthFailureBridge(source);
    });

    expect(missingAuthErrorBridge).toEqual([]);
  });

  it("keeps wrapped auth error responses header-only", () => {
    const invalidWrappers = findPlanningAuthBoundaryRouteFiles()
      .flatMap(findNonHeaderOnlyAuthErrorResponseWrappers);

    expect(invalidWrappers).toEqual([]);
  });

  it("keeps planning and ops API routes off direct current-user scope helpers", () => {
    const directCurrentUserRoutes = findDirectCurrentUserScopeRouteFiles([
      ...findPlanningAuthBoundaryRouteFiles(),
      ...findOpsRouteFiles(),
    ]);

    expect(directCurrentUserRoutes).toEqual([]);
  });

  it("keeps every App API route handler off direct current-user scope helpers", () => {
    const directCurrentUserRoutes = findDirectCurrentUserScopeRouteFiles(findAppApiRouteFiles());

    expect(directCurrentUserRoutes).toEqual([]);
  });

  it("keeps planning API routes off direct store, storage, and database imports", () => {
    const directStoreRoutes = findPlanningRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_ROUTE_STORE_IMPORT_PATTERNS.some((pattern) => source.includes(pattern));
    });

    expect(directStoreRoutes).toEqual([]);
  });

  it("keeps planning route repository imports on the current-user ownership boundary", () => {
    const violations = findPlanningRouteFiles().flatMap(findNonCurrentUserRepositoryImports);

    expect(violations).toEqual([]);
  });

  it("keeps ops API routes with user-owned planning storage behind routeAuth", () => {
    const missing = findOpsRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return routeReadsUserScopedPlanningStorage(source) && !ROUTE_AUTH_HELPERS.some((helper) => source.includes(helper));
    });

    expect(missing).toEqual([]);
  });

  it("treats ops action registry routes as user-owned planning storage routes", () => {
    const source = [
      "import { runOpsAction } from \"../../../../../lib/ops/actions/registry\";",
      "export async function POST() {",
      "  return runOpsAction(\"RUN_MIGRATIONS\", {});",
      "}",
    ].join("\n");

    expect(routeReadsUserScopedPlanningStorage(source)).toBe(true);
  });

  it("keeps user-owned ops API routes on the routeAuth boundary", () => {
    const directCurrentUserRoutes = findOpsRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return routeReadsUserScopedPlanningStorage(source)
        && FORBIDDEN_OPS_ROUTE_AUTH_BYPASS_PATTERNS.some((pattern) => source.includes(pattern));
    });

    expect(directCurrentUserRoutes).toEqual([]);
  });

  it("keeps user-owned ops JSON success object literals annotated with route user metadata", () => {
    const missingUserMeta = findUserOwnedOpsRouteFiles().flatMap(findDirectSuccessJsonWithoutUserMeta);

    expect(missingUserMeta).toEqual([]);
  });

  it("keeps direct user-owned ops JSON success meta shaped by route user metadata", () => {
    const invalidUserMeta = findUserOwnedOpsRouteFiles().flatMap(findDirectSuccessJsonWithNonUserMeta);

    expect(invalidUserMeta).toEqual([]);
  });

  it("keeps user-owned ops response helper success meta shaped by route user metadata", () => {
    const invalidUserMeta = findUserOwnedOpsRouteFiles().flatMap(findResponseHelperSuccessJsonWithNonUserMeta);

    expect(invalidUserMeta).toEqual([]);
  });

  it("keeps user-owned ops route metadata wrappers backed by planningUserMeta", () => {
    const invalidWrappers = OPS_ROUTE_USER_META_WRAPPER_SOURCES.filter(({ helper, filePath }) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !source.includes(`function ${helper}(`) || !source.includes(USER_META_HELPER);
    });

    expect(invalidWrappers).toEqual([]);
  });

  it("keeps shared ops API routes off planning user-owned storage and auth scope", () => {
    const existingSharedRoutes = SHARED_OPS_ROUTE_FILES.filter((filePath) => fs.existsSync(filePath)).sort();
    const invalid = existingSharedRoutes.filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return FORBIDDEN_SHARED_OPS_ROUTE_PATTERNS.some((pattern) => source.includes(pattern));
    });

    expect(existingSharedRoutes).toEqual([...SHARED_OPS_ROUTE_FILES].sort());
    expect(invalid).toEqual([]);
  });

  it("keeps shared ops API routes behind dev/local read guards", () => {
    const missingGuards = SHARED_OPS_ROUTE_FILES.filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !SHARED_OPS_ROUTE_GUARD_PATTERNS.every((pattern) => source.includes(pattern));
    });

    expect(missingGuards).toEqual([]);
  });

  it("detects success meta objects that are not shaped by route user metadata", () => {
    const directInvalidSource = [
      "import { NextResponse } from \"next/server\";",
      "export function GET() {",
      "  return NextResponse.json({ ok: true, data: {}, meta: { requestId: \"trace-only\" } });",
      "}",
    ].join("\n");
    const helperInvalidSource = [
      "import { jsonOk } from \"@/lib/planning/api/response\";",
      "export function GET() {",
      "  return jsonOk({ data: {} }, { meta: { userId: \"alice\" } });",
      "}",
    ].join("\n");

    expect(findDirectSuccessJsonWithNonUserMetaInSource("fixture/direct-route.ts", directInvalidSource)).toEqual([
      "fixture/direct-route.ts:3",
    ]);
    expect(findResponseHelperSuccessJsonWithNonUserMetaInSource("fixture/helper-route.ts", helperInvalidSource)).toEqual([
      "fixture/helper-route.ts:3",
    ]);
  });

  it("allows success meta objects extended from planningUserMeta", () => {
    const directValidSource = [
      "import { NextResponse } from \"next/server\";",
      "export function GET() {",
      "  return NextResponse.json({ ok: true, data: {}, meta: { ...planningUserMeta(currentUser), requestId: \"trace\" } });",
      "}",
    ].join("\n");
    const helperValidSource = [
      "import { jsonOk } from \"@/lib/planning/api/response\";",
      "export function GET() {",
      "  return jsonOk({ data: {} }, { meta: { ...planningUserMeta(currentUser), requestId: \"trace\" } });",
      "}",
    ].join("\n");

    expect(findDirectSuccessJsonWithNonUserMetaInSource("fixture/direct-route.ts", directValidSource)).toEqual([]);
    expect(findResponseHelperSuccessJsonWithNonUserMetaInSource("fixture/helper-route.ts", helperValidSource)).toEqual([]);
  });

  it("keeps direct planning JSON responses annotated with route user metadata", () => {
    const missingUserMeta = findPlanningRouteFiles().filter((filePath) => {
      if (USER_META_JSON_EXCEPTIONS.has(filePath)) return false;
      const source = fs.readFileSync(filePath, "utf8");
      const buildsSuccessResponse = SUCCESS_RESPONSE_PATTERNS.some((pattern) => source.includes(pattern));
      return buildsSuccessResponse && !source.includes(USER_META_HELPER);
    });

    expect(missingUserMeta).toEqual([]);
  });

  it("keeps direct planning JSON success object literals annotated with route user metadata", () => {
    const missingUserMeta = findPlanningRouteFiles().flatMap(findDirectSuccessJsonWithoutUserMeta);

    expect(missingUserMeta).toEqual([]);
  });

  it("keeps direct planning JSON success meta shaped by route user metadata", () => {
    const invalidUserMeta = findPlanningRouteFiles().flatMap(findDirectSuccessJsonWithNonUserMeta);

    expect(invalidUserMeta).toEqual([]);
  });

  it("keeps planning response helper success meta shaped by route user metadata", () => {
    const invalidUserMeta = findPlanningRouteFiles().flatMap(findResponseHelperSuccessJsonWithNonUserMeta);

    expect(invalidUserMeta).toEqual([]);
  });

  it("keeps user metadata exceptions limited to proxy or raw response routes", () => {
    const categorizedExceptions = new Set([
      ...USER_META_PROXY_EXCEPTIONS,
      ...USER_META_RAW_RESPONSE_EXCEPTIONS,
    ]);
    const overlappingExceptions = [...USER_META_PROXY_EXCEPTIONS].filter((filePath) =>
      USER_META_RAW_RESPONSE_EXCEPTIONS.has(filePath),
    );
    const invalidExceptions = [...USER_META_JSON_EXCEPTIONS].filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return SUCCESS_RESPONSE_PATTERNS.some((pattern) => source.includes(pattern));
    });

    expect([...USER_META_JSON_EXCEPTIONS].sort()).toEqual([...categorizedExceptions].sort());
    expect(overlappingExceptions).toEqual([]);
    expect(invalidExceptions).toEqual([]);
  });

  it("keeps proxy user metadata exceptions as delegated route handlers", () => {
    const invalidProxyExceptions = [...USER_META_PROXY_EXCEPTIONS].filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const importsDelegate = PROXY_IMPORT_PATTERNS.some((pattern) => source.includes(pattern));
      return !importsDelegate || !PROXY_DELEGATE_CALL_PATTERN.test(source);
    });

    expect(invalidProxyExceptions).toEqual([]);
  });

  it("keeps proxy user metadata exceptions delegated to metadata-bearing targets", () => {
    const invalidProxyTargets = [...USER_META_PROXY_EXCEPTIONS].flatMap((filePath) => {
      const targets = findProxyDelegateTargets(filePath);
      if (targets.length === 0) return [filePath];

      return targets.filter((targetPath) => {
        if (!fs.existsSync(targetPath)) return true;
        const targetSource = fs.readFileSync(targetPath, "utf8");
        return !targetSource.includes(USER_META_HELPER);
      });
    });

    expect(invalidProxyTargets).toEqual([]);
  });

  it("keeps raw user metadata exceptions as non-JSON success responses", () => {
    const invalidRawExceptions = [...USER_META_RAW_RESPONSE_EXCEPTIONS].filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !RAW_SUCCESS_RESPONSE_PATTERNS.some((pattern) => source.includes(pattern));
    });

    expect(invalidRawExceptions).toEqual([]);
  });

  it("keeps raw user metadata exceptions behind current-user attachment guards", () => {
    const invalidRawExceptions = [...USER_META_RAW_RESPONSE_EXCEPTIONS].filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !RAW_RESPONSE_GUARD_PATTERNS.every((pattern) => source.includes(pattern));
    });

    expect(invalidRawExceptions).toEqual([]);
  });
});
