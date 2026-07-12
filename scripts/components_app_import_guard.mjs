import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const NON_PRODUCTION_FILE_PATTERN = /\.(?:spec|test|stories)\.[cm]?[jt]sx?$/;
const SOURCE_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/;

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function scriptKindFor(filePath) {
  if (/\.[cm]?tsx$/.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.[cm]?jsx$/.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function listComponentSourceFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") stack.push(fullPath);
        continue;
      }
      if (!SOURCE_FILE_PATTERN.test(entry.name)) continue;
      if (NON_PRODUCTION_FILE_PATTERN.test(entry.name)) continue;
      files.push(fullPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function moduleText(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return `${node.head.text}\${...}`;
  return null;
}

function collectCreateRequireAliases(sourceFile) {
  const createRequireNames = new Set();
  const moduleNamespaceNames = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (moduleText(statement.moduleSpecifier) !== "node:module") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === "createRequire") createRequireNames.add(element.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      moduleNamespaceNames.add(bindings.name.text);
    }
  }

  const loaderNames = new Set();

  function isCreateRequireCall(node) {
    if (!ts.isCallExpression(node)) return false;
    if (ts.isIdentifier(node.expression)) return createRequireNames.has(node.expression.text);
    if (!ts.isPropertyAccessExpression(node.expression)) return false;
    return ts.isIdentifier(node.expression.expression)
      && moduleNamespaceNames.has(node.expression.expression.text)
      && node.expression.name.text === "createRequire";
  }

  function visit(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && isCreateRequireCall(node.initializer)
    ) {
      loaderNames.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return loaderNames;
}

export function collectModuleReferences(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const createRequireAliases = collectCreateRequireAliases(sourceFile);
  const references = [];

  function add(kind, node, specifierNode) {
    const specifier = moduleText(specifierNode);
    if (!specifier) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    references.push({
      kind,
      specifier,
      line: position.line + 1,
      column: position.character + 1,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node.importClause?.isTypeOnly ? "import-type" : "import", node, node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      add("export", node, node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add("import-type", node, node.argument.literal);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      add("import-equals", node, node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length >= 1) {
      const [argument] = node.arguments;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add("dynamic-import", node, argument);
      } else if (
        ts.isIdentifier(node.expression)
        && (node.expression.text === "require" || createRequireAliases.has(node.expression.text))
      ) {
        add(node.expression.text === "require" ? "require" : "create-require", node, argument);
      } else if (
        ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "module"
        && node.expression.name.text === "require"
      ) {
        add("module-require", node, argument);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

export function resolveProjectTarget(cwd, importer, specifier) {
  const staticPrefix = specifier.split("${", 1)[0] ?? specifier;
  let absolutePath;
  if (staticPrefix.startsWith("@/")) {
    absolutePath = path.join(cwd, "src", staticPrefix.slice(2));
  } else if (staticPrefix.startsWith(".")) {
    absolutePath = path.resolve(cwd, path.dirname(importer), staticPrefix);
  } else {
    return null;
  }

  const relativePath = toPosix(path.relative(cwd, absolutePath));
  if (relativePath === ".." || relativePath.startsWith("../")) return null;
  return relativePath.replace(SOURCE_EXTENSION_PATTERN, "").replace(/\/$/, "");
}

export function findComponentsAppImportViolations(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const componentsRoot = path.resolve(cwd, options.componentsRoot ?? "src/components");
  const violations = [];

  for (const filePath of listComponentSourceFiles(componentsRoot)) {
    const importer = toPosix(path.relative(cwd, filePath));
    const source = fs.readFileSync(filePath, "utf8");
    for (const reference of collectModuleReferences(filePath, source)) {
      const target = resolveProjectTarget(cwd, importer, reference.specifier);
      if (!target || (target !== "src/app" && !target.startsWith("src/app/"))) continue;
      violations.push({
        code: "components-app-import",
        file: importer,
        ...reference,
        target,
      });
    }
  }

  return violations.sort((left, right) => {
    const leftKey = `${left.file}:${String(left.line).padStart(8, "0")}:${String(left.column).padStart(8, "0")}:${left.kind}`;
    const rightKey = `${right.file}:${String(right.line).padStart(8, "0")}:${String(right.column).padStart(8, "0")}:${right.kind}`;
    return leftKey.localeCompare(rightKey);
  });
}

function run() {
  const cwd = process.cwd();
  const files = listComponentSourceFiles(path.join(cwd, "src", "components"));
  const violations = findComponentsAppImportViolations({ cwd });
  if (violations.length > 0) {
    console.error("[components:app-import:guard] src/components -> src/app imports found:");
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line}:${violation.column} ${violation.kind} ${violation.specifier} -> ${violation.target}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[components:app-import:guard] PASS scanned=${files.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run();
}
