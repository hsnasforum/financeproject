import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeHero, type HomeHeroSlide } from "@/components/home/HomeHero";

const HOME_HERO_SOURCE = fs.readFileSync("src/components/home/HomeHero.tsx", "utf8");
const WHITE = "#ffffff";
const SLATE_500 = "#64748b";

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f\d]{2}/gi) ?? [];
    const linear = channels.map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };

  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const slides: HomeHeroSlide[] = [
  {
    id: "first",
    eyebrow: "첫 슬라이드",
    title: "첫 번째 안내",
    metric: "1",
    metricCaption: "첫 지표",
    summary: "첫 요약",
    footer: "첫 안내",
    badge: "첫째",
    theme: "sky",
  },
  {
    id: "second",
    eyebrow: "둘째 슬라이드",
    title: "두 번째 안내",
    metric: "2",
    metricCaption: "둘째 지표",
    summary: "둘째 요약",
    footer: "둘째 안내",
    badge: "둘째",
    theme: "emerald",
  },
];

describe("HomeHero manual carousel contract", () => {
  it("does not create an autoplay timer", () => {
    expect(HOME_HERO_SOURCE).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame)\s*\(/);
    expect(HOME_HERO_SOURCE).not.toContain("useEffect");
    expect(HOME_HERO_SOURCE).not.toContain("4500");
  });

  it("exposes carousel, current slide, and manual control semantics", () => {
    const markup = renderToStaticMarkup(<HomeHero slides={slides} />);

    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-roledescription="캐러셀"');
    expect(markup).toContain('aria-label="시작 가이드 추천 슬라이드"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-roledescription="슬라이드"');
    expect(markup).toContain('aria-label="1 / 2: 첫 번째 안내"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
    expect(markup).toContain('aria-controls="home-hero-active-slide"');
    expect(markup).toContain('aria-label="2번 슬라이드: 두 번째 안내"');
    expect(markup).toContain("group inline-flex h-11 w-11");
    expect(markup).toContain("focus-visible:outline-2");
    expect(markup).toContain("bg-slate-500");
    expect(contrastRatio(SLATE_500, WHITE)).toBeGreaterThanOrEqual(3);
  });
});
