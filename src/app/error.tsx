"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ErrorState } from "@/components/ui/ErrorState";

type RootErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
};

function getSafeErrorId(error: RootErrorProps["error"]) {
  const digest = typeof error.digest === "string" ? error.digest.trim() : "";
  return /^[A-Za-z0-9_-]{1,128}$/.test(digest) ? digest : "";
}

export default function RootError({ error, reset, unstable_retry: retryServerContent }: RootErrorProps) {
  const errorId = getSafeErrorId(error);
  const retry = retryServerContent ?? reset;

  return (
    <Container className="py-16 sm:py-24">
      <section aria-labelledby="route-error-title" className="mx-auto max-w-2xl">
        <h1 className="sr-only" id="route-error-title">화면을 불러오지 못했습니다</h1>
        <ErrorState
          message="일시적인 문제일 수 있습니다. 다시 시도하거나 홈으로 이동해주세요."
          onRetry={retry}
          testId="route-error-state"
          title="화면을 불러오지 못했습니다"
        />
        {errorId ? (
          <p className="mt-3 text-xs font-medium text-slate-500">오류 ID: {errorId}</p>
        ) : null}
        <Link className="mt-6 inline-flex text-sm font-bold text-primary underline-offset-4 hover:underline" href="/">
          홈으로 이동
        </Link>
      </section>
    </Container>
  );
}
