import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  CAPABILITY_AXES,
  ROUTE_RISK_LEVELS,
  ROUTE_SECURITY_REGISTRY,
  mutationRouteKey,
  resolveMutationRouteContract,
  validateRouteSecurityRegistry,
} from "./security_route_registry.mjs";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PROD_HIDDEN_PAGE_ALLOWLIST = new Set([
  "src/app/dashboard/artifacts/page.tsx",
]);
const SAFE_DISABLED_ROUTE_CONFIG_EXPORTS = new Set([
  "runtime",
  "dynamic",
  "revalidate",
  "maxDuration",
  "preferredRegion",
]);

function normalizePath(value) {
  return String(value).split(path.sep).join("/");
}

function relativePath(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function walk(dirPath, out = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, out);
      continue;
    }
    if (entry.isFile()) out.push(absolute);
  }
  return out;
}

function gatherFiles(baseDir, suffix) {
  if (!fs.existsSync(baseDir)) return [];
  return walk(baseDir).filter((filePath) => filePath.endsWith(suffix));
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function identifierText(name) {
  return ts.isIdentifier(name) ? name.text : null;
}

function scriptKind(filePath) {
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function parseSource(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
}

function exportedHttpNames(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement)) {
      const name = identifierText(statement.name);
      if (name && HTTP_METHODS.has(name)) names.add(name);
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = identifierText(declaration.name);
        if (name && HTTP_METHODS.has(name)) names.add(name);
      }
      continue;
    }

    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    for (const element of statement.exportClause.elements) {
      if (HTTP_METHODS.has(element.name.text)) names.add(element.name.text);
    }
  }
  return [...names].sort();
}

export function discoverExportedHttpMethodsFromSource(source, filePath = "route.ts") {
  return exportedHttpNames(parseSource(filePath, source));
}

function emptyCapabilities() {
  return Object.fromEntries(CAPABILITY_AXES.map((axis) => [axis, false]));
}

function emptyEvidence() {
  return Object.fromEntries(CAPABILITY_AXES.map((axis) => [axis, new Set()]));
}

function emptyPathEvidence() {
  return Object.fromEntries(CAPABILITY_AXES.map((axis) => [axis, []]));
}

function mergeCapabilities(target, provider, evidence, pathEvidence, label, branches) {
  for (const axis of CAPABILITY_AXES) {
    if (provider[axis] !== true) continue;
    target[axis] = true;
    evidence[axis].add(label);
    pathEvidence[axis].push({ label, branches: { ...branches } });
  }
}

function mergeBranchAssignments(target, branches) {
  const next = { ...target };
  for (const [key, value] of Object.entries(branches)) {
    if (Object.hasOwn(next, key) && next[key] !== value) return null;
    next[key] = value;
  }
  return next;
}

function hasCompatibleCapabilityEvidence(requiredAxes, pathEvidence, index = 0, branches = {}) {
  if (index >= requiredAxes.length) return true;
  const axis = requiredAxes[index];
  for (const item of pathEvidence[axis] ?? []) {
    const merged = mergeBranchAssignments(branches, item.branches);
    if (merged && hasCompatibleCapabilityEvidence(requiredAxes, pathEvidence, index + 1, merged)) {
      return true;
    }
  }
  return false;
}

function branchSignature(branches) {
  return Object.entries(branches)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value ? "1" : "0"}`)
    .join(";");
}

function requiredAxes(requirements) {
  return CAPABILITY_AXES.filter((axis) => requirements?.[axis] === true);
}

function evaluateProfileCapabilities(profile, collected) {
  const alwaysRequired = new Set(requiredAxes(profile.requirements));
  const candidates = profile.alternatives?.length
    ? profile.alternatives.map((alternative) => ({
        id: alternative.id,
        axes: [...new Set([...alwaysRequired, ...requiredAxes(alternative.requirements)])],
      }))
    : [{ id: null, axes: [...alwaysRequired] }];
  const evaluations = candidates.map((candidate) => {
    const missing = candidate.axes.filter((axis) => !collected.observed[axis]);
    const compatible = missing.length === 0
      && hasCompatibleCapabilityEvidence(candidate.axes, collected.pathEvidence);
    return { ...candidate, missing, compatible };
  });
  const passed = evaluations.find((evaluation) => evaluation.missing.length === 0 && evaluation.compatible);
  if (passed) return { ok: true, selected: passed.id };
  evaluations.sort((left, right) => left.missing.length - right.missing.length);
  return { ok: false, evaluations };
}

function unwrapExpression(node) {
  let current = node;
  while (
    current.parent
    && (
      ts.isAwaitExpression(current.parent)
      || ts.isParenthesizedExpression(current.parent)
      || ts.isAsExpression(current.parent)
      || ts.isNonNullExpression(current.parent)
    )
  ) {
    current = current.parent;
  }
  return current;
}

function isIdentifierReference(node, name) {
  if (!ts.isIdentifier(node) || node.text !== name) return false;
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  return true;
}

function isVariableResultUsed(declaration) {
  if (!ts.isIdentifier(declaration.name)) return false;
  let statement = declaration;
  while (statement.parent && !ts.isBlock(statement.parent) && !ts.isSourceFile(statement.parent)) {
    statement = statement.parent;
  }
  const container = statement.parent;
  if (!container || !ts.isBlock(container) && !ts.isSourceFile(container)) return false;
  const statements = container.statements;
  const start = statements.indexOf(statement);
  if (start < 0) return false;
  let used = false;
  const visit = (node) => {
    if (used) return;
    if (isIdentifierReference(node, declaration.name.text)) {
      used = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  for (let index = start + 1; index < statements.length && !used; index += 1) {
    visit(statements[index]);
  }
  return used;
}

function isProviderCallEnforced(call, provider) {
  if (provider.enforcement === "throws" || provider.enforcement === "effect") return true;
  const expression = unwrapExpression(call);
  const parent = expression.parent;
  if (!parent || ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return false;
  if (provider.enforcement === "result") {
    return ts.isVariableDeclaration(parent) ? isVariableResultUsed(parent) : true;
  }
  if (provider.enforcement === "wrapper") {
    return ts.isReturnStatement(parent)
      || ts.isArrowFunction(parent) && parent.body === expression;
  }
  return false;
}

function isNestedFunction(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node);
}

function resolveModuleFile(root, fromFile, sourceText) {
  if (!sourceText.startsWith(".") && !sourceText.startsWith("@/")) return null;
  const unresolved = sourceText.startsWith("@/")
    ? path.join(root, "src", sourceText.slice(2))
    : path.resolve(path.dirname(fromFile), sourceText);
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [
      `${unresolved}.ts`,
      `${unresolved}.tsx`,
      `${unresolved}.js`,
      `${unresolved}.mjs`,
      path.join(unresolved, "index.ts"),
      path.join(unresolved, "index.tsx"),
      path.join(unresolved, "index.js"),
      path.join(unresolved, "index.mjs"),
    ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function variableDefinitionNode(declaration) {
  if (!declaration.initializer) return declaration;
  return declaration.initializer;
}

class SourceGraph {
  constructor(root, registry) {
    this.root = root;
    this.registry = registry;
    this.moduleCache = new Map();
    this.providerIndex = new Map();
    for (const provider of registry.providers) {
      for (const symbol of provider.symbols) {
        this.providerIndex.set(`${provider.module}#${symbol}`, provider);
      }
    }
  }

  moduleInfo(filePath) {
    const absolute = path.resolve(filePath);
    const cached = this.moduleCache.get(absolute);
    if (cached) return cached;

    const source = fs.readFileSync(absolute, "utf8");
    const sourceFile = parseSource(absolute, source);
    const info = {
      filePath: absolute,
      relPath: relativePath(this.root, absolute),
      source,
      sourceFile,
      imports: new Map(),
      importDeclarations: [],
      locals: new Map(),
      exports: new Map(),
    };
    this.moduleCache.set(absolute, info);

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const sourceText = statement.moduleSpecifier.text;
        const sourcePath = resolveModuleFile(this.root, absolute, sourceText);
        info.importDeclarations.push({ statement, sourceText, sourcePath });
        const clause = statement.importClause;
        if (!clause) continue;
        if (clause.name) {
          info.imports.set(clause.name.text, {
            sourceText,
            sourcePath,
            importedName: "default",
            namespace: false,
          });
        }
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            info.imports.set(element.name.text, {
              sourceText,
              sourcePath,
              importedName: element.propertyName?.text ?? element.name.text,
              namespace: false,
            });
          }
        }
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          info.imports.set(clause.namedBindings.name.text, {
            sourceText,
            sourcePath,
            importedName: "*",
            namespace: true,
          });
        }
        continue;
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        info.locals.set(statement.name.text, statement);
        if (hasExportModifier(statement)) {
          info.exports.set(statement.name.text, { kind: "local", localName: statement.name.text });
        }
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const name = identifierText(declaration.name);
          if (!name) continue;
          info.locals.set(name, variableDefinitionNode(declaration));
          if (hasExportModifier(statement)) {
            info.exports.set(name, { kind: "local", localName: name });
          }
        }
        continue;
      }

      if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        continue;
      }
      const sourceText = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
      const sourcePath = sourceText ? resolveModuleFile(this.root, absolute, sourceText) : null;
      for (const element of statement.exportClause.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (sourceText) {
          info.exports.set(element.name.text, {
            kind: "reexport",
            sourceText,
            sourcePath,
            importedName,
          });
        } else {
          info.exports.set(element.name.text, { kind: "local", localName: importedName });
        }
      }
    }

    return info;
  }

  exportedHandlers(routeFile) {
    const info = this.moduleInfo(routeFile);
    const handlers = [];
    for (const method of exportedHttpNames(info.sourceFile)) {
      const target = this.resolveExport(info, method, new Set());
      handlers.push({ method, routeFile: path.resolve(routeFile), ...target });
    }
    return handlers;
  }

  resolveExport(info, exportedName, seen) {
    const key = `${info.filePath}#${exportedName}`;
    if (seen.has(key)) return { implementationFile: info.filePath, node: null, unresolved: "export-cycle" };
    seen.add(key);
    const binding = info.exports.get(exportedName);
    if (!binding) return { implementationFile: info.filePath, node: null, unresolved: "missing-export" };

    if (binding.kind === "reexport") {
      if (!binding.sourcePath) return { implementationFile: info.filePath, node: null, unresolved: "unresolved-reexport" };
      return this.resolveExport(this.moduleInfo(binding.sourcePath), binding.importedName, seen);
    }

    return this.resolveLocal(info, binding.localName, seen);
  }

  resolveLocal(info, localName, seen) {
    const local = info.locals.get(localName);
    if (local) {
      if (ts.isIdentifier(local)) {
        return this.resolveIdentifier(info, local.text, seen);
      }
      return { implementationFile: info.filePath, node: local, unresolved: null };
    }
    return this.resolveIdentifier(info, localName, seen);
  }

  resolveIdentifier(info, localName, seen) {
    const imported = info.imports.get(localName);
    if (!imported?.sourcePath) {
      return { implementationFile: info.filePath, node: null, unresolved: "unresolved-local" };
    }
    return this.resolveExport(this.moduleInfo(imported.sourcePath), imported.importedName, seen);
  }

  providerFor(imported) {
    if (!imported.sourcePath) return null;
    const modulePath = relativePath(this.root, imported.sourcePath);
    return this.providerIndex.get(`${modulePath}#${imported.importedName}`) ?? null;
  }

  collectCapabilities(handler) {
    const observed = emptyCapabilities();
    const evidence = emptyEvidence();
    const pathEvidence = emptyPathEvidence();
    if (!handler.node) {
      return { observed, evidence, pathEvidence, unresolved: handler.unresolved ?? "missing-handler" };
    }
    const visitedDefinitions = new Set();
    this.collectFromNode(
      handler.node,
      this.moduleInfo(handler.implementationFile),
      observed,
      evidence,
      pathEvidence,
      visitedDefinitions,
      {},
    );
    return { observed, evidence, pathEvidence, unresolved: null };
  }

  collectFromNode(node, info, observed, evidence, pathEvidence, visitedDefinitions, initialBranches) {
    const visit = (current, branches) => {
      if (current !== node && isNestedFunction(current)) return;

      if (ts.isIfStatement(current)) {
        visit(current.expression, branches);
        const branchKey = `${info.relPath}:${current.pos}`;
        const isAlwaysFalse = current.expression.kind === ts.SyntaxKind.FalseKeyword;
        const isAlwaysTrue = current.expression.kind === ts.SyntaxKind.TrueKeyword;
        if (!isAlwaysFalse) {
          visit(current.thenStatement, isAlwaysTrue ? branches : { ...branches, [branchKey]: true });
        }
        if (current.elseStatement && current.expression.kind !== ts.SyntaxKind.TrueKeyword) {
          visit(
            current.elseStatement,
            isAlwaysFalse ? branches : { ...branches, [branchKey]: false },
          );
        }
        return;
      }

      if (ts.isConditionalExpression(current)) {
        visit(current.condition, branches);
        const branchKey = `${info.relPath}:${current.pos}`;
        const isAlwaysFalse = current.condition.kind === ts.SyntaxKind.FalseKeyword;
        const isAlwaysTrue = current.condition.kind === ts.SyntaxKind.TrueKeyword;
        if (!isAlwaysFalse) {
          visit(current.whenTrue, isAlwaysTrue ? branches : { ...branches, [branchKey]: true });
        }
        if (!isAlwaysTrue) {
          visit(current.whenFalse, isAlwaysFalse ? branches : { ...branches, [branchKey]: false });
        }
        return;
      }

      if (ts.isBlock(current)) {
        for (const statement of current.statements) {
          visit(statement, branches);
          if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) break;
        }
        return;
      }

      if (ts.isCallExpression(current)) {
        const binding = this.callBinding(current.expression, info);
        if (binding?.kind === "import") {
          const provider = this.providerFor(binding.imported);
          if (provider && isProviderCallEnforced(current, provider)) {
            const sourcePath = binding.imported.sourcePath
              ? relativePath(this.root, binding.imported.sourcePath)
              : binding.imported.sourceText;
            mergeCapabilities(
              observed,
              provider.provides,
              evidence,
              pathEvidence,
              `${sourcePath}#${binding.imported.importedName}`,
              branches,
            );
            if (provider.callbackIndexes) {
              for (const index of provider.callbackIndexes) {
                const argument = current.arguments[index];
                if (argument && (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))) {
                  this.collectFromNode(
                    argument,
                    info,
                    observed,
                    evidence,
                    pathEvidence,
                    visitedDefinitions,
                    branches,
                  );
                }
              }
            }
          } else if (binding.imported.sourcePath && this.shouldFollowImportedCall(current, binding.imported.sourcePath)) {
            const target = this.resolveExport(
              this.moduleInfo(binding.imported.sourcePath),
              binding.imported.importedName,
              new Set(),
            );
            this.collectFromResolvedTarget(
              target,
              observed,
              evidence,
              pathEvidence,
              visitedDefinitions,
              branches,
            );
          }
        } else if (binding?.kind === "local") {
          const localKey = `${info.filePath}#${binding.localName}@${branchSignature(branches)}`;
          if (!visitedDefinitions.has(localKey)) {
            visitedDefinitions.add(localKey);
            const local = info.locals.get(binding.localName);
            if (local) {
              this.collectFromNode(
                local,
                info,
                observed,
                evidence,
                pathEvidence,
                visitedDefinitions,
                branches,
              );
            }
          }
        }
      }

      ts.forEachChild(current, (child) => visit(child, branches));
    };
    visit(node, initialBranches);
  }

  collectFromResolvedTarget(target, observed, evidence, pathEvidence, visitedDefinitions, branches) {
    if (!target.node) return;
    const targetKey = `${target.implementationFile}#${target.node.pos}:${target.node.end}@${branchSignature(branches)}`;
    if (visitedDefinitions.has(targetKey)) return;
    visitedDefinitions.add(targetKey);
    this.collectFromNode(
      target.node,
      this.moduleInfo(target.implementationFile),
      observed,
      evidence,
      pathEvidence,
      visitedDefinitions,
      branches,
    );
  }

  callBinding(expression, info) {
    if (ts.isIdentifier(expression)) {
      const imported = info.imports.get(expression.text);
      if (imported) return { kind: "import", imported };
      if (info.locals.has(expression.text)) return { kind: "local", localName: expression.text };
      return null;
    }

    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      const imported = info.imports.get(expression.expression.text);
      if (imported?.namespace) {
        return {
          kind: "import",
          imported: { ...imported, importedName: expression.name.text },
        };
      }
    }
    return null;
  }

  shouldFollowImportedCall(call, sourcePath) {
    const modulePath = relativePath(this.root, sourcePath);
    if (!modulePath.startsWith("src/app/api/") && !/routeAdapter\.(ts|tsx)$/i.test(modulePath)) return false;
    let current = call;
    while (current.parent) {
      const parent = current.parent;
      if (ts.isReturnStatement(parent)) return true;
      if (ts.isArrowFunction(parent) && parent.body === current) return true;
      if (ts.isBlock(parent) || ts.isSourceFile(parent)) return false;
      current = parent;
    }
    return false;
  }
}

function isNextResponseJsonCall(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "NextResponse"
    && node.expression.name.text === "json";
}

function isSafeLiteralInitializer(node) {
  if (!node) return false;
  return ts.isStringLiteral(node)
    || ts.isNumericLiteral(node)
    || node.kind === ts.SyntaxKind.TrueKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || ts.isArrayLiteralExpression(node) && node.elements.every((element) => isSafeLiteralInitializer(element));
}

function propertyInitializer(node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : null;
    if (propertyName === name) return property.initializer;
  }
  return null;
}

function stringLiteralValue(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function numericLiteralValue(node) {
  return node && ts.isNumericLiteral(node) ? Number(node.text) : null;
}

function booleanLiteralValue(node) {
  if (node?.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node?.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

function readDisabledResponseContract(returnStatement) {
  const call = returnStatement.expression;
  if (!call || !isNextResponseJsonCall(call)) return null;
  const payload = call.arguments[0];
  const options = call.arguments[1];
  const error = propertyInitializer(payload, "error");
  const ok = booleanLiteralValue(propertyInitializer(payload, "ok"));
  const code = stringLiteralValue(propertyInitializer(error, "code"));
  const hint = stringLiteralValue(propertyInitializer(error, "hint"));
  const status = numericLiteralValue(propertyInitializer(options, "status"));
  if (!code || status === null) return null;
  return { ok, code, hint, status };
}

function isAssignmentOperator(kind) {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

export function validateDisabledHttpHandler(graph, routeFile, handler, contract) {
  const issues = [];
  const info = graph.moduleInfo(routeFile);
  const relPath = relativePath(graph.root, routeFile);
  const label = `${handler.method} ${relPath}`;

  if (!handler.node || path.resolve(handler.implementationFile) !== path.resolve(routeFile)) {
    return [`disabled-http: handler must be inline -> ${label}`];
  }

  const allowedImports = new Set(contract.disabledContract?.allowedImports ?? []);
  for (const imported of info.importDeclarations) {
    if (!allowedImports.has(imported.sourceText)) {
      issues.push(`disabled-http: disallowed import ${imported.sourceText} -> ${label}`);
    }
    if (imported.sourceText === "next/server") {
      const clause = imported.statement.importClause;
      const names = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        ? clause.namedBindings.elements.map((entry) => entry.propertyName?.text ?? entry.name.text)
        : [];
      if (clause?.name || clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)
        || names.some((name) => name !== "NextResponse")) {
        issues.push(`disabled-http: next/server may only import NextResponse -> ${label}`);
      }
    }
  }

  for (const statement of info.sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      continue;
    }
    if (statement === handler.node || ts.isFunctionDeclaration(statement) && statement === handler.node) continue;
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      const safe = statement.declarationList.declarations.every((declaration) => {
        const name = identifierText(declaration.name);
        return name && SAFE_DISABLED_ROUTE_CONFIG_EXPORTS.has(name) && isSafeLiteralInitializer(declaration.initializer);
      });
      if (safe) continue;
    }
    issues.push(`disabled-http: extra top-level executable declaration -> ${label}`);
  }

  const returns = [];
  const visit = (node) => {
    if (ts.isReturnStatement(node)) returns.push(node);
    if (ts.isCallExpression(node) && !isNextResponseJsonCall(node)) {
      issues.push(`disabled-http: only NextResponse.json calls are allowed -> ${label}`);
    }
    if (ts.isAwaitExpression(node) || ts.isNewExpression(node)) {
      issues.push(`disabled-http: async work or object construction is not allowed -> ${label}`);
    }
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      issues.push(`disabled-http: assignment side effects are not allowed -> ${label}`);
    }
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "process"
      && node.expression.name.text === "env"
      && node.name.text !== "NODE_ENV"
    ) {
      issues.push(`disabled-http: only NODE_ENV may affect the tombstone -> ${label}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.node);

  if (returns.length === 0 || returns.some((entry) => !entry.expression || !isNextResponseJsonCall(entry.expression))) {
    issues.push(`disabled-http: every return must be NextResponse.json -> ${label}`);
  }
  const responses = returns.map(readDisabledResponseContract);
  if (responses.some((response) => !response)) {
    issues.push(`disabled-http: every response must contain literal error.code and status -> ${label}`);
  }
  if (responses.some((response) => response?.ok !== false)) {
    issues.push(`disabled-http: every response must contain ok: false -> ${label}`);
  }
  const actualCodes = new Set(responses.flatMap((response) => response ? [response.code] : []));
  const actualStatuses = new Set(responses.flatMap((response) => response ? [response.status] : []));
  const expectedCodes = new Set(contract.disabledContract?.errorCodes ?? []);
  const expectedStatuses = new Set(contract.disabledContract?.statuses ?? []);
  for (const code of expectedCodes) {
    if (!actualCodes.has(code)) issues.push(`disabled-http: missing error code ${code} -> ${label}`);
  }
  for (const code of actualCodes) {
    if (!expectedCodes.has(code)) issues.push(`disabled-http: unexpected error code ${code} -> ${label}`);
  }
  for (const status of expectedStatuses) {
    if (!actualStatuses.has(status)) issues.push(`disabled-http: missing status ${status} -> ${label}`);
  }
  for (const status of actualStatuses) {
    if (!expectedStatuses.has(status)) issues.push(`disabled-http: unexpected status ${status} -> ${label}`);
  }
  const expectedPairs = contract.disabledContract?.responsePairs ?? [];
  for (const expected of expectedPairs) {
    const response = responses.find(
      (candidate) => candidate?.code === expected.code && candidate.status === expected.status,
    );
    if (!response) {
      issues.push(`disabled-http: missing response pair ${expected.code}/${expected.status} -> ${label}`);
      continue;
    }
    if (expected.hint === "forbidden" && response.hint) {
      issues.push(`disabled-http: ${expected.code}/${expected.status} must not expose an operator command -> ${label}`);
    }
    if (expected.hint === "required" && !response.hint) {
      issues.push(`disabled-http: ${expected.code}/${expected.status} requires an operator command hint -> ${label}`);
    }
  }
  const expectedPairKeys = new Set(expectedPairs.map((entry) => `${entry.code}/${entry.status}`));
  for (const response of responses) {
    if (response && expectedPairs.length > 0 && !expectedPairKeys.has(`${response.code}/${response.status}`)) {
      issues.push(`disabled-http: unexpected response pair ${response.code}/${response.status} -> ${label}`);
    }
  }
  const commandHint = contract.disabledContract?.commandHint;
  if (commandHint && !responses.some((response) => response?.hint?.includes(commandHint))) {
    issues.push(`disabled-http: missing CLI hint ${commandHint} -> ${label}`);
  }

  return [...new Set(issues)];
}

export function scanMutationRouteCapabilities({ root = process.cwd(), registry = ROUTE_SECURITY_REGISTRY } = {}) {
  const normalizedRoot = path.resolve(root);
  const apiDir = path.join(normalizedRoot, "src", "app", "api");
  const graph = new SourceGraph(normalizedRoot, registry);
  const issues = validateRouteSecurityRegistry(registry).map((issue) => `route-registry: ${issue}`);
  const routeFiles = gatherFiles(apiDir, "route.ts").sort();
  const discoveredKeys = new Set();
  const matchedExactIds = new Set();
  const matchedFamilyIds = new Set();
  const riskCounts = Object.fromEntries(ROUTE_RISK_LEVELS.map((risk) => [risk, 0]));
  const results = [];

  for (const provider of registry.providers) {
    const providerFile = path.join(normalizedRoot, ...provider.module.split("/"));
    if (!fs.existsSync(providerFile)) {
      issues.push(`route-registry: missing capability provider module -> ${provider.module}`);
      continue;
    }
    const providerInfo = graph.moduleInfo(providerFile);
    for (const symbol of provider.symbols) {
      if (!providerInfo.exports.has(symbol)) {
        issues.push(`route-registry: missing capability provider export -> ${provider.module}#${symbol}`);
      }
    }
  }

  for (const routeFile of routeFiles) {
    const relPath = relativePath(normalizedRoot, routeFile);
    for (const handler of graph.exportedHandlers(routeFile)) {
      if (!MUTATION_METHODS.has(handler.method)) continue;
      const key = mutationRouteKey(handler.method, relPath);
      if (discoveredKeys.has(key)) {
        issues.push(`route-capability: duplicate mutation export -> ${key}`);
        continue;
      }
      discoveredKeys.add(key);

      const resolved = resolveMutationRouteContract(handler.method, relPath, registry);
      if (!resolved.ok) {
        const matchIds = resolved.matches.map((entry) => entry.id).join(", ");
        issues.push(
          `route-capability: ${resolved.reason}${matchIds ? ` (${matchIds})` : ""} -> ${key}`,
        );
        continue;
      }

      const contract = resolved.contract;
      const profile = registry.profiles[contract.profile];
      if (resolved.source === "exact") matchedExactIds.add(contract.id);
      else matchedFamilyIds.add(contract.id);
      if (Object.hasOwn(riskCounts, contract.risk)) riskCounts[contract.risk] += 1;

      if (!profile) continue;
      if (profile.execution === "disabled") {
        const disabledIssues = validateDisabledHttpHandler(graph, routeFile, handler, contract);
        issues.push(...disabledIssues);
        results.push({ key, contract, profile, observed: emptyCapabilities(), evidence: emptyEvidence() });
        continue;
      }

      const collected = graph.collectCapabilities(handler);
      if (collected.unresolved) {
        issues.push(`route-capability: unresolved handler (${collected.unresolved}) -> ${key}`);
        continue;
      }
      const evaluation = evaluateProfileCapabilities(profile, collected);
      if (!evaluation.ok) {
        const best = evaluation.evaluations[0];
        const alternative = best.id ? ` alternative=${best.id}` : "";
        if (best.missing.length > 0) {
          issues.push(
            `route-capability: missing ${best.missing.join(", ")} -> ${key} [risk=${contract.risk} effect=${contract.effect} profile=${contract.profile}${alternative}]`,
          );
        } else {
          issues.push(
            `route-capability: incompatible branches for ${best.axes.join(", ")} -> ${key} [risk=${contract.risk} effect=${contract.effect} profile=${contract.profile}${alternative}]`,
          );
        }
      }
      results.push({ key, contract, profile, ...collected });
    }
  }

  for (const entry of registry.exactRoutes) {
    if (!matchedExactIds.has(entry.id)) {
      issues.push(`route-registry: stale exact entry ${entry.id} -> ${mutationRouteKey(entry.method, entry.file)}`);
    }
  }
  for (const entry of registry.familyRoutes) {
    if (!matchedFamilyIds.has(entry.id)) {
      issues.push(`route-registry: stale family entry ${entry.id} -> ${entry.prefix}`);
    }
  }

  return {
    issues: [...new Set(issues)],
    results,
    stats: {
      mutationMethods: discoveredKeys.size,
      classified: results.length,
      disabled: results.filter((entry) => entry.profile.execution === "disabled").length,
      riskCounts,
    },
  };
}

function hasOnlyDevGuard(content) {
  return /onlyDev\s*\(/.test(content) || /guardDev(Read|Mutation)Request\s*\(/.test(content);
}

function hasLocalGuard(content) {
  return /guardDev(Read|Mutation)Request\s*\(/.test(content)
    || /guardLocalRequest\s*\(/.test(content)
    || /assertLocalHost\s*\(/.test(content);
}

function hasOpsActionGuard(content) {
  return /assertNotProduction\s*\(/.test(content)
    && /assertLocalHost\s*\(/.test(content)
    && /assertSameOrigin\s*\(/.test(content);
}

function hasProductionNotFoundPageGuard(content) {
  return /notFound\s*\(/.test(content)
    && (
      /isProductionEnv\s*\(/.test(content)
      || /process\.env\.NODE_ENV\s*={2,3}\s*["']production["']/.test(content)
    );
}

function hasDebugNotFoundPageGuard(content) {
  return /notFound\s*\(/.test(content) && /isDebugPageAccessible\s*\(/.test(content);
}

function isProdHiddenPagePath(relPath) {
  return relPath.startsWith("src/app/debug/")
    || relPath.startsWith("src/app/dev/")
    || PROD_HIDDEN_PAGE_ALLOWLIST.has(relPath);
}

function validateDevOrOpsRoutes(root, files, label) {
  const issues = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const relPath = relativePath(root, filePath);
    if (!hasOnlyDevGuard(content)) issues.push(`${label}: missing onlyDev gate -> ${relPath}`);
    if (!hasLocalGuard(content)) issues.push(`${label}: missing local-only guard -> ${relPath}`);
  }
  return issues;
}

function validateProdHiddenPages(root, files) {
  const issues = [];
  for (const filePath of files) {
    const relPath = relativePath(root, filePath);
    const isDebugPage = relPath.startsWith("src/app/debug/");
    const isDevPage = relPath.startsWith("src/app/dev/");
    const isAllowlistedPage = PROD_HIDDEN_PAGE_ALLOWLIST.has(relPath);
    if (!isDebugPage && !isDevPage && !isAllowlistedPage) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (isDebugPage) {
      if (!hasDebugNotFoundPageGuard(content)) {
        issues.push(`prod-hidden-page: missing debug access notFound guard -> ${relPath}`);
      }
      continue;
    }
    if (!hasProductionNotFoundPageGuard(content)) {
      issues.push(`prod-hidden-page: missing production notFound guard -> ${relPath}`);
    }
  }
  return issues;
}

function validateOpsActions(root, files) {
  const issues = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    if (!hasOpsActionGuard(content)) {
      issues.push(`ops-action: missing assertNotProduction/local/same-origin -> ${relativePath(root, filePath)}`);
    }
  }
  return issues;
}

export function runSecurityRouteGuardScan({ root = process.cwd(), registry = ROUTE_SECURITY_REGISTRY } = {}) {
  const normalizedRoot = path.resolve(root);
  const appDir = path.join(normalizedRoot, "src", "app");
  const apiDir = path.join(appDir, "api");
  const opsAppDir = path.join(appDir, "ops");
  const apiRoutes = gatherFiles(apiDir, "route.ts");
  const appPages = gatherFiles(appDir, "page.tsx");
  const devRoutes = apiRoutes.filter((filePath) => relativePath(normalizedRoot, filePath).startsWith("src/app/api/dev/"));
  const opsRoutes = apiRoutes.filter((filePath) => relativePath(normalizedRoot, filePath).startsWith("src/app/api/ops/"));
  const prodHiddenPages = appPages.filter((filePath) => isProdHiddenPagePath(relativePath(normalizedRoot, filePath)));
  const opsActions = gatherFiles(opsAppDir, "actions.ts");
  const mutationScan = scanMutationRouteCapabilities({ root: normalizedRoot, registry });
  const issues = [
    ...validateDevOrOpsRoutes(normalizedRoot, devRoutes, "dev-route"),
    ...validateDevOrOpsRoutes(normalizedRoot, opsRoutes, "ops-route"),
    ...mutationScan.issues,
    ...validateProdHiddenPages(normalizedRoot, prodHiddenPages),
    ...validateOpsActions(normalizedRoot, opsActions),
  ];
  return {
    issues,
    stats: {
      devRoutes: devRoutes.length,
      opsRoutes: opsRoutes.length,
      prodHiddenPages: prodHiddenPages.length,
      opsActions: opsActions.length,
      ...mutationScan.stats,
    },
  };
}

function main() {
  try {
    const result = runSecurityRouteGuardScan();
    if (result.issues.length > 0) {
      console.error(`[sec:scan:routes] FAIL (${result.issues.length})`);
      for (const issue of result.issues) console.error(` - ${issue}`);
      process.exitCode = 1;
      return;
    }
    const { stats } = result;
    console.log(
      `[sec:scan:routes] PASS devRoutes=${stats.devRoutes} opsRoutes=${stats.opsRoutes} prodHiddenPages=${stats.prodHiddenPages} opsActions=${stats.opsActions} mutationMethods=${stats.mutationMethods} classified=${stats.classified} disabled=${stats.disabled} riskLow=${stats.riskCounts.low} riskMedium=${stats.riskCounts.medium} riskHigh=${stats.riskCounts.high}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[sec:scan:routes] FAIL ${message}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) main();
