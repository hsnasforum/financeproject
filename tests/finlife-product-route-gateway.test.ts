import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const productRouteKinds = [
  "deposit",
  "saving",
  "pension",
  "mortgage-loan",
  "rent-house-loan",
  "credit-loan",
] as const;

describe("finlife product API routes", () => {
  it("use the shared product route gateway instead of importing the source client directly", () => {
    for (const kind of productRouteKinds) {
      const filePath = path.join(process.cwd(), "src", "app", "api", "finlife", kind, "route.ts");
      const source = fs.readFileSync(filePath, "utf-8");

      expect(source).toContain("createFinlifeProductRoute");
      expect(source).not.toContain("@/lib/finlife/source");
      expect(source).not.toContain("getFinlifeProducts(");
    }
  });
});
