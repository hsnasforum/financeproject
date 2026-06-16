import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function findPlanningRouteFiles(dir = "src/app/api/planning"): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findPlanningRouteFiles(fullPath));
      continue;
    }
    if (entry.name === "route.ts") {
      files.push(fullPath);
    }
  }
  return files.sort();
}

describe("planning route current-user scope coverage", () => {
  const standardizedRouteFiles = [
    "src/app/api/planning/profiles/[id]/route.ts",
    "src/app/api/planning/profiles/route.ts",
    "src/app/api/planning/v2/profiles/[id]/route.ts",
    "src/app/api/planning/v2/profiles/route.ts",
    "src/app/api/planning/v2/runs/[id]/action-progress/route.ts",
  ];

  it("keeps standardized planning API routes behind current-user scope", () => {
    const missing = standardizedRouteFiles.filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return !source.includes("withPlanningRouteUser(")
        && !source.includes("requirePlanningRouteUser(");
    });

    expect(missing).toEqual([]);
  });

  it("keeps planning API routes on the routeAuth boundary", () => {
    const directCurrentUserRoutes = findPlanningRouteFiles().filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return source.includes("withCurrentPlanningUser(")
        || source.includes("/planning/auth/currentUser")
        || source.includes("../auth/currentUser");
    });

    expect(directCurrentUserRoutes).toEqual([]);
  });
});
