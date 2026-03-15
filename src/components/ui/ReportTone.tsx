import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export const reportHeroActionLinkClassName =
  "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95";

export const reportHeroPrimaryActionClassName =
  "rounded-full border border-emerald-400/20 bg-emerald-500 px-5 py-2 text-sm font-black text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400 active:scale-95";

export const reportHeroAnchorLinkClassName =
  "rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white/80 transition hover:bg-white/15";

export const reportHeroMetaChipClassName =
  "rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/80 transition hover:bg-white/15";

export const reportSurfaceFieldClassName =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-200/20";

export const reportSurfaceTableFrameClassName =
  "overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm";

export const reportSurfaceInsetClassName =
  "rounded-2xl border border-slate-100 bg-slate-50/50 px-3 py-3 text-xs text-slate-600 shadow-sm";

export const reportSurfaceDisclosureClassName =
  "rounded-3xl border border-slate-100 bg-slate-50/30 px-4 py-3 shadow-sm";

export const reportSurfaceDisclosureSummaryClassName =
  "cursor-pointer text-sm font-black text-slate-900 uppercase tracking-widest";

export const reportSurfaceButtonClassName =
  "rounded-lg border border-slate-200 bg-white px-3 py-1 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export const reportSurfaceDetailClassName =
  "rounded-lg border border-slate-100 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 shadow-sm";

export const reportSurfacePopoverTriggerClassName =
  "flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-50 shadow-sm";

export const reportSurfacePopoverPanelClassName =
  "pointer-events-auto absolute max-h-[34rem] origin-top overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-200/50 z-50";

type ReportHeroChipTone = "neutral" | "emerald" | "sky" | "amber" | "rose" | "slate";

export function reportHeroToggleButtonClassName(active: boolean) {
  return cn(
    "rounded-md border px-3 py-1.5 text-sm font-semibold transition",
    active
      ? "border-white/20 bg-white text-slate-950"
      : "border-white/15 bg-white/10 text-white hover:bg-white/15",
  );
}

export function reportHeroFilterChipClassName(active: boolean, tone: ReportHeroChipTone = "neutral") {
  const activeToneClassName = {
    neutral: "bg-white text-slate-950",
    emerald: "bg-emerald-400 text-slate-950",
    sky: "bg-sky-300 text-slate-950",
    amber: "bg-amber-300 text-slate-950",
    rose: "bg-rose-300 text-slate-950",
    slate: "bg-slate-200 text-slate-950",
  }[tone];

  return cn(
    "rounded-full px-3 py-1 font-semibold transition",
    active ? activeToneClassName : "border border-white/15 text-white/80 hover:bg-white/10",
  );
}

type ReportHeroCardProps = {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

type ReportHeroStatCardProps = {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type ReportHeroStatGridProps = {
  children: ReactNode;
  className?: string;
};

export function ReportHeroCard({
  kicker,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: ReportHeroCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border border-slate-100 bg-white p-0 text-slate-900 shadow-sm rounded-[2.5rem]",
        className,
      )}
    >
      <div className={cn("space-y-8 p-8 lg:p-10", contentClassName)}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-600">{kicker}</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 leading-tight">{title}</h1>
            <p className="mt-4 text-base font-medium leading-relaxed text-slate-500">{description}</p>
          </div>
          {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
        </div>
        {children}
      </div>
    </Card>
  );
}

export function ReportHeroStatGrid({ children, className }: ReportHeroStatGridProps) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function ReportHeroStatCard({ label, value, description, children, className }: ReportHeroStatCardProps) {
  return (
    <div className={cn("rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4 transition-all hover:bg-white hover:shadow-sm group", className)}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 group-hover:text-emerald-600 transition-colors">{label}</p>
      <p className="mt-2 text-xl font-black tracking-tight text-slate-900">{value}</p>
      {description ? <p className="mt-1 text-xs font-bold text-slate-400">{description}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
