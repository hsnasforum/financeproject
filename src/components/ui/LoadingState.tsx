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
        "rounded-[2rem] border border-slate-200/60 bg-white p-8 text-center animate-pulse",
        className,
      )}
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
      <p className="text-base font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-bold text-slate-500">{description}</p>
    </div>
  );
}

