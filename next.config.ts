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
  serverExternalPackages: [
    "@prisma/adapter-better-sqlite3",
    "@prisma/client",
    "better-sqlite3",
  ],
  // Public snapshots are copied explicitly; local .data never belongs in a trace.
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*"],
    "next-server": ["./.data/**/*"],
  },
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@prisma/adapter-better-sqlite3/**/*",
      "./node_modules/@prisma/driver-adapter-utils/**/*",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/bindings/**/*",
      "./node_modules/file-uri-to-path/**/*",
      "./node_modules/.pnpm/@prisma+adapter-better-sqlite3@*/node_modules/@prisma/adapter-better-sqlite3/**/*",
      "./node_modules/.pnpm/@prisma+driver-adapter-utils@*/node_modules/@prisma/driver-adapter-utils/**/*",
      "./node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/**/*",
      "./node_modules/.pnpm/bindings@*/node_modules/bindings/**/*",
      "./node_modules/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path/**/*",
    ],
  },
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
