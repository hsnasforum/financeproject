import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

function detectWorkspaceRoot(startDir: string, maxDepth = 8): string {
  let current = path.resolve(startDir);

  for (let i = 0; i < maxDepth; i += 1) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && "workspaces" in parsed) {
          return current;
        }
      } catch {
        // ignore parse errors, continue upward
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(startDir);
}

const workspaceRoot = detectWorkspaceRoot(__dirname);
const playwrightDistDir = process.env.PLAYWRIGHT_DIST_DIR?.trim();
const playwrightTsconfigPath = process.env.PLAYWRIGHT_TSCONFIG_PATH?.trim();
const useIsolatedDistDir = Boolean(playwrightDistDir && playwrightDistDir !== ".next");

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost", "::1", "[::1]"],
  ...(playwrightDistDir ? { distDir: playwrightDistDir } : {}),
  experimental: {
    // [build-runtime] Next webpack build worker가 현재 저장소에서 compile 종료를 불안정하게 만들어 비활성화한다.
    webpackBuildWorker: false,
    ...(useIsolatedDistDir ? { lockDistDir: false } : {}),
  },
  ...(playwrightTsconfigPath ? { typescript: { tsconfigPath: playwrightTsconfigPath } } : {}),
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
