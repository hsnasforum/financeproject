import { cn } from "@/lib/utils";

type LoadingStateProps = {
  title?: string;
  description?: string;
  className?: string;
  testId?: string;
};

export function LoadingState({
  title = "불러오는 중입니다",
  description = "잠시만 기다려주세요.",
  className,
  testId,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-slate-50 p-5 animate-pulse",
        className,
      )}
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </div>
  );
}

