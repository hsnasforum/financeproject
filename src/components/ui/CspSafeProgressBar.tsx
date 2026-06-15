import { cn } from "@/lib/utils";

type CspSafeProgressBarProps = {
  value: number;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
  ariaLabel?: string;
};

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function CspSafeProgressBar({
  value,
  className,
  trackClassName,
  fillClassName,
  ariaLabel,
}: CspSafeProgressBarProps) {
  const progress = clampProgress(value);

  return (
    <svg
      className={cn("block h-full w-full", className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      {...(ariaLabel ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true })}
    >
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx="50"
        fill="currentColor"
        className={cn("text-surface-muted", trackClassName)}
      />
      <rect
        x="0"
        y="0"
        width={progress}
        height="100"
        rx="50"
        fill="currentColor"
        className={cn("text-primary transition-all duration-500", fillClassName)}
      />
    </svg>
  );
}
