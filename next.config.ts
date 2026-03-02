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

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
