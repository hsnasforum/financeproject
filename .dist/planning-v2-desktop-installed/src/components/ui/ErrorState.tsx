import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
  testId?: string;
};

function normalizeErrorMessage(message?: string): string {
  const raw = typeof message === "string" ? message.trim() : "";
  if (!raw) return "요청을 처리하지 못했습니다. 다시 시도해주세요.";
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const cleaned = firstLine.replace(/^Error:\s*/i, "").trim();
  return cleaned || "요청을 처리하지 못했습니다. 다시 시도해주세요.";
}

export function ErrorState({
  title = "오류가 발생했습니다",
  message,
  retryLabel,
  onRetry,
  className,
  testId,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-rose-200 bg-rose-50 p-5",
        className,
      )}
      data-testid={testId}
      role="alert"
    >
      <p className="text-sm font-semibold text-rose-900">{title}</p>
      <p className="mt-1 text-xs text-rose-800">{normalizeErrorMessage(message)}</p>
      {retryLabel && onRetry ? (
        <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

