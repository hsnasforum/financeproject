import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));
const appRoot = path.resolve(path.dirname(currentScreensPath), "../src/app");
const repoRoot = path.resolve(path.dirname(currentScreensPath), "..");
const buildAppRoutesManifestCandidates = [
  path.join(repoRoot, ".next", "app-path-routes-manifest.json"),
  path.join(repoRoot, ".next-build-check", "app-path-routes-manifest.json"),
];
const buildAppPathsManifestCandidates = [
  path.join(repoRoot, ".next", "server", "app-paths-manifest.json"),
  path.join(repoRoot, ".next", "dev", "server", "app-paths-manifest.json"),
  path.join(repoRoot, ".next-build-check", "server", "app-paths-manifest.json"),
];
const EXCLUDED_METADATA_ROUTES = new Set(["/_global-error", "/_not-found", "/favicon.ico"]);

function findFirstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizeManifestRoute(route: string): string {
  const normalized = route.replace(/\/(page|route)$/, "");
  return normalized === "" ? "/" : normalized;
}

function listPageRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listPageRoutes(entryPath));
      continue;
    }
    if (!entry.isFile() || entry.name !== "page.tsx") continue;
    const routePath = `/${path.relative(appRoot, path.dirname(entryPath)).replace(/\\/g, "/")}`;
    out.push(routePath === "/." ? "/" : routePath);
  }
  return out;
}

function readBuildPageRoutes(): string[] | null {
  const buildAppRoutesManifestPath = findFirstExistingPath(buildAppRoutesManifestCandidates);
  if (buildAppRoutesManifestPath) {
    const parsed = JSON.parse(readFileSync(buildAppRoutesManifestPath, "utf8")) as Record<string, string>;
    return Object.values(parsed)
      .map(normalizeManifestRoute)
      .filter((route) => route.startsWith("/"))
      .filter((route) => !route.startsWith("/api/"))
      .filter((route) => !EXCLUDED_METADATA_ROUTES.has(route))
      .sort((a, b) => a.localeCompare(b));
  }

  const buildAppPathsManifestPath = findFirstExistingPath(buildAppPathsManifestCandidates);
  if (buildAppPathsManifestPath) {
    const parsed = JSON.parse(readFileSync(buildAppPathsManifestPath, "utf8")) as Record<string, string>;
    return Object.keys(parsed)
      .filter((route) => route.endsWith("/page") || route.endsWith("/route"))
      .map(normalizeManifestRoute)
      .filter((route) => route.startsWith("/"))
      .filter((route) => !route.startsWith("/api/"))
      .filter((route) => !EXCLUDED_METADATA_ROUTES.has(route))
      .sort((a, b) => a.localeCompare(b));
  }

  return null;
}

function listKnownPageRoutes(): string[] {
  // Use source pages as the authoritative route surface during local dirty-worktree edits.
  // `.next` manifests can lag behind newly added pages and cause false negatives.
  const sourceRoutes = listPageRoutes(appRoot).sort((a, b) => a.localeCompare(b));
  if (sourceRoutes.length > 0) {
    return sourceRoutes;
  }

  return readBuildPageRoutes() ?? [];
}

function readDocumentedRoutes(): string[] {
  const markdown = readFileSync(currentScreensPath, "utf8");
  return [...markdown.matchAll(/- `([^`]+)`/g)]
    .map((match) => match[1])
    .filter((route) => route.startsWith("/"))
    .filter((route) => !route.startsWith("/api/"))
    .filter((route) => !EXCLUDED_METADATA_ROUTES.has(route))
    .filter((route) => !route.includes("*"));
}

describe("current screens full route set", () => {
  it("matches every page route in src/app or build fallback", () => {
    const pageRoutes = new Set(listKnownPageRoutes());
    const documentedRoutes = new Set(readDocumentedRoutes());

    expect([...pageRoutes].filter((route) => !documentedRoutes.has(route))).toEqual([]);
    expect([...documentedRoutes].filter((route) => !pageRoutes.has(route))).toEqual([]);
  });
});
