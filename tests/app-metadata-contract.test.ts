import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPublicProductDetailMetadata,
  PUBLIC_METADATA_ROUTES,
  PUBLIC_PAGE_METADATA,
  ROOT_PUBLIC_METADATA,
  type PublicMetadataRoute,
} from "../src/lib/navigation/publicMetadata";
import { ROUTE_POLICY_REGISTRY, resolveRouteVisibility } from "../src/lib/navigation/routeRegistry";

const ownerByRoute: Record<PublicMetadataRoute, string> = {
  "/": "../src/app/page.tsx",
  "/benefits": "../src/app/benefits/page.tsx",
  "/dashboard": "../src/app/dashboard/page.tsx",
  "/feedback": "../src/app/feedback/page.tsx",
  "/gov24": "../src/app/gov24/page.tsx",
  "/help": "../src/app/help/page.tsx",
  "/housing/afford": "../src/app/housing/afford/page.tsx",
  "/housing/subscription": "../src/app/housing/subscription/page.tsx",
  "/invest/companies": "../src/app/invest/companies/page.tsx",
  "/planning": "../src/app/planning/page.tsx",
  "/planning/reports": "../src/app/planning/reports/page.tsx",
  "/planning/reports/[id]": "../src/app/planning/reports/[id]/page.tsx",
  "/planning/runs": "../src/app/planning/runs/page.tsx",
  "/planning/runs/[id]": "../src/app/planning/runs/[id]/page.tsx",
  "/planning/trash": "../src/app/planning/trash/page.tsx",
  "/products": "../src/app/products/page.tsx",
  "/products/catalog": "../src/app/products/catalog/layout.tsx",
  "/products/catalog/[id]": "../src/app/products/catalog/[id]/page.tsx",
  "/products/compare": "../src/app/products/compare/layout.tsx",
  "/products/credit-loan": "../src/app/products/credit-loan/page.tsx",
  "/products/mortgage-loan": "../src/app/products/mortgage-loan/page.tsx",
  "/products/pension": "../src/app/products/pension/page.tsx",
  "/products/rent-house-loan": "../src/app/products/rent-house-loan/page.tsx",
  "/public/dart": "../src/app/public/dart/page.tsx",
  "/public/dart/company": "../src/app/public/dart/company/page.tsx",
  "/recommend": "../src/app/recommend/layout.tsx",
  "/recommend/history": "../src/app/recommend/history/page.tsx",
  "/settings": "../src/app/settings/page.tsx",
  "/settings/alerts": "../src/app/settings/alerts/page.tsx",
  "/settings/backup": "../src/app/settings/backup/page.tsx",
  "/settings/data-sources": "../src/app/settings/data-sources/page.tsx",
  "/settings/maintenance": "../src/app/settings/maintenance/page.tsx",
  "/settings/recovery": "../src/app/settings/recovery/page.tsx",
  "/tools/fx": "../src/app/tools/fx/page.tsx",
};

const DYNAMIC_METADATA_ROUTES = new Set<PublicMetadataRoute>([
  "/products/catalog/[id]",
]);

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
  it("covers every public-stable page route from the route SSOT", () => {
    const stablePageRoutes = ROUTE_POLICY_REGISTRY
      .filter((entry) => entry.kind === "page" && entry.visibility === "public-stable")
      .map((entry) => entry.pattern);

    expect(PUBLIC_METADATA_ROUTES).toEqual(stablePageRoutes);
    expect(PUBLIC_METADATA_ROUTES).toHaveLength(34);

    for (const route of PUBLIC_METADATA_ROUTES) {
      expect(resolveRouteVisibility(route)).toMatchObject({
        kind: "page",
        visibility: "public-stable",
        status: "stable",
      });
    }
  });

  it("keeps route titles and descriptions non-empty, unique and free of private identifiers", () => {
    const titles = PUBLIC_METADATA_ROUTES.map(renderedTitle);
    const descriptions = PUBLIC_METADATA_ROUTES.map((route) => PUBLIC_PAGE_METADATA[route].description);

    expect(ROOT_PUBLIC_METADATA.title).toEqual({ default: "MMD", template: "%s | MMD" });
    expect(titles).toContain("개인 재무진단과 금융상품 비교 | MMD");
    expect(titles).toContain("금융상품 상세 | MMD");
    expect(titles).toContain("데이터 소스 상태 | MMD");
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(descriptions.every((description) => description.trim().length > 0)).toBe(true);
    expect(JSON.stringify(PUBLIC_PAGE_METADATA)).not.toMatch(/profileId|runId|저장 시각|timestamp/i);
  });

  it("keeps one server metadata owner per route and uses dynamic metadata only for product detail", () => {
    for (const route of PUBLIC_METADATA_ROUTES) {
      const ownerSource = readSource(ownerByRoute[route]);
      if (DYNAMIC_METADATA_ROUTES.has(route)) {
        expect(ownerSource.match(/export\s+async\s+function\s+generateMetadata\s*\(/g)).toHaveLength(1);
        expect(ownerSource).toContain("buildPublicProductDetailMetadata");
        continue;
      }

      const metadataExport = new RegExp(
        `export\\s+const\\s+metadata\\s*=\\s*PUBLIC_PAGE_METADATA\\["${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\]\\s*;`,
        "g",
      );
      expect(ownerSource.match(metadataExport), route).toHaveLength(1);
    }

    for (const clientPage of [
      "../src/app/recommend/page.tsx",
      "../src/app/products/catalog/page.tsx",
      "../src/app/products/compare/page.tsx",
    ]) {
      const source = readSource(clientPage);
      expect(source.startsWith('"use client";'), clientPage).toBe(true);
      expect(source, clientPage).not.toMatch(/export const metadata|generateMetadata/);
    }
  });

  it("builds distinct, bounded product-detail metadata and falls back safely", () => {
    const first = buildPublicProductDetailMetadata({ id: "P-001" });
    const second = buildPublicProductDetailMetadata({ id: "P-002" });
    const named = buildPublicProductDetailMetadata({
      id: "P-001",
      productName: " 테스트   예금 ",
      providerName: "테스트은행",
    });

    expect(first.title).toBe("상품 P-001 상세");
    expect(second.title).toBe("상품 P-002 상세");
    expect(first.title).not.toBe(second.title);
    expect(named).toEqual({
      title: "테스트 예금 상품 상세",
      description: "테스트은행에서 제공하는 테스트 예금의 기간별 금리와 우대조건, 제공 정보를 현재 비교 기준으로 확인합니다.",
    });
    expect(buildPublicProductDetailMetadata({ id: "" })).toEqual({
      title: "금융상품 상세",
      description: "선택한 금융상품의 기간별 금리와 우대조건, 제공 정보를 현재 비교 기준으로 확인합니다.",
    });
  });
});
