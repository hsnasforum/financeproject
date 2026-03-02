import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");
const PLANNING_API_DIR = path.join(APP_DIR, "api", "planning", "v2");
const OPS_API_DIR = path.join(APP_DIR, "api", "ops");
const DEBUG_DIR = path.join(APP_DIR, "debug");

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

async function walk(dirPath, out = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, out);
      continue;
    }
    if (entry.isFile()) out.push(absolute);
  }
  return out;
}

async function gatherFiles(baseDir, suffix) {
  const files = await walk(baseDir);
  return files.filter((filePath) => filePath.endsWith(suffix));
}

function hasLocalGuard(content) {
  return /assertLocalHost\s*\(/.test(content) || /guardLocalRequest\s*\(/.test(content);
}

function hasDevGate(content) {
  return /onlyDev\s*\(/.test(content);
}

function hasDebugGate(content) {
  return /isDebugPageAccessible\s*\(/.test(content);
}

function parseRouteProxy(content) {
  const importMatch = content.match(
    /import\s+\{\s*(GET|POST|PUT|PATCH|DELETE)\s+as\s+([A-Za-z0-9_$]+)\s*\}\s+from\s+["'](.+)["'];?/,
  );
  if (!importMatch) return null;
  const method = importMatch[1];
  const alias = importMatch[2];
  const source = importMatch[3];
  const exportPattern = new RegExp(
    `export\\s+async\\s+function\\s+${method}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\breturn\\s+${alias}\\s*\\(`,
  );
  if (!exportPattern.test(content)) return null;
  return { source };
}

async function resolveProxyFile(fromFile, sourcePath) {
  if (!sourcePath.startsWith(".")) return null;
  const baseDir = path.dirname(fromFile);
  const candidates = [];
  const resolved = path.resolve(baseDir, sourcePath);
  if (resolved.endsWith(".ts") || resolved.endsWith(".tsx")) {
    candidates.push(resolved);
  } else {
    candidates.push(`${resolved}.ts`);
    candidates.push(`${resolved}.tsx`);
  }
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function validateRouteGroup(name, files) {
  const issues = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    let scanContent = content;
    const proxy = parseRouteProxy(content);
    if (proxy) {
      const proxyFile = await resolveProxyFile(filePath, proxy.source);
      if (proxyFile) {
        scanContent = await fs.readFile(proxyFile, "utf8");
      }
    }
    if (!hasLocalGuard(scanContent)) {
      issues.push(`${name}: missing local guard -> ${rel(filePath)}`);
    }
    if (!hasDevGate(scanContent)) {
      issues.push(`${name}: missing onlyDev gate -> ${rel(filePath)}`);
    }
  }
  return issues;
}

async function run() {
  const planningRoutes = await gatherFiles(PLANNING_API_DIR, "route.ts");
  const opsRoutes = await gatherFiles(OPS_API_DIR, "route.ts");
  const debugPages = await gatherFiles(DEBUG_DIR, "page.tsx");

  const issues = [
    ...(await validateRouteGroup("planning-api", planningRoutes)),
    ...(await validateRouteGroup("ops-api", opsRoutes)),
  ];

  for (const pagePath of debugPages) {
    const content = await fs.readFile(pagePath, "utf8");
    if (!hasDebugGate(content)) {
      issues.push(`debug-page: missing debug gate -> ${rel(pagePath)}`);
    }
  }

  if (issues.length > 0) {
    console.error(`[planning:v2:scan:guards] FAIL (${issues.length})`);
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    `[planning:v2:scan:guards] PASS planningRoutes=${planningRoutes.length} opsRoutes=${opsRoutes.length} debugPages=${debugPages.length}`,
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[planning:v2:scan:guards] FAIL ${message}`);
  process.exit(1);
});
