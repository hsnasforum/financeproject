import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const REMOVED_MODULES = new Set([
  "src/lib/planner/core",
  "src/lib/planner/metrics",
  "src/lib/planner/rules",
]);

const LEGACY_MODEL_MODULE = "src/lib/planner/legacyPlanModel";
const LEGACY_MODEL_ALLOWED_IMPORTERS = new Set([
  "src/lib/planner/insuranceMetrics.ts",
  "src/lib/planner/plan.ts",
  "src/lib/planner/retirementMetrics.ts",
]);

const EXTERNAL_PLANNER_ALLOWED_IMPORTS = new Map([
  [
    "src/app/api/planner/compute/route.ts",
    new Set([
      "src/lib/planner/compute",
      "src/lib/planner/types",
    ]),
  ],
  ["src/components/BenefitsClient.tsx", new Set(["src/lib/planner/actionQuery"])],
  [
    "src/components/PlannerWizard.tsx",
    new Set([
      "src/lib/planner/checklistStorage",
      "src/lib/planner/executionHints",
      "src/lib/planner/insuranceMetrics",
      "src/lib/planner/plan",
      "src/lib/planner/retirementMetrics",
      "src/lib/planner/storage",
      "src/lib/planner/uiPrefs",
    ]),
  ],
  ["src/components/PlaybookModal.tsx", new Set(["src/lib/planner/playbook.ko"])],
  [
    "src/components/SnapshotDeltaCards.tsx",
    new Set([
      "src/lib/planner/plan",
      "src/lib/planner/storage",
    ]),
  ],
  [
    "src/components/plannerWizard/shared.ts",
    new Set([
      "src/lib/planner/checklistStorage",
      "src/lib/planner/insuranceMetrics",
      "src/lib/planner/plan",
      "src/lib/planner/retirementMetrics",
      "src/lib/planner/storage",
      "src/lib/planner/uiPrefs",
    ]),
  ],
  ["src/lib/report/reportBuilder.ts", new Set(["src/lib/planner/types"])],
  ["src/lib/schemas/plannerInput.ts", new Set(["src/lib/planner/types"])],
]);

const PARKED_UI_ALLOWED_IMPORTERS = new Map([
  ["src/components/PlannerClient", new Set()],
  ["src/components/PlannerWizard", new Set(["src/components/PlannerClient.tsx"])],
  ["src/components/ReportClient", new Set()],
]);

const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const SOURCE_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/;
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".cts",
  ".cjs",
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function withoutSourceExtension(value) {
  return value.replace(SOURCE_EXTENSION_PATTERN, "");
}

function isRemovedModuleTarget(target) {
  return [...REMOVED_MODULES].some(
    (modulePath) => target === modulePath || target.startsWith(`${modulePath}/`),
  );
}

function looksLikeBoundarySpecifier(value) {
  const normalized = value.replaceAll("\\", "/");
  return normalized.includes("/lib/planner/")
    || normalized.includes("/planner/")
    || normalized === "@/components/PlannerClient"
    || normalized === "@/components/PlannerWizard"
    || normalized === "@/components/ReportClient";
}

function listSourceFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (SOURCE_FILE_PATTERN.test(entry.name)) out.push(fullPath);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function extractModuleSpecifiers(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  const specifiers = [];

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addStringLiteral(argument);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        addStringLiteral(argument);
      } else if (ts.isStringLiteralLike(argument) && looksLikeBoundarySpecifier(argument.text)) {
        addStringLiteral(argument);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function resolveProjectModule(cwd, importer, specifier) {
  let absolute = "";
  if (specifier.startsWith("@/")) {
    absolute = path.join(cwd, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    absolute = path.resolve(cwd, path.dirname(importer), specifier);
  } else {
    return null;
  }

  const relative = toPosix(path.relative(cwd, absolute));
  if (relative === ".." || relative.startsWith("../")) return null;
  return withoutSourceExtension(relative);
}

function addViolation(violations, violation) {
  violations.push(violation);
}

export function findLegacyPlannerBoundaryViolations(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const violations = [];

  for (const modulePath of REMOVED_MODULES) {
    const restored = [path.join(cwd, modulePath), ...SOURCE_EXTENSIONS.map(
      (extension) => path.join(cwd, `${modulePath}${extension}`),
    )]
      .find((filePath) => fs.existsSync(filePath));
    if (restored) {
      addViolation(violations, {
        code: "removed-file-restored",
        file: toPosix(path.relative(cwd, restored)),
        target: modulePath,
      });
    }
  }

  const files = [
    ...listSourceFiles(path.join(cwd, "src")),
    ...listSourceFiles(path.join(cwd, "tests")),
  ];

  for (const filePath of files) {
    const importer = toPosix(path.relative(cwd, filePath));
    let source = "";
    try {
      source = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    for (const specifier of extractModuleSpecifiers(filePath, source)) {
      const target = resolveProjectModule(cwd, importer, specifier);
      if (!target) continue;

      if (isRemovedModuleTarget(target)) {
        addViolation(violations, {
          code: "removed-module-import",
          file: importer,
          specifier,
          target,
        });
      }

      if (
        importer.startsWith("src/")
        && target === LEGACY_MODEL_MODULE
        && !LEGACY_MODEL_ALLOWED_IMPORTERS.has(importer)
      ) {
        addViolation(violations, {
          code: "legacy-model-importer",
          file: importer,
          specifier,
          target,
        });
      }

      if (
        importer.startsWith("src/")
        && !importer.startsWith("src/lib/planner/")
        && target.startsWith("src/lib/planner/")
      ) {
        const allowedTargets = EXTERNAL_PLANNER_ALLOWED_IMPORTS.get(importer);
        if (!allowedTargets?.has(target)) {
          addViolation(violations, {
            code: "external-planner-importer",
            file: importer,
            specifier,
            target,
          });
        }
      }

      const allowedParkedImporters = PARKED_UI_ALLOWED_IMPORTERS.get(target);
      if (
        importer.startsWith("src/")
        && allowedParkedImporters
        && !allowedParkedImporters.has(importer)
      ) {
        addViolation(violations, {
          code: "parked-ui-importer",
          file: importer,
          specifier,
          target,
        });
      }
    }
  }

  return violations.sort((a, b) => {
    const left = `${a.code}:${a.file}:${a.specifier ?? ""}`;
    const right = `${b.code}:${b.file}:${b.specifier ?? ""}`;
    return left.localeCompare(right);
  });
}

function run() {
  const violations = findLegacyPlannerBoundaryViolations();
  if (violations.length > 0) {
    console.error("[planner:deprecated:guard] legacy planner boundary violations found:");
    for (const violation of violations) {
      const specifier = violation.specifier ? ` import=${violation.specifier}` : "";
      console.error(`- ${violation.code}: ${violation.file}${specifier}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("[planner:deprecated:guard] legacy planner compatibility boundary intact");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run();
}
