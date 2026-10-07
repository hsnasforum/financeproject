import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findPagesDir } from "next/dist/lib/find-pages-dir";
import type { PAGE_TYPES } from "next/dist/lib/page-types";
import { loadBindings } from "next/dist/build/swc";
import { getPageStaticInfo } from "next/dist/build/analysis/get-page-static-info";

describe("Next production middleware discovery", () => {
  it("finds the entry beside app and statically extracts every matcher", async () => {
    const { appDir, pagesDir } = findPagesDir(process.cwd());
    const conventionRoot = path.dirname((pagesDir || appDir)!);
    const pageFilePath = path.join(conventionRoot, "middleware.ts");
    expect(fs.existsSync(pageFilePath)).toBe(true);

    await loadBindings();
    const info = await getPageStaticInfo({
      pageFilePath,
      page: "/src/middleware",
      pageType: "pages" as PAGE_TYPES.PAGES,
      nextConfig: { pageExtensions: ["tsx", "ts", "jsx", "js"] },
      isDev: false,
    });
    expect(info.hadUnsupportedValue).toBe(false);
    expect(info.middleware?.matchers).toMatchObject([
      { originalSource: "/feedback/:path*" },
      { originalSource: "/api/feedback/:path*" },
      { originalSource: "/ops/:path*" },
      { originalSource: "/api/ops/:path*" },
      {
        originalSource: "/((?!_next/static|_next/image|favicon.ico).*)",
        missing: [
          { type: "header", key: "next-router-prefetch" },
          { type: "header", key: "purpose", value: "prefetch" },
        ],
      },
    ]);
  });
});
