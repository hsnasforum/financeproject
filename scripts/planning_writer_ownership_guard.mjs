import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  PLANNING_WRITER_ENTRYPOINTS,
  PLANNING_WRITER_EXCLUSIONS,
  PLANNING_WRITER_SOURCES,
  createPlanningWriterTargetRegistry,
  planningWriterRegistryDigest,
} from "../src/lib/planning/storage/writerOwnershipRegistry.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["src/lib/planning", "src/lib/news", "src/lib/ops", "src/lib/audit"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const FS_MUTATION_METHODS = new Set([
  "writeFile", "writeFileSync", "appendFile", "appendFileSync", "rename", "renameSync",
  "rm", "rmSync", "unlink", "unlinkSync", "truncate", "truncateSync", "copyFile", "copyFileSync",
  "link", "linkSync", "symlink", "symlinkSync", "mkdir", "mkdirSync", "open", "openSync",
  "createWriteStream",
]);
const WRITE_HELPER_MODULE_RE = /(?:atomicWrite|planning_v2_ops_common|writerTargets)$/u;
const ID_RE = /^[a-z][a-z0-9.:-]{2,95}$/u;
const LOGICAL_INVALID_RE = /(?:^\/|\\|[\u0000-\u001F\u007F<>:"|?*]|(?:^|\/)\.\.?(?:\/|$)|^[A-Za-z]:|^\/\/)/u;
const SOURCE_KINDS = new Set(["server-module", "cli-module", "scheduler-module", "shared-helper"]);
const SOURCE_LEASE_POLICIES = new Set(["inherited-runtime", "one-shot", "disabled", "fixture", "out-of-scope"]);
const ENTRYPOINT_KINDS = new Set(["runtime-parent", "runtime-child", "one-shot-cli", "scheduler-parent", "composite-child", "read-only", "disabled"]);
const ENTRYPOINT_LEASE_POLICIES = new Set(["parent-acquire-child-inherit", "one-shot", "read-only", "disabled", "out-of-scope"]);

function repoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function walk(relativeRoot) {
  const root = path.join(REPO_ROOT, relativeRoot);
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(repoPath(entryPath)));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(entryPath);
  }
  return out;
}

function scriptKind(filePath) {
  const extension = path.extname(filePath);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function propertyChain(node) {
  const parts = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) parts.unshift(current.text);
  return parts;
}

export function scanMutationSignals(filePath, sourceText = fs.readFileSync(filePath, "utf8")) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const namespaceBindings = new Set();
  const methodBindings = new Map();
  const helperBindings = new Set();
  const sqliteBindings = new Set();
  const createRequireBindings = new Set();
  const requireBindings = new Set();
  const findings = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text.replace(/^node:/u, "");
    const normalizedModuleName = moduleName.replace(/\.(?:[mc]?[jt]s)$/u, "");
    const clause = statement.importClause;
    if (!clause) continue;
    if (moduleName === "fs" || moduleName === "fs/promises") {
      if (clause.name) namespaceBindings.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaceBindings.add(clause.namedBindings.name.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) {
          const imported = item.propertyName?.text ?? item.name.text;
          if (imported === "promises") namespaceBindings.add(item.name.text);
          if (FS_MUTATION_METHODS.has(imported)) methodBindings.set(item.name.text, imported);
        }
      }
    }
    if (WRITE_HELPER_MODULE_RE.test(normalizedModuleName)) {
      if (clause.name) helperBindings.add(clause.name.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) helperBindings.add(item.name.text);
      }
    }
    if (moduleName === "better-sqlite3") {
      if (clause.name) sqliteBindings.add(clause.name.text);
    }
    if (moduleName === "module" && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const item of clause.namedBindings.elements) {
        const imported = item.propertyName?.text ?? item.name.text;
        if (imported === "createRequire") createRequireBindings.add(item.name.text);
      }
    }
  }

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      if (ts.isIdentifier(node.initializer.expression) && createRequireBindings.has(node.initializer.expression.text)) {
        requireBindings.add(node.name.text);
      }
      if (ts.isIdentifier(node.initializer.expression)
        && requireBindings.has(node.initializer.expression.text)
        && node.initializer.arguments[0]
        && ts.isStringLiteralLike(node.initializer.arguments[0])
        && node.initializer.arguments[0].text === "better-sqlite3") {
        sqliteBindings.add(node.name.text);
      }
    }
    if (ts.isCallExpression(node)) {
      let signal = "";
      if (ts.isIdentifier(node.expression) && methodBindings.has(node.expression.text)) {
        signal = `fs:${methodBindings.get(node.expression.text)}`;
      } else if (ts.isIdentifier(node.expression) && helperBindings.has(node.expression.text)) {
        signal = `helper:${node.expression.text}`;
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const chain = propertyChain(node.expression);
        const root = chain[0] ?? "";
        const method = chain[chain.length - 1] ?? "";
        if (namespaceBindings.has(root) && FS_MUTATION_METHODS.has(method)) signal = `fs:${method}`;
        if (helperBindings.has(root)) signal = `helper:${method}`;
      }
      if (signal) {
        if ((signal === "fs:open" || signal === "fs:openSync")) {
          const flagNode = node.arguments[1];
          if (flagNode && ts.isStringLiteralLike(flagNode) && !/[wax+]/u.test(flagNode.text)) signal = "";
        }
      }
      if (signal) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        findings.push({ signal, line: position.line + 1 });
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && sqliteBindings.has(node.expression.text)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push({ signal: "sqlite:open", line: position.line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function hasExportedDeclaration(filePath, sourceText = fs.readFileSync(filePath, "utf8")) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const hasExportModifier = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
  return sourceFile.statements.some((statement) => (
    hasExportModifier(statement)
    || ts.isExportAssignment(statement)
    || ts.isExportDeclaration(statement)
  ));
}

export function findExportedBypassErrors(sources, sourceLoader = (sourcePath) => fs.readFileSync(path.join(REPO_ROOT, sourcePath), "utf8")) {
  const errors = [];
  for (const source of sources) {
    const sourceText = sourceLoader(source.sourcePath);
    if (!hasExportedDeclaration(source.sourcePath, sourceText)) continue;
    if (source.exportedBypassRisk !== true) errors.push(`EXPORTED_MUTATION_BYPASS_UNDECLARED:${source.sourcePath}`);
  }
  return errors;
}

export function findExportedBypassGraphErrors(
  sources,
  entrypoints,
  sourceLoader = (sourcePath) => fs.readFileSync(path.join(REPO_ROOT, sourcePath), "utf8"),
) {
  const linkedSources = new Set(entrypoints.flatMap((entrypoint) => entrypoint.sources ?? []));
  return sources.flatMap((source) => {
    if (!hasExportedDeclaration(source.sourcePath, sourceLoader(source.sourcePath))) return [];
    if (source.exportedBypassRisk !== true || linkedSources.has(source.id)) return [];
    return [`EXPORTED_MUTATION_SOURCE_ORPHAN:${source.id}`];
  });
}

export function scanRegisteredPackageScriptLiterals(filePath, packageScripts, sourceText = fs.readFileSync(filePath, "utf8")) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const known = packageScripts instanceof Set ? packageScripts : new Set(packageScripts);
  const found = new Set();
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) && known.has(node.text)) found.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found].sort();
}

function packageScriptFromTokens(tokens, known) {
  const normalized = tokens.filter((token) => token && token !== "run" && !token.startsWith("-"));
  return normalized.find((token) => known.has(token)) ?? null;
}

export function scanChildProcessPackageScripts(filePath, packageScripts, sourceText = fs.readFileSync(filePath, "utf8")) {
  const known = packageScripts instanceof Set ? packageScripts : new Set(packageScripts);
  const found = new Set();
  if (path.extname(filePath) === ".sh") {
    for (const match of sourceText.matchAll(/\b(?:pnpm|npm|yarn)\s+(?:run\s+)?([a-zA-Z0-9:_-]+)/gu)) {
      if (known.has(match[1])) found.add(match[1]);
    }
    return [...found].sort();
  }

  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const namespaceBindings = new Set();
  const methodBindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text.replace(/^node:/u, "") !== "child_process") continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) namespaceBindings.add(clause.name.text);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaceBindings.add(clause.namedBindings.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const item of clause.namedBindings.elements) {
        const imported = item.propertyName?.text ?? item.name.text;
        if (["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync"].includes(imported)) {
          methodBindings.set(item.name.text, imported);
        }
      }
    }
  }
  const addShellCommand = (command) => {
    const match = command.match(/\b(?:pnpm|npm|yarn)\s+(?:run\s+)?([a-zA-Z0-9:_-]+)/u);
    if (match && known.has(match[1])) found.add(match[1]);
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      let method = null;
      if (ts.isIdentifier(node.expression)) method = methodBindings.get(node.expression.text) ?? null;
      if (ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && namespaceBindings.has(node.expression.expression.text)) {
        method = node.expression.name.text;
      }
      if (method && ["exec", "execSync"].includes(method) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        addShellCommand(node.arguments[0].text);
      }
      if (method && ["spawn", "spawnSync", "execFile", "execFileSync"].includes(method)
        && node.arguments[0]
        && ts.isStringLiteralLike(node.arguments[0])) {
        const command = path.basename(node.arguments[0].text).replace(/\.cmd$/u, "");
        if (["pnpm", "npm", "yarn"].includes(command) && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])) {
          const tokens = node.arguments[1].elements.filter(ts.isStringLiteralLike).map((item) => item.text);
          const packageScript = packageScriptFromTokens(tokens, known);
          if (packageScript) found.add(packageScript);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found].sort();
}

export function findUndeclaredRegisteredChildren(parent, discoveredPackageScripts, entrypoints) {
  const declared = new Set(parent.childEntrypoints ?? []);
  const excluded = new Set((parent.childCommandExclusions ?? []).map((item) => item.packageScript));
  const errors = [];
  for (const packageScript of discoveredPackageScripts) {
    if (excluded.has(packageScript)) continue;
    const child = entrypoints.find((entry) => entry.packageScript === packageScript);
    if (!child) {
      errors.push(`ENTRYPOINT_CHILD_UNREGISTERED:${parent.id}:${packageScript}`);
      continue;
    }
    if (child.id === parent.id || child.kind === "read-only" || child.kind === "disabled") continue;
    if (!declared.has(child.id)) errors.push(`ENTRYPOINT_CHILD_UNDECLARED:${parent.id}:${child.id}`);
  }
  return errors;
}

function readArchiveOwnerIds() {
  const filePath = path.join(REPO_ROOT, "src/lib/ops/backup/planningOwnerRegistry.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "PLANNING_DATA_OWNER_IDS") continue;
      let initializer = declaration.initializer;
      if (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
      if (!initializer || !ts.isArrayLiteralExpression(initializer)) continue;
      return initializer.elements.filter(ts.isStringLiteral).map((item) => item.text);
    }
  }
  throw new Error("PLANNING_ARCHIVE_OWNER_IDS_UNREADABLE");
}

function validateUnique(rows, field, code, errors) {
  const seen = new Set();
  for (const row of rows) {
    const value = String(row[field] ?? "").normalize("NFC").toLowerCase();
    if (seen.has(value)) errors.push(`${code}:${row[field]}`);
    seen.add(value);
  }
}

function validateTargets(targets, archiveOwnerIds, errors) {
  validateUnique(targets, "id", "TARGET_ID_DUPLICATE", errors);
  const ownerSet = new Set(archiveOwnerIds);
  const logicalKeys = new Set();
  const classRules = new Map([
    ["archive-owner", { roots: ["registered-owner-target"], namespaces: ["user", "runtime-shared"], backups: ["archive-owner"], restores: ["owner-restore"], authoritative: true }],
    ["user-runtime-control", { roots: ["planning-root"], namespaces: ["user"], backups: ["excluded-control"], restores: ["operator-only", "disabled"], authoritative: true }],
    ["runtime-shared-control", { roots: ["planning-root", "runtime-root", "control-root"], namespaces: ["runtime-shared"], backups: ["excluded-control"], restores: ["operator-only", "disabled"], authoritative: true }],
    ["derived-cache", { roots: ["planning-root", "runtime-root"], namespaces: ["user"], backups: ["excluded-derived"], restores: ["rebuild"], authoritative: false }],
    ["output-artifact", { roots: ["planning-root", "runtime-root"], namespaces: ["user", "runtime-shared"], backups: ["separate-output"], restores: ["not-applicable"], authoritative: false }],
    ["external-output", { roots: ["external-selected"], namespaces: ["external"], backups: ["separate-output"], restores: ["not-applicable"], authoritative: false }],
    ["disabled", { roots: ["registered-owner-target", "control-root"], namespaces: ["none"], backups: ["disabled"], restores: ["disabled"], authoritative: true }],
    ["fixture", { roots: ["temp-root"], namespaces: ["none"], backups: ["not-applicable"], restores: ["not-applicable"], authoritative: false }],
    ["out-of-scope", { roots: ["runtime-root", "temp-root", "external-selected"], namespaces: ["none", "external"], backups: ["not-applicable"], restores: ["not-applicable"], authoritative: null }],
  ]);
  for (const target of targets) {
    if (!ID_RE.test(target.id)) errors.push(`TARGET_ID_INVALID:${target.id}`);
    const logical = String(target.logicalPath).normalize("NFC");
    if (!logical || LOGICAL_INVALID_RE.test(logical) || logical.includes("**")) errors.push(`TARGET_LOGICAL_PATH_INVALID:${target.id}`);
    const logicalKey = `${target.rootKind}:${logical.toLowerCase()}`;
    if (logicalKeys.has(logicalKey)) errors.push(`TARGET_LOGICAL_PATH_COLLISION:${target.id}`);
    logicalKeys.add(logicalKey);
    if (target.class === "archive-owner" && !ownerSet.has(target.archiveOwnerId)) errors.push(`TARGET_ARCHIVE_OWNER_UNKNOWN:${target.id}`);
    if (target.class !== "archive-owner" && target.archiveOwnerId) errors.push(`TARGET_ARCHIVE_OWNER_FORBIDDEN:${target.id}`);
    const rule = classRules.get(target.class);
    if (!rule) errors.push(`TARGET_CLASS_INVALID:${target.id}`);
    else {
      if (!rule.roots.includes(target.rootKind)) errors.push(`TARGET_CLASS_ROOT_INVALID:${target.id}`);
      if (!rule.namespaces.includes(target.namespace)) errors.push(`TARGET_NAMESPACE_INVALID:${target.id}`);
      if (!rule.backups.includes(target.backupPolicy)) errors.push(`TARGET_BACKUP_POLICY_INVALID:${target.id}`);
      if (!rule.restores.includes(target.restorePolicy)) errors.push(`TARGET_RESTORE_POLICY_INVALID:${target.id}`);
      if (rule.authoritative !== null && target.authoritative !== rule.authoritative) errors.push(`TARGET_AUTHORITATIVE_INVALID:${target.id}`);
    }
    if (target.class === "archive-owner" && target.pathKind !== "registered-owner-locations") errors.push(`TARGET_PATH_KIND_INVALID:${target.id}`);
    if (target.rootKind === "external-selected" && target.pathKind !== "external-selected") errors.push(`TARGET_PATH_KIND_INVALID:${target.id}`);
    if (!target.pathKind) errors.push(`TARGET_PATH_KIND_MISSING:${target.id}`);
    if (target.rootKind !== "external-selected" && target.class !== "archive-owner" && !["file", "directory"].includes(target.pathKind)) errors.push(`TARGET_PATH_KIND_INVALID:${target.id}`);
  }
  for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < targets.length; rightIndex += 1) {
      const left = targets[leftIndex];
      const right = targets[rightIndex];
      if (left.rootKind !== right.rootKind || left.namespace !== right.namespace) continue;
      const leftPath = String(left.logicalPath).normalize("NFC").toLowerCase();
      const rightPath = String(right.logicalPath).normalize("NFC").toLowerCase();
      if (leftPath.startsWith(`${rightPath}/`) || rightPath.startsWith(`${leftPath}/`)) {
        errors.push(`TARGET_LOGICAL_PATH_OVERLAP:${left.id}:${right.id}`);
      }
    }
  }
  const archiveRefs = targets.filter((target) => target.class === "archive-owner").map((target) => target.archiveOwnerId).sort();
  const expectedArchiveRefs = [...ownerSet].sort();
  if (JSON.stringify(archiveRefs) !== JSON.stringify(expectedArchiveRefs)) errors.push("TARGET_ARCHIVE_OWNER_EXACT_SET_MISMATCH");
}

export function validatePlanningWriterTargets(targets, archiveOwnerIds) {
  const errors = [];
  validateTargets(targets, archiveOwnerIds, errors);
  return errors.sort();
}

export function packageScriptExecutablePaths(scripts) {
  const paths = new Set();
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (!/^(?:planning:|v3:|news:|indicators:|daily:|cleanup$)/u.test(scriptName)) continue;
    for (const match of String(command).matchAll(/(?:^|\s)((?:scripts|src\/lib\/planning)\/[A-Za-z0-9_./-]+\.(?:[mc]?[jt]s))(?:\s|$)/gu)) {
      paths.add(match[1]);
    }
  }
  return [...paths].sort();
}

export function findPackageScriptMutationCandidates(scripts, sourceLoader = (sourcePath) => (
  fs.existsSync(path.join(REPO_ROOT, sourcePath)) ? fs.readFileSync(path.join(REPO_ROOT, sourcePath), "utf8") : null
)) {
  return packageScriptExecutablePaths(scripts).flatMap((sourcePath) => {
    const sourceText = sourceLoader(sourcePath);
    if (typeof sourceText !== "string") return [];
    const findings = scanMutationSignals(sourcePath, sourceText);
    return findings.length > 0 ? [{ sourcePath, findings }] : [];
  });
}

function validateSources(sources, exclusions, entrypoints, targetIds, errors) {
  validateUnique(sources, "id", "SOURCE_ID_DUPLICATE", errors);
  validateUnique(sources, "sourcePath", "SOURCE_PATH_DUPLICATE", errors);
  validateUnique(exclusions, "sourcePath", "EXCLUSION_PATH_DUPLICATE", errors);
  const exclusionsByPath = new Map(exclusions.map((row) => [row.sourcePath, row]));
  for (const source of sources) {
    if (!fs.existsSync(path.join(REPO_ROOT, source.sourcePath))) errors.push(`SOURCE_FILE_MISSING:${source.sourcePath}`);
    if (!SOURCE_KINDS.has(source.kind)) errors.push(`SOURCE_KIND_INVALID:${source.id}`);
    if (!SOURCE_LEASE_POLICIES.has(source.futureLeasePolicy)) errors.push(`SOURCE_LEASE_POLICY_INVALID:${source.id}`);
    if (source.targets.length < 1) errors.push(`SOURCE_TARGET_MISSING:${source.id}`);
    if (!Array.isArray(source.mutationSignals) || source.mutationSignals.length < 1) errors.push(`SOURCE_MUTATION_SIGNAL_MISSING:${source.id}`);
    if (source.mutationSignals.includes("manual-indirect") && !String(source.notes).trim()) errors.push(`SOURCE_MANUAL_EVIDENCE_MISSING:${source.id}`);
    for (const targetId of source.targets) if (!targetIds.has(targetId)) errors.push(`SOURCE_TARGET_UNKNOWN:${source.id}:${targetId}`);
    if (typeof source.exportedBypassRisk !== "boolean") errors.push(`SOURCE_BYPASS_RISK_MISSING:${source.id}`);
  }
  for (const exclusion of exclusions) {
    if (!fs.existsSync(path.join(REPO_ROOT, exclusion.sourcePath))) errors.push(`EXCLUSION_FILE_MISSING:${exclusion.sourcePath}`);
    if (!String(exclusion.reason).trim() || !String(exclusion.evidence).trim()) errors.push(`EXCLUSION_REASON_INVALID:${exclusion.sourcePath}`);
  }
  errors.push(...findExportedBypassErrors(sources));
  errors.push(...findExportedBypassGraphErrors(sources, entrypoints));
  const classified = new Set([
    ...sources.map((row) => row.sourcePath),
    ...entrypoints.map((row) => row.executablePath),
  ]);
  const candidates = [];
  for (const root of SOURCE_ROOTS) {
    for (const filePath of walk(root)) {
      const relative = repoPath(filePath);
      const findings = scanMutationSignals(filePath);
      if (findings.length > 0) candidates.push({ sourcePath: relative, findings });
    }
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  candidates.push(...findPackageScriptMutationCandidates(packageJson.scripts ?? {}));
  errors.push(...findUnclassifiedMutationCandidates(candidates, classified, new Set(exclusionsByPath.keys())));
}

export function findUnclassifiedMutationCandidates(candidates, classifiedPaths, excludedPaths) {
  const classified = classifiedPaths instanceof Set ? classifiedPaths : new Set(classifiedPaths);
  const excluded = excludedPaths instanceof Set ? excludedPaths : new Set(excludedPaths);
  return candidates
    .filter((candidate) => !classified.has(candidate.sourcePath) && !excluded.has(candidate.sourcePath))
    .map((candidate) => {
      const first = candidate.findings[0] ?? { line: 0, signal: "unknown" };
      return `UNCLASSIFIED_MUTATION_SOURCE:${candidate.sourcePath}:${first.line}:${first.signal}`;
    });
}

function validateEntrypoints(entrypoints, sourceIds, targetIds, errors) {
  validateUnique(entrypoints, "id", "ENTRYPOINT_ID_DUPLICATE", errors);
  const entryById = new Map(entrypoints.map((entry) => [entry.id, entry]));
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const scripts = packageJson.scripts ?? {};
  for (const entrypoint of entrypoints) {
    if (!ENTRYPOINT_KINDS.has(entrypoint.kind)) errors.push(`ENTRYPOINT_KIND_INVALID:${entrypoint.id}`);
    if (!ENTRYPOINT_LEASE_POLICIES.has(entrypoint.futureLeasePolicy)) errors.push(`ENTRYPOINT_LEASE_POLICY_INVALID:${entrypoint.id}`);
    const expectedPolicies = {
      "runtime-parent": ["parent-acquire-child-inherit"],
      "runtime-child": ["parent-acquire-child-inherit"],
      "scheduler-parent": ["parent-acquire-child-inherit"],
      "composite-child": ["parent-acquire-child-inherit"],
      "one-shot-cli": ["one-shot", "parent-acquire-child-inherit", "out-of-scope"],
      "read-only": ["read-only"],
      "disabled": ["disabled"],
    };
    if (!(expectedPolicies[entrypoint.kind] ?? []).includes(entrypoint.futureLeasePolicy)) errors.push(`ENTRYPOINT_KIND_POLICY_INVALID:${entrypoint.id}`);
    if (!["read-only", "disabled"].includes(entrypoint.kind) && entrypoint.targets.length < 1) errors.push(`ENTRYPOINT_TARGET_MISSING:${entrypoint.id}`);
    const executable = path.join(REPO_ROOT, entrypoint.executablePath);
    if (!fs.existsSync(executable)) errors.push(`ENTRYPOINT_EXECUTABLE_MISSING:${entrypoint.id}:${entrypoint.executablePath}`);
    if (entrypoint.packageScript) {
      const command = scripts[entrypoint.packageScript];
      if (typeof command !== "string") errors.push(`ENTRYPOINT_PACKAGE_SCRIPT_MISSING:${entrypoint.id}:${entrypoint.packageScript}`);
      else if (entrypoint.executablePath !== "package.json" && !command.includes(entrypoint.executablePath)) errors.push(`ENTRYPOINT_PACKAGE_ALIAS_DRIFT:${entrypoint.id}:${entrypoint.packageScript}`);
    }
    for (const sourceId of entrypoint.sources) if (!sourceIds.has(sourceId)) errors.push(`ENTRYPOINT_SOURCE_UNKNOWN:${entrypoint.id}:${sourceId}`);
    for (const targetId of entrypoint.targets) if (!targetIds.has(targetId)) errors.push(`ENTRYPOINT_TARGET_UNKNOWN:${entrypoint.id}:${targetId}`);
    for (const childId of entrypoint.childEntrypoints) if (!entryById.has(childId)) errors.push(`ENTRYPOINT_CHILD_UNKNOWN:${entrypoint.id}:${childId}`);
    for (const childCommandPath of entrypoint.childCommandPaths ?? []) {
      if (!fs.existsSync(path.join(REPO_ROOT, childCommandPath))) errors.push(`ENTRYPOINT_CHILD_COMMAND_FILE_MISSING:${entrypoint.id}:${childCommandPath}`);
    }
    for (const exclusion of entrypoint.childCommandExclusions ?? []) {
      if (!exclusion.packageScript || !String(exclusion.reason).trim()) errors.push(`ENTRYPOINT_CHILD_EXCLUSION_INVALID:${entrypoint.id}`);
    }
  }
  errors.push(...findUnregisteredPackageAliases(scripts, entrypoints));
  for (const entrypoint of entrypoints) {
    if (entrypoint.kind === "read-only" || entrypoint.kind === "disabled") continue;
    const scanPaths = [...new Set([entrypoint.executablePath, ...(entrypoint.childCommandPaths ?? [])])];
    const discovered = new Set();
    for (const scanPath of scanPaths) {
      const absolute = path.join(REPO_ROOT, scanPath);
      if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
      for (const script of scanChildProcessPackageScripts(absolute, new Set(Object.keys(scripts)))) discovered.add(script);
    }
    errors.push(...findUndeclaredRegisteredChildren(entrypoint, discovered, entrypoints));
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) { errors.push(`ENTRYPOINT_CHILD_CYCLE:${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const childId of entryById.get(id)?.childEntrypoints ?? []) visit(childId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of entryById.keys()) visit(id);
}

export function findUnregisteredPackageAliases(scripts, entrypoints) {
  const registeredPackageScripts = new Set(entrypoints.map((entry) => entry.packageScript).filter(Boolean));
  const mutatingExecutables = new Set(entrypoints
    .filter((entry) => entry.kind !== "read-only" && entry.executablePath !== "package.json")
    .map((entry) => entry.executablePath));
  const mutatingPackageScripts = new Set(entrypoints
    .filter((entry) => entry.kind !== "read-only" && entry.kind !== "disabled" && entry.packageScript)
    .map((entry) => entry.packageScript));
  const errors = [];
  for (const [scriptName, command] of Object.entries(scripts)) {
    const commandText = String(command);
    const matchedExecutable = [...mutatingExecutables].some((executablePath) => commandText.includes(executablePath));
    const matchedPackageScript = [...mutatingPackageScripts].some((registeredScript) => (
      new RegExp(`\\b(?:pnpm|npm|yarn)\\s+(?:run\\s+)?${registeredScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "u").test(commandText)
    ));
    const matched = matchedExecutable || matchedPackageScript;
    if (matched && !registeredPackageScripts.has(scriptName)) errors.push(`PACKAGE_ALIAS_UNREGISTERED:${scriptName}`);
  }
  return errors;
}

function containsRootFact(node) {
  let found = false;
  const visit = (current) => {
    if (ts.isIdentifier(current) && (current.text === "cwd" || current.text === "rootDir")) found = true;
    if (ts.isCallExpression(current)
      && ts.isPropertyAccessExpression(current.expression)
      && ts.isIdentifier(current.expression.expression)
      && current.expression.expression.text === "process"
      && current.expression.name.text === "cwd") found = true;
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

export function scanDirectWriterPathViolations(filePath, sourceText = fs.readFileSync(filePath, "utf8")) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const namespaceBindings = new Set();
  const methodBindings = new Map();
  const findings = [];
  const seen = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!new Set(["path", "node:path"]).has(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) namespaceBindings.add(clause.name.text);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaceBindings.add(clause.namedBindings.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const item of clause.namedBindings.elements) {
        const imported = item.propertyName?.text ?? item.name.text;
        if (imported === "join" || imported === "resolve") methodBindings.set(item.name.text, imported);
      }
    }
  }
  const belongsToLegacyPathProperty = (node) => {
    let current = node;
    while (current.parent && !ts.isSourceFile(current.parent)) {
      current = current.parent;
      if (ts.isPropertyAssignment(current)) {
        const name = ts.isIdentifier(current.name) || ts.isStringLiteralLike(current.name) ? current.name.text : "";
        return name === "legacyPath";
      }
    }
    return false;
  };
  const push = (node, signal) => {
    if (belongsToLegacyPathProperty(node)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const key = `${line}:${signal}`;
    if (!seen.has(key)) findings.push({ line, signal });
    seen.add(key);
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      let isPathCall = false;
      if (ts.isIdentifier(node.expression) && methodBindings.has(node.expression.text)) isPathCall = true;
      if (ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && namespaceBindings.has(node.expression.expression.text)
        && (node.expression.name.text === "join" || node.expression.name.text === "resolve")) isPathCall = true;
      const dataIndex = node.arguments.findIndex((argument) => ts.isStringLiteralLike(argument) && argument.text === ".data");
      if (isPathCall && dataIndex >= 0 && node.arguments.slice(0, dataIndex).some(containsRootFact)) push(node, "cwd-data-path");
    }
    if ((ts.isTemplateExpression(node) || ts.isBinaryExpression(node))
      && containsRootFact(node)
      && /(?:^|[\\/])\.data(?:[\\/]|$)/u.test(node.getText(sourceFile))) push(node, "cwd-data-expression");
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const lines = sourceText.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (/(?:Library["'],\s*["']Application Support|AppData["'],\s*["']Local|["']\.local["'],\s*["']share)/u.test(lines[index])) {
      findings.push({ line: index + 1, signal: "packaged-root-duplication" });
    }
  }
  return findings.sort((left, right) => left.line - right.line || left.signal.localeCompare(right.signal));
}

function validateDirectPaths(sources, exclusions, entrypoints, errors) {
  const allowed = new Set([
    "src/lib/ops/backup/planningOwnerRegistry.ts",
    "src/lib/planning/storage/runtimeRoots.mjs",
    "scripts/planning_runtime_paths.mjs",
  ]);
  const paths = new Set([
    ...sources.map((row) => row.sourcePath),
    ...entrypoints.filter((row) => row.kind !== "read-only").map((row) => row.executablePath).filter((row) => SOURCE_EXTENSIONS.has(path.extname(row))),
  ]);
  for (const relative of paths) {
    if (allowed.has(relative)) continue;
    const filePath = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) continue;
    for (const finding of scanDirectWriterPathViolations(filePath)) {
      errors.push(`DIRECT_WRITER_PATH_FORBIDDEN:${relative}:${finding.line}:${finding.signal}`);
    }
  }
}

export function runPlanningWriterOwnershipGuard() {
  const errors = [];
  const archiveOwnerIds = readArchiveOwnerIds();
  const targets = createPlanningWriterTargetRegistry(archiveOwnerIds);
  const targetIds = new Set(targets.map((row) => row.id));
  const sourceIds = new Set(PLANNING_WRITER_SOURCES.map((row) => row.id));
  errors.push(...validatePlanningWriterTargets(targets, archiveOwnerIds));
  validateSources(PLANNING_WRITER_SOURCES, PLANNING_WRITER_EXCLUSIONS, PLANNING_WRITER_ENTRYPOINTS, targetIds, errors);
  validateEntrypoints(PLANNING_WRITER_ENTRYPOINTS, sourceIds, targetIds, errors);
  validateDirectPaths(PLANNING_WRITER_SOURCES, PLANNING_WRITER_EXCLUSIONS, PLANNING_WRITER_ENTRYPOINTS, errors);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors.sort()),
    counts: Object.freeze({
      archiveOwners: archiveOwnerIds.length,
      targets: targets.length,
      sources: PLANNING_WRITER_SOURCES.length,
      exclusions: PLANNING_WRITER_EXCLUSIONS.length,
      entrypoints: PLANNING_WRITER_ENTRYPOINTS.length,
      unresolved: errors.length,
    }),
    digest: planningWriterRegistryDigest({ targets }),
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runPlanningWriterOwnershipGuard();
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`[planning:writer:guard] ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`[planning:writer:guard] PASS targets=${result.counts.targets} sources=${result.counts.sources} exclusions=${result.counts.exclusions} entrypoints=${result.counts.entrypoints} digest=${result.digest}\n`);
  }
}
