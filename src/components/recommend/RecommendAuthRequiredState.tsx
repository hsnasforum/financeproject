"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";

export type RecommendAuthCallbackPath = "/recommend" | "/recommend/history";

export function resolveRecommendAuthCallbackPath(pathname: string | null): RecommendAuthCallbackPath {
  return pathname === "/recommend/history" ? "/recommend/history" : "/recommend";
}

export function RecommendAuthRequiredState({ message }: { message: string }) {
  const callbackPath = resolveRecommendAuthCallbackPath(usePathname());
  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`;

  return (
    <div className="min-h-screen bg-surface-muted px-4 py-16">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-primary">추천 사용자 확인 필요</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-navy">로그인 후 추천 기록을 확인해 주세요.</h1>
        <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">{message}</p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
          추천 조건과 최근 결과, 저장 기록은 로그인한 사용자별로 분리됩니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={signInHref} prefetch={false} variant="primary">로그인하기</ButtonLink>
          <ButtonLink href="/" variant="outline">홈으로 돌아가기</ButtonLink>
        </div>
      </section>
    </div>
  );
}
