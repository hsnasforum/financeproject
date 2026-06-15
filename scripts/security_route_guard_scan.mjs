import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src", "app");
const API_DIR = path.join(ROOT, "src", "app", "api");
const OPS_APP_DIR = path.join(ROOT, "src", "app", "ops");
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_PROXY_DEPTH = 2;
const PROD_HIDDEN_PAGE_ALLOWLIST = new Set([
  "src/app/dashboard/artifacts/page.tsx",
]);

const PUBLIC_MUTATION_ALLOWLIST = new Map([
  [
    "src/app/api/feedback/route.ts",
    "public feedback submission endpoint without session auth",
  ],
  [
    "src/app/api/feedback/[id]/route.ts",
    "public feedback detail workflow remains sessionless; follow-up auth split tracked separately",
  ],
  [
    "src/app/api/gov24/simple-find/route.ts",
    "public gov24 simple-find request is intentionally browser-callable without auth cookies",
  ],
  [
    "src/app/api/gov24/sync/route.ts",
    "gov24 sync trigger remains browser-callable to preserve current surface; follow-up auth hardening tracked separately",
  ],
  [
    "src/app/api/planner/compute/route.ts",
    "planner compute API is intentionally public to support the planner UI without session state",
  ],
  [
    "src/app/api/recommend/route.ts",
    "recommend API is intentionally public to support the recommendation UI without session state",
  ],
  [
    "src/app/api/sync/smoke/route.ts",
    "trusted-origin command route explicitly allowlisted to preserve smoke tooling behavior",
  ],
]);

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

function readExportedMethods(content) {
  return [...content.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)].map((match) => match[1]);
}

function parseProxyImports(content) {
  const out = [];
  for (const match of content.matchAll(/import\s+\{\s*([^}]+)\}\s+from\s+["'](.+)["'];?/g)) {
    const spec = match[1] ?? "";
    const source = match[2] ?? "";
    if (!source.startsWith(".")) continue;
    for (const token of spec.split(",")) {
      const normalized = token.trim();
      const parsed = /^(GET|POST|PUT|PATCH|DELETE)(?:\s+as\s+([A-Za-z0-9_$]+))?$/.exec(normalized);
      if (!parsed) continue;
      out.push({
        method: parsed[1],
        alias: parsed[2] ?? parsed[1],
        source,
      });
    }
  }
  return out;
}

async function resolveRelativeModule(fromFile, sourcePath) {
  const resolved = path.resolve(path.dirname(fromFile), sourcePath);
  const candidates = [];
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

async function collectScanContents(filePath, seen = new Set(), depth = 0) {
  const normalized = path.resolve(filePath);
  if (seen.has(normalized)) return [];
  seen.add(normalized);

  const content = await fs.readFile(normalized, "utf8");
  const out = [{ filePath: normalized, content }];
  if (depth >= MAX_PROXY_DEPTH) return out;

  for (const entry of parseProxyImports(content)) {
    if (!content.includes(`return ${entry.alias}(`)) continue;
    const target = await resolveRelativeModule(normalized, entry.source);
    if (!target) continue;
    out.push(...await collectScanContents(target, seen, depth + 1));
  }

  return out;
}

function hasOnlyDevGuard(content) {
  return /onlyDev\s*\(/.test(content) || /guardDev(Read|Mutation)Request\s*\(/.test(content);
}

function hasLocalGuard(content) {
  return /guardDev(Read|Mutation)Request\s*\(/.test(content)
    || /guardLocalRequest\s*\(/.test(content)
    || /assertLocalHost\s*\(/.test(content);
}

function hasMutationGuard(content) {
  return /guardDevMutationRequest\s*\(/.test(content)
    || /consumeVaultCsrfOrThrow\s*\(/.test(content)
    || /assertCsrf\s*\(/.test(content)
    || /requireCsrf\s*\(/.test(content)
    || /assertSameOrigin\s*\(/.test(content)
    || /decideTrustedOrigin\s*\(/.test(content);
}

function hasPublicMutationGuard(content) {
  return (/assertSameOrigin\s*\(/.test(content) && (/(assertCsrf|requireCsrf)\s*\(/.test(content)))
    || (/assertLocalHost\s*\(/.test(content) && /assertSameOrigin\s*\(/.test(content))
    || /decideTrustedOrigin\s*\(/.test(content);
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

async function validateDevRoutes(files) {
  const issues = [];
  for (const filePath of files) {
    const scanContents = await collectScanContents(filePath);
    const joined = scanContents.map((entry) => entry.content).join("\n");
    const methods = readExportedMethods((await fs.readFile(filePath, "utf8")));
    const relPath = rel(filePath);

    if (!hasOnlyDevGuard(joined)) {
      issues.push(`dev-route: missing onlyDev gate -> ${relPath}`);
    }
    if (!hasLocalGuard(joined)) {
      issues.push(`dev-route: missing local-only guard -> ${relPath}`);
    }
    if (methods.some((method) => MUTATION_METHODS.has(method)) && !hasMutationGuard(joined)) {
      issues.push(`dev-route: missing mutation guard -> ${relPath}`);
    }
  }
  return issues;
}

async function validateOpsRoutes(files) {
  const issues = [];
  for (const filePath of files) {
    const scanContents = await collectScanContents(filePath);
    const joined = scanContents.map((entry) => entry.content).join("\n");
    const methods = readExportedMethods((await fs.readFile(filePath, "utf8")));
    const relPath = rel(filePath);

    if (!hasOnlyDevGuard(joined)) {
      issues.push(`ops-route: missing onlyDev gate -> ${relPath}`);
    }
    if (!hasLocalGuard(joined)) {
      issues.push(`ops-route: missing local-only guard -> ${relPath}`);
    }
    if (methods.some((method) => MUTATION_METHODS.has(method)) && !hasMutationGuard(joined)) {
      issues.push(`ops-route: missing mutation guard -> ${relPath}`);
    }
  }
  return issues;
}

async function validatePublicMutationRoutes(files) {
  const issues = [];
  for (const filePath of files) {
    const relPath = rel(filePath);
    if (relPath.startsWith("src/app/api/dev/")) continue;
    if (relPath.startsWith("src/app/api/ops/")) continue;

    const content = await fs.readFile(filePath, "utf8");
    const methods = readExportedMethods(content);
    if (!methods.some((method) => MUTATION_METHODS.has(method))) continue;

    const scanContents = await collectScanContents(filePath);
    const joined = scanContents.map((entry) => entry.content).join("\n");
    if (hasPublicMutationGuard(joined)) continue;
    if (PUBLIC_MUTATION_ALLOWLIST.has(relPath)) continue;

    issues.push(`public-route: missing explicit mutation policy -> ${relPath}`);
  }
  return issues;
}

async function validateProdHiddenPages(files) {
  const issues = [];
  for (const filePath of files) {
    const relPath = rel(filePath);
    const isDebugPage = relPath.startsWith("src/app/debug/");
    const isDevPage = relPath.startsWith("src/app/dev/");
    const isAllowlistedPage = PROD_HIDDEN_PAGE_ALLOWLIST.has(relPath);
    if (!isDebugPage && !isDevPage && !isAllowlistedPage) continue;

    const content = await fs.readFile(filePath, "utf8");
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

async function validateOpsActions(files) {
  const issues = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    if (!hasOpsActionGuard(content)) {
      issues.push(`ops-action: missing assertNotProduction/local/same-origin -> ${rel(filePath)}`);
    }
  }
  return issues;
}

async function run() {
  const apiRoutes = await gatherFiles(API_DIR, "route.ts");
  const appPages = await gatherFiles(APP_DIR, "page.tsx");
  const devRoutes = apiRoutes.filter((filePath) => rel(filePath).startsWith("src/app/api/dev/"));
  const opsRoutes = apiRoutes.filter((filePath) => rel(filePath).startsWith("src/app/api/ops/"));
  const prodHiddenPages = appPages.filter((filePath) => isProdHiddenPagePath(rel(filePath)));
  const opsActions = await gatherFiles(OPS_APP_DIR, "actions.ts");

  const issues = [
    ...(await validateDevRoutes(devRoutes)),
    ...(await validateOpsRoutes(opsRoutes)),
    ...(await validatePublicMutationRoutes(apiRoutes)),
    ...(await validateProdHiddenPages(prodHiddenPages)),
    ...(await validateOpsActions(opsActions)),
  ];

  if (issues.length > 0) {
    console.error(`[sec:scan:routes] FAIL (${issues.length})`);
    for (const issue of issues) {
      console.error(` - ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    `[sec:scan:routes] PASS devRoutes=${devRoutes.length} opsRoutes=${opsRoutes.length} prodHiddenPages=${prodHiddenPages.length} publicMutationAllowlist=${PUBLIC_MUTATION_ALLOWLIST.size} opsActions=${opsActions.length}`,
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sec:scan:routes] FAIL ${message}`);
  process.exit(1);
});
