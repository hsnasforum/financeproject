import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_METADATA_ROUTES,
  PUBLIC_PAGE_METADATA,
  ROOT_PUBLIC_METADATA,
  type PublicMetadataRoute,
} from "../src/lib/navigation/publicMetadata";
import {
  getPublicDesktopNavItems,
  resolveRouteVisibility,
} from "../src/lib/navigation/routeRegistry";

const ownerByRoute: Record<PublicMetadataRoute, string> = {
  "/": "../src/app/page.tsx",
  "/dashboard": "../src/app/dashboard/page.tsx",
  "/planning": "../src/app/planning/page.tsx",
  "/recommend": "../src/app/recommend/layout.tsx",
  "/recommend/history": "../src/app/recommend/history/page.tsx",
  "/products": "../src/app/products/page.tsx",
  "/settings": "../src/app/settings/page.tsx",
  "/benefits": "../src/app/benefits/page.tsx",
  "/gov24": "../src/app/gov24/page.tsx",
};

function readSource(relativePath: string): string {
  return fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function renderedTitle(route: PublicMetadataRoute): string {
  const title = PUBLIC_PAGE_METADATA[route].title;
  if (typeof title === "string") return `${title} | MMD`;
  if (title && typeof title === "object" && "absolute" in title) return String(title.absolute);
  if (title && typeof title === "object" && "default" in title) return `${String(title.default)} | MMD`;
  throw new Error(`unsupported title contract for ${route}`);
}

describe("public app metadata contract", () => {
  it("covers landing, every public desktop destination, benefits and Gov24", () => {
    const primaryRoutes = [
      "/",
      ...getPublicDesktopNavItems().map((item) => item.href),
      "/benefits",
      "/gov24",
    ];

    expect(PUBLIC_METADATA_ROUTES.filter((route) => route !== "/recommend/history")).toEqual(primaryRoutes);
    expect(PUBLIC_METADATA_ROUTES).toHaveLength(9);

    for (const route of PUBLIC_METADATA_ROUTES) {
      expect(resolveRouteVisibility(route)).toMatchObject({
        kind: "page",
        visibility: "public-stable",
        status: "stable",
      });
    }
  });

  it("keeps route titles and descriptions non-empty, unique and static", () => {
    const titles = PUBLIC_METADATA_ROUTES.map(renderedTitle);
    const descriptions = PUBLIC_METADATA_ROUTES.map((route) => PUBLIC_PAGE_METADATA[route].description);

    expect(ROOT_PUBLIC_METADATA.title).toEqual({ default: "MMD", template: "%s | MMD" });
    expect(titles).toEqual([
      "개인 재무진단과 금융상품 비교 | MMD",
      "재무 대시보드 | MMD",
      "재무진단·플래닝 | MMD",
      "예적금 상품 추천 비교 | MMD",
      "추천 비교 기록 | MMD",
      "금융상품 탐색 | MMD",
      "내 설정과 데이터 관리 | MMD",
      "공공혜택 탐색 | MMD",
      "보조금24 혜택 찾기 | MMD",
    ]);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(descriptions.every((description) => description.trim().length > 0)).toBe(true);
    expect(JSON.stringify(PUBLIC_PAGE_METADATA)).not.toMatch(/profileId|runId|저장 시각|timestamp/i);
  });

  it("keeps one server metadata owner per route and the recommend page client-only", () => {
    for (const route of PUBLIC_METADATA_ROUTES) {
      const ownerSource = readSource(ownerByRoute[route]);
      const metadataExport = new RegExp(
        `export\\s+const\\s+metadata\\s*=\\s*PUBLIC_PAGE_METADATA\\["${route}"\\]\\s*;`,
        "g",
      );
      expect(ownerSource.match(metadataExport)).toHaveLength(1);
    }

    const recommendPage = readSource("../src/app/recommend/page.tsx");
    expect(recommendPage.startsWith('"use client";')).toBe(true);
    expect(recommendPage).not.toMatch(/export const metadata|generateMetadata/);
  });
});
