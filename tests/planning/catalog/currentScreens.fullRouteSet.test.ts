import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentScreensPath = fileURLToPath(new URL("../../../docs/current-screens.md", import.meta.url));
const appRoot = path.resolve(path.dirname(currentScreensPath), "../src/app");
const repoRoot = path.resolve(path.dirname(currentScreensPath), "..");
const buildAppRoutesManifestPath = path.join(repoRoot, ".next", "app-path-routes-manifest.json");
const buildAppPathsManifestPath = path.join(repoRoot, ".next", "server", "app-paths-manifest.json");
const EXCLUDED_METADATA_ROUTES = new Set(["/_global-error", "/_not-found", "/favicon.ico"]);

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

function listBuildPageRoutes(): string[] {
  if (existsSync(buildAppRoutesManifestPath)) {
      const parsed = JSON.parse(readFileSync(buildAppRoutesManifestPath, "utf8")) as Record<string, string>;
      return Object.values(parsed)
      .filter((route) => route.startsWith("/"))
      .filter((route) => !route.startsWith("/api/"))
      .filter((route) => !EXCLUDED_METADATA_ROUTES.has(route))
      .sort((a, b) => a.localeCompare(b));
  }

  if (existsSync(buildAppPathsManifestPath)) {
    const parsed = JSON.parse(readFileSync(buildAppPathsManifestPath, "utf8")) as Record<string, string>;
      return Object.keys(parsed)
      .map((route) => route.replace(/\/page$/, ""))
      .filter((route) => route.startsWith("/"))
      .filter((route) => !route.startsWith("/api/"))
      .filter((route) => !EXCLUDED_METADATA_ROUTES.has(route))
      .sort((a, b) => a.localeCompare(b));
  }

  return listPageRoutes(appRoot).sort((a, b) => a.localeCompare(b));
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
  it("matches every page route in build metadata or src/app fallback", () => {
    const pageRoutes = new Set(listBuildPageRoutes());
    const documentedRoutes = new Set(readDocumentedRoutes());

    expect([...pageRoutes].filter((route) => !documentedRoutes.has(route))).toEqual([]);
    expect([...documentedRoutes].filter((route) => !pageRoutes.has(route))).toEqual([]);
  });
});
