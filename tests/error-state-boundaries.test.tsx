import fs from "node:fs";
import { Children, isValidElement, type ComponentProps, type ElementType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootError from "@/app/error";
import NotFound from "@/app/not-found";
import PlanningLoading from "@/app/planning/loading";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";

// @ts-expect-error retryLabel without onRetry is an invalid ErrorState action contract.
const invalidRetryProps: ComponentProps<typeof ErrorState> = { retryLabel: "다시 실행" };
void invalidRetryProps;

const PLANNING_REPORTS_SOURCE = fs.readFileSync("src/components/PlanningReportsDashboardClient.tsx", "utf8");

function findElementByType<Props>(node: ReactNode, type: ElementType): ReactElement<Props> | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as ReactElement<Props>;

  let found: ReactElement<Props> | null = null;
  const props = node.props as { children?: ReactNode };
  Children.forEach(props.children, (child) => {
    if (!found) found = findElementByType<Props>(child, type);
  });
  return found;
}

describe("ErrorState and root route failure boundaries", () => {
  it("uses the safe default retry label and preserves the supplied action", () => {
    const onRetry = vi.fn();
    const state = ErrorState({ message: "일시적인 오류", onRetry });
    const button = findElementByType<{ onClick: () => void; children: ReactNode }>(state, Button);

    expect(button?.props.children).toBe("다시 시도");
    button?.props.onClick();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps the Planning reports caller connected to reload through the shared default action", () => {
    expect(PLANNING_REPORTS_SOURCE).toContain("kind={loadFailureKind}");
    expect(PLANNING_REPORTS_SOURCE).toContain("onRetry={() => window.location.reload()}");
    expect(PLANNING_REPORTS_SOURCE).not.toContain("retryLabel=");
  });

  it("renders auth-required separately from a generic failure", () => {
    const authMarkup = renderToStaticMarkup(<ErrorState kind="auth-required" />);
    const genericMarkup = renderToStaticMarkup(<ErrorState />);

    expect(authMarkup).toContain("로그인이 필요합니다");
    expect(authMarkup).toContain("border-amber-200");
    expect(authMarkup).not.toContain("오류가 발생했습니다");
    expect(genericMarkup).toContain("오류가 발생했습니다");
    expect(genericMarkup).toContain("border-rose-200");
  });

  it("keeps the root error copy safe and prefers a server-content retry", () => {
    const reset = vi.fn();
    const retryServerContent = vi.fn();
    const error = Object.assign(new Error("secret database path"), {
      digest: "safe-digest-123",
      stack: "private stack trace",
    });
    const boundary = RootError({ error, reset, unstable_retry: retryServerContent });
    const errorState = findElementByType<{ onRetry: () => void }>(boundary, ErrorState);
    const markup = renderToStaticMarkup(boundary);

    expect(markup).toContain("화면을 불러오지 못했습니다");
    expect(markup).toContain("오류 ID: safe-digest-123");
    expect(markup).not.toContain("secret database path");
    expect(markup).not.toContain("private stack trace");
    errorState?.props.onRetry();
    expect(retryServerContent).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("falls back to reset and hides malformed or oversized error digests", () => {
    const reset = vi.fn();
    const invalidDigest = Object.assign(new Error("private message"), {
      digest: "../../private/path",
    });
    const oversizedDigest = Object.assign(new Error("private message"), {
      digest: "a".repeat(129),
    });
    const invalidBoundary = RootError({ error: invalidDigest, reset });
    const oversizedMarkup = renderToStaticMarkup(RootError({ error: oversizedDigest, reset }));
    const errorState = findElementByType<{ onRetry: () => void }>(invalidBoundary, ErrorState);
    const invalidMarkup = renderToStaticMarkup(invalidBoundary);

    expect(invalidMarkup).not.toContain("오류 ID:");
    expect(oversizedMarkup).not.toContain("오류 ID:");
    errorState?.props.onRetry();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("keeps 404 and scoped loading states distinct from the generic failure boundary", () => {
    const notFoundMarkup = renderToStaticMarkup(<NotFound />);
    const loadingMarkup = renderToStaticMarkup(<PlanningLoading />);

    expect(notFoundMarkup).toContain("404");
    expect(notFoundMarkup).toContain("요청한 화면을 찾을 수 없습니다");
    expect(notFoundMarkup).not.toContain("화면을 불러오지 못했습니다");
    expect(loadingMarkup).toContain("플래닝 화면을 준비하고 있습니다");
    expect(loadingMarkup).not.toContain("오류가 발생했습니다");
  });
});
