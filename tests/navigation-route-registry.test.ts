import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getAdminNavItems,
  getPublicBottomNavItems,
  getPublicDesktopNavItems,
  isExplicitPageRoute,
  isNavigationItemActive,
  isOpsOrDevRoute,
  isRoutePatternMatch,
  isSegmentAwarePrefixMatch,
  resolveRouteVisibility,
} from "../src/lib/navigation/routeRegistry";

const siteHeaderPath = fileURLToPath(new URL("../src/components/SiteHeader.tsx", import.meta.url));
const mobileBottomNavPath = fileURLToPath(new URL("../src/components/ui/MobileBottomNav.tsx", import.meta.url));

describe("navigation route registry", () => {
  it("feeds desktop and mobile public nav from the same route source", () => {
    const desktop = getPublicDesktopNavItems();
    const mobile = getPublicBottomNavItems();

    expect(desktop.map((item) => item.id)).toEqual(["dashboard", "planning", "recommend", "products", "settings"]);
    expect(mobile.map((item) => item.id)).toEqual(desktop.map((item) => item.id));
    expect(mobile.map((item) => item.href)).toEqual(desktop.map((item) => item.href));
  });

  it("keeps ops/dev/debug routes out of public nav entries", () => {
    const publicEntries = [...getPublicDesktopNavItems(), ...getPublicBottomNavItems()];
    for (const item of publicEntries) {
      const values = [item.href, ...(item.includePrefixes ?? [])];
      expect(values.some((value) => value.startsWith("/ops"))).toBe(false);
      expect(values.some((value) => value.startsWith("/dev"))).toBe(false);
      expect(values.some((value) => value.startsWith("/debug"))).toBe(false);
      expect(values.some((value) => value.startsWith("/dashboard/artifacts"))).toBe(false);
      expect(item.visibility).toBe("public-stable");
    }

    expect(getAdminNavItems().map((item) => item.href)).toEqual(["/ops"]);
  });

  it("classifies feedback management pages as local ops while keeping submission public", () => {
    expect(resolveRouteVisibility("/feedback")).toMatchObject({
      visibility: "public-stable",
      status: "stable",
    });
    expect(resolveRouteVisibility("/feedback/list")).toMatchObject({
      visibility: "ops",
      status: "ops",
    });
    expect(resolveRouteVisibility("/feedback/feedback-id")).toMatchObject({
      visibility: "ops",
      status: "ops",
    });
    expect(isOpsOrDevRoute("/feedback")).toBe(false);
    expect(isOpsOrDevRoute("/feedback/list")).toBe(true);
    expect(isOpsOrDevRoute("/feedback/feedback-id")).toBe(true);
  });

  it("separates planning v3 official beta entries from internal v3 routes", () => {
    expect(resolveRouteVisibility("/planning/reports/prototype")).toMatchObject({
      visibility: "public-beta",
      status: "beta",
      kind: "page",
    });
    expect(resolveRouteVisibility("/planning/v3/transactions")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
      kind: "redirect",
      canonicalHref: "/planning/v3/transactions/batches",
    });
    expect(resolveRouteVisibility("/planning/v3/transactions/batches")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });
    expect(resolveRouteVisibility("/planning/v3/balances")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });
    expect(resolveRouteVisibility("/planning/v3/profile/drafts")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });

    expect(resolveRouteVisibility("/planning/v3/news")).toMatchObject({ visibility: "internal", status: "internal" });
    expect(resolveRouteVisibility("/planning/v3/transactions/batches/demo")).toMatchObject({
      visibility: "internal",
      status: "internal",
    });
  });

  it("keeps product-adjacent public routes active under financial exploration", () => {
    const products = getPublicDesktopNavItems().find((item) => item.id === "products");
    expect(products).toBeTruthy();
    if (!products) return;

    for (const route of ["/benefits", "/public/dart", "/housing/subscription", "/tools/fx", "/invest/companies", "/compare", "/gov24"]) {
      expect(isNavigationItemActive(route, products)).toBe(true);
    }
  });

  it("matches navigation prefixes only at exact segment boundaries", () => {
    const planning = getPublicDesktopNavItems().find((item) => item.id === "planning");
    const products = getPublicDesktopNavItems().find((item) => item.id === "products");
    expect(planning).toBeTruthy();
    expect(products).toBeTruthy();
    if (!planning || !products) return;

    expect(isSegmentAwarePrefixMatch("/planning/runs", "/planning")).toBe(true);
    expect(isSegmentAwarePrefixMatch("/planning-v3", "/planning")).toBe(false);
    expect(isNavigationItemActive("/planning-v3", planning)).toBe(false);
    expect(isNavigationItemActive("/products-old", products)).toBe(false);
    expect(isNavigationItemActive("/benefits-plus", products)).toBe(false);
    expect(isNavigationItemActive("/publicity", products)).toBe(false);
  });

  it("matches dynamic page patterns without swallowing deeper or sibling routes", () => {
    expect(isRoutePatternMatch("/products/catalog/deposit-1", "/products/catalog/[id]")).toBe(true);
    expect(isRoutePatternMatch("/products/catalog/deposit-1/detail", "/products/catalog/[id]")).toBe(false);
    expect(isRoutePatternMatch("/planner/reports/detail", "/planner/[...slug]")).toBe(true);
    expect(isRoutePatternMatch("/planner", "/planner/[...slug]")).toBe(false);

    expect(resolveRouteVisibility("/planning/reports/run-1")).toMatchObject({
      href: "/planning/reports/[id]",
      kind: "page",
      visibility: "public-stable",
      status: "stable",
    });
    expect(resolveRouteVisibility("/planning/reports/prototype")).toMatchObject({
      href: "/planning/reports/prototype",
      status: "beta",
    });
    expect(resolveRouteVisibility("/planning/reports/run-1/detail")).toMatchObject({
      kind: "unknown",
      visibility: "internal",
      status: "unknown",
    });
    expect(isExplicitPageRoute("/planning/runs/run-1")).toBe(true);
    expect(isExplicitPageRoute("/planning/runs/run-1/detail")).toBe(false);
    expect(isExplicitPageRoute("/report")).toBe(false);
  });

  it("fails closed for unregistered runtime paths", () => {
    for (const route of ["/unregistered", "/products-old", "/planning-v4", "/ops-center", "/devtools"]) {
      expect(resolveRouteVisibility(route)).toMatchObject({
        id: "unknown-route",
        href: route,
        kind: "unknown",
        visibility: "internal",
        status: "unknown",
      });
    }
  });

  it("keeps nav consumers on the shared registry instead of local item arrays", () => {
    const siteHeader = fs.readFileSync(siteHeaderPath, "utf8");
    const mobileBottomNav = fs.readFileSync(mobileBottomNavPath, "utf8");

    expect(siteHeader).toContain("getPublicDesktopNavItems");
    expect(siteHeader).not.toMatch(/const publicNavItems\s*[:=]\s*\[/);
    expect(mobileBottomNav).toContain("getPublicBottomNavItems");
    expect(mobileBottomNav).not.toMatch(/const navItems\s*[:=]\s*\[/);
  });
});
