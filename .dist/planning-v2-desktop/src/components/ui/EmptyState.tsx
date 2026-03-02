import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: "search" | "data" | "default";
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

const iconMap = {
  search: "/visuals/empty-search.png",
  data: "/visuals/empty-data.png",
  default: "/visuals/empty-default.png",
};

export function EmptyState({
  title,
  description,
  icon = "default",
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[2.5rem] border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center",
        className
      )}
    >
      <div className="relative mb-6 h-40 w-40 overflow-hidden rounded-3xl">
        <Image
          src={iconMap[icon]}
          alt=""
          fill
          className="object-cover opacity-80"
          priority
        />
      </div>
      <h3 className="text-xl font-bold tracking-tight text-slate-900">{title}</h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          variant="outline"
          onClick={onAction}
          className="mt-8 rounded-full bg-white px-8"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
