import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const COMPONENTS_DIR = path.join(SRC_DIR, "components");
const APP_DIR = path.join(SRC_DIR, "app");
const DOCS_DIR = path.join(ROOT, "docs");
const DOCS_RELEASES_DIR = path.join(DOCS_DIR, "releases");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const ROUTES_INVENTORY_PATH = path.join(DOCS_DIR, "routes-inventory.md");
const CURRENT_SCREENS_PATH = path.join(DOCS_DIR, "current-screens.md");
const PLANNING_API_DIR = path.join(APP_DIR, "api", "planning", "v2");
const PLANNING_CORE_DIR = path.join(SRC_DIR, "lib", "planning", "core");
const README_PATH = path.join(ROOT, "README.md");

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

function isDocFile(filePath) {
  return [".md", ".mdx", ".txt"].includes(path.extname(filePath));
}

async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(absolute));
    } else if (entry.isFile() && isCodeFile(absolute)) {
      out.push(absolute);
    }
  }
  return out;
}

async function walkDocFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkDocFiles(absolute));
    } else if (entry.isFile() && isDocFile(absolute)) {
      out.push(absolute);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function maskSnippet(input) {
  return input
    .replace(/(process\.env\.)[A-Z0-9_]+/g, "$1***")
    .replace(/(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN(?:_DISPATCH)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|Authorization\s*:\s*Bearer)\S*/gi, "$1***")
    .replace(/\.data\/[^\s"'`)]*/g, ".data/***");
}

function lineNumberFromIndex(content, index) {
  if (index < 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function isUseClientFile(content) {
  return /^\s*["']use client["'];?/m.test(content);
}

async function collectClientFiles() {
  const componentFiles = await walkFiles(COMPONENTS_DIR);
  const appFiles = await walkFiles(APP_DIR);
  const useClientAppFiles = [];
  for (const filePath of appFiles) {
    const content = await fs.readFile(filePath, "utf8");
    if (isUseClientFile(content)) useClientAppFiles.push(filePath);
  }
  return Array.from(new Set([...componentFiles, ...useClientAppFiles]));
}

async function collectPlanningApiFiles() {
  const files = await walkFiles(PLANNING_API_DIR);
  return files.filter((filePath) => path.basename(filePath) === "route.ts");
}

async function collectPlanningCoreFiles() {
  return walkFiles(PLANNING_CORE_DIR);
}

async function collectBundleScriptFiles() {
  const files = await walkFiles(SCRIPTS_DIR);
  return files.filter((filePath) => path.basename(filePath).toLowerCase().includes("bundle"));
}

async function collectReleaseDocFiles() {
  return walkDocFiles(DOCS_RELEASES_DIR);
}

async function collectLegacyRouteScanFiles() {
  const srcCodeFiles = await walkFiles(SRC_DIR);
  const docFiles = await walkDocFiles(DOCS_DIR);
  const rootDocs = [README_PATH];
  const existingRootDocs = [];
  for (const filePath of rootDocs) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) existingRootDocs.push(filePath);
    } catch {
      // ignore
    }
  }
  return [...srcCodeFiles, ...docFiles, ...existingRootDocs];
}

function checkClientFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const envMatches = [...line.matchAll(/process\.env\.([A-Z0-9_]+)/g)];
    for (const match of envMatches) {
      const key = match[1];
      const allowed = key === "NODE_ENV" || key.startsWith("NEXT_PUBLIC_");
      if (!allowed) {
        issues.push({
          filePath,
          line: index + 1,
          code: "CLIENT_ENV",
          message: "client 코드에서 민감 env 참조 감지",
          snippet: maskSnippet(line.trim()),
        });
      }
    }

    if (/\b(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN(?:_DISPATCH)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|Authorization\s*:\s*Bearer)\b/i.test(line)) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CLIENT_SECRET_PATTERN",
        message: "client 코드에서 민감 키/토큰 패턴 감지",
        snippet: maskSnippet(line.trim()),
      });
    }

    if (line.includes(".data/")) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CLIENT_INTERNAL_PATH",
        message: "client 코드에서 내부 .data 경로 문자열 감지",
        snippet: maskSnippet(line.trim()),
      });
    }

    if (
      line.includes("@/lib/planning/server/")
      || line.includes("/lib/planning/server/")
      || line.includes("../planning/server/")
    ) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CLIENT_SERVER_IMPORT",
        message: "client 코드에서 planning/server import 감지",
        snippet: maskSnippet(line.trim()),
      });
    }
  });

  return issues;
}

function checkPlanningApiFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes(".data/")) {
      issues.push({
        filePath,
        line: index + 1,
        code: "API_INTERNAL_PATH",
        message: "planning API 코드에 내부 .data 경로 문자열 감지",
        snippet: maskSnippet(line.trim()),
      });
    }

    if (/\b(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN(?:_DISPATCH)?|FINLIFE_[A-Z0-9_]*(?:KEY|TOKEN)|Authorization\s*:\s*Bearer)\b/i.test(line)) {
      issues.push({
        filePath,
        line: index + 1,
        code: "API_SECRET_PATTERN",
        message: "planning API 코드에 민감 키/토큰 패턴 감지",
        snippet: maskSnippet(line.trim()),
      });
    }
  });

  const sourceUrlPattern = /sources\s*:\s*\[[\s\S]{0,500}?url\s*:/m;
  const match = sourceUrlPattern.exec(content);
  if (match) {
    issues.push({
      filePath,
      line: lineNumberFromIndex(content, match.index),
      code: "API_SOURCES_URL",
      message: "planning API 응답 구성에 sources.url 노출 패턴 감지",
      snippet: "sources: [ ... url: ... ]",
    });
  }

  const responseLeakPattern = /(jsonOk|jsonError|Response\.json|NextResponse\.json|ok\()([^\n]{0,300})(\.data\/|Bearer\s+|ECOS_API_KEY|GITHUB_TOKEN)/i;
  const responseLeakMatch = responseLeakPattern.exec(content);
  if (responseLeakMatch) {
    issues.push({
      filePath,
      line: lineNumberFromIndex(content, responseLeakMatch.index),
      code: "API_RESPONSE_LEAK",
      message: "planning API 응답 구성에서 내부 경로/토큰 패턴 감지",
      snippet: maskSnippet(responseLeakMatch[0].trim()),
    });
  }

  return issues;
}

function checkBundleScriptFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/\.data\/planning\/(profiles|runs)\b/i.test(line)) return;
    issues.push({
      filePath,
      line: index + 1,
      code: "BUNDLE_USER_DATA_INCLUDE",
      message: "bundle 스크립트에 사용자 데이터 경로 포함 감지",
      snippet: maskSnippet(line.trim()),
    });
  });
  return issues;
}

function checkReleaseDocFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.includes(".data/planning/profiles")) return;
    issues.push({
      filePath,
      line: index + 1,
      code: "RELEASE_DOC_PROFILE_PATH",
      message: "docs/releases 문서에 profile 내부 경로 문자열 감지",
      snippet: maskSnippet(line.trim()),
    });
  });
  return issues;
}

function checkPlanningCoreFile(filePath, content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (
      line.includes("/planning/server/")
      || line.includes("../server/")
      || line.includes("./server/")
    ) {
      issues.push({
        filePath,
        line: index + 1,
        code: "CORE_SERVER_IMPORT",
        message: "planning/core 코드에서 planning/server import 감지",
        snippet: maskSnippet(line.trim()),
      });
    }
  });
  return issues;
}

const LEGACY_PLANNER_ROUTE_PATTERN = /(^|[\s("'`])\/planner(?:[/?#][^\s"'`)]*)?(?=$|[\s)"'`.,;:])/;
const LEGACY_PLANNER_ROUTE_ALLOWLIST = new Set([
  "src/lib/planning/legacyPlannerRedirect.ts",
]);

function checkLegacyPlannerRoute(filePath, content) {
  if (LEGACY_PLANNER_ROUTE_ALLOWLIST.has(rel(filePath))) return [];
  const issues = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!LEGACY_PLANNER_ROUTE_PATTERN.test(line)) return;
    issues.push({
      filePath,
      line: index + 1,
      code: "LEGACY_PLANNER_ROUTE",
      message: "레거시 /planner 경로 문자열 감지 (/planning 사용 필요)",
      snippet: maskSnippet(line.trim()),
    });
  });
  return issues;
}

function normalizeRouteRoot(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw.startsWith("/")) return "";
  const first = raw.slice(1).split("/")[0]?.trim() ?? "";
  if (!first || first.startsWith("(") || first.startsWith("[") || first.startsWith("_")) return "";
  return first;
}

async function collectTopLevelRouteRoots() {
  const entries = await fs.readdir(APP_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizeRouteRoot(`/${entry.name}`))
    .filter((item) => item.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function parseDocumentedRouteRoots(content) {
  const roots = new Set();
  const add = (routePath) => {
    const root = normalizeRouteRoot(routePath);
    if (root) roots.add(root);
  };

  for (const match of content.matchAll(/`(\/[^`]+)`/g)) {
    add(match[1]);
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const bulletMatch = /^-\s+(\/[^\s#]+)/.exec(trimmed);
    if (bulletMatch) add(bulletMatch[1]);
  }
  return roots;
}

async function run() {
  const clientFiles = await collectClientFiles();
  const planningApiFiles = await collectPlanningApiFiles();
  const planningCoreFiles = await collectPlanningCoreFiles();
  const legacyRouteScanFiles = await collectLegacyRouteScanFiles();
  const bundleScriptFiles = await collectBundleScriptFiles();
  const releaseDocFiles = await collectReleaseDocFiles();
  const topLevelRouteRoots = await collectTopLevelRouteRoots();

  const issues = [];
  const warnings = [];

  for (const filePath of clientFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkClientFile(filePath, content));
  }

  for (const filePath of planningApiFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkPlanningApiFile(filePath, content));
  }

  for (const filePath of planningCoreFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkPlanningCoreFile(filePath, content));
  }

  for (const filePath of bundleScriptFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkBundleScriptFile(filePath, content));
  }

  for (const filePath of releaseDocFiles) {
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkReleaseDocFile(filePath, content));
  }

  for (const filePath of legacyRouteScanFiles) {
    if (path.resolve(filePath) === path.resolve(ROUTES_INVENTORY_PATH)) continue;
    if (path.resolve(filePath) === path.resolve(CURRENT_SCREENS_PATH)) continue;
    const content = await fs.readFile(filePath, "utf8");
    issues.push(...checkLegacyPlannerRoute(filePath, content));
  }

  try {
    const inventoryContent = await fs.readFile(ROUTES_INVENTORY_PATH, "utf8");
    const documentedRoots = parseDocumentedRouteRoots(inventoryContent);
    const missingRoots = topLevelRouteRoots.filter((root) => !documentedRoots.has(root));
    if (missingRoots.length > 0) {
      warnings.push({
        code: "ROUTE_INVENTORY_MISSING_TOP_LEVEL",
        message: `routes-inventory 누락 top-level route: ${missingRoots.map((item) => `/${item}`).join(", ")}`,
      });
    }
  } catch {
    warnings.push({
      code: "ROUTE_INVENTORY_NOT_FOUND",
      message: `routes inventory 문서를 찾을 수 없습니다: ${rel(ROUTES_INVENTORY_PATH)}`,
    });
  }

  if (issues.length > 0) {
    console.error(`[planning:v2:guard] FAIL (${issues.length} issues)`);
    for (const issue of issues) {
      console.error(` - ${issue.code} ${rel(issue.filePath)}:${issue.line} ${issue.message}`);
      if (issue.snippet) {
        console.error(`   ${issue.snippet}`);
      }
    }
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn(`[planning:v2:guard] WARN (${warnings.length} warnings)`);
    for (const warning of warnings) {
      console.warn(` - ${warning.code} ${warning.message}`);
    }
  }

  console.log(
    `[planning:v2:guard] PASS clientFiles=${clientFiles.length} planningApiFiles=${planningApiFiles.length} planningCoreFiles=${planningCoreFiles.length} bundleScriptFiles=${bundleScriptFiles.length} releaseDocFiles=${releaseDocFiles.length} legacyRouteScanFiles=${legacyRouteScanFiles.length}`,
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[planning:v2:guard] FAIL ${message}`);
  process.exit(1);
});
