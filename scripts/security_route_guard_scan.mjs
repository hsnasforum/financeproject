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

function mergeCapabilities(target, provider, evidence, pathEvidence, label, branches, order) {
  for (const axis of CAPABILITY_AXES) {
    if (provider[axis] !== true) continue;
    target[axis] = true;
    evidence[axis].add(label);
    pathEvidence[axis].push({ label, branches: { ...branches }, order });
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

function compatibleCapabilityAssignments(requiredAxes, pathEvidence, index = 0, branches = {}) {
  if (index >= requiredAxes.length) return [branches];
  const axis = requiredAxes[index];
  const assignments = [];
  for (const item of pathEvidence[axis] ?? []) {
    const merged = mergeBranchAssignments(branches, item.branches);
    if (!merged) continue;
    assignments.push(
      ...compatibleCapabilityAssignments(requiredAxes, pathEvidence, index + 1, merged),
    );
  }
  const unique = new Map(assignments.map((assignment) => [branchSignature(assignment), assignment]));
  return [...unique.values()];
}

function branchAssignmentsCoverAllPaths(assignments) {
  const covers = (remaining) => {
    if (remaining.some((assignment) => Object.keys(assignment).length === 0)) return true;
    const branchKey = remaining.flatMap((assignment) => Object.keys(assignment))[0];
    if (!branchKey) return false;
    return [true, false].every((outcome) => {
      const projected = remaining
        .filter((assignment) => !Object.hasOwn(assignment, branchKey) || assignment[branchKey] === outcome)
        .map((assignment) => {
          const next = { ...assignment };
          delete next[branchKey];
          return next;
        });
      return projected.length > 0 && covers(projected);
    });
  };
  return assignments.length > 0 && covers(assignments);
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
  const eligibleEvidence = Object.fromEntries(CAPABILITY_AXES.map((axis) => [
    axis,
    (collected.pathEvidence[axis] ?? []).filter((item) => !collected.effects.some(
      (effect) => effect.order < item.order && mergeBranchAssignments(item.branches, effect.branches),
    )),
  ]));
  const candidates = profile.alternatives?.length
    ? profile.alternatives.map((alternative) => ({
        id: alternative.id,
        axes: [...new Set([...alwaysRequired, ...requiredAxes(alternative.requirements)])],
      }))
    : [{ id: null, axes: [...alwaysRequired] }];
  const evaluations = candidates.map((candidate) => {
    const missing = candidate.axes.filter((axis) => eligibleEvidence[axis].length === 0);
    const assignments = missing.length === 0
      ? compatibleCapabilityAssignments(candidate.axes, eligibleEvidence)
      : [];
    const compatible = assignments.length > 0;
    return { ...candidate, missing, compatible, assignments };
  });
  const coveringAssignments = evaluations.flatMap((evaluation) => evaluation.assignments);
  if (branchAssignmentsCoverAllPaths(coveringAssignments)) {
    const selected = evaluations.find((evaluation) => evaluation.assignments.length > 0)?.id ?? null;
    return { ok: true, selected };
  }
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

function statementAlwaysExits(node) {
  if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return true;
  if (ts.isBlock(node)) return node.statements.some((statement) => statementAlwaysExits(statement));
  if (ts.isIfStatement(node)) {
    return Boolean(node.elseStatement)
      && statementAlwaysExits(node.thenStatement)
      && statementAlwaysExits(node.elseStatement);
  }
  return false;
}

function containsReturnStatement(node) {
  let found = false;
  const visit = (current) => {
    if (found || current !== node && isNestedFunction(current)) return;
    if (ts.isReturnStatement(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function expressionIsDefinitelyTruthy(node) {
  const current = unwrapParentheses(node);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (ts.isStringLiteralLike(current)) return current.text.length > 0;
  if (ts.isNumericLiteral(current)) return Number(current.text) !== 0;
  if (ts.isBigIntLiteral(current)) return current.text !== "0n";
  if (
    ts.isArrayLiteralExpression(current)
    || ts.isObjectLiteralExpression(current)
    || ts.isArrowFunction(current)
    || ts.isFunctionExpression(current)
    || ts.isClassExpression(current)
    || ts.isNewExpression(current)
    || ts.isRegularExpressionLiteral(current)
  ) {
    return true;
  }
  if (ts.isConditionalExpression(current)) {
    return expressionIsDefinitelyTruthy(current.whenTrue)
      && expressionIsDefinitelyTruthy(current.whenFalse);
  }
  return false;
}

function returnStatementsAreDefinitelyTruthy(node, isDefinitelyTruthy = expressionIsDefinitelyTruthy) {
  let found = false;
  let allTruthy = true;
  const visit = (current) => {
    if (!allTruthy || current !== node && isNestedFunction(current)) return;
    if (ts.isReturnStatement(current)) {
      found = true;
      if (!current.expression || !isDefinitelyTruthy(current.expression)) {
        allTruthy = false;
      }
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found && allTruthy;
}

function isGuardResultProperty(node, name, properties) {
  const current = unwrapParentheses(node);
  return ts.isPropertyAccessExpression(current)
    && ts.isIdentifier(current.expression)
    && current.expression.text === name
    && properties.has(current.name.text);
}

function conditionBlocksOnGuardResult(node, name) {
  const current = unwrapParentheses(node);
  if (ts.isIdentifier(current)) return current.text === name;
  if (
    ts.isPrefixUnaryExpression(current)
    && current.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return isGuardResultProperty(current.operand, name, new Set(["allowed", "authorized", "ok"]));
  }
  return false;
}

function variableResultBlocksExecution(declaration) {
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
  const candidate = statements[start + 1];
  return Boolean(
    candidate
    && ts.isIfStatement(candidate)
    && conditionBlocksOnGuardResult(candidate.expression, declaration.name.text)
    && statementAlwaysExits(candidate.thenStatement),
  );
}

function callReturnBoundaryKind(call) {
  const expression = unwrapExpression(call);
  const parent = expression.parent;
  if (!parent) return "none";
  if (ts.isReturnStatement(parent)) return "direct";
  if (ts.isArrowFunction(parent) && parent.body === expression) return "direct";
  return ts.isVariableDeclaration(parent) && variableResultBlocksExecution(parent)
    ? "conditional"
    : "none";
}

function childReturnBoundary(parentBoundary, call) {
  if (parentBoundary === "none") return "none";
  const callBoundary = callReturnBoundaryKind(call);
  if (callBoundary === "direct") return parentBoundary;
  return callBoundary;
}

function isInUnsupportedConditionalContext(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (isNestedFunction(parent)) return false;
    if (
      ts.isBinaryExpression(parent)
      && (
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || parent.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      )
    ) {
      return true;
    }
    if (
      ts.isForStatement(parent)
      || ts.isForInStatement(parent)
      || ts.isForOfStatement(parent)
      || ts.isWhileStatement(parent)
      || ts.isDoStatement(parent)
      || ts.isSwitchStatement(parent)
      || ts.isCaseClause(parent)
      || ts.isDefaultClause(parent)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
}

function isThrowProviderEnforced(call, returnBoundary, isDefinitelyTruthy) {
  let current = call;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isTryStatement(parent) && current === parent.tryBlock) {
      if (parent.catchClause && !statementAlwaysExits(parent.catchClause.block)) return false;
      if (parent.catchClause && containsReturnStatement(parent.catchClause.block)) {
        if (returnBoundary === "none") return false;
        if (
          returnBoundary === "conditional"
          && !returnStatementsAreDefinitelyTruthy(parent.catchClause.block, isDefinitelyTruthy)
        ) {
          return false;
        }
      }
      if (parent.finallyBlock && statementAlwaysExits(parent.finallyBlock)) return false;
    }
    current = parent;
  }
  return true;
}

function isProviderCallEnforced(call, provider, returnBoundary, isDefinitelyTruthy) {
  if (isInUnsupportedConditionalContext(call)) return false;
  if (provider.enforcement === "throws") {
    return isThrowProviderEnforced(call, returnBoundary, isDefinitelyTruthy);
  }
  if (provider.enforcement === "effect") return true;
  const expression = unwrapExpression(call);
  const parent = expression.parent;
  if (!parent || ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return false;
  if (provider.enforcement === "result") {
    return returnBoundary !== "none"
      && ts.isVariableDeclaration(parent)
      && variableResultBlocksExecution(parent);
  }
  if (provider.enforcement === "wrapper") {
    return returnBoundary !== "none"
      && (
        ts.isReturnStatement(parent)
        || ts.isArrowFunction(parent) && parent.body === expression
      );
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

function bindingNameContains(name, target) {
  if (ts.isIdentifier(name)) return name.text === target;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.some((element) => (
      ts.isBindingElement(element) && bindingNameContains(element.name, target)
    ));
  }
  return false;
}

function statementBinding(statement, name) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (bindingNameContains(declaration.name, name)) return variableDefinitionNode(declaration);
    }
  }
  if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
    && statement.name?.text === name
  ) {
    return statement;
  }
  return null;
}

function functionScopedVarBinding(node, name) {
  if (!node?.body) return null;
  let found = null;
  const visit = (current) => {
    if (found || current !== node.body && isNestedFunction(current)) return;
    if (
      ts.isVariableDeclarationList(current)
      && (current.flags & ts.NodeFlags.BlockScoped) === 0
    ) {
      for (const declaration of current.declarations) {
        if (bindingNameContains(declaration.name, name)) {
          found = variableDefinitionNode(declaration);
          return;
        }
      }
    }
    ts.forEachChild(current, visit);
  };
  visit(node.body);
  return found;
}

function calledSymbolName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

const ROUTE_EFFECT_SYMBOLS = new Map([
  ["authenticated-compute", new Set(["computePlanner", "recommendCandidates"])],
  ["bounded-compute", new Set(["rankBySimpleFind"])],
  ["operator-process", new Set(["buildCorpCodesIndex"])],
  ["ops-write", new Set(["updateFeedback"])],
  ["public-submission", new Set(["addPublicFeedback"])],
]);
const MUTATION_SYMBOLS = new Set(["$transaction", "persist"]);
const EXTERNAL_MUTATION_IMPORTS = new Map([
  ["node:child_process", new Set(["exec", "execFile", "fork", "spawn"])],
  ["node:fs", new Set([
    "appendFile",
    "appendFileSync",
    "copyFile",
    "copyFileSync",
    "createWriteStream",
    "rename",
    "renameSync",
    "rm",
    "rmSync",
    "truncate",
    "truncateSync",
    "unlink",
    "unlinkSync",
    "writeFile",
    "writeFileSync",
  ])],
  ["node:fs/promises", new Set([
    "appendFile",
    "copyFile",
    "rename",
    "rm",
    "truncate",
    "unlink",
    "writeFile",
  ])],
]);

function importBindingFromExpression(expression, imports) {
  if (!expression) return null;
  const current = unwrapParentheses(expression);
  if (ts.isIdentifier(current)) return imports.get(current.text) ?? null;
  if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression)) {
    const imported = imports.get(current.expression.text);
    if (imported && (imported.namespace || EXTERNAL_MUTATION_IMPORTS.has(imported.sourceText))) {
      return { ...imported, importedName: current.name.text, namespace: false };
    }
  }
  return null;
}

function isExternalMutationImport(binding) {
  if (binding?.kind !== "import") return false;
  const imported = binding.imported;
  return EXTERNAL_MUTATION_IMPORTS.get(imported.sourceText)?.has(imported.importedName) === true;
}

function isPotentialMutationCall(call, routeEffect) {
  const name = calledSymbolName(call.expression);
  if (!name) return false;
  if (ROUTE_EFFECT_SYMBOLS.get(routeEffect)?.has(name)) return true;
  return MUTATION_SYMBOLS.has(name)
    || /^(apply|change|cleanup|commit|configure|create|delete|dispatch|execute|exec|fix|import|insert|lock|merge|mutate|patch|publish|purge|refresh|remove|repair|reset|restore|rollback|run|save|seed|spawn|sync|unlock|update|upsert|write)/i.test(name);
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
      exportStars: [],
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
          if (name) {
            const importedAlias = importBindingFromExpression(declaration.initializer, info.imports);
            if (importedAlias) {
              info.imports.set(name, importedAlias);
            } else {
              info.locals.set(name, variableDefinitionNode(declaration));
            }
            if (hasExportModifier(statement)) {
              info.exports.set(name, { kind: "local", localName: name });
            }
            continue;
          }
          if (!ts.isObjectBindingPattern(declaration.name)) continue;
          const importedObject = importBindingFromExpression(declaration.initializer, info.imports);
          if (!importedObject) continue;
          for (const element of declaration.name.elements) {
            const localName = identifierText(element.name);
            if (!localName) continue;
            const importedName = element.propertyName
              ? ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName)
                ? element.propertyName.text
                : null
              : localName;
            if (!importedName) continue;
            info.imports.set(localName, {
              ...importedObject,
              importedName,
              namespace: false,
            });
            if (hasExportModifier(statement)) {
              info.exports.set(localName, { kind: "local", localName });
            }
          }
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement)
        && !statement.exportClause
        && statement.moduleSpecifier
        && ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const sourceText = statement.moduleSpecifier.text;
        info.exportStars.push({
          sourceText,
          sourcePath: resolveModuleFile(this.root, absolute, sourceText),
        });
        continue;
      }

      if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        continue;
      }
      const sourceText = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : null;
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
    if (!binding) {
      const matches = [];
      for (const star of info.exportStars) {
        if (!star.sourcePath) continue;
        const target = this.resolveExport(
          this.moduleInfo(star.sourcePath),
          exportedName,
          new Set(seen),
        );
        if (target.node) matches.push(target);
      }
      const unique = new Map(matches.map((target) => [
        `${target.implementationFile}#${target.node.pos}:${target.node.end}`,
        target,
      ]));
      if (unique.size === 1) return [...unique.values()][0];
      return {
        implementationFile: info.filePath,
        node: null,
        unresolved: unique.size > 1 ? "ambiguous-star-export" : "missing-export",
      };
    }

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

  collectCapabilities(handler, routeEffect) {
    const observed = emptyCapabilities();
    const evidence = emptyEvidence();
    const pathEvidence = emptyPathEvidence();
    const effects = [];
    if (!handler.node) {
      return {
        observed,
        evidence,
        pathEvidence,
        effects,
        unresolved: handler.unresolved ?? "missing-handler",
      };
    }
    const visitedDefinitions = new Set();
    const traversalState = { sequence: 0 };
    this.collectFromNode(
      handler.node,
      this.moduleInfo(handler.implementationFile),
      observed,
      evidence,
      pathEvidence,
      effects,
      visitedDefinitions,
      {},
      traversalState,
      routeEffect,
      "direct",
    );
    return { observed, evidence, pathEvidence, effects, unresolved: null };
  }

  collectFromNode(
    node,
    info,
    observed,
    evidence,
    pathEvidence,
    effects,
    visitedDefinitions,
    initialBranches,
    traversalState,
    routeEffect,
    returnBoundary,
  ) {
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
        visit(current.expression, branches);
        for (const argument of current.arguments) visit(argument, branches);
        traversalState.sequence += 1;
        const order = traversalState.sequence;
        const binding = this.callBinding(current.expression, info);
        let capabilityProvider = null;
        let followedImportedCall = false;
        let followedLocalCall = false;
        if (binding?.kind === "import") {
          const provider = this.providerFor(binding.imported);
          capabilityProvider = provider;
          if (
            provider
            && isProviderCallEnforced(
              current,
              provider,
              returnBoundary,
              (expression) => this.expressionDefinitelyTruthy(expression, info),
            )
          ) {
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
              order,
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
                    effects,
                    visitedDefinitions,
                    branches,
                    traversalState,
                    routeEffect,
                    "direct",
                  );
                }
              }
            }
          } else if (binding.imported.sourcePath && this.shouldFollowImportedCall(current, binding.imported.sourcePath)) {
            followedImportedCall = true;
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
              effects,
              visitedDefinitions,
              branches,
              traversalState,
              routeEffect,
              childReturnBoundary(returnBoundary, current),
            );
          }
        } else if (binding?.kind === "local") {
          const local = binding.node ?? info.locals.get(binding.localName);
          const localKey = `${info.filePath}#${binding.localName}:${local?.pos ?? "unknown"}@${branchSignature(branches)}`;
          if (!visitedDefinitions.has(localKey)) {
            visitedDefinitions.add(localKey);
            if (local) {
              followedLocalCall = true;
              this.collectFromNode(
                local,
                info,
                observed,
                evidence,
                pathEvidence,
                effects,
                visitedDefinitions,
                branches,
                traversalState,
                routeEffect,
                childReturnBoundary(returnBoundary, current),
              );
            }
          }
        }
        if (
          !capabilityProvider
          && !followedImportedCall
          && !followedLocalCall
          && this.callMayMutate(current, binding, info, routeEffect)
        ) {
          effects.push({
            label: `${info.relPath}#${calledSymbolName(current.expression)}`,
            branches: { ...branches },
            order,
          });
        }
        return;
      }

      ts.forEachChild(current, (child) => visit(child, branches));
    };
    visit(node, initialBranches);
  }

  collectFromResolvedTarget(
    target,
    observed,
    evidence,
    pathEvidence,
    effects,
    visitedDefinitions,
    branches,
    traversalState,
    routeEffect,
    returnBoundary,
  ) {
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
      effects,
      visitedDefinitions,
      branches,
      traversalState,
      routeEffect,
      returnBoundary,
    );
  }

  callBinding(expression, info) {
    if (ts.isIdentifier(expression)) {
      const lexical = this.lexicalBinding(expression, expression.text);
      if (lexical) {
        return lexical.node
          ? { kind: "local", localName: expression.text, node: lexical.node }
          : { kind: "shadow", localName: expression.text };
      }
      const imported = info.imports.get(expression.text);
      if (imported) return { kind: "import", imported };
      if (info.locals.has(expression.text)) return { kind: "local", localName: expression.text };
      return null;
    }

    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
      if (this.lexicalBinding(expression.expression, expression.expression.text)) {
        return { kind: "shadow", localName: expression.expression.text };
      }
      const imported = info.imports.get(expression.expression.text);
      if (imported && (imported.namespace || EXTERNAL_MUTATION_IMPORTS.has(imported.sourceText))) {
        return {
          kind: "import",
          imported: { ...imported, importedName: expression.name.text },
        };
      }
    }
    return null;
  }

  lexicalBinding(node, name) {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isBlock(current)) {
        for (const statement of current.statements) {
          const binding = statementBinding(statement, name);
          if (binding) return { node: binding };
        }
      }
      if (
        ts.isCatchClause(current)
        && current.variableDeclaration
        && bindingNameContains(current.variableDeclaration.name, name)
      ) {
        return { node: null };
      }
      if (
        (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current))
        && current.initializer
        && ts.isVariableDeclarationList(current.initializer)
      ) {
        for (const declaration of current.initializer.declarations) {
          if (bindingNameContains(declaration.name, name)) {
            return { node: variableDefinitionNode(declaration) };
          }
        }
      }
      if (isNestedFunction(current)) {
        for (const parameter of current.parameters) {
          if (bindingNameContains(parameter.name, name)) return { node: null };
        }
        const variable = functionScopedVarBinding(current, name);
        if (variable) return { node: variable };
      }
      current = current.parent;
    }
    return null;
  }

  expressionDefinitelyTruthy(expression, info, seen = new Set(), substitutions = new Map()) {
    const current = unwrapParentheses(expression);
    if (expressionIsDefinitelyTruthy(current)) return true;
    if (ts.isIdentifier(current) && substitutions.has(current.text)) {
      const replacement = substitutions.get(current.text);
      return this.expressionDefinitelyTruthy(
        replacement.expression,
        replacement.info,
        seen,
        replacement.substitutions,
      );
    }
    if (!ts.isCallExpression(current)) return false;

    if (
      ts.isPropertyAccessExpression(current.expression)
      && ts.isIdentifier(current.expression.expression)
    ) {
      const owner = current.expression.expression.text;
      const method = current.expression.name.text;
      if (
        owner === "Response"
        && method === "json"
        && !info.locals.has(owner)
        && !info.imports.has(owner)
        && !this.lexicalBinding(current.expression.expression, owner)
      ) {
        return true;
      }
      const imported = info.imports.get(owner);
      if (
        imported?.sourceText === "next/server"
        && imported.importedName === "NextResponse"
        && method === "json"
        && !this.lexicalBinding(current.expression.expression, owner)
      ) {
        return true;
      }
    }

    const binding = this.callBinding(current.expression, info);
    let target = null;
    if (binding?.kind === "import" && binding.imported.sourcePath) {
      target = this.resolveExport(
        this.moduleInfo(binding.imported.sourcePath),
        binding.imported.importedName,
        new Set(),
      );
    } else if (binding?.kind === "local") {
      const node = binding.node ?? info.locals.get(binding.localName);
      if (node) target = { implementationFile: info.filePath, node };
    }
    if (!target?.node) return false;

    const key = `${target.implementationFile}#${target.node.pos}:${target.node.end}`;
    if (seen.has(key)) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    return this.functionAlwaysReturnsBlockingValue(
      target,
      current.arguments,
      info,
      substitutions,
      nextSeen,
    );
  }

  functionAlwaysReturnsBlockingValue(target, args, callerInfo, callerSubstitutions, seen) {
    const node = target.node;
    if (
      !ts.isFunctionDeclaration(node)
      && !ts.isFunctionExpression(node)
      && !ts.isArrowFunction(node)
      && !ts.isMethodDeclaration(node)
    ) {
      return false;
    }
    const targetInfo = this.moduleInfo(target.implementationFile);
    const substitutions = new Map();
    for (const [index, parameter] of node.parameters.entries()) {
      const name = identifierText(parameter.name);
      const argument = args[index];
      if (!name || !argument) continue;
      substitutions.set(name, {
        expression: argument,
        info: callerInfo,
        substitutions: callerSubstitutions,
      });
    }

    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      return this.expressionDefinitelyTruthy(node.body, targetInfo, seen, substitutions);
    }
    if (!node.body || !ts.isBlock(node.body) || !statementAlwaysExits(node.body)) return false;
    let allReturnsBlock = true;
    const visit = (current) => {
      if (!allReturnsBlock || current !== node.body && isNestedFunction(current)) return;
      if (ts.isReturnStatement(current)) {
        allReturnsBlock = Boolean(
          current.expression
          && this.expressionDefinitelyTruthy(current.expression, targetInfo, seen, substitutions),
        );
        return;
      }
      ts.forEachChild(current, visit);
    };
    visit(node.body);
    return allReturnsBlock;
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

  callMayMutate(call, binding, info, routeEffect, seen = new Set()) {
    if (isPotentialMutationCall(call, routeEffect) || isExternalMutationImport(binding)) return true;

    let target = null;
    if (binding?.kind === "import" && binding.imported.sourcePath) {
      target = this.resolveExport(
        this.moduleInfo(binding.imported.sourcePath),
        binding.imported.importedName,
        new Set(),
      );
    } else if (binding?.kind === "local") {
      const node = binding.node ?? info.locals.get(binding.localName);
      if (node) target = { implementationFile: info.filePath, node };
    }
    if (!target?.node) return false;

    const key = `${target.implementationFile}#${target.node.pos}:${target.node.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const targetInfo = this.moduleInfo(target.implementationFile);
    let mutates = false;
    const visit = (node) => {
      if (mutates || node !== target.node && isNestedFunction(node)) return;
      if (ts.isCallExpression(node)) {
        const nestedBinding = this.callBinding(node.expression, targetInfo);
        if (
          isPotentialMutationCall(node, routeEffect)
          || this.callMayMutate(node, nestedBinding, targetInfo, routeEffect, seen)
        ) {
          mutates = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(target.node);
    return mutates;
  }
}

function isNextResponseJsonCall(node, graph, info) {
  const imported = info.imports.get("NextResponse");
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "NextResponse"
    && node.expression.name.text === "json"
    && imported?.sourceText === "next/server"
    && imported.importedName === "NextResponse"
    && !graph.lexicalBinding(node.expression.expression, "NextResponse");
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

function unwrapParentheses(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isNodeEnvAccess(node) {
  const current = unwrapParentheses(node);
  return ts.isPropertyAccessExpression(current)
    && current.name.text === "NODE_ENV"
    && ts.isPropertyAccessExpression(current.expression)
    && current.expression.name.text === "env"
    && ts.isIdentifier(current.expression.expression)
    && current.expression.expression.text === "process";
}

function productionConditionPolarity(node) {
  const current = unwrapParentheses(node);
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
    const nested = productionConditionPolarity(current.operand);
    return nested === null ? null : !nested;
  }
  if (!ts.isBinaryExpression(current)) return null;
  const leftIsEnv = isNodeEnvAccess(current.left);
  const rightIsEnv = isNodeEnvAccess(current.right);
  const leftValue = stringLiteralValue(unwrapParentheses(current.left));
  const rightValue = stringLiteralValue(unwrapParentheses(current.right));
  if (!(leftIsEnv && rightValue === "production") && !(rightIsEnv && leftValue === "production")) {
    return null;
  }
  if (
    current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    || current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
  ) {
    return true;
  }
  if (
    current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    || current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
  ) {
    return false;
  }
  return null;
}

function environmentForConditionOutcome(condition, outcome) {
  const trueMeansProduction = productionConditionPolarity(condition);
  if (trueMeansProduction === null) return null;
  return trueMeansProduction === outcome ? "production" : "non-production";
}

function mergeResponseEnvironment(current, next) {
  if (!next) return current;
  if (!current || current === next) return next;
  return "conflicting";
}

function disabledResponseEnvironment(returnStatement, handlerNode) {
  let environment = null;
  let current = returnStatement;
  while (current.parent && current !== handlerNode) {
    const parent = current.parent;
    if (ts.isIfStatement(parent)) {
      if (current === parent.thenStatement) {
        environment = mergeResponseEnvironment(
          environment,
          environmentForConditionOutcome(parent.expression, true),
        );
      } else if (current === parent.elseStatement) {
        environment = mergeResponseEnvironment(
          environment,
          environmentForConditionOutcome(parent.expression, false),
        );
      }
    }
    if (ts.isBlock(parent)) {
      const index = parent.statements.indexOf(current);
      if (index >= 0) {
        for (let siblingIndex = index - 1; siblingIndex >= 0; siblingIndex -= 1) {
          const sibling = parent.statements[siblingIndex];
          if (!ts.isIfStatement(sibling) || productionConditionPolarity(sibling.expression) === null) continue;
          const thenExits = statementAlwaysExits(sibling.thenStatement);
          const elseExits = Boolean(sibling.elseStatement) && statementAlwaysExits(sibling.elseStatement);
          if (thenExits && !elseExits) {
            environment = mergeResponseEnvironment(
              environment,
              environmentForConditionOutcome(sibling.expression, false),
            );
          } else if (elseExits && !thenExits) {
            environment = mergeResponseEnvironment(
              environment,
              environmentForConditionOutcome(sibling.expression, true),
            );
          }
          break;
        }
      }
    }
    current = parent;
  }
  return environment;
}

function readDisabledResponseContract(returnStatement, handlerNode, graph, info) {
  const call = returnStatement.expression;
  if (!call || !isNextResponseJsonCall(call, graph, info)) return null;
  const payload = call.arguments[0];
  const options = call.arguments[1];
  const error = propertyInitializer(payload, "error");
  const ok = booleanLiteralValue(propertyInitializer(payload, "ok"));
  const code = stringLiteralValue(propertyInitializer(error, "code"));
  const hint = stringLiteralValue(propertyInitializer(error, "hint"));
  const status = numericLiteralValue(propertyInitializer(options, "status"));
  if (!code || status === null) return null;
  return {
    ok,
    code,
    hint,
    status,
    environment: disabledResponseEnvironment(returnStatement, handlerNode),
  };
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
    if (ts.isCallExpression(node) && !isNextResponseJsonCall(node, graph, info)) {
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

  if (
    returns.length === 0
    || returns.some((entry) => !entry.expression || !isNextResponseJsonCall(entry.expression, graph, info))
  ) {
    issues.push(`disabled-http: every return must be NextResponse.json -> ${label}`);
  }
  const responses = returns.map((entry) => (
    readDisabledResponseContract(entry, handler.node, graph, info)
  ));
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
  const expectedPairsByKey = new Map(
    expectedPairs.map((entry) => [`${entry.code}/${entry.status}`, entry]),
  );
  for (const expected of expectedPairs) {
    const hasResponse = responses.some(
      (candidate) => candidate?.code === expected.code && candidate.status === expected.status,
    );
    if (!hasResponse) {
      issues.push(`disabled-http: missing response pair ${expected.code}/${expected.status} -> ${label}`);
    }
  }
  for (const response of responses) {
    if (!response || expectedPairs.length === 0) continue;
    const expected = expectedPairsByKey.get(`${response.code}/${response.status}`);
    if (!expected) {
      issues.push(`disabled-http: unexpected response pair ${response.code}/${response.status} -> ${label}`);
      continue;
    }
    if (expected.hint === "forbidden" && response.hint) {
      issues.push(`disabled-http: ${expected.code}/${expected.status} must not expose an operator command -> ${label}`);
    }
    if (expected.hint === "required" && !response.hint) {
      issues.push(`disabled-http: ${expected.code}/${expected.status} requires an operator command hint -> ${label}`);
    }
    const expectedEnvironment = expected.hint === "forbidden"
      ? "production"
      : expected.hint === "required"
        ? "non-production"
        : null;
    if (expectedEnvironment && response.environment !== expectedEnvironment) {
      issues.push(
        `disabled-http: ${expected.code}/${expected.status} must be returned from the ${expectedEnvironment} branch -> ${label}`,
      );
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

      const collected = graph.collectCapabilities(handler, contract.effect);
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
