import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
};

export function StatCard({ label, value, description, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-black tabular-nums tracking-tight text-slate-900">{value}</p>
        {trend && (
          <span
            className={cn(
              "text-xs font-bold",
              trend.isPositive ? "text-emerald-600" : "text-amber-600"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-slate-400">{description}</p>
      )}
    </Card>
  );
}
