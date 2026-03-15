"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import { cn } from "@/lib/utils";

export type HomeHeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  metric: string;
  metricCaption: string;
  summary: string;
  footer: string;
  badge: string;
  theme: "sky" | "emerald" | "amber";
  href?: string;
  ctaLabel?: string;
};

const DEFAULT_SLIDES: HomeHeroSlide[] = [
  {
    id: "default-planning",
    eyebrow: "내 금융 플랜",
    title: "이번 달 액션",
    metric: "TOP 1",
    metricCaption: "비상금 흐름부터 점검",
    summary: "첫 플랜 저장 후 바로 반영",
    footer: "지금 바로 시작",
    badge: "READY",
    theme: "sky",
    href: "/planning",
    ctaLabel: "플래닝 시작",
  },
  {
    id: "default-report",
    eyebrow: "MMD 흐름",
    title: "추천부터 리포트까지",
    metric: "MMD",
    metricCaption: "한 번에 비교",
    summary: "복잡한 설명 없이 바로 선택",
    footer: "실행 저장 후 자동 연결",
    badge: "REPORT",
    theme: "emerald",
    href: "/planning/reports",
    ctaLabel: "리포트 보기",
  },
];

const THEME_MAP: Record<HomeHeroSlide["theme"], { front: string; orb: string; backA: string; backB: string }> = {
  sky: {
    front: "bg-[linear-gradient(145deg,#8fd0ff_0%,#66afff_45%,#4e82ff_100%)] text-white shadow-[0_28px_48px_rgba(77,129,255,0.30)]",
    orb: "bg-[radial-gradient(circle_at_35%_30%,#6df4d5_0%,#58c9ff_45%,#3764ff_100%)]",
    backA: "bg-[#77bbff]/55",
    backB: "bg-[#7ac8ff]/70",
  },
  emerald: {
    front: "bg-[linear-gradient(145deg,#7be7d0_0%,#2bc2a3_46%,#0e8f7a_100%)] text-white shadow-[0_28px_48px_rgba(16,185,129,0.26)]",
    orb: "bg-[radial-gradient(circle_at_35%_30%,#d9fff5_0%,#8bf3d9_45%,#1ea88d_100%)]",
    backA: "bg-[#88ecd7]/50",
    backB: "bg-[#71e1c8]/70",
  },
  amber: {
    front: "bg-[linear-gradient(145deg,#ffe29a_0%,#ffc85c_44%,#ff9b54_100%)] text-slate-950 shadow-[0_28px_48px_rgba(251,146,60,0.24)]",
    orb: "bg-[radial-gradient(circle_at_35%_30%,#fff7d6_0%,#ffd46f_45%,#ff9952_100%)]",
    backA: "bg-[#ffd994]/50",
    backB: "bg-[#ffc86b]/68",
  },
};

export function HomeHero({ slides = DEFAULT_SLIDES }: { slides?: HomeHeroSlide[] }) {
  const resolvedSlides = slides.length > 0 ? slides : DEFAULT_SLIDES;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (resolvedSlides.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % resolvedSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [resolvedSlides.length]);

  const normalizedIndex = resolvedSlides.length > 0 ? activeIndex % resolvedSlides.length : 0;
  const activeSlide = resolvedSlides[normalizedIndex] ?? DEFAULT_SLIDES[0];
  const theme = THEME_MAP[activeSlide.theme];

  return (
    <section className="border-b border-slate-200 bg-slate-100">
      <Container className="px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Better Decisions, Financial Wellness</p>
            <h1 className="mt-5 text-[2.75rem] font-black leading-[1.12] tracking-[-0.04em] text-slate-950 md:text-[4.4rem]">
              한눈에 비교하고
              <br />
              내 돈 흐름에 맞게
              <br />
              바로 움직이는 MMD
            </h1>
            <p className="mt-5 max-w-lg text-lg font-medium leading-relaxed text-slate-600">
              플래닝, 추천, 리포트를 한 흐름으로 묶어 지금 필요한 선택만 바로 보여줍니다.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-14 items-center rounded-2xl bg-emerald-600 px-8 text-base font-black text-white shadow-xl shadow-emerald-200 transition-all hover:bg-emerald-700 hover:-translate-y-0.5 active:scale-95"
                href="/planning"
                prefetch={devPlanningPrefetch("/planning")}
              >
                플래닝 시작하기
              </Link>
              <Link
                className="inline-flex h-14 items-center rounded-2xl bg-slate-900 px-8 text-base font-black text-white shadow-xl shadow-slate-200 transition-all hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95"
                href="/products/catalog"
              >
                전체 상품 보기
              </Link>
            </div>
          </div>

          <div className="relative flex min-h-[320px] items-center justify-center lg:min-h-[420px]">
            <div className="absolute h-72 w-72 rounded-full bg-white/30 blur-3xl" />
            <div className="absolute -right-2 top-6 h-32 w-32 rounded-full bg-[#6dd3ff]/20 blur-3xl" />
            <div className="hero-card-stage relative h-[264px] w-[388px] md:h-[312px] md:w-[492px]">
              <HeroCard className={cn("hero-card hero-card-back left-8 top-12 rotate-[-10deg]", theme.backA)} />
              <HeroCard className={cn("hero-card hero-card-mid left-14 top-7 rotate-[-4deg]", theme.backB)} />
              <HeroCard
                className={cn("hero-card hero-card-front left-20 top-0", theme.front)}
                href={activeSlide.href}
                orbClassName={theme.orb}
                slide={activeSlide}
                foreground
              />
            </div>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3">
          {resolvedSlides.map((slide, index) => {
            const isActive = index === normalizedIndex;
            return (
              <button
                aria-label={`${index + 1}번 슬라이드 보기`}
                className={cn(
                  "h-2.5 rounded-full bg-white/70 transition-all duration-300",
                  isActive ? "w-8 bg-white" : "w-2.5 hover:bg-white/90",
                )}
                key={slide.id}
                onClick={() => setActiveIndex(index)}
                type="button"
              />
            );
          })}
        </div>
        {activeSlide.href ? (
          <div className="mt-5 flex justify-center">
            <Link
              className="inline-flex h-11 items-center rounded-full bg-white/80 px-5 text-sm font-extrabold text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-0.5"
              href={activeSlide.href}
              prefetch={devPlanningPrefetch(activeSlide.href)}
            >
              {activeSlide.ctaLabel ?? "지금 보기"}
            </Link>
          </div>
        ) : null}
      </Container>
    </section>
  );
}

function HeroCard(props: {
  className: string;
  href?: string;
  orbClassName?: string;
  slide?: HomeHeroSlide;
  foreground?: boolean;
}) {
  const content = (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[24px] border border-white/20 p-0 shadow-[0_22px_44px_rgba(15,23,42,0.10)] md:rounded-[22px]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0.05)_38%,rgba(255,255,255,0)_100%)]" />
      <div className="absolute -right-6 top-4 h-16 w-16 rounded-full bg-white/20 blur-2xl md:-right-8 md:top-5 md:h-20 md:w-20" />
      {props.foreground && props.slide ? (
        <>
          <div className="relative z-10 flex items-start justify-between">
            <span className="text-[13px] font-bold opacity-90 md:text-sm">{props.slide.eyebrow}</span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-current">{props.slide.badge}</span>
          </div>
          <div className="relative z-10">
            <p className="text-[13px] font-semibold opacity-85 md:text-[15px]">{props.slide.title}</p>
            <p className="mt-2 text-[2.45rem] leading-none font-black tracking-[-0.04em] md:text-[3.6rem]">{props.slide.metric}</p>
            <p className="mt-1.5 text-[13px] font-bold opacity-95 md:text-[15px]">{props.slide.metricCaption}</p>
          </div>
          <div className="relative z-10 flex items-end justify-between gap-2 md:gap-3">
            <div className="max-w-[180px] md:max-w-[238px]">
              <p className="text-[12px] font-medium leading-5 opacity-80 md:text-[13px]">{props.slide.summary}</p>
              <p className="mt-1.5 text-[13px] font-bold md:text-[15px]">{props.slide.footer}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className={cn("h-12 w-12 rounded-full shadow-[inset_0_1px_12px_rgba(255,255,255,0.25),0_10px_24px_rgba(16,185,129,0.22)] md:h-16 md:w-16", props.orbClassName)} />
              {props.href ? <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] opacity-85">GO</span> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  if (props.href) {
    return (
      <Link
        className={`absolute block h-[204px] w-[308px] rounded-[30px] p-5 transition-transform duration-500 md:h-[232px] md:w-[360px] md:rounded-[28px] md:p-6 ${props.className}`}
        href={props.href}
        prefetch={devPlanningPrefetch(props.href)}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`absolute h-[204px] w-[308px] rounded-[30px] p-5 transition-transform duration-500 md:h-[232px] md:w-[360px] md:rounded-[28px] md:p-6 ${props.className}`}>
      {content}
    </div>
  );
}
