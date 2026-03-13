import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BodyActionLinkProps = ComponentProps<typeof Link>;

type BodyInsetProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

type BodyTableFrameProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

type BodySectionHeadingProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

type BodyEmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

type BodyStatusInsetProps = {
  tone?: "default" | "success" | "warning" | "danger";
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

type BodyDialogSurfaceProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

export const bodyFieldClassName =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export const bodyCompactFieldClassName =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export const bodyTextAreaClassName =
  "mt-1 min-h-48 w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export const bodyLabelClassName = "text-sm font-semibold text-slate-700";

export const bodySectionTitleClassName = "text-sm font-bold text-slate-900";

export const bodySectionDescriptionClassName = "text-xs text-slate-600";

export const bodyChoiceRowClassName = "flex items-center gap-2 text-sm text-slate-700";

export const bodyDenseActionRowClassName = "flex flex-wrap items-center gap-2";

export const bodyDialogActionsClassName = "mt-4 flex justify-end gap-2";

export const bodyActionLinkGroupClassName = "flex flex-wrap items-center gap-3";

export const bodyMetaChipClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm";

export const bodyInlineActionLinkClassName =
  "inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700";

export const bodyActionLinkClassName =
  "inline-flex items-center text-sm font-semibold text-emerald-700 underline underline-offset-2";

export function BodyActionLink({ className, ...props }: BodyActionLinkProps) {
  return (
    <Link
      className={cn(bodyActionLinkClassName, className)}
      {...props}
    />
  );
}

export function BodyInset({ children, className, ...rest }: BodyInsetProps) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50 p-3", className)} {...rest}>
      {children}
    </div>
  );
}

export function BodyStatusInset({ tone = "default", children, className, ...rest }: BodyStatusInsetProps) {
  const toneClassName = {
    default: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-3 py-2", toneClassName, className)} {...rest}>
      {children}
    </div>
  );
}

export function BodyDialogSurface({ children, className, ...rest }: BodyDialogSurfaceProps) {
  return (
    <div
      className={cn("w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function BodyTableFrame({ children, className, ...rest }: BodyTableFrameProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-slate-200", className)} {...rest}>
      {children}
    </div>
  );
}

export function BodySectionHeading({ title, description, action, className }: BodySectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-2", className)}>
      <div className="space-y-1">
        <h2 className={bodySectionTitleClassName}>{title}</h2>
        {description ? <p className={bodySectionDescriptionClassName}>{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function BodyEmptyState({ title, description, className }: BodyEmptyStateProps) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center", className)}>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
    </div>
  );
}
