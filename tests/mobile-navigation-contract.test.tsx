import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";

const navigationState = vi.hoisted(() => ({ pathname: "/planning" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

const CSS_SOURCE = fs.readFileSync("src/components/ui/MobileBottomNav.module.css", "utf8");
const HEADER_SOURCE = fs.readFileSync("src/components/SiteHeader.tsx", "utf8");
const LAYOUT_SOURCE = fs.readFileSync("src/app/layout.tsx", "utf8");

function renderMobileBottomNav(pathname: string): string {
  navigationState.pathname = pathname;
  return renderToStaticMarkup(<MobileBottomNav />);
}

function readActiveHref(markup: string): string | undefined {
  const activeLink = markup.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0];
  return activeLink?.match(/href="([^"]+)"/)?.[1];
}

describe("mobile primary navigation contract", () => {
  beforeEach(() => {
    navigationState.pathname = "/planning";
  });

  it("labels the mobile navigation and marks exactly one active destination", () => {
    const planningMarkup = renderMobileBottomNav("/planning/runs");
    expect(planningMarkup).toContain('aria-label="모바일 주 메뉴"');
    expect(planningMarkup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(readActiveHref(planningMarkup)).toBe("/planning");
    expect(planningMarkup).toContain("min-h-11 min-w-11");

    const explorationMarkup = renderMobileBottomNav("/public/dart");
    expect(explorationMarkup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(readActiveHref(explorationMarkup)).toBe("/products");
  });

  it("renders the fixed nav and matching flow spacer together", () => {
    const markup = renderMobileBottomNav("/settings/backup");
    expect(markup).toContain('data-testid="mobile-bottom-nav-root"');
    expect(markup).toContain('data-testid="mobile-bottom-nav-spacer"');
    expect(markup).toContain('data-testid="mobile-bottom-nav"');
  });

  it("removes both nav and spacer from ops and dev routes", () => {
    for (const pathname of ["/ops", "/dev/data", "/debug/unified", "/dashboard/artifacts"]) {
      expect(renderMobileBottomNav(pathname)).toBe("");
    }
  });

  it("does not mark a public header destination current on dev routes", () => {
    navigationState.pathname = "/dashboard/artifacts";
    const markup = renderToStaticMarkup(<SiteHeader />);

    expect(markup).toContain('aria-label="데스크톱 주 메뉴"');
    expect(markup).toContain('aria-label="태블릿 주 메뉴"');
    expect(markup).not.toContain('aria-current="page"');
  });

  it("keeps breakpoint ownership and safe-area sizing in one CSS contract", () => {
    expect(HEADER_SOURCE).toMatch(/data-testid="mobile-header-actions"[\s\S]*?className="hidden items-center gap-2 md:flex"/);
    expect(HEADER_SOURCE).toContain('className="hidden border-t border-slate-100 bg-white md:block lg:hidden"');
    expect(CSS_SOURCE).toContain("--mobile-bottom-nav-content-height: 5rem");
    expect(CSS_SOURCE).toContain("--mobile-bottom-nav-border-height: 1px");
    expect(CSS_SOURCE).toContain("env(safe-area-inset-bottom, 0px)");
    expect(CSS_SOURCE).toContain("height: calc(var(--mobile-bottom-nav-content-height) + var(--mobile-bottom-nav-border-height) + var(--mobile-bottom-nav-safe-area))");
    expect(CSS_SOURCE).toContain("@media (min-width: 768px)");
    expect(LAYOUT_SOURCE).toContain('viewportFit: "cover"');
    expect(LAYOUT_SOURCE).not.toContain("pb-20 md:pb-0");
  });
});
