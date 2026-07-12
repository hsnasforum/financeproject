import { Button } from "@/components/ui/Button";
import { DevUnlockShortcutLink, isDevUnlockCsrfMessage } from "@/components/DevUnlockShortcutLink";
import { cn } from "@/lib/utils";

type ErrorStateActionProps =
  | {
      onRetry: () => void;
      retryLabel?: string;
    }
  | {
      onRetry?: never;
      retryLabel?: never;
    };

type ErrorStateProps = {
  title?: string;
  message?: string;
  kind?: "generic" | "auth-required";
  className?: string;
  testId?: string;
} & ErrorStateActionProps;

function normalizeErrorMessage(message: string | undefined, kind: ErrorStateProps["kind"]): string {
  const raw = typeof message === "string" ? message.trim() : "";
  if (!raw) {
    return kind === "auth-required"
      ? "로그인 상태를 확인한 뒤 다시 시도해주세요."
      : "요청을 처리하지 못했습니다. 다시 시도해주세요.";
  }
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const cleaned = firstLine.replace(/^Error:\s*/i, "").trim();
  return cleaned || "요청을 처리하지 못했습니다. 다시 시도해주세요.";
}

export function ErrorState({
  title,
  message,
  kind = "generic",
  retryLabel,
  onRetry,
  className,
  testId,
}: ErrorStateProps) {
  const shouldShowDevUnlockLink = isDevUnlockCsrfMessage(message);
  const resolvedTitle = title ?? (kind === "auth-required" ? "로그인이 필요합니다" : "오류가 발생했습니다");
  const isAuthRequired = kind === "auth-required";

  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        isAuthRequired ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50",
        className,
      )}
      data-testid={testId}
      role="alert"
    >
      <p className={cn("text-sm font-semibold", isAuthRequired ? "text-amber-900" : "text-rose-900")}>{resolvedTitle}</p>
      <p className={cn("mt-1 text-xs", isAuthRequired ? "text-amber-800" : "text-rose-800")}>{normalizeErrorMessage(message, kind)}</p>
      {shouldShowDevUnlockLink ? (
        <p className="mt-2 text-xs font-semibold text-rose-900">
          <DevUnlockShortcutLink className="text-rose-900" />
        </p>
      ) : null}
      {onRetry ? (
        <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">
          {retryLabel ?? "다시 시도"}
        </Button>
      ) : null}
    </div>
  );
}
